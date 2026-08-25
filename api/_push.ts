import webpush from 'web-push';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface PushPayload {
  /** Eindeutiger Bezeichner dieser Benachrichtigung - identisch fuer die
   * "zeigen"- und die spaetere "schliessen"-Nachricht desselben Ereignisses,
   * damit ein Geraet die richtige Notification per getNotifications({tag})
   * wiederfindet. */
  tag: string;
  /** 'close' schliesst eine zuvor gezeigte Benachrichtigung mit gleichem tag
   * auf allen Geraeten wieder (z. B. sobald die Nachricht in der Admin-App
   * als gelesen markiert wurde) - title/body werden dann ignoriert. */
  type?: 'show' | 'close';
  title?: string;
  body?: string;
  url?: string;
}

function vapidConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
}

/**
 * Verschickt eine Push-Benachrichtigung an alle abonnierten Geraete des
 * angegebenen Scopes ('admin' bis auf Weiteres - 'customer' ist fuer eine
 * spaetere Erweiterung auf die Weinapp vorgesehen, siehe push_subscriptions).
 * Still (kein Throw) wenn VAPID nicht konfiguriert ist oder niemand
 * abonniert hat - Push ist immer ein Nebeneffekt, nie kritisch fuer den
 * aufrufenden Request.
 */
export async function sendPush(supabase: SupabaseClient, scope: 'admin' | 'customer', payload: PushPayload): Promise<void> {
  if (!vapidConfigured()) return;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT!, process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);

  const { data: subs, error } = await supabase.from('push_subscriptions').select('id, endpoint, p256dh, auth_key').eq('scope', scope);
  if (error || !subs || subs.length === 0) return;

  const body = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } }, body);
      } catch (e) {
        // 404/410 = Abo ist beim Push-Dienst nicht mehr gueltig (Browser-Profil
        // geloescht, Berechtigung entzogen etc.) - aufraeumen statt bei jedem
        // weiteren Versuch erneut zu scheitern.
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id);
        }
      }
    }),
  );
}
