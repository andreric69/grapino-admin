import type { VercelRequest, VercelResponse } from './_types.js';
import { isAuthorized } from './_auth.js';
import { getSupabaseAdmin } from './_supabaseAdmin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isAuthorized(req)) {
    res.status(401).json({ error: 'Nicht angemeldet.' });
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.RESEND_FROM_ADDRESS;
  if (!apiKey || !fromAddress) {
    res.status(500).json({ error: 'RESEND_API_KEY/RESEND_FROM_ADDRESS fehlen in den Umgebungsvariablen.' });
    return;
  }

  const { userId, subject, body } = (req.body ?? {}) as { userId?: string; subject?: string; body?: string };
  if (!userId || !subject?.trim() || !body?.trim()) {
    res.status(400).json({ error: 'userId, subject und body erforderlich.' });
    return;
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId);
    if (userError) throw userError;
    const to = userData.user.email;
    if (!to) {
      res.status(400).json({ error: 'Nutzer hat keine E-Mail-Adresse.' });
      return;
    }

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: fromAddress,
        to,
        subject: subject.trim(),
        html: body.trim().replace(/\n/g, '<br>'),
      }),
    });
    if (!resendRes.ok) {
      const errBody = await resendRes.text();
      throw new Error(`Resend-Fehler (${resendRes.status}): ${errBody}`);
    }
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Unbekannter Fehler.' });
  }
}
