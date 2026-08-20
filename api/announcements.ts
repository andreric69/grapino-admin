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
        .from('announcements')
        .select('id, created_at, title, body, is_active')
        .order('created_at', { ascending: false });
      if (error) throw error;
      res.status(200).json({ announcements: data ?? [] });
      return;
    }

    if (req.method === 'POST') {
      const { title, body } = (req.body ?? {}) as { title?: string; body?: string };
      if (!title?.trim() || !body?.trim()) {
        res.status(400).json({ error: 'title und body erforderlich.' });
        return;
      }
      const { error } = await supabase.from('announcements').insert({ title: title.trim(), body: body.trim() });
      if (error) throw error;
      res.status(200).json({ ok: true });
      return;
    }

    if (req.method === 'PATCH') {
      const { id, is_active } = (req.body ?? {}) as { id?: string; is_active?: boolean };
      if (!id || typeof is_active !== 'boolean') {
        res.status(400).json({ error: 'id und is_active erforderlich.' });
        return;
      }
      const { error } = await supabase.from('announcements').update({ is_active }).eq('id', id);
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
      const { error } = await supabase.from('announcements').delete().eq('id', id);
      if (error) throw error;
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Unbekannter Fehler.' });
  }
}
