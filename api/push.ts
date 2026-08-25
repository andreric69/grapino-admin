import type { VercelRequest, VercelResponse } from './_types.js';
import { isAuthorized } from './_auth.js';
import { getSupabaseAdmin, listAllUsers } from './_supabaseAdmin.js';
import { sendPush } from './_push.js';

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
    if (!secret || req.headers['x-push-webhook-secret'] !== secret) {
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
      res.status(500).json({ error: e instanceof Error ? e.message : 'Unbekannter Fehler.' });
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
      res.status(500).json({ error: e instanceof Error ? e.message : 'Unbekannter Fehler.' });
    }
    return;
  }

  res.status(404).json({ error: 'Unbekannte Resource.' });
}
