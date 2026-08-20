import type { VercelRequest, VercelResponse } from './_types.js';
import { isAuthorized } from './_auth.js';
import { getSupabaseAdmin } from './_supabaseAdmin.js';

interface ActivityEntry {
  at: string;
  type: 'wine_added' | 'wine_consumed' | 'deletion_requested' | 'feedback';
  email: string | null;
  detail: string;
}

const LIMIT_PER_SOURCE = 30;

// Kein eigenes Audit-Log noetig: die Aktivitaet ergibt sich schon aus vier
// bestehenden Tabellen. Hier nur zusammengefuehrt und nach Zeit sortiert -
// echte Login-Historie ist damit NICHT abgedeckt (Supabase liefert dafuer
// nur den letzten Login, siehe Nutzerliste), fuer den Rest reicht das.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isAuthorized(req)) {
    res.status(401).json({ error: 'Nicht angemeldet.' });
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const supabase = getSupabaseAdmin();

    const [usersRes, winesRes, consumptionRes, deletionRes, feedbackRes] = await Promise.all([
      supabase.auth.admin.listUsers({ perPage: 200 }),
      supabase
        .from('wines')
        .select('created_at, user_id, name')
        .order('created_at', { ascending: false })
        .limit(LIMIT_PER_SOURCE),
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
      supabase
        .from('app_feedback')
        .select('created_at, user_id, rating')
        .order('created_at', { ascending: false })
        .limit(LIMIT_PER_SOURCE),
    ]);
    if (usersRes.error) throw usersRes.error;
    if (winesRes.error) throw winesRes.error;
    if (consumptionRes.error) throw consumptionRes.error;
    if (deletionRes.error) throw deletionRes.error;
    if (feedbackRes.error) throw feedbackRes.error;

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

    res.status(200).json({ entries: entries.slice(0, 50) });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Unbekannter Fehler.' });
  }
}
