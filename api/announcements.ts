import type { VercelRequest, VercelResponse } from './_types.js';
import { isAuthorized } from './_auth.js';
import { getSupabaseAdmin, listAllUsers } from './_supabaseAdmin.js';
import { logError } from './_health.js';

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
        .select('id, created_at, title, body, is_active, target_user_id, type, repeat_every_days')
        .order('created_at', { ascending: false });
      if (error) throw error;

      const allUsers = await listAllUsers(supabase);
      const emailById = new Map(allUsers.map((u) => [u.id, u.email ?? null]));

      const announcements = (data ?? []).map((a) => ({
        ...a,
        target_email: a.target_user_id ? (emailById.get(a.target_user_id) ?? null) : null,
      }));
      res.status(200).json({ announcements });
      return;
    }

    if (req.method === 'POST') {
      const { title, body, targetUserId, type, repeatEveryDays } = (req.body ?? {}) as {
        title?: string;
        body?: string;
        targetUserId?: string | null;
        type?: 'news' | 'update';
        repeatEveryDays?: number | null;
      };
      if (!title?.trim() || !body?.trim()) {
        res.status(400).json({ error: 'title und body erforderlich.' });
        return;
      }
      const { error } = await supabase.from('announcements').insert({
        title: title.trim(),
        body: body.trim(),
        target_user_id: targetUserId || null,
        type: type === 'update' ? 'update' : 'news',
        repeat_every_days: repeatEveryDays && repeatEveryDays > 0 ? repeatEveryDays : null,
      });
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
    await logError(getSupabaseAdmin(), 'announcements', e);
    res.status(500).json({ error: e instanceof Error ? e.message : 'Unbekannter Fehler.' });
  }
}
