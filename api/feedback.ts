import type { VercelRequest, VercelResponse } from './_types.js';
import { isAuthorized } from './_auth.js';
import { getSupabaseAdmin } from './_supabaseAdmin.js';

interface FeedbackRow {
  id: string;
  createdAt: string;
  email: string | null;
  rating: number;
  message: string | null;
  tipAmount: number | null;
  reply: string | null;
}

async function listFeedback(): Promise<FeedbackRow[]> {
  const supabase = getSupabaseAdmin();

  const { data: feedback, error: feedbackError } = await supabase
    .from('app_feedback')
    .select('id, created_at, user_id, rating, message, tip_amount')
    .order('created_at', { ascending: false });
  if (feedbackError) throw feedbackError;
  if (!feedback || feedback.length === 0) return [];

  const { data: usersData, error: usersError } = await supabase.auth.admin.listUsers({ perPage: 200 });
  if (usersError) throw usersError;
  const emailById = new Map(usersData.users.map((u) => [u.id, u.email ?? null]));

  const { data: replies, error: repliesError } = await supabase
    .from('feedback_replies')
    .select('feedback_id, reply');
  if (repliesError) throw repliesError;
  const replyByFeedbackId = new Map((replies ?? []).map((r) => [r.feedback_id, r.reply]));

  return feedback.map((f) => ({
    id: f.id,
    createdAt: f.created_at,
    email: emailById.get(f.user_id) ?? null,
    rating: f.rating,
    message: f.message,
    tipAmount: f.tip_amount,
    reply: replyByFeedbackId.get(f.id) ?? null,
  }));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isAuthorized(req)) {
    res.status(401).json({ error: 'Nicht angemeldet.' });
    return;
  }

  try {
    if (req.method === 'GET') {
      const feedback = await listFeedback();
      res.status(200).json({ feedback });
      return;
    }

    if (req.method === 'POST') {
      const { feedbackId, reply } = (req.body ?? {}) as { feedbackId?: string; reply?: string };
      if (!feedbackId || !reply?.trim()) {
        res.status(400).json({ error: 'feedbackId und reply erforderlich.' });
        return;
      }
      const supabase = getSupabaseAdmin();
      const { error } = await supabase
        .from('feedback_replies')
        .upsert({ feedback_id: feedbackId, reply: reply.trim() }, { onConflict: 'feedback_id' });
      if (error) throw error;
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Unbekannter Fehler.' });
  }
}
