import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Schreibt eine Zeile in admin_activity_log - ein leichtgewichtiges Protokoll
 * fuer Andrins eigene, wichtige Admin-Aktionen (Nutzer sperren/entsperren,
 * Testabo verlaengern, Preise aendern), NICHT zu verwechseln mit dem
 * bestehenden Nutzer-Aktivitaets-Feed in reports.ts (?resource=activity).
 *
 * Wirft nie - wie logError() in _health.ts darf ein fehlgeschlagenes Logging
 * die eigentliche Aktion (z. B. das Sperren eines Nutzers), an die es
 * angehaengt ist, nie zusaetzlich zum Scheitern bringen.
 */
export async function logAdminAction(
  supabase: SupabaseClient,
  action: string,
  detail?: string | null,
  userId?: string | null,
): Promise<void> {
  try {
    const { error } = await supabase.from('admin_activity_log').insert({
      action,
      detail: detail ?? null,
      user_id: userId ?? null,
    });
    if (error) console.error('admin_activity_log Insert fehlgeschlagen:', error);
  } catch (e) {
    console.error('admin_activity_log Insert fehlgeschlagen:', e);
  }
}
