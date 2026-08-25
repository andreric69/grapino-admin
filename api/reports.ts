import type { VercelRequest, VercelResponse } from './_types.js';
import { isAuthorized } from './_auth.js';
import { getSupabaseAdmin, listAllUsers } from './_supabaseAdmin.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { logError } from './_health.js';

// Aktivitaets-Feed, Kosten-/Einnahmen-Uebersicht, Speicher-Uebersicht,
// KI-Nutzung und Datenqualitaets-Check zusammen in einer Datei - wegen
// Vercels 12-Funktionen-Limit auf dem Hobby-Plan, ausgewaehlt via
// ?resource=activity|costs|income|storage|ai-usage|data-quality.

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

function stripDiacritics(s: string): string {
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

function looksLikeProducerName(name: string): boolean {
  const firstWord = stripDiacritics(name.trim().toLowerCase()).split(/\s+/)[0] ?? '';
  return PRODUCER_PREFIXES.has(firstWord);
}

interface DataQualityFlag {
  source: 'wines' | 'wine_knowledge_cache';
  id: string;
  name: string;
  producer: string | null;
  vintage: number | null;
  email: string | null;
  reason: 'missing_producer_looks_like_name';
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
    supabase.from('wines').select('id, user_id, name, producer, vintage'),
    supabase.from('wine_knowledge_cache').select('name_key, producer_key, vintage'),
  ]);
  if (winesRes.error) throw winesRes.error;
  if (cacheRes.error) throw cacheRes.error;

  const emailById = new Map(allUsers.map((u) => [u.id, u.email ?? null]));
  const flags: DataQualityFlag[] = [];

  for (const w of winesRes.data ?? []) {
    const name = (w.name as string | null) ?? '';
    const producer = (w.producer as string | null)?.trim() || null;
    if (!name.trim()) continue;
    if (!producer && looksLikeProducerName(name)) {
      flags.push({
        source: 'wines',
        id: w.id as string,
        name,
        producer,
        vintage: w.vintage as number | null,
        email: emailById.get(w.user_id as string) ?? null,
        reason: 'missing_producer_looks_like_name',
      });
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
          .select('id, created_at, label, amount, note, recurrence')
          .order('created_at', { ascending: false });
        if (error) throw error;
        res.status(200).json({ costs: data ?? [] });
        return;
      }
      if (req.method === 'POST') {
        const { label, amount, note, recurrence } = (req.body ?? {}) as {
          label?: string;
          amount?: number;
          note?: string;
          recurrence?: 'einmalig' | 'monatlich';
        };
        if (!label?.trim() || typeof amount !== 'number' || Number.isNaN(amount)) {
          res.status(400).json({ error: 'label und amount erforderlich.' });
          return;
        }
        const { error } = await supabase.from('admin_costs').insert({
          label: label.trim(),
          amount,
          note: note?.trim() || null,
          recurrence: recurrence === 'monatlich' ? 'monatlich' : 'einmalig',
        });
        if (error) throw error;
        res.status(200).json({ ok: true });
        return;
      }
      if (req.method === 'PATCH') {
        const { id, label, amount, note, recurrence } = (req.body ?? {}) as {
          id?: string;
          label?: string;
          amount?: number;
          note?: string;
          recurrence?: 'einmalig' | 'monatlich';
        };
        if (!id) {
          res.status(400).json({ error: 'id erforderlich.' });
          return;
        }
        const update: Record<string, unknown> = {};
        if (label?.trim()) update.label = label.trim();
        if (typeof amount === 'number' && !Number.isNaN(amount)) update.amount = amount;
        if (note !== undefined) update.note = note?.trim() || null;
        if (recurrence === 'einmalig' || recurrence === 'monatlich') update.recurrence = recurrence;
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

    res.status(400).json({ error: 'resource ("activity"|"costs"|"income"|"storage"|"ai-usage"|"data-quality") erforderlich.' });
  } catch (e) {
    await logError(getSupabaseAdmin(), 'reports', e);
    res.status(500).json({ error: e instanceof Error ? e.message : 'Unbekannter Fehler.' });
  }
}
