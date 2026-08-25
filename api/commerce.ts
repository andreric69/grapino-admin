import type { VercelRequest, VercelResponse } from './_types.js';
import { isAuthorized } from './_auth.js';
import { getSupabaseAdmin, listAllUsers } from './_supabaseAdmin.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { logError } from './_health.js';

// Auftraege, Zahlungsanfragen und Preise zusammen in einer Datei - wegen
// Vercels 12-Funktionen-Limit auf dem Hobby-Plan, ausgewaehlt via
// ?resource=orders|payments|pricing.

const PRICING_FIELDS = 'refresh_price, neue_weine_price, ultra_price, minimum_price, access_fee, updated_at';

const CATEGORY_LABELS: Record<string, string> = {
  refresh: 'Aktualisierung aller Weine',
  neue_weine: 'Neue Weine (ohne Foto)',
  ultra: 'Import-Aktualisierung (inkl. Foto)',
};

const CATEGORY_INSTRUCTIONS: Record<string, string> = {
  refresh: 'Fuer die unten gelisteten Weine bitte ALLE recherchierbaren Angaben aktualisieren (Region, Subregion, Rebsorte, Trinkfenster, Kritiker-Punkte, Food-Pairing etc).',
  neue_weine: 'Die unten gelisteten Weine wurden per Foto hinzugefuegt (Etikett-Foto ist also schon vorhanden) und haben sonst kaum Angaben - bitte alle Basisdaten ergaenzen (Region, Rebsorte, Trinkfenster etc), wo recherchierbar. KEIN Foto suchen/aendern.',
  ultra: 'Fuer die unten gelisteten Weine (typischerweise aus einem CSV-Import ohne Fotos) bitte RUNDUM-SORGLOS-Recherche: Fotos (Etikett, klar erkennbar, exakt passender Jahrgang), Region/Subregion, Rebsorte, Trinkfenster, Kritiker-Punkte, Food-Pairing - alles Verfuegbare.',
};

interface WineRef {
  id: string;
  name: string;
  producer: string | null;
  vintage: number | null;
  notes: string | null;
}

const KNOWLEDGE_FIELDS = [
  'grape_variety',
  'region',
  'subregion',
  'country',
  'wine_type',
  'drink_from',
  'drink_to',
  'critic_scores',
  'food_pairing',
] as const;

/**
 * Schreibt Trinkfenster/Kritiker-Punkte/Food-Pairing (plus die uebrigen
 * recherchierbaren Felder) der Weine eines erledigten Auftrags in den
 * geteilten wine_knowledge_cache - reiner Nebeneffekt, kein eigenes
 * Kurations-UI noetig. Ab dann sieht JEDER Nutzer, der denselben Wein
 * (Name+Produzent+Jahrgang) scannt, diese Angaben sofort, ohne dass fuer
 * ihn erneut recherchiert werden muss.
 *
 * Liest den bestehenden Cache-Eintrag zuerst und ergaenzt nur Felder, die
 * DIESER Wein tatsaechlich hat - ueberschreibt nie mit null. Der Cache-
 * Schluessel (Name+Produzent+Jahrgang) ist nutzerUEBERGREIFEND: besitzen
 * zwei verschiedene Nutzer denselben Wein, wuerde ein einfaches Upsert des
 * jeweils NUR TEILWEISE recherchierten Weins von Nutzer B sonst die bereits
 * vollstaendig recherchierten Felder von Nutzer A stillschweigend mit null
 * ueberschreiben.
 */
