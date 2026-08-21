import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/apiClient';
import { cardStyle, colors, inputStyle, primaryBtnStyle } from '../theme';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';

interface FeedbackRow {
  id: string;
  createdAt: string;
  email: string | null;
  rating: number;
  message: string | null;
  tipAmount: number | null;
  reply: string | null;
}

export function FeedbackPage() {
  const [feedback, setFeedback] = useState<FeedbackRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setError(null);
    const res = await apiFetch('/api/feedback');
    if (!res.ok) {
      setError('Feedback konnte nicht geladen werden.');
      return;
    }
    const data = (await res.json()) as { feedback: FeedbackRow[] };
    setFeedback(data.feedback);
  }

  useEffect(() => {
    load();
  }, []);

  async function sendReply(f: FeedbackRow) {
    const reply = (drafts[f.id] ?? f.reply ?? '').trim();
    if (!reply) return;
    setBusyId(f.id);
    try {
      const res = await apiFetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedbackId: f.id, reply }),
      });
      if (!res.ok) throw new Error();
      await load();
    } catch {
      setError('Antwort konnte nicht gesendet werden.');
    } finally {
      setBusyId(null);
    }
  }

  if (error) return <p style={{ color: colors.danger }}>{error}</p>;
  if (!feedback) return <LoadingSpinner label="Wird geladen ..." />;
  if (feedback.length === 0) return <EmptyState icon="⭐" text="Noch kein Feedback." />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {feedback.map((f) => (
        <div key={f.id} style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <strong>{f.email ?? 'Unbekannt'}</strong>
            <span style={{ fontSize: 12, opacity: 0.6 }}>{new Date(f.createdAt).toLocaleString('de-CH')}</span>
          </div>
          <div style={{ marginTop: 4, color: colors.accent }}>
            {'★'.repeat(f.rating)}
            {f.tipAmount ? ` · Trinkgeld-Wunsch: ${f.tipAmount}` : ''}
          </div>
          {f.message && <div style={{ marginTop: 4, opacity: 0.85 }}>{f.message}</div>}

          <textarea
            placeholder="Antwort schreiben ..."
            value={drafts[f.id] ?? f.reply ?? ''}
            onChange={(e) => setDrafts((d) => ({ ...d, [f.id]: e.target.value }))}
            rows={2}
            style={{ ...inputStyle, marginTop: 8, width: '100%', resize: 'vertical' }}
          />
          <button
            type="button"
            disabled={busyId === f.id || !(drafts[f.id] ?? f.reply ?? '').trim()}
            onClick={() => sendReply(f)}
            style={{ ...primaryBtnStyle, marginTop: 6 }}
          >
            {f.reply ? 'Antwort aktualisieren' : 'Antworten'}
          </button>
        </div>
      ))}
    </div>
  );
}
