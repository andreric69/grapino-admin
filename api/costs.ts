import type { VercelRequest, VercelResponse } from './_types.js';
import { isAuthorized } from './_auth.js';
import { getSupabaseAdmin } from './_supabaseAdmin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isAuthorized(req)) {
    res.status(401).json({ error: 'Nicht angemeldet.' });
    return;
  }

  const supabase = getSupabaseAdmin();

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('admin_costs')
        .select('id, created_at, label, amount, note')
        .order('created_at', { ascending: false });
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
      const { error } = await supabase
        .from('admin_costs')
        .insert({ label: label.trim(), amount, note: note?.trim() || null });
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
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Unbekannter Fehler.' });
  }
}
