import type { VercelRequest, VercelResponse } from './_types.js';
import { isAuthorized } from './_auth.js';
import { getSupabaseAdmin } from './_supabaseAdmin.js';
import type { SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'wine-photos';
// Supabase-Speicherlimit fuer den aktuellen Plan (MB) - im Supabase-Dashboard
// unter Settings -> Billing -> Usage nachpruefen/anpassen, falls sich der
// Plan oder das Limit aendert. Free-Tier lag zuletzt bei ca. 1 GB.
const TOTAL_QUOTA_MB = 1024;

async function folderSizeBytes(supabase: SupabaseClient, prefix: string): Promise<number> {
  const { data, error } = await supabase.storage.from(BUCKET).list(prefix, { limit: 1000 });
  if (error) throw error;
  let size = 0;
  for (const entry of data ?? []) {
    if (entry.id === null) {
      // "Ordner" - Supabase Storage hat keine echten Ordner, list() liefert
      // dafuer Platzhalter-Eintraege ohne id/metadata.
      size += await folderSizeBytes(supabase, `${prefix}/${entry.name}`);
    } else {
      size += (entry.metadata as { size?: number } | null)?.size ?? 0;
    }
  }
  return size;
}

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
    const { data: usersData, error: usersError } = await supabase.auth.admin.listUsers({ perPage: 200 });
    if (usersError) throw usersError;

    const perUser: { userId: string; email: string | null; bytes: number }[] = [];
    let totalBytes = 0;
    for (const u of usersData.users) {
      const bytes = await folderSizeBytes(supabase, u.id);
      totalBytes += bytes;
      perUser.push({ userId: u.id, email: u.email ?? null, bytes });
    }

    const totalQuotaBytes = TOTAL_QUOTA_MB * 1024 * 1024;
    const avgPerUserBytes = usersData.users.length > 0 ? totalBytes / usersData.users.length : 0;
    const remainingBytes = Math.max(0, totalQuotaBytes - totalBytes);
    const estimatedAdditionalUsers = avgPerUserBytes > 0 ? Math.floor(remainingBytes / avgPerUserBytes) : null;

    res.status(200).json({
      perUser: perUser.sort((a, b) => b.bytes - a.bytes),
      totalBytes,
      totalQuotaBytes,
      estimatedAdditionalUsers,
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Unbekannter Fehler.' });
  }
}
