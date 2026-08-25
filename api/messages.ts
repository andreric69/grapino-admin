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
        .from('user_messages')
        .select('id, created_at, user_id, category, message, read_at')
        .order('created_at', { ascending: false });
      if (error) throw error;

      const users = await listAllUsers(supabase);
      const emailById = new Map(users.map((u) => [u.id, u.email ?? null]));

      res.status(200).json({
        messages: (data ?? []).map((m) => ({ ...m, email: emailById.get(m.user_id) ?? null })),
      });
      return;
    }

    if (req.method === 'PATCH') {
      const { id } = (req.body ?? {}) as { id?: string };
      if (!id) {
        res.status(400).json({ error: 'id erforderlich.' });
        return;
      }
      const { error } = await supabase.from('user_messages').update({ read_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    await logError(supabase, 'messages', e);
    res.status(500).json({ error: e instanceof Error ? e.message : 'Unbekannter Fehler.' });
  }
}