async function syncWineKnowledgeCache(supabase: SupabaseClient, wineIds: string[]): Promise<void> {
  if (wineIds.length === 0) return;
  const { data: wines, error } = await supabase
    .from('wines')
    .select('name, producer, vintage, grape_variety, region, subregion, country, wine_type, drink_from, drink_to, critic_scores, food_pairing')
    .in('id', wineIds);
  if (error) throw error;

  const candidates = (wines ?? []).filter((w) => KNOWLEDGE_FIELDS.some((field) => (w as Record<string, unknown>)[field] !== null));

  for (const w of candidates) {
    const name_key = w.name.trim().toLowerCase();
    const producer_key = (w.producer ?? '').trim().toLowerCase();

    let existingQuery = supabase.from('wine_knowledge_cache').select('*').eq('name_key', name_key).eq('producer_key', producer_key);
    existingQuery = w.vintage === null ? existingQuery.is('vintage', null) : existingQuery.eq('vintage', w.vintage);
    const { data: existing, error: existingError } = await existingQuery.maybeSingle();
    if (existingError) throw existingError;

    const merged = {
      name_key,
      producer_key,
      // Richtig geschriebene Form zusaetzlich zum Kleinschreib-Schluessel -
      // wird gebraucht, wenn ein spaeterer Scan denselben Wein nur ueber
      // Name+Jahrgang findet (kein Produzent auf dem Etikett erkennbar) und
      // den Produzenten selbst als Vorschlag uebernehmen will.
      producer: w.producer ?? existing?.producer ?? null,
      vintage: w.vintage,
      grape_variety: w.grape_variety ?? existing?.grape_variety ?? null,
      region: w.region ?? existing?.region ?? null,
      subregion: w.subregion ?? existing?.subregion ?? null,
      country: w.country ?? existing?.country ?? null,
      wine_type: w.wine_type ?? existing?.wine_type ?? null,
      drink_from: w.drink_from ?? existing?.drink_from ?? null,
      drink_to: w.drink_to ?? existing?.drink_to ?? null,
      critic_scores: w.critic_scores ?? existing?.critic_scores ?? null,
      food_pairing: w.food_pairing ?? existing?.food_pairing ?? null,
      source: 'admin_research',
      updated_at: new Date().toISOString(),
    };

    const { error: upsertError } = await supabase
      .from('wine_knowledge_cache')
      .upsert(merged, { onConflict: 'name_key,producer_key,vintage' });
    if (upsertError) throw upsertError;
  }
}

interface KnowledgeRow {
  grape_variety: string | null;
  region: string | null;
  subregion: string | null;
  country: string | null;
  wine_type: string | null;
}

const KNOWLEDGE_SELECT = 'grape_variety, region, subregion, country, wine_type';

/** Wie agree() in der Weinapp (src/lib/wineKnowledgeCache.ts): liefert ein Feld nur, wenn sich ALLE Zeilen einig sind (ohne Gross-/Kleinschreibung), sonst null. */
function agreeField(rows: KnowledgeRow[], key: keyof KnowledgeRow): string | null {
  let result: string | null = null;
  for (const row of rows) {
    const value = row[key];
    if (!value) continue;
    if (result === null) result = value;
    else if (result.trim().toLowerCase() !== value.trim().toLowerCase()) return null;
  }
  return result;
}

function summarizeKnowledge(rows: KnowledgeRow[]): string | null {
  const grapeVariety = agreeField(rows, 'grape_variety');
  const region = agreeField(rows, 'region');
  const subregion = agreeField(rows, 'subregion');
  const country = agreeField(rows, 'country');
  const wineType = agreeField(rows, 'wine_type');

  const parts = [
    grapeVariety ? `Rebsorte ${grapeVariety}` : null,
    region ? `Region ${region}${subregion ? ' / ' + subregion : ''}` : null,
    country ? `Land ${country}` : null,
    wineType ? `Typ ${wineType}` : null,
  ].filter((p): p is string => p !== null);
  return parts.length > 0 ? parts.join(', ') : null;
}

/**
 * Fasst zusammen, was der geteilte wine_knowledge_cache zu einem Wein schon
 * weiss - wird in listOrders() direkt in den Recherche-Prompt eingeblendet,
 * damit fuer Aktualisierungs-/Import-Auftraege nicht jeder Wein bei null
 * recherchiert werden muss, auch wenn schon ein anderer Nutzer denselben
 * (oder namensgleichen) Wein hatte. Gleiche Ambiguitaets-Logik wie
 * lookupWineKnowledge() in der Weinapp, hier nur als Info-Text statt als
 * Formular-Vorschlag: erst Name+Produzent (ueber alle Jahrgaenge hinweg),
 * sonst - falls kein Produzent bekannt ist - Name allein (ueber alle
 * Produzenten/Jahrgaenge hinweg, nur wenn sich diese bei Herkunft/Rebsorte
 * einig sind).
 */
