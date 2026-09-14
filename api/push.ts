import type { VercelRequest, VercelResponse } from './_types.js';
import { isAuthorized, safeEqualStrings } from './_auth.js';
import { getSupabaseAdmin, listAllUsers } from './_supabaseAdmin.js';
import { sendPush } from './_push.js';
import { errorMessage, notifyErrorIfDue } from './_health.js';

const CATEGORY_LABELS: Record<string, string> = {
  allgemein: 'Allgemein',
  vorschlag: 'Vorschlag',
};

interface SubscriptionKeys {
  p256dh: string;
  auth: string;
}
interface PushSubscriptionBody {
  endpoint: string;
  keys: SubscriptionKeys;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const resource = typeof req.query.resource === 'string' ? req.query.resource : null;

  // Dieser Zweig wird vom Postgres-Trigger (net.http_post) aufgerufen, nicht
  // von einer eingeloggten Admin-Session - deshalb eigene Pruefung ueber ein
  // geteiltes Secret statt isAuthorized().
  if (resource === 'notify-message') {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    const secret = process.env.PUSH_WEBHOOK_SECRET;
    const provided = req.headers['x-push-webhook-secret'];
    if (!secret || typeof provided !== 'string' || !safeEqualStrings(provided, secret)) {
      res.status(401).json({ error: 'Nicht autorisiert.' });
      return;
    }
    const { id, user_id, category, message } = (req.body ?? {}) as {
      id?: string;
      user_id?: string;
      category?: string;
      message?: string;
    };
    try {
      const supabase = getSupabaseAdmin();
      let who = user_id ?? '';
      if (user_id) {
        const users = await listAllUsers(supabase);
        who = users.find((u) => u.id === user_id)?.email ?? user_id;
      }
      const categoryLabel = category ? (CATEGORY_LABELS[category] ?? category) : '';
      await sendPush(supabase, 'admin', {
        tag: id ? `grapino-message-${id}` : 'grapino-message',
        type: 'show',
        title: 'Neue Nachricht',
        body: `${who}${categoryLabel ? ' - ' + categoryLabel : ''}: ${message ?? ''}`.trim(),
        url: '/',
      });
      res.status(200).json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: errorMessage(e) });
    }
    return;
  }

  // Wird von der Haupt-Weinapp aufgerufen (siehe
  // claude weinapp/api/_errorLog.ts), nicht von einem Postgres-Trigger - die
  // Weinapp hat bewusst kein eigenes VAPID-Schluesselpaar/web-push-Abhaengigkeit
  // (Zero-Cost/schlanke Architektur, siehe NOTFALL/README.md), sondern
  // schreibt den admin_error_log-Eintrag selbst direkt per service_role
  // (gleiches Supabase-Projekt) und ruft hier nur noch die eigentliche
  // Push-Zustellung ab - gleiches geteiltes Secret wie beim
  // notify-message-Pfad oben, gleiche Drossel-Logik wie fuer Admin-App-eigene
  // Fehler (siehe notifyErrorIfDue in _health.ts).
  if (resource === 'notify-error') {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    const secret = process.env.PUSH_WEBHOOK_SECRET;
    const provided = req.headers['x-push-webhook-secret'];
    if (!secret || typeof provided !== 'string' || !safeEqualStrings(provided, secret)) {
      res.status(401).json({ error: 'Nicht autorisiert.' });
      return;
    }
    const { id, endpoint, message } = (req.body ?? {}) as { id?: string; endpoint?: string; message?: string };
    if (!id || !endpoint || !message) {
      res.status(400).json({ error: 'id, endpoint, message erforderlich.' });
      return;
    }
    try {
      const supabase = getSupabaseAdmin();
      await notifyErrorIfDue(supabase, id, endpoint, message);
      res.status(200).json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: errorMessage(e) });
    }
    return;
  }

  if (!isAuthorized(req)) {
    res.status(401).json({ error: 'Nicht angemeldet.' });
    return;
  }

  if (resource === 'vapid-public-key') {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    res.status(200).json({ publicKey: process.env.VAPID_PUBLIC_KEY ?? null });
    return;
  }

  if (resource === 'subscribe') {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    const { subscription } = (req.body ?? {}) as { subscription?: PushSubscriptionBody };
    if (!subscription?.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
      res.status(400).json({ error: 'subscription erforderlich.' });
      return;
    }
    try {
      const supabase = getSupabaseAdmin();
      const { error } = await supabase.from('push_subscriptions').upsert(
        {
          scope: 'admin',
          endpoint: subscription.endpoint,
          p256dh: subscription.keys.p256dh,
          auth_key: subscription.keys.auth,
        },
        { onConflict: 'endpoint' },
      );
      if (error) throw error;
      res.status(200).json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: errorMessage(e) });
    }
    return;
  }

  res.status(404).json({ error: 'Unbekannte Resource.' });
}
