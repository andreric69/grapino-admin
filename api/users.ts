import type { VercelRequest, VercelResponse } from './_types.js';
import { isAuthorized } from './_auth.js';
import { getSupabaseAdmin } from './_supabaseAdmin.js';
import type { SupabaseClient } from '@supabase/supabase-js';

// "Deaktivieren" heisst: 10 Jahre gesperrt (Supabase kennt kein permanentes
// Sperren, nur eine Dauer) - in der Praxis dauerhaft, aber jederzeit ueber
// "none" wieder aufhebbar, ohne dass Daten angetastet werden.
const BAN_DURATION = '87600h';

interface AdminUserRow {
  id: string;
  email: string | null;
  displayName: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  bannedUntil: string | null;
  wineCount: number;
}

async function listUsersWithWineCounts(supabase: SupabaseClient): Promise<AdminUserRow[]> {
  const { data: usersData, error: usersError } = await supabase.auth.admin.listUsers({ perPage: 200 });
  if (usersError) throw usersError;

  const { data: wines, error: winesError } = await supabase.from('wines').select('user_id');
  if (winesError) throw winesError;

  const wineCountByUser = new Map<string, number>();
  for (const row of wines ?? []) {
    wineCountByUser.set(row.user_id, (wineCountByUser.get(row.user_id) ?? 0) + 1);
  }

  return usersData.users
    .map((u) => ({
      id: u.id,
      email: u.email ?? null,
      displayName: (u.user_metadata?.display_name as string | undefined) ?? null,
      createdAt: u.created_at,
      lastSignInAt: u.last_sign_in_at ?? null,
      // ban_duration liegt weit in der Zukunft, wenn aktiv gesperrt; sonst leer.
      bannedUntil: u.banned_until && new Date(u.banned_until) > new Date() ? u.banned_until : null,
      wineCount: wineCountByUser.get(u.id) ?? 0,
    }))
    .sort((a, b) => a.email?.localeCompare(b.email ?? '') ?? 0);
}

async function getUserDetail(supabase: SupabaseClient, userId: string) {
  const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId);
  if (userError) throw userError;
  const user = userData.user;

  const [winesRes, announcementsRes, dismissalsRes, feedbackRes, deletionRes, paymentRes, ordersRes, notesRes] =
    await Promise.all([
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

  return {
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
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isAuthorized(req)) {
    res.status(401).json({ error: 'Nicht angemeldet.' });
    return;
  }

  const supabase = getSupabaseAdmin();

  try {
    if (req.method === 'GET') {
      const userId = typeof req.query.userId === 'string' ? req.query.userId : null;
      if (userId) {
        res.status(200).json(await getUserDetail(supabase, userId));
        return;
      }
      const users = await listUsersWithWineCounts(supabase);
      res.status(200).json({ users });
      return;
    }

    if (req.method === 'POST') {
      const body = (req.body ?? {}) as {
        userId?: string;
        action?: 'ban' | 'unban' | 'create' | 'setDisplayName' | 'addNote';
        email?: string;
        password?: string;
        displayName?: string;
        note?: string;
      };

      if (body.action === 'create') {
        const email = body.email?.trim();
        const password = body.password;
        if (!email || !password || password.length < 8) {
          res.status(400).json({ error: 'E-Mail und Passwort (mind. 8 Zeichen) erforderlich.' });
          return;
        }
        const { error } = await supabase.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: body.displayName?.trim() ? { display_name: body.displayName.trim() } : undefined,
        });
        if (error) throw error;
        res.status(200).json({ ok: true });
        return;
      }

      if (body.action === 'setDisplayName') {
        if (!body.userId) {
          res.status(400).json({ error: 'userId erforderlich.' });
          return;
        }
        const { error } = await supabase.auth.admin.updateUserById(body.userId, {
          user_metadata: { display_name: body.displayName?.trim() || null },
        });
        if (error) throw error;
        res.status(200).json({ ok: true });
        return;
      }

      if (body.action === 'addNote') {
        if (!body.userId || !body.note?.trim()) {
          res.status(400).json({ error: 'userId und note erforderlich.' });
          return;
        }
        const { error } = await supabase.from('admin_user_notes').insert({ user_id: body.userId, note: body.note.trim() });
        if (error) throw error;
        res.status(200).json({ ok: true });
        return;
      }

      if (!body.userId || (body.action !== 'ban' && body.action !== 'unban')) {
        res.status(400).json({ error: 'userId und action erforderlich.' });
        return;
      }
      const { error } = await supabase.auth.admin.updateUserById(body.userId, {
        ban_duration: body.action === 'ban' ? BAN_DURATION : 'none',
      });
      if (error) throw error;
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Unbekannter Fehler.' });
  }
}
