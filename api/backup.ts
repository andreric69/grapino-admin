import type { SupabaseClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from './_types.js';
import { isAuthorized, safeEqualStrings } from './_auth.js';
import { getSupabaseAdmin } from './_supabaseAdmin.js';
import { logError, errorMessage } from './_health.js';

const BUCKET = 'db-backups';
const PHOTOS_BUCKET = 'wine-photos';
const PHOTOS_BACKUP_BUCKET = 'wine-photos-backup';

// Produktregel des Papierkorbs: ein weicher geloeschter Wein (deleted_at
// gesetzt) wird 30 Tage danach endgueltig entfernt - Zeile und Fotos.
const TRASH_RETENTION_DAYS = 30;
// Taegliche Sicherungen werden nach dieser Anzahl Tage geloescht, damit der
// Speicher nicht unbegrenzt waechst - ein privates Backup ist kein Ersatz
// fuer eine echte Punkt-in-der-Zeit-Wiederherstellung eines bezahlten
// Supabase-Plans, sondern nur ein zusaetzliches Sicherheitsnetz. Bei
// aktuell wenigen KB pro Sicherung (siehe unten) waeren selbst deutlich mehr
// Tage kein Speicherproblem - 30 ist grosszuegig genug fuer "vor ein paar
// Wochen war noch alles gut" als Notfall-Referenz.
const RETENTION_DAYS = 30;

// Die wichtigsten, schwer von Hand rekonstruierbaren Tabellen - bewusst
// NICHT wine_recognition_refs (Vektor-Embeddings, gross, aus den Fotos neu
// berechenbar) oder admin_error_log (rein operativ, kein Nutzerdaten-Verlust
// bei Fehlen).
const TABLES = [
  'wines',
  'wine_knowledge_cache',
  'user_access',
  'payment_requests',
  'enrichment_orders',
  'admin_costs',
  'admin_income',
  'announcements',
  'deletion_requests',
  'app_feedback',
  'wine_consumption_log',
  'label_recognition_log',
] as const;

function isAuthorizedForBackup(req: VercelRequest): boolean {
  if (isAuthorized(req)) return true; // manueller Aufruf aus der Admin-App
  const secret = process.env.CRON_SECRET;
  const header = req.headers.authorization;
  return !!secret && !!header && safeEqualStrings(header, `Bearer ${secret}`); // automatischer Vercel-Cron-Aufruf
}

/** Bisheriges taegliches Verhalten: DB-Tabellen + Auth-Nutzer als JSON sichern. Unveraendert. */
async function handleDailyBackup(supabase: SupabaseClient) {
  const dump: Record<string, unknown> = { createdAt: new Date().toISOString() };
  for (const table of TABLES) {
    const { data, error } = await supabase.from(table).select('*');
    if (error) throw error;
    dump[table] = data ?? [];
  }
  const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (authError) throw authError;
  dump.authUsers = authUsers.users.map((u) => ({ id: u.id, email: u.email, created_at: u.created_at }));

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const path = `backup-${timestamp}.json`;
  const body = JSON.stringify(dump);
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, new Blob([body], { type: 'application/json' }), { upsert: false });
  if (uploadError) throw uploadError;

  // Alte Sicherungen aufraeumen - eine nach der anderen pruefen statt alles
  // auf einmal zu listen und zu vergleichen, bleibt so robust auch wenn die
  // Liste mal gross wird.
  const { data: files, error: listError } = await supabase.storage.from(BUCKET).list('', { limit: 1000 });
  if (listError) throw listError;
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const toDelete = (files ?? [])
    .filter((f) => f.name.startsWith('backup-') && new Date(f.created_at ?? 0).getTime() < cutoff)
    .map((f) => f.name);
  if (toDelete.length > 0) {
    const { error: deleteError } = await supabase.storage.from(BUCKET).remove(toDelete);
    if (deleteError) throw deleteError;
  }

  return { ok: true, path, bytes: body.length, deletedOldBackups: toDelete.length };
}

/**
 * Woechentliches, unabhaengiges Backup der Weinfotos: die taegliche
 * DB-Sicherung oben sichert nur Tabellenzeilen - Fotos liegen in Supabase
 * Storage und hatten bisher gar keine eigene Sicherung. Bewusst einfach
 * gehalten (kein inkrementeller Abgleich): jeder referenzierte Pfad wird bei
 * jedem Lauf erneut kopiert, bei wenigen Nutzern/Fotos unproblematisch.
 * Einzelne fehlgeschlagene Fotos brechen den Lauf nicht ab, sondern landen
 * nur in `skipped`.
 */