async function lookupKnownWineHints(supabase: SupabaseClient, wine: WineRef): Promise<string | null> {
  const nameKey = wine.name.trim().toLowerCase();
  if (!nameKey) return null;
  const producerKey = (wine.producer ?? '').trim().toLowerCase();

  if (producerKey) {
    const { data } = await supabase
      .from('wine_knowledge_cache')
      .select(KNOWLEDGE_SELECT)
      .eq('name_key', nameKey)
      .eq('producer_key', producerKey)
      .limit(20);
    return data && data.length > 0 ? summarizeKnowledge(data as KnowledgeRow[]) : null;
  }

  const { data } = await supabase.from('wine_knowledge_cache').select(KNOWLEDGE_SELECT).eq('name_key', nameKey).limit(50);
  return data && data.length > 0 ? summarizeKnowledge(data as KnowledgeRow[]) : null;
}

async function listOrders(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('enrichment_orders')
    .select('id, created_at, user_id, category, wine_ids, wine_count, estimated_price, status, note')
    .order('created_at', { ascending: false });
  if (error) throw error;

  const allUsers = await listAllUsers(supabase);
  const emailById = new Map(allUsers.map((u) => [u.id, u.email ?? null]));

  const orders = data ?? [];
  const allWineIds = Array.from(new Set(orders.flatMap((o) => o.wine_ids as string[])));
  const { data: wines, error: winesError } =
    allWineIds.length > 0
      ? await supabase.from('wines').select('id, name, producer, vintage, notes').in('id', allWineIds)
      : { data: [], error: null };
  if (winesError) throw winesError;
  const wineById = new Map<string, WineRef>((wines ?? []).map((w) => [w.id, w as WineRef]));

  return Promise.all(
    orders.map(async (o) => {
      const wineList = (o.wine_ids as string[]).map((id) => wineById.get(id)).filter((w): w is WineRef => w !== undefined);
      // Hinweise nur fuer Auftraege berechnen, an denen tatsaechlich noch
      // gearbeitet wird - erledigte/stornierte Auftraege brauchen sie nicht
      // mehr, das spart bei wachsender Auftragshistorie unnoetige Abfragen.
      const needsHints = o.status === 'pending' || o.status === 'in_progress';
      const hints = needsHints ? await Promise.all(wineList.map((w) => lookupKnownWineHints(supabase, w))) : wineList.map(() => null);
      const prompt = [
        CATEGORY_INSTRUCTIONS[o.category],
        o.note ? `Notiz vom Nutzer: ${o.note}` : null,
        '',
        'Weine:',
        ...wineList.map((w, i) => {
          const hint = hints[i];
          const note = w.notes?.trim();
          return `- ${w.name}${w.producer ? ' / ' + w.producer : ''}${w.vintage ? ' ' + w.vintage : ''} (id: ${w.id})${hint ? ` | bereits bekannt: ${hint}` : ''}${note ? ` | Notiz vom Nutzer zu diesem Wein: ${note}` : ''}`;
        }),
      ]
        .filter((line) => line !== null)
        .join('\n');
      return { ...o, email: emailById.get(o.user_id) ?? null, categoryLabel: CATEGORY_LABELS[o.category] ?? o.category, prompt };
    }),
  );
}

