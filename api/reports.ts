import type { VercelRequest, VercelResponse } from './_types.js';
import { isAuthorized } from './_auth.js';
import { getSupabaseAdmin, listAllUsers } from './_supabaseAdmin.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { logError, errorMessage } from './_health.js';

// Aktivitaets-Feed, Admin-Aktions-Protokoll, Kosten-/Einnahmen-Uebersicht,
// Speicher-Uebersicht, KI-Nutzung, Datenqualitaets-Check und Analytics/
// Monatsbericht zusammen in einer Datei - wegen Vercels 12-Funktionen-Limit
// auf dem Hobby-Plan, ausgewaehlt via
// ?resource=activity|admin-activity|costs|income|storage|ai-usage|data-quality|analytics|monthly-report.

const BUCKET = 'wine-photos';
// Supabase-Speicherlimit fuer den aktuellen Plan (MB) - im Supabase-Dashboard
// unter Settings -> Billing -> Usage nachpruefen/anpassen, falls sich der
// Plan oder das Limit aendert. Free-Tier lag zuletzt bei ca. 1 GB.
const TOTAL_QUOTA_MB = 1024;

// Grobe Schaetzung pro Scan (Claude Sonnet 5, Bild + kurze strukturierte
// Antwort) - siehe api/recognize-label.ts in der Weinapp. Keine exakte
// Abrechnung, nur eine Groessenordnung fuer diese Uebersicht.
const AI_ESTIMATED_COST_PER_SCAN_CHF = 0.01;
const AI_DAILY_LIMIT = 100;

interface ActivityEntry {
  at: string;
  type: 'wine_added' | 'wine_consumed' | 'deletion_requested' | 'feedback';
  email: string | null;
  detail: string;
}

const LIMIT_PER_SOURCE = 30;

