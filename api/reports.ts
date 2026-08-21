import type { VercelRequest, VercelResponse } from './_types.js';
import { isAuthorized } from './_auth.js';
import { getSupabaseAdmin } from './_supabaseAdmin.js';
import type { SupabaseClient } from '@supabase/supabase-js';

// Aktivitaets-Feed, Kosten-Uebersicht und Speicher-Uebersicht zusammen in
// einer Datei - wegen Vercels 12-Funktionen-Limit auf dem Hobby-Plan,
// ausgewaehlt via ?resource=activity|costs|storage.

const BUCKET = 'wine-photos';
// Supabase-Speicherlimit fuer den aktuellen Plan (MB) - im Supabase-Dashboard
// unter Settings -> Billing -> Usage nachpruefen/anpassen, falls sich der
// Plan oder das Limit aendert. Free-Tier lag zuletzt bei ca. 1 GB.
const TOTAL_QUOTA_MB = 1024;

interface ActivityEntry {
  at: string;
  type: 'wine_added' | 'wine_consumed' | 'deletion_requested' | 'feedback';
  email: string | null;
  detail: string;
}

const LIMIT_PER_SOURCE = 30;

async function buildActivity(supabase: SupabaseClient): Promise<ActivityEntry[]> {
  const [usersRes, winesRes, consumptionRes, deletionRes, feedbackRes] = await Promise.all([
    supabase.auth.admin.listUsers({ perPage: 200 }),
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
  for (const r of [usersRes, winesRes, consumptionRes, deletionRes, feedbackRes]) {
    if (r.error) throw r.error;
  }

  const emailById = new Map(usersRes.data.users.map((u) => [u.id, u.email ?? null]));

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

async function folderSizeBytes(supabase: SupabaseClient, prefix: string): Promise<number> {
  const { data, error } = await supabase.storage.from(BUCKET).list(prefix, { limit: 1000 });
  if (error) throw error;
  let size = 0;
  for (const entry of data ?? []) {
    if (entry.id === null) {
      size += await folderSizeBytes(supabase, `${prefix}/${entry.name}`);
    } else {
      size += (entry.metadata as { size?: number } | null)?.size ?? 0;
    }
  }
  return size;
}

async function buildStorageUsage(supabase: SupabaseClient) {
  const { data: usersData, error: usersError } = await supabase.auth.admin.listUsers({ perPage: 200 });
  if (usersError) throw usersError;

  const perUser: { userId: string; email: string | null; bytes: number }[] = [];
  let totalBytes = 0;
  for (const u of usersData.users) {
    const bytes = await folderSizeBytes(supabase, u.id);
    totalBytes += bytes;
    perUser.push({ userId: u.id, email: u.email ?? null, bytes });
  }

  const totalQuotaBytes = TOTAL_QUOTA_MB * 1024 * 1024;
  const avgPerUserBytes = usersData.users.length > 0 ? totalBytes / usersData.users.length : 0;
  const remainingBytes = Math.max(0, totalQuotaBytes - totalBytes);
  const estimatedAdditionalUsers = avgPerUserBytes > 0 ? Math.floor(remainingBytes / avgPerUserBytes) : null;

  return {
    perUser: perUser.sort((a, b) => b.bytes - a.bytes),
    totalBytes,
    totalQuotaBytes,
    estimatedAdditionalUsers,
  };
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

    if (resource === 'costs') {
      if (req.method === 'GET') {
        const { data, error } = await supabase.from('admin_costs').select('id, created_at, label, amount, note').order('created_at', { ascending: false });
        if (error) throw error;
        res.status(200).json({ costs: data ?? [] });
        return;
      }
      if (req.method === 'POST') {
        const { label, amount, note } = (req.body ?? {}) as { label?: string; amount?: number; note?: string };
        if (!label?.trim() || typeof amount !== 'number' || Number.isNaN(amount)) {
          res.status(400).json({ error: 'label und amount erforderlich.' });
          return;
        }
        const { error } = await supabase.from('admin_costs').insert({ label: label.trim(), amount, note: note?.trim() || null });
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

    res.status(400).json({ error: 'resource ("activity"|"costs"|"storage") erforderlich.' });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Unbekannter Fehler.' });
  }
}
