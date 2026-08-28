import type { VercelRequest, VercelResponse } from './_types.js';
import { isAuthorized } from './_auth.js';
import { getSupabaseAdmin, listAllUsers } from './_supabaseAdmin.js';
import { logError, errorMessage } from './_health.js';

interface DeletionRequestRow {
  id: string;
  userId: string;
  email: string | null;
  createdAt: string;
  status: 'pending' | 'approved' | 'rejected';
  wineCount: number;
}

async function listPendingRequests(): Promise<DeletionRequestRow[]> {
  const supabase = getSupabaseAdmin();

  const { data: requests, error: reqError } = await supabase
    .from('deletion_requests')
    .select('id, user_id, created_at, status')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (reqError) throw reqError;
  if (!requests || requests.length === 0) return [];

  const userIds = Array.from(new Set(requests.map((r) => r.user_id)));

  const allUsers = await listAllUsers(supabase);
  const emailById = new Map(allUsers.map((u) => [u.id, u.email ?? null]));

  const { data: wines, error: winesError } = await supabase
    .from('wines')
    .select('user_id')
    .in('user_id', userIds);
  if (winesError) throw winesError;
  const wineCountByUser = new Map<string, number>();
  for (const row of wines ?? []) {
    wineCountByUser.set(row.user_id, (wineCountByUser.get(row.user_id) ?? 0) + 1);
  }

  return requests.map((r) => ({
    id: r.id,
    userId: r.user_id,
    email: emailById.get(r.user_id) ?? null,
    createdAt: r.created_at,
    status: r.status,
    wineCount: wineCountByUser.get(r.user_id) ?? 0,
  }));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isAuthorized(req)) {
    res.status(401).json({ error: 'Nicht angemeldet.' });
    return;
  }

  try {
    if (req.method === 'GET') {
      const requests = await listPendingRequests();
      res.status(200).json({ requests });
      return;
    }

    if (req.method === 'POST') {
      const { requestId, action } = (req.body ?? {}) as { requestId?: string; action?: 'approve' | 'reject' };
      if (!requestId || (action !== 'approve' && action !== 'reject')) {
        res.status(400).json({ error: 'requestId und action ("approve"|"reject") erforderlich.' });
        return;
      }

      const supabase = getSupabaseAdmin();
      const { data: request, error: fetchError } = await supabase
        .from('deletion_requests')
        .select('id, user_id, status')
        .eq('id', requestId)
        .single();
      if (fetchError) throw fetchError;
      if (!request || request.status !== 'pending') {
        res.status(409).json({ error: 'Anfrage ist nicht mehr offen (evtl. bereits bearbeitet).' });
        return;
      }

      // Der SELECT oben diente nur der Vorpruefung/Anzeige - zwischen ihm und
      // hier koennte der Nutzer die Anfrage in der Weinapp selbst zurueck-
      // genommen haben (er darf das, solange sie noch "pending" ist). Deshalb
      // wird der Status-Wechsel selbst atomar UND ZUERST gemacht (bedingt auf
      // status='pending', mit .select() um zu sehen ob wirklich eine Zeile
      // getroffen wurde) - erst wenn dieser "Claim" wirklich glueckt, werden
      // die eigentlich zerstoerenden Schritte (Fotos/Weine loeschen)
      // ausgefuehrt. Vorher lief das in der falschen Reihenfolge (erst
      // loeschen, dann Status setzen, ohne den Claim zu pruefen) - eine
      // zwischenzeitliche Ruecknahme haette die Weine trotzdem geloescht,
      // aber am Ende lautlos 0 Zeilen aktualisiert, ohne dass das auffiel.
      const { data: claimed, error: claimError } = await supabase
        .from('deletion_requests')
        .update({ status: action === 'approve' ? 'approved' : 'rejected', reviewed_at: new Date().toISOString() })
        .eq('id', requestId)
        .eq('status', 'pending')
        .select('id');
      if (claimError) throw claimError;
      if (!claimed || claimed.length === 0) {
        res.status(409).json({ error: 'Anfrage ist nicht mehr offen (evtl. inzwischen zurueckgenommen oder bereits bearbeitet).' });
        return;
      }

      if (action === 'approve') {
        // Fotos aus dem Storage-Bucket UND alle Weine des Nutzers loeschen -
        // dieselbe Aktion, die vorher direkt aus der Weinapp heraus lief.
        const { data: wines, error: winesError } = await supabase
          .from('wines')
          .select('photo_url, photo_urls')
          .eq('user_id', request.user_id);
        if (winesError) throw winesError;

        const paths = (wines ?? []).flatMap((w) => [w.photo_url, ...(w.photo_urls ?? [])]).filter((p): p is string => !!p);
        if (paths.length > 0) {
          const { error: storageError } = await supabase.storage.from('wine-photos').remove(paths);
          if (storageError) throw storageError;
        }

        const { error: deleteError } = await supabase.from('wines').delete().eq('user_id', request.user_id);
        if (deleteError) throw deleteError;
      }

      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    await logError(getSupabaseAdmin(), 'deletion-requests', e);
    res.status(500).json({ error: errorMessage(e) });
  }
}
