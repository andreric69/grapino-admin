import type { VercelRequest, VercelResponse } from './_types.js';
import { isAuthorized } from './_auth.js';
import { getSupabaseAdmin } from './_supabaseAdmin.js';

// "Deaktivieren" heisst: 10 Jahre gesperrt (Supabase kennt kein permanentes
// Sperren, nur eine Dauer) - in der Praxis dauerhaft, aber jederzeit ueber
// "none" wieder aufhebbar, ohne dass Daten angetastet werden.
const BAN_DURATION = '87600h';

interface AdminUserRow {
  id: string;
  email: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  bannedUntil: string | null;
  wineCount: number;
}

async function listUsersWithWineCounts(): Promise<AdminUserRow[]> {
  const supabase = getSupabaseAdmin();

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
      createdAt: u.created_at,
      lastSignInAt: u.last_sign_in_at ?? null,
      // ban_duration liegt weit in der Zukunft, wenn aktiv gesperrt; sonst leer.
      bannedUntil: u.banned_until && new Date(u.banned_until) > new Date() ? u.banned_until : null,
      wineCount: wineCountByUser.get(u.id) ?? 0,
    }))
    .sort((a, b) => a.email?.localeCompare(b.email ?? '') ?? 0);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isAuthorized(req)) {
    res.status(401).json({ error: 'Nicht angemeldet.' });
    return;
  }

  try {
    if (req.method === 'GET') {
      const users = await listUsersWithWineCounts();
      res.status(200).json({ users });
      return;
    }

    if (req.method === 'POST') {
      const { userId, action } = (req.body ?? {}) as { userId?: string; action?: 'ban' | 'unban' };
      if (!userId || (action !== 'ban' && action !== 'unban')) {
        res.status(400).json({ error: 'userId und action ("ban"|"unban") erforderlich.' });
        return;
      }
      const supabase = getSupabaseAdmin();
      const { error } = await supabase.auth.admin.updateUserById(userId, {
        ban_duration: action === 'ban' ? BAN_DURATION : 'none',
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