async function listPaymentRequests(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('payment_requests')
    .select('id, created_at, user_id, amount, reason, status, paid_at, order_id')
    .order('created_at', { ascending: false });
  if (error) throw error;

  const allUsers = await listAllUsers(supabase);
  const emailById = new Map(allUsers.map((u) => [u.id, u.email ?? null]));

  return (data ?? []).map((p) => ({ ...p, email: emailById.get(p.user_id) ?? null }));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isAuthorized(req)) {
    res.status(401).json({ error: 'Nicht angemeldet.' });
    return;
  }

  const supabase = getSupabaseAdmin();
  const resource = typeof req.query.resource === 'string' ? req.query.resource : null;

  try {
    if (resource === 'orders') {
      if (req.method === 'GET') {
        res.status(200).json({ orders: await listOrders(supabase) });
        return;
      }
      if (req.method === 'PATCH') {
        const { id, status } = (req.body ?? {}) as { id?: string; status?: 'pending' | 'in_progress' | 'done' | 'cancelled' };
        if (!id || !status) {
          res.status(400).json({ error: 'id und status erforderlich.' });
          return;
        }
        // wine_ids vor dem Status-Update lesen, statt sie ueber den Body zu
        // vertrauen - der Auftrag selbst kennt seine Weine bereits.
        const { data: order, error: fetchError } = await supabase
          .from('enrichment_orders')
          .select('wine_ids')
          .eq('id', id)
          .single();
        if (fetchError) throw fetchError;

        const { error } = await supabase.from('enrichment_orders').update({ status }).eq('id', id);
        if (error) throw error;

        if (status === 'done') {
          // Nebeneffekt, kein kritischer Schritt - schlaegt der Cache-Sync
          // fehl, ist der Auftrag trotzdem korrekt als erledigt markiert.
          await syncWineKnowledgeCache(supabase, (order?.wine_ids as string[] | null) ?? []).catch((e) => {
            console.error('wine_knowledge_cache Sync fehlgeschlagen:', e);
          });
        }

        res.status(200).json({ ok: true });
        return;
      }
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    if (resource === 'payments') {
      if (req.method === 'GET') {
        res.status(200).json({ paymentRequests: await listPaymentRequests(supabase) });
        return;
      }
      if (req.method === 'POST') {
        const { userId, amount, reason, orderId } = (req.body ?? {}) as {
          userId?: string;
          amount?: number;
          reason?: string;
          orderId?: string | null;
        };
        if (
          !userId ||
          typeof amount !== 'number' ||
          Number.isNaN(amount) ||
          amount <= 0 ||
          amount > 100_000 ||
          !reason?.trim()
        ) {
          res.status(400).json({ error: 'userId, amount (0 - 100000) und reason erforderlich.' });
          return;
        }
        const { error } = await supabase
          .from('payment_requests')
          .insert({ user_id: userId, amount, reason: reason.trim(), order_id: orderId || null });
        if (error) throw error;
        res.status(200).json({ ok: true });
        return;
      }
      if (req.method === 'PATCH') {
        const { id, status } = (req.body ?? {}) as { id?: string; status?: 'open' | 'paid' | 'cancelled' };
        if (!id || !status) {
          res.status(400).json({ error: 'id und status erforderlich.' });
          return;
        }
        const { error } = await supabase
          .from('payment_requests')
          .update({ status, paid_at: status === 'paid' ? new Date().toISOString() : null })
          .eq('id', id);
        if (error) throw error;
        res.status(200).json({ ok: true });
        return;
      }
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    if (resource === 'pricing') {
      if (req.method === 'GET') {
        const { data, error } = await supabase.from('pricing_config').select(PRICING_FIELDS).eq('id', 1).single();
        if (error) throw error;
        res.status(200).json({ pricing: data });
        return;
      }
      if (req.method === 'PATCH') {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const allowedFields = ['refresh_price', 'neue_weine_price', 'ultra_price', 'minimum_price', 'access_fee'];
        const update: Record<string, number> = {};
        for (const field of allowedFields) {
          const value = body[field];
          if (value === undefined) continue;
          // Ungueltige Werte werden nicht mehr still uebersprungen (sonst wirkt
          // ein Speichern-Klick erfolgreich, obwohl ein Feld z. B. wegen eines
          // Tippfehlers gar nicht uebernommen wurde) - stattdessen ein klarer
          // Fehler, inkl. Obergrenze als Tippfehler-Schutz bei echten Preisen.
          if (typeof value !== 'number' || Number.isNaN(value) || value < 0 || value > 10_000) {
            res.status(400).json({ error: `${field}: ungueltiger Wert (0 - 10000 erwartet).` });
            return;
          }
          update[field] = value;
        }
        if (Object.keys(update).length === 0) {
          res.status(400).json({ error: 'Mindestens ein gueltiges Preisfeld erforderlich.' });
          return;
        }
        const { error } = await supabase
          .from('pricing_config')
          .update({ ...update, updated_at: new Date().toISOString() })
          .eq('id', 1);
        if (error) throw error;
        res.status(200).json({ ok: true });
        return;
      }
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    res.status(400).json({ error: 'resource ("orders"|"payments"|"pricing") erforderlich.' });
  } catch (e) {
    await logError(getSupabaseAdmin(), 'commerce', e);
    res.status(500).json({ error: e instanceof Error ? e.message : 'Unbekannter Fehler.' });
  }
}