async function handlePhotoBackup(supabase: SupabaseClient) {
  // Kein Filter auf deleted_at: auch Weine, die erst kuerzlich in den
  // Papierkorb wandern, haben noch gueltige Fotos, die ein Backup wert sind -
  // erst das endgueltige Loeschen (siehe handleTrashPurge) soll das Backup
  // stoppen, nicht schon das weiche Loeschen.
  const { data: wines, error } = await supabase.from('wines').select('user_id, photo_url, photo_urls');
  if (error) throw error;

  const paths = new Set<string>();
  for (const wine of (wines ?? []) as { photo_url: string | null; photo_urls: string[] | null }[]) {
    if (wine.photo_url) paths.add(wine.photo_url);
    for (const p of wine.photo_urls ?? []) {
      if (p) paths.add(p);
    }
  }

  const skipped: string[] = [];
  let backedUp = 0;
  for (const path of paths) {
    const { error: copyError } = await supabase.storage
      .from(PHOTOS_BUCKET)
      .copy(path, path, { destinationBucket: PHOTOS_BACKUP_BUCKET });
    if (copyError) {
      skipped.push(path);
    } else {
      backedUp++;
    }
  }

  return { ok: true, attempted: paths.size, backedUp, skipped };
}

/**
 * Taeglicher Papierkorb-Purge: Weine, die vor mehr als 30 Tagen in den
 * Papierkorb gelegt wurden (deleted_at), werden endgueltig entfernt - Fotos
 * UND Zeile. Die Spalte deleted_at kommt aus einer separaten, noch nicht
 * angewendeten Migration eines Teammitglieds - dieser Job laeuft aber schon
 * vor deren Anwendung auf Zeitplan und muss sich bis dahin ruhig verhalten
 * statt bei jedem Lauf zu alarmieren.
 */
async function handleTrashPurge(supabase: SupabaseClient) {
  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: expired, error } = await supabase
    .from('wines')
    .select('id, photo_url, photo_urls')
    .lt('deleted_at', cutoff);

  if (error) {
    if (/column .*deleted_at.* does not exist/i.test(errorMessage(error))) {
      return { ok: true, purged: 0, note: 'deleted_at column not present yet' };
    }
    throw error;
  }

  let purged = 0;
  for (const wine of (expired ?? []) as { id: string; photo_url: string | null; photo_urls: string[] | null }[]) {
    const paths = [wine.photo_url, ...(wine.photo_urls ?? [])].filter((p): p is string => !!p);
    if (paths.length > 0) {
      // Best-effort: ein bereits fehlendes Foto darf das endgueltige Loeschen
      // der Zeile nicht verhindern.
      await supabase.storage.from(PHOTOS_BUCKET).remove(paths);
      // Auch die Backup-Kopie entfernen, damit ein endgueltig gelöschter Wein
      // nicht im Foto-Backup weiterlebt. Ebenfalls best-effort (z. B. falls
      // Job 1 noch nie gelaufen ist und gar keine Kopie existiert).
      await supabase.storage.from(PHOTOS_BACKUP_BUCKET).remove(paths);
    }
    const { error: deleteError } = await supabase.from('wines').delete().eq('id', wine.id);
    if (deleteError) throw deleteError;
    purged++;
  }

  return { ok: true, purged };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isAuthorizedForBackup(req)) {
    res.status(401).json({ error: 'Nicht angemeldet.' });
    return;
  }

  const supabase = getSupabaseAdmin();
  const jobParam = req.query.job;
  const job = Array.isArray(jobParam) ? jobParam[0] : jobParam;

  try {
    if (job === 'photos') {
      res.status(200).json(await handlePhotoBackup(supabase));
      return;
    }
    if (job === 'purge-trash') {
      res.status(200).json(await handleTrashPurge(supabase));
      return;
    }
    res.status(200).json(await handleDailyBackup(supabase));
  } catch (e) {
    await logError(supabase, job ? `backup?job=${job}` : 'backup', e);
    res.status(500).json({ error: errorMessage(e) });
  }
}
