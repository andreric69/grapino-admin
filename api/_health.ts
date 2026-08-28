import type { SupabaseClient } from '@supabase/supabase-js';
import { sendPush } from './_push.js';

// Verhindert Push-Spam, wenn ein Fehler wiederholt auftritt (z. B. eine
// kaputte Umgebungsvariable, die bei jedem Request erneut fehlschlaegt) -
// erst nach dieser Pause wird fuer denselben oder einen neuen Fehler wieder
// tatsaechlich benachrichtigt. Der Fehler selbst wird trotzdem IMMER
// geloggt, nur die Benachrichtigung wird gedrosselt.
const NOTIFY_COOLDOWN_MS = 10 * 60 * 1000;

/**
 * Extrahiert eine lesbare Fehlermeldung aus einem catch(e)-Wert. NICHT nur
 * `instanceof Error` pruefen: postgrest-js gibt bei einem reinen
 * Netzwerkfehler (DNS-Aussetzer, Timeout, abgebrochene Verbindung zwischen
 * Vercel und Supabase) ein PLAIN OBJECT mit {message, details, hint, code}
 * zurueck statt eine echte PostgrestError-Instanz zu werfen - das faellt
 * durch `instanceof Error` und landete bisher IMMER als "Unbekannter
 * Fehler." im Log, ganz ohne brauchbare Details (live im admin_error_log
 * bestaetigt: jeder einzelne Eintrag zeigte "Unbekannter Fehler." +
 * detail=null). Deshalb hier zusaetzlich ein Objekt mit `message`-Property
 * akzeptieren, bevor auf den generischen Text zurueckgefallen wird.
 */
export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
    return (e as { message: string }).message;
  }
  return 'Unbekannter Fehler.';
}

/**
 * Schreibt einen Fehler in admin_error_log und loest (gedrosselt) eine Push-
 * Benachrichtigung aus. Wirft nie - ein fehlgeschlagenes Logging darf den
 * eigentlich fehlgeschlagenen Request nicht zusaetzlich crashen.
 */
export async function logError(supabase: SupabaseClient, endpoint: string, e: unknown): Promise<void> {
  const message = errorMessage(e);
  const detail = e instanceof Error ? (e.stack ?? null) : e ? JSON.stringify(e) : null;

  try {
    const cutoff = new Date(Date.now() - NOTIFY_COOLDOWN_MS).toISOString();
    const { data: recentNotified } = await supabase
      .from('admin_error_log')
      .select('id')
      .gte('notified_at', cutoff)
      .limit(1);
    const shouldNotify = !recentNotified || recentNotified.length === 0;

    const { data: inserted } = await supabase
      .from('admin_error_log')
      .insert({ endpoint, message, detail })
      .select('id')
      .single();

    if (shouldNotify && inserted) {
      await sendPush(supabase, 'admin', { tag: 'grapino-error', title: 'Grapino Admin - Fehler', body: `${endpoint}: ${message}`, url: '/' });
      await supabase.from('admin_error_log').update({ notified_at: new Date().toISOString() }).eq('id', inserted.id);
    }
  } catch {
    // Logging/Push ist ein Nebeneffekt - nie den urspruenglichen Fehler
    // ueberdecken oder den Request zusaetzlich zum Absturz bringen.
  }
}

/** Guenstiger Erreichbarkeits-Check gegen Supabase mit Zeitmessung. */
export async function pingSupabase(supabase: SupabaseClient): Promise<{ ok: boolean; ms: number }> {
  const start = Date.now();
  try {
    const { error } = await supabase.from('admin_error_log').select('id', { count: 'exact', head: true });
    return { ok: !error, ms: Date.now() - start };
  } catch {
    return { ok: false, ms: Date.now() - start };
  }
}
