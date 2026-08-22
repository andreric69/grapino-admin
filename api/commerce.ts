import type { VercelRequest, VercelResponse } from './_types.js';
import { isAuthorized } from './_auth.js';
import { getSupabaseAdmin } from './_supabaseAdmin.js';
import type { SupabaseClient } from '@supabase/supabase-js';

// Auftraege, Zahlungsanfragen und Preise zusammen in einer Datei - wegen
// Vercels 12-Funktionen-Limit auf dem Hobby-Plan, ausgewaehlt via
// ?resource=orders|payments|pricing.

const PRICING_FIELDS =
  'trinkfenster_price, name_price, refresh_price, neue_weine_price, ultra_price, minimum_price, access_fee, updated_at';

const CATEGORY_LABELS: Record<string, string> = {
  trinkfenster: 'Nur Trinkfenster',
  name: 'Nur Name',
  refresh: 'Refresh (alles aktualisieren)',
  neue_weine: 'Fuer neue Weine',
  ultra: 'Ultra Import Paket',
};

const CATEGORY_INSTRUCTIONS: Record<string, string> = {
  trinkfenster: 'Fuer die unten gelisteten Weine bitte AUSSCHLIESSLICH das Trinkfenster (drink_from/drink_to) recherchieren und eintragen. Sonst nichts aendern.',
  name: 'Fuer die unten gelisteten Weine bitte AUSSCHLIESSLICH Name/Bezeichnung pruefen und ggf. korrigieren. Sonst nichts aendern.',
  refresh: 'Fuer die unten gelisteten Weine bitte ALLE recherchierbaren Angaben aktualisieren (Region, Subregion, Rebsorte, Trinkfenster, Kritiker-Punkte, Food-Pairing etc).',
  neue_weine: 'Die unten gelisteten Weine sind neu und haben kaum Angaben - bitte alle Basisdaten ergaenzen (Region, Rebsorte, Trinkfenster etc), wo recherchierbar.',
  ultra: 'Fuer die unten gelisteten Weine bitte RUNDUM-SORGLOS-Recherche: Fotos (Etikett, klar erkennbar), Region/Subregion, Rebsorte, Trinkfenster, Kritiker-Punkte, Food-Pairing - alles Verfuegbare.',
};

interface WineRef {
  id: string;
  name: string;
  producer: string | null;
  vintage: number | null;
}

async function listOrders(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('enrichment_orders')
    .select('id, created_at, user_id, category, wine_ids, wine_count, estimated_price, status, note')
    .order('created_at', { ascending: false });
  if (error) throw error;

  const { data: usersData, error: usersError } = await supabase.auth.admin.listUsers({ perPage: 200 });
  if (usersError) throw usersError;
  const emailById = new Map(usersData.users.map((u) => [u.id, u.email ?? null]));

  const orders = data ?? [];
  const allWineIds = Array.from(new Set(orders.flatMap((o) => o.wine_ids as string[])));
  const { data: wines, error: winesError } =
    allWineIds.length > 0
      ? await supabase.from('wines').select('id, name, producer, vintage').in('id', allWineIds)
      : { data: [], error: null };
  if (winesError) throw winesError;
  const wineById = new Map<string, WineRef>((wines ?? []).map((w) => [w.id, w as WineRef]));

  return orders.map((o) => {
    const wineList = (o.wine_ids as string[]).map((id) => wineById.get(id)).filter((w): w is WineRef => w !== undefined);
    const prompt = [
      CATEGORY_INSTRUCTIONS[o.category],
      o.note ? `Notiz vom Nutzer: ${o.note}` : null,
      '',
      'Weine:',
      ...wineList.map((w) => `- ${w.name}${w.producer ? ' / ' + w.producer : ''}${w.vintage ? ' ' + w.vintage : ''} (id: ${w.id})`),
    ]
      .filter((line) => line !== null)
      .join('\n');
    return { ...o, email: emailById.get(o.user_id) ?? null, categoryLabel: CATEGORY_LABELS[o.category] ?? o.category, prompt };
  });
}

async function listPaymentRequests(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('payment_requests')
    .select('id, created_at, user_id, amount, reason, status, paid_at, order_id')
    .order('created_at', { ascending: false });
  if (error) throw error;

  const { data: usersData, error: usersError } = await supabase.auth.admin.listUsers({ perPage: 200 });
  if (usersError) throw usersError;
  const emailById = new Map(usersData.users.map((u) => [u.id, u.email ?? null]));

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
        const { error } = await supabase.from('enrichment_orders').update({ status }).eq('id', id);
        if (error) throw error;
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
        if (!userId || typeof amount !== 'number' || amount <= 0 || !reason?.trim()) {
          res.status(400).json({ error: 'userId, amount (>0) und reason erforderlich.' });
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
        const allowedFields = [
          'trinkfenster_price',
          'name_price',
          'refresh_price',
          'neue_weine_price',
          'ultra_price',
          'minimum_price',
          'access_fee',
        ];
        const update: Record<string, number> = {};
        for (const field of allowedFields) {
          const value = body[field];
          if (typeof value === 'number' && !Number.isNaN(value) && value >= 0) update[field] = value;
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
    res.status(500).json({ error: e instanceof Error ? e.message : 'Unbekannter Fehler.' });
  }
}
