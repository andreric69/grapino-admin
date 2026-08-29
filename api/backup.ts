import type { VercelRequest, VercelResponse } from './_types.js';
import { isAuthorized } from './_auth.js';
import { getSupabaseAdmin } from './_supabaseAdmin.js';
import { logError, errorMessage } from './_health.js';

const BUCKET = 'db-backups';
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
  return !!secret && header === `Bearer ${secret}`; // automatischer Vercel-Cron-Aufruf
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isAuthorizedForBackup(req)) {
    res.status(401).json({ error: 'Nicht angemeldet.' });
    return;
  }

  const supabase = getSupabaseAdmin();

  try {
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

    res.status(200).json({ ok: true, path, bytes: body.length, deletedOldBackups: toDelete.length });
  } catch (e) {
    await logError(supabase, 'backup', e);
    res.status(500).json({ error: errorMessage(e) });
  }
}