async function buildActivity(supabase: SupabaseClient): Promise<ActivityEntry[]> {
  const [allUsers, winesRes, consumptionRes, deletionRes, feedbackRes] = await Promise.all([
    listAllUsers(supabase),
    supabase.from('wines').select('created_at, user_id, name').order('created_at', { ascending: false }).limit(LIMIT_PER_SOURCE),
    supabase
      .from('wine_consumption_log')
      .select('consumed_at, user_id, wine_name')
      .order('consumed_at', { ascending: false })
      .limit(LIMIT_PER_SOURCE),
    supabase
      .from('deletion_requests')
      .select('created_at, user_id, status')
      .order('created_at', { ascending: false })
      .limit(LIMIT_PER_SOURCE),
    supabase.from('app_feedback').select('created_at, user_id, rating').order('created_at', { ascending: false }).limit(LIMIT_PER_SOURCE),
  ]);
  for (const r of [winesRes, consumptionRes, deletionRes, feedbackRes]) {
    if (r.error) throw r.error;
  }

  const emailById = new Map(allUsers.map((u) => [u.id, u.email ?? null]));

  const entries: ActivityEntry[] = [
    ...(winesRes.data ?? []).map((w) => ({
      at: w.created_at,
      type: 'wine_added' as const,
      email: emailById.get(w.user_id) ?? null,
      detail: `Wein hinzugefuegt: "${w.name}"`,
    })),
    ...(consumptionRes.data ?? []).map((c) => ({
      at: c.consumed_at,
      type: 'wine_consumed' as const,
      email: emailById.get(c.user_id) ?? null,
      detail: `Flasche getrunken: "${c.wine_name}"`,
    })),
    ...(deletionRes.data ?? []).map((d) => ({
      at: d.created_at,
      type: 'deletion_requested' as const,
      email: emailById.get(d.user_id) ?? null,
      detail: `Loeschanfrage (${d.status})`,
    })),
    ...(feedbackRes.data ?? []).map((f) => ({
      at: f.created_at,
      type: 'feedback' as const,
      email: emailById.get(f.user_id) ?? null,
      detail: `Feedback gesendet (${f.rating} Sterne)`,
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return entries.slice(0, 50);
}

// Nur die Primaerfoto-Datei liegt flach im Nutzer-Ordner
// ({userId}/{wineId}.jpg) - Zusatzfotos landen je in einem eigenen
// Unterordner ({userId}/{wineId}/...), siehe uploadWinePhotos() in der
// Weinapp. Bei vielen Weinen mit Zusatzfotos (z. B. Gregors ~1500er
// Sammlung) waeren das potenziell hunderte Unterordner - sequenziell
// abgefragt (ein API-Aufruf nach dem anderen) drohte das bei so vielen
// Nutzern/Ordnern den Vercel-Funktions-Timeout zu reissen. Parallel statt
// nacheinander abgefragt, sowohl innerhalb eines Ordners als auch ueber alle
// Nutzer hinweg.
async function folderSizeBytes(supabase: SupabaseClient, prefix: string): Promise<number> {
  const { data, error } = await supabase.storage.from(BUCKET).list(prefix, { limit: 1000 });
  if (error) throw error;
  const sizes = await Promise.all(
    (data ?? []).map((entry) =>
      entry.id === null
        ? folderSizeBytes(supabase, `${prefix}/${entry.name}`)
        : Promise.resolve((entry.metadata as { size?: number } | null)?.size ?? 0),
    ),
  );
  return sizes.reduce((sum, s) => sum + s, 0);
}

async function buildStorageUsage(supabase: SupabaseClient) {
  const allUsers = await listAllUsers(supabase);

  const perUser = await Promise.all(
    allUsers.map(async (u) => ({
      userId: u.id,
      email: u.email ?? null,
      bytes: await folderSizeBytes(supabase, u.id),
    })),
  );
  const totalBytes = perUser.reduce((sum, u) => sum + u.bytes, 0);

  const totalQuotaBytes = TOTAL_QUOTA_MB * 1024 * 1024;
  const avgPerUserBytes = allUsers.length > 0 ? totalBytes / allUsers.length : 0;
  const remainingBytes = Math.max(0, totalQuotaBytes - totalBytes);
  const estimatedAdditionalUsers = avgPerUserBytes > 0 ? Math.floor(remainingBytes / avgPerUserBytes) : null;

  return {
    perUser: perUser.sort((a, b) => b.bytes - a.bytes),
    totalBytes,
    totalQuotaBytes,
    estimatedAdditionalUsers,
  };
}

async function buildAiUsage(supabase: SupabaseClient) {
  const [allUsers, logsRes] = await Promise.all([
    listAllUsers(supabase),
    supabase.from('label_recognition_log').select('user_id, created_at'),
  ]);
  if (logsRes.error) throw logsRes.error;

  const emailById = new Map(allUsers.map((u) => [u.id, u.email ?? null]));
  const todayCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const perUser = new Map<string, { total: number; today: number; lastUsed: string | null }>();
  for (const row of logsRes.data ?? []) {
    const entry = perUser.get(row.user_id) ?? { total: 0, today: 0, lastUsed: null };
    entry.total += 1;
    if (row.created_at >= todayCutoff) entry.today += 1;
    if (!entry.lastUsed || row.created_at > entry.lastUsed) entry.lastUsed = row.created_at;
    perUser.set(row.user_id, entry);
  }

  const perUserList = Array.from(perUser.entries())
    .map(([userId, stats]) => ({
      userId,
      email: emailById.get(userId) ?? null,
      total: stats.total,
      today: stats.today,
      dailyLimit: AI_DAILY_LIMIT,
      lastUsed: stats.lastUsed,
      estimatedCostChf: Math.round(stats.total * AI_ESTIMATED_COST_PER_SCAN_CHF * 100) / 100,
    }))
    .sort((a, b) => b.total - a.total);

  const totalScans = perUserList.reduce((sum, u) => sum + u.total, 0);

  return {
    perUser: perUserList,
    totalScans,
    estimatedTotalCostChf: Math.round(totalScans * AI_ESTIMATED_COST_PER_SCAN_CHF * 100) / 100,
    estimatedCostPerScanChf: AI_ESTIMATED_COST_PER_SCAN_CHF,
  };
}

const DIACRITICS_RANGE = /[̀-ͯ]/g;

export function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(DIACRITICS_RANGE, '');
}

// Typische erste Woerter von Produzentennamen im Weinbau (mehrsprachig) -
// steht so ein Wort am Anfang des NAME-Felds, sieht das eher nach einem
// Produzenten aus, der versehentlich ins Namensfeld gerutscht ist.
const PRODUCER_PREFIXES = new Set([
  'chateau', 'domaine', 'weingut', 'weinguter', 'cantina', 'cantine', 'tenuta', 'bodega', 'bodegas',
  'clos', 'podere', 'marchesi', 'casa', 'finca', 'quinta', 'schloss', 'winery', 'cellars', 'cellar',
  'vignobles', 'azienda', 'fattoria', 'maison', 'cave', 'caves', 'vinicola', 'adega',
  'kellerei', 'herrschaft', 'gebruder', 'famille',
]);

export function looksLikeProducerName(name: string): boolean {
  const firstWord = stripDiacritics(name.trim().toLowerCase()).split(/\s+/)[0] ?? '';
  return PRODUCER_PREFIXES.has(firstWord);
}

// Ein "en primeur"/Subskriptions-Kauf des naechsten Jahrgangs ist im Weinhandel
// normal - erst ab zwei Jahren in der Zukunft ist ein Jahrgang mit hoher
// Wahrscheinlichkeit ein Tippfehler (z. B. 2029 statt 2019) statt ein echter
// Vorab-Kauf.
export function isImplausibleFutureVintage(vintage: number | null, currentYear: number): boolean {
  return vintage !== null && vintage > currentYear + 1;
}

// Grosszuegige Obergrenze bewusst weit ueber dem, was selbst seltene
// Spitzenweine typischerweise kosten - soll nur eindeutige Zahlendreher/
// verrutschte Kommastellen faenden (z. B. 5000.- statt 50.-), nicht echte,
// aber teure Flaschen als Fehler markieren.
export const IMPLAUSIBLE_PRICE_CHF = 50_000;

export function isImplausiblePrice(price: number | null): boolean {
  return price !== null && (price < 0 || price > IMPLAUSIBLE_PRICE_CHF);
}

interface DataQualityFlag {
  source: 'wines' | 'wine_knowledge_cache';
  id: string;
  name: string;
  producer: string | null;
  vintage: number | null;
  email: string | null;
  reason: 'missing_producer_looks_like_name' | 'implausible_future_vintage' | 'implausible_price';
}

/**
 * Rein lesende Heuristik-Pruefung - schlaegt NIE selbst etwas um, sondern
 * listet nur Verdachtsfaelle auf, die von Hand geprueft werden sollten (siehe
 * Standing-Regel: Name/Produzent/Region nie ohne gruendliche Verifikation
 * aendern). Ein einziges Signal: Produzent-Feld leer, aber der Name faengt
 * mit einem typischen Produzenten-Praefix an (Chateau/Domaine/Weingut/...) -
 * deutet darauf hin, dass beim Import/Scan der Produzent versehentlich ins
 * Namensfeld gerutscht ist.
 *
 * "Name === Produzent" wurde als zweites Signal bewusst verworfen, nachdem
 * ein Test gegen die echten Produktivdaten gezeigt hat, dass es fast nur
 * Fehlalarme produziert: bei sehr vielen hochwertigen Weinen (nicht nur
 * klassischen Bordeaux-Chateaux, auch z.B. "Aalto", "Orma", "Cos
 * d'Estournel") ist der Weinname absichtlich identisch mit dem Produzenten -
 * das ist die korrekte, uebliche Namensgebung fuer ein "Flaggschiff"/
 * Monopol-Gewaechs, kein Datenfehler.
 *
 * Geprueft werden sowohl die eigenen Weine jedes Nutzers als auch der
 * geteilte wine_knowledge_cache (dort nur name_key, also kleingeschrieben,
 * da kein original-cased Name gespeichert wird). Fuer den Cache wird
 * "producer_key" statt "producer" geprueft: die richtig geschriebene
 * "producer"-Spalte kam erst spaeter dazu und ist bei vielen aelteren
 * Eintraegen leer, obwohl ein Produzent bekannt ist (das haette sonst 71
 * Fehlalarme auf einmal erzeugt - live getestet). "producer_key" ist von
 * Anfang an Pflichtfeld und immer verlaesslich.
 */
async function buildDataQuality(supabase: SupabaseClient): Promise<{ flags: DataQualityFlag[] }> {
  const [allUsers, winesRes, cacheRes] = await Promise.all([
    listAllUsers(supabase),
    supabase.from('wines').select('id, user_id, name, producer, vintage, price'),
    supabase.from('wine_knowledge_cache').select('name_key, producer_key, vintage'),
  ]);
  if (winesRes.error) throw winesRes.error;
  if (cacheRes.error) throw cacheRes.error;

  const emailById = new Map(allUsers.map((u) => [u.id, u.email ?? null]));
  const flags: DataQualityFlag[] = [];
  const currentYear = new Date().getFullYear();

  for (const w of winesRes.data ?? []) {
    const name = (w.name as string | null) ?? '';
    const producer = (w.producer as string | null)?.trim() || null;
    const vintage = w.vintage as number | null;
    const price = w.price as number | null;
    if (!name.trim()) continue;

    const base = {
      source: 'wines' as const,
      id: w.id as string,
      name,
      producer,
      vintage,
      email: emailById.get(w.user_id as string) ?? null,
    };
    if (!producer && looksLikeProducerName(name)) {
      flags.push({ ...base, reason: 'missing_producer_looks_like_name' });
    }
    if (isImplausibleFutureVintage(vintage, currentYear)) {
      flags.push({ ...base, reason: 'implausible_future_vintage' });
    }
    if (isImplausiblePrice(price)) {
      flags.push({ ...base, reason: 'implausible_price' });
    }
  }

  for (const c of cacheRes.data ?? []) {
    const nameKey = (c.name_key as string | null) ?? '';
    const producerKey = (c.producer_key as string | null)?.trim() || null;
    if (!nameKey) continue;
    if (!producerKey && looksLikeProducerName(nameKey)) {
      flags.push({ source: 'wine_knowledge_cache', id: nameKey, name: nameKey, producer: null, vintage: c.vintage as number | null, email: null, reason: 'missing_producer_looks_like_name' });
    }
  }

  return { flags };
}

// --- Analytics/Charts & Monatsbericht ---------------------------------------
// Alle Zeitstempel in dieser Codebasis sind ISO-Strings aus Postgres
// (timestamptz -> "2026-01-15T10:23:00+00:00" bzw. mit "Z"), also immer UTC
// und lexikografisch sortierbar - simples String-Slicing auf "YYYY-MM"
// reicht deshalb aus, keine Zeitzonen-Bibliothek noetig.

export function monthKeyFromIso(iso: string): string {
  return iso.slice(0, 7);
}

export function currentMonthKey(referenceDate: Date = new Date()): string {
  return referenceDate.toISOString().slice(0, 7);
}

export function isValidMonthKey(s: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

function shiftMonthKey(month: string, deltaMonths: number): string {
  const [year, mon] = month.split('-').map(Number);
  const d = new Date(Date.UTC(year, mon - 1 + deltaMonths, 1));
  return currentMonthKey(d);
}

// 13 Monate (rollierend, endet im aktuellen Monat) statt nur 12 - so laesst
// sich auf der Frontend-Seite sowohl "dieses Jahr vs. letztes Jahr" als auch
// ein einfacher Monat-zu-Monat-Trend berechnen (braucht den Vormonat des
// aeltesten Jahresmonats als Referenzpunkt).
export function getLast13Months(referenceDate: Date = new Date()): string[] {
  const current = currentMonthKey(referenceDate);
  const months: string[] = [];
  for (let i = 12; i >= 0; i--) {
    months.push(shiftMonthKey(current, -i));
  }
  return months;
}

function initMonthBucket(months: string[]): Map<string, number> {
  return new Map(months.map((m) => [m, 0]));
}

async function buildAnalytics(supabase: SupabaseClient) {
  const months = getLast13Months();

  const [allUsers, paymentsRes, scansRes] = await Promise.all([
    listAllUsers(supabase),
    supabase.from('payment_requests').select('amount, paid_at').eq('status', 'paid'),
    supabase.from('label_recognition_log').select('created_at'),
  ]);
  if (paymentsRes.error) throw paymentsRes.error;
  if (scansRes.error) throw scansRes.error;

  const revenueByMonthMap = initMonthBucket(months);
  for (const p of paymentsRes.data ?? []) {
    if (!p.paid_at) continue; // sollte bei status='paid' immer gesetzt sein, siehe commerce.ts - defensiv trotzdem geprueft
    const key = monthKeyFromIso(p.paid_at);
    if (revenueByMonthMap.has(key)) {
      revenueByMonthMap.set(key, revenueByMonthMap.get(key)! + Number(p.amount));
    }
  }

  // Fuer die kumulative Nutzerzahl pro Monat werden auch Signups VOR dem
  // 13-Monats-Fenster gebraucht (als Startwert), sonst wuerde totalUsers im
  // aeltesten Monat faelschlich bei 0 statt beim tatsaechlichen Bestand
  // beginnen.
  const windowStart = months[0];
  const newUsersByMonthMap = initMonthBucket(months);
  let usersBeforeWindow = 0;
  for (const u of allUsers) {
    if (!u.created_at) continue;
    const key = monthKeyFromIso(u.created_at);
    if (key < windowStart) {
      usersBeforeWindow += 1;
    } else if (newUsersByMonthMap.has(key)) {
      newUsersByMonthMap.set(key, newUsersByMonthMap.get(key)! + 1);
    }
  }

  const scansByMonthMap = initMonthBucket(months);
  for (const s of scansRes.data ?? []) {
    const key = monthKeyFromIso(s.created_at);
    if (scansByMonthMap.has(key)) {
      scansByMonthMap.set(key, scansByMonthMap.get(key)! + 1);
    }
  }

  let runningTotal = usersBeforeWindow;
  const userGrowthByMonth = months.map((month) => {
    const newUsers = newUsersByMonthMap.get(month)!;
    runningTotal += newUsers;
    return { month, newUsers, totalUsers: runningTotal };
  });

  const revenueByMonth = months.map((month) => ({
    month,
    amountChf: Math.round((revenueByMonthMap.get(month) ?? 0) * 100) / 100,
  }));

  const scansByMonth = months.map((month) => ({ month, scans: scansByMonthMap.get(month) ?? 0 }));

  return { revenueByMonth, userGrowthByMonth, scansByMonth };
}

/**
 * Ein "monatlich" laufender Kosten-Eintrag zaehlt in JEDEM Monat ab (inkl.)
 * seinem Erstellungsmonat, ein "einmalig"er nur im eigenen Erstellungsmonat.
 * String-Vergleich auf "YYYY-MM" reicht fuer "ab/vor" wie bei den anderen
 * Monats-Keys hier.
 *
 * Optional kann ein "monatlich" laufender Eintrag ein Enddatum (ends_at)
 * haben - noetig, um ein gekuendigtes Abo sauber zu beenden, ohne die Zeile
 * zu loeschen (Loeschen wuerde es faelschlich auch aus vergangenen Monaten
 * entfernen, in denen es tatsaechlich lief, und damit die historische
 * Buchhaltung verfaelschen). Ist ends_at gesetzt, zaehlt der Eintrag nur bis
 * einschliesslich dem Endmonat (gleiche inklusive "<=" Logik wie beim
 * Erstellungsmonat).
 */
export function isCostActiveInMonth(
  cost: { createdAt: string; recurrence: string | null; endsAt?: string | null },
  month: string,
): boolean {
  const createdMonth = monthKeyFromIso(cost.createdAt);
  if (cost.recurrence === 'monatlich') {
    if (createdMonth > month) return false;
    if (cost.endsAt) {
      const endMonth = monthKeyFromIso(cost.endsAt);
      return month <= endMonth;
    }
    return true;
  }
  return createdMonth === month;
}

interface MonthlyReportData {
  month: string;
  revenueChf: number;
  costsChf: number;
  incomeChf: number;
  netProfitChf: number;
  newUsers: number;
  scans: number;
}

async function buildMonthlyReport(supabase: SupabaseClient, month: string): Promise<MonthlyReportData> {
  const [allUsers, paymentsRes, costsRes, incomeRes, scansRes] = await Promise.all([
    listAllUsers(supabase),
    supabase.from('payment_requests').select('amount, paid_at').eq('status', 'paid'),
    supabase.from('admin_costs').select('amount, created_at, recurrence, ends_at'),
    supabase.from('admin_income').select('amount, created_at'),
    supabase.from('label_recognition_log').select('created_at'),
  ]);
  if (paymentsRes.error) throw paymentsRes.error;
  if (costsRes.error) throw costsRes.error;
  if (incomeRes.error) throw incomeRes.error;
  if (scansRes.error) throw scansRes.error;

  const revenueChf = (paymentsRes.data ?? [])
    .filter((p) => p.paid_at && monthKeyFromIso(p.paid_at) === month)
    .reduce((sum, p) => sum + Number(p.amount), 0);

  const costsChf = (costsRes.data ?? [])
    .filter((c) => isCostActiveInMonth({ createdAt: c.created_at, recurrence: c.recurrence, endsAt: c.ends_at }, month))
    .reduce((sum, c) => sum + Number(c.amount), 0);

  const incomeChf = (incomeRes.data ?? [])
    .filter((i) => monthKeyFromIso(i.created_at) === month)
    .reduce((sum, i) => sum + Number(i.amount), 0);

  const newUsers = allUsers.filter((u) => u.created_at && monthKeyFromIso(u.created_at) === month).length;

  const scans = (scansRes.data ?? []).filter((s) => monthKeyFromIso(s.created_at) === month).length;

  const round2 = (n: number) => Math.round(n * 100) / 100;

  return {
    month,
    revenueChf: round2(revenueChf),
    costsChf: round2(costsChf),
    incomeChf: round2(incomeChf),
    netProfitChf: round2(revenueChf + incomeChf - costsChf),
    newUsers,
    scans,
  };
}

// Werte hier sind ausschliesslich Zahlen und ein fest vorgegebenes deutsches
// Label (keine Nutzereingaben) - Escaping ist daher nicht zwingend noetig,
// aber defensiv trotzdem vorhanden, falls sich das mal aendert.
export function csvEscape(value: string | number): string {
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function formatMonthlyReportCsv(data: MonthlyReportData): string {
  const rows: Array<[string, string | number]> = [
    ['Monat', data.month],
    ['Umsatz (CHF)', data.revenueChf],
    ['Kosten (CHF)', data.costsChf],
    ['Einnahmen (CHF)', data.incomeChf],
    ['Nettogewinn (CHF)', data.netProfitChf],
    ['Neue Nutzer', data.newUsers],
    ['Scans', data.scans],
  ];
  const lines = ['Kennzahl,Wert', ...rows.map(([label, value]) => `${csvEscape(label)},${csvEscape(value)}`)];
  return lines.join('\n') + '\n';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isAuthorized(req)) {
    res.status(401).json({ error: 'Nicht angemeldet.' });
    return;
  }

  const supabase = getSupabaseAdmin();
  const resource = typeof req.query.resource === 'string' ? req.query.resource : null;

  try {
    if (resource === 'activity') {
      if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }
      res.status(200).json({ entries: await buildActivity(supabase) });
      return;
    }

    // Andrins eigenes Admin-Aktions-Protokoll (Nutzer sperren/entsperren,
    // Testabo verlaengern, Preise aendern) - siehe api/_activityLog.ts. Nicht
    // zu verwechseln mit ?resource=activity oben, dem Feed der NUTZER-
    // Aktivitaet. Bewusst als eigene resource auf diesem bestehenden Bundle
    // statt einer neuen Vercel-Funktion (Funktionslimit).
    if (resource === 'admin-activity') {
      if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }
      const { data, error } = await supabase
        .from('admin_activity_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      res.status(200).json({ entries: data ?? [] });
      return;
    }

    if (resource === 'storage') {
      if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }
      res.status(200).json(await buildStorageUsage(supabase));
      return;
    }

    if (resource === 'ai-usage') {
      if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }
      res.status(200).json(await buildAiUsage(supabase));
      return;
    }

    if (resource === 'costs') {
      if (req.method === 'GET') {
        const { data, error } = await supabase
          .from('admin_costs')
          .select('id, created_at, label, amount, note, recurrence, ends_at')
          .order('created_at', { ascending: false });
        if (error) throw error;
        res.status(200).json({ costs: data ?? [] });
        return;
      }
      if (req.method === 'POST') {
        const { label, amount, note, recurrence, ends_at } = (req.body ?? {}) as {
          label?: string;
          amount?: number;
          note?: string;
          recurrence?: 'einmalig' | 'monatlich';
          ends_at?: string | null;
        };
        if (!label?.trim() || typeof amount !== 'number' || Number.isNaN(amount)) {
          res.status(400).json({ error: 'label und amount erforderlich.' });
          return;
        }
        if (ends_at !== undefined && ends_at !== null && Number.isNaN(Date.parse(ends_at))) {
          res.status(400).json({ error: 'ends_at ist kein gueltiges Datum.' });
          return;
        }
        const { error } = await supabase.from('admin_costs').insert({
          label: label.trim(),
          amount,
          note: note?.trim() || null,
          recurrence: recurrence === 'monatlich' ? 'monatlich' : 'einmalig',
          ends_at: ends_at || null,
        });
        if (error) throw error;
        res.status(200).json({ ok: true });
        return;
      }
      if (req.method === 'PATCH') {
        const { id, label, amount, note, recurrence, ends_at } = (req.body ?? {}) as {
          id?: string;
          label?: string;
          amount?: number;
          note?: string;
          recurrence?: 'einmalig' | 'monatlich';
          ends_at?: string | null;
        };
        if (!id) {
          res.status(400).json({ error: 'id erforderlich.' });
          return;
        }
        if (ends_at !== undefined && ends_at !== null && Number.isNaN(Date.parse(ends_at))) {
          res.status(400).json({ error: 'ends_at ist kein gueltiges Datum.' });
          return;
        }
        const update: Record<string, unknown> = {};
        if (label?.trim()) update.label = label.trim();
        if (typeof amount === 'number' && !Number.isNaN(amount)) update.amount = amount;
        if (note !== undefined) update.note = note?.trim() || null;
        if (recurrence === 'einmalig' || recurrence === 'monatlich') update.recurrence = recurrence;
        if (ends_at !== undefined) update.ends_at = ends_at || null;
        if (Object.keys(update).length === 0) {
          res.status(400).json({ error: 'Keine Aenderung angegeben.' });
          return;
        }
        const { error } = await supabase.from('admin_costs').update(update).eq('id', id);
        if (error) throw error;
        res.status(200).json({ ok: true });
        return;
      }
      if (req.method === 'DELETE') {
        const { id } = (req.body ?? {}) as { id?: string };
        if (!id) {
          res.status(400).json({ error: 'id erforderlich.' });
          return;
        }
        const { error } = await supabase.from('admin_costs').delete().eq('id', id);
        if (error) throw error;
        res.status(200).json({ ok: true });
        return;
      }
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    if (resource === 'data-quality') {
      if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }
      res.status(200).json(await buildDataQuality(supabase));
      return;
    }

    if (resource === 'income') {
      if (req.method === 'GET') {
        const { data, error } = await supabase
          .from('admin_income')
          .select('id, created_at, label, amount, note')
          .order('created_at', { ascending: false });
        if (error) throw error;
        res.status(200).json({ income: data ?? [] });
        return;
      }
      if (req.method === 'POST') {
        const { label, amount, note } = (req.body ?? {}) as {
          label?: string;
          amount?: number;
          note?: string;
        };
        if (!label?.trim() || typeof amount !== 'number' || Number.isNaN(amount)) {
          res.status(400).json({ error: 'label und amount erforderlich.' });
          return;
        }
        const { error } = await supabase.from('admin_income').insert({
          label: label.trim(),
          amount,
          note: note?.trim() || null,
        });
        if (error) throw error;
        res.status(200).json({ ok: true });
        return;
      }
      if (req.method === 'PATCH') {
        const { id, label, amount, note } = (req.body ?? {}) as {
          id?: string;
          label?: string;
          amount?: number;
          note?: string;
        };
        if (!id) {
          res.status(400).json({ error: 'id erforderlich.' });
          return;
        }
        const update: Record<string, unknown> = {};
        if (label?.trim()) update.label = label.trim();
        if (typeof amount === 'number' && !Number.isNaN(amount)) update.amount = amount;
        if (note !== undefined) update.note = note?.trim() || null;
        if (Object.keys(update).length === 0) {
          res.status(400).json({ error: 'Keine Aenderung angegeben.' });
          return;
        }
        const { error } = await supabase.from('admin_income').update(update).eq('id', id);
        if (error) throw error;
        res.status(200).json({ ok: true });
        return;
      }
      if (req.method === 'DELETE') {
        const { id } = (req.body ?? {}) as { id?: string };
        if (!id) {
          res.status(400).json({ error: 'id erforderlich.' });
          return;
        }
        const { error } = await supabase.from('admin_income').delete().eq('id', id);
        if (error) throw error;
        res.status(200).json({ ok: true });
        return;
      }
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    if (resource === 'analytics') {
      if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }
      res.status(200).json(await buildAnalytics(supabase));
      return;
    }

    if (resource === 'monthly-report') {
      if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }
      const monthParam = typeof req.query.month === 'string' ? req.query.month : null;
      const month = monthParam && isValidMonthKey(monthParam) ? monthParam : currentMonthKey();
      const report = await buildMonthlyReport(supabase, month);
      const csv = formatMonthlyReportCsv(report);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="grapino-bericht-${month}.csv"`);
      res.status(200).send(csv);
      return;
    }

    res.status(400).json({
      error:
        'resource ("activity"|"admin-activity"|"costs"|"income"|"storage"|"ai-usage"|"data-quality"|"analytics"|"monthly-report") erforderlich.',
    });
  } catch (e) {
    await logError(getSupabaseAdmin(), 'reports', e);
    res.status(500).json({ error: errorMessage(e) });
  }
}
