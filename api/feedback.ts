import type { VercelRequest, VercelResponse } from './_types.js';
import { isAuthorized } from './_auth.js';
import { getSupabaseAdmin, listAllUsers } from './_supabaseAdmin.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { logError, errorMessage } from './_health.js';

interface FeedbackRow {
  id: string;
  createdAt: string;
  email: string | null;
  rating: number;
  message: string | null;
  tipAmount: number | null;
  reply: string | null;
}

async function listFeedback(supabase: SupabaseClient): Promise<FeedbackRow[]> {
  const { data: feedback, error: feedbackError } = await supabase
    .from('app_feedback')
    .select('id, created_at, user_id, rating, message, tip_amount')
    .order('created_at', { ascending: false });
  if (feedbackError) throw feedbackError;
  if (!feedback || feedback.length === 0) return [];

  const allUsers = await listAllUsers(supabase);
  const emailById = new Map(allUsers.map((u) => [u.id, u.email ?? null]));

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

// Feedback-Anfragen (Admin fragt aktiv Feedback bei einer Person an) leben
// wegen Vercels 12-Funktionen-Limit auf dem Hobby-Plan hier mit drin statt
// in einer eigenen Datei - via ?resource=requests.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isAuthorized(req)) {
    res.status(401).json({ error: 'Nicht angemeldet.' });
    return;
  }

  const supabase = getSupabaseAdmin();
  const resource = typeof req.query.resource === 'string' ? req.query.resource : null;

  try {
    if (resource === 'requests') {
      if (req.method === 'GET') {
        const { data, error } = await supabase.from('feedback_requests').select('id, user_id').is('fulfilled_at', null);
        if (error) throw error;
        res.status(200).json({ openUserIds: (data ?? []).map((r) => r.user_id) });
        return;
      }
      if (req.method === 'POST') {
        const { userId } = (req.body ?? {}) as { userId?: string };
        if (!userId) {
          res.status(400).json({ error: 'userId erforderlich.' });
          return;
        }
        const { data: existing, error: existingError } = await supabase
          .from('feedback_requests')
          .select('id')
          .eq('user_id', userId)
          .is('fulfilled_at', null)
          .limit(1);
        if (existingError) throw existingError;
        if (existing && existing.length > 0) {
          res.status(200).json({ ok: true, alreadyPending: true });
          return;
        }
        const { error } = await supabase.from('feedback_requests').insert({ user_id: userId });
        if (error) throw error;
        res.status(200).json({ ok: true, alreadyPending: false });
        return;
      }
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    if (req.method === 'GET') {
      const feedback = await listFeedback(supabase);
      res.status(200).json({ feedback });
      return;
    }

    if (req.method === 'POST') {
      const { feedbackId, reply } = (req.body ?? {}) as { feedbackId?: string; reply?: string };
      if (!feedbackId || !reply?.trim()) {
        res.status(400).json({ error: 'feedbackId und reply erforderlich.' });
        return;
      }
      const { error } = await supabase
        .from('feedback_replies')
        .upsert({ feedback_id: feedbackId, reply: reply.trim() }, { onConflict: 'feedback_id' });
      if (error) throw error;
      res.status(200).json({ ok: true });
      return;
    }

    if (req.method === 'DELETE') {
      const { feedbackId } = (req.body ?? {}) as { feedbackId?: string };
      if (!feedbackId) {
        res.status(400).json({ error: 'feedbackId erforderlich.' });
        return;
      }
      // Antwort (falls vorhanden) zuerst loeschen - kein Cascade auf app_feedback definiert.
      const { error: replyError } = await supabase.from('feedback_replies').delete().eq('feedback_id', feedbackId);
      if (replyError) throw replyError;
      const { error } = await supabase.from('app_feedback').delete().eq('id', feedbackId);
      if (error) throw error;
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    await logError(getSupabaseAdmin(), 'feedback', e);
    res.status(500).json({ error: errorMessage(e) });
  }
}
