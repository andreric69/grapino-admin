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

    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId);
    if (userError) throw userError;
    const user = userData.user;

    const [
      winesRes,
      announcementsRes,
      dismissalsRes,
      feedbackRes,
      deletionRes,
      paymentRes,
      ordersRes,
      notesRes,
    ] = await Promise.all([
      supabase.from('wines').select('id, price, is_consumed, is_wishlist').eq('user_id', userId),
      supabase
        .from('announcements')
        .select('id, created_at, title, type, target_user_id')
        .order('created_at', { ascending: false })
        .limit(50),
      supabase.from('announcement_dismissals').select('announcement_id, dismissed_at').eq('user_id', userId),
      supabase.from('app_feedback').select('id, created_at, rating').eq('user_id', userId).order('created_at', { ascending: false }),
      supabase
        .from('deletion_requests')
        .select('id, created_at, status')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),
      supabase
        .from('payment_requests')
        .select('id, created_at, amount, reason, status, paid_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),
      supabase
        .from('enrichment_orders')
        .select('id, created_at, category, wine_count, estimated_price, status, note')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),
      supabase.from('admin_user_notes').select('id, created_at, note').eq('user_id', userId).order('created_at', { ascending: false }),
    ]);
    for (const r of [winesRes, announcementsRes, dismissalsRes, feedbackRes, deletionRes, paymentRes, ordersRes, notesRes]) {
      if (r.error) throw r.error;
    }

    const dismissedAt = new Map((dismissalsRes.data ?? []).map((d) => [d.announcement_id, d.dismissed_at]));
    const announcements = (announcementsRes.data ?? [])
      .filter((a) => a.target_user_id === null || a.target_user_id === userId)
      .slice(0, 20)
      .map((a) => ({ ...a, seenAt: dismissedAt.get(a.id) ?? null }));

    const wines = winesRes.data ?? [];
    const activeWines = wines.filter((w) => !w.is_consumed && !w.is_wishlist);

    res.status(200).json({
      profile: {
        id: user.id,
        email: user.email ?? null,
        displayName: (user.user_metadata?.display_name as string | undefined) ?? null,
        createdAt: user.created_at,
        lastSignInAt: user.last_sign_in_at ?? null,
        bannedUntil: user.banned_until && new Date(user.banned_until) > new Date() ? user.banned_until : null,
      },
      wineStats: {
        total: wines.length,
        active: activeWines.length,
        totalValue: activeWines.reduce((sum, w) => sum + (w.price ?? 0), 0),
        withPrice: activeWines.filter((w) => w.price !== null).length,
      },
      announcements,
      feedback: feedbackRes.data ?? [],
      deletionRequests: deletionRes.data ?? [],
      paymentRequests: paymentRes.data ?? [],
      orders: ordersRes.data ?? [],
      notes: notesRes.data ?? [],
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Unbekannter Fehler.' });
  }
}
