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
        .from('payment_requests')
        .select('id, created_at, user_id, amount, reason, status, paid_at, order_id')
        .order('created_at', { ascending: false });
      if (error) throw error;

      const { data: usersData, error: usersError } = await supabase.auth.admin.listUsers({ perPage: 200 });
      if (usersError) throw usersError;
      const emailById = new Map(usersData.users.map((u) => [u.id, u.email ?? null]));

      res.status(200).json({
        paymentRequests: (data ?? []).map((p) => ({ ...p, email: emailById.get(p.user_id) ?? null })),
      });
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
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Unbekannter Fehler.' });
  }
}
