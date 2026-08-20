import type { VercelRequest, VercelResponse } from './_types.js';
import { isAuthorized } from './_auth.js';
import { getSupabaseAdmin } from './_supabaseAdmin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isAuthorized(req)) {
    res.status(401).json({ error: 'Nicht angemeldet.' });
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const userId = typeof req.query.userId === 'string' ? req.query.userId : null;
  if (!userId) {
    res.status(400).json({ error: 'userId erforderlich.' });
    return;
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('wines')
      .select('id, name, producer, vintage, quantity, is_consumed, is_wishlist')
      .eq('user_id', userId)
      .order('name', { ascending: true });
    if (error) throw error;
    res.status(200).json({ wines: data ?? [] });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Unbekannter Fehler.' });
  }
}
