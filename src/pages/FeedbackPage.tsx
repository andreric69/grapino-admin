import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../lib/apiClient';
import { cardStyle, colors, inputStyle, primaryBtnStyle, secondaryBtnStyle } from '../theme';
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

const RATING_FILTERS = [5, 4, 3, 2, 1] as const;

export function FeedbackPage() {
  const [feedback, setFeedback] = useState<FeedbackRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [ratingFilter, setRatingFilter] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [onlyUnanswered, setOnlyUnanswered] = useState(false);

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

  async function handleDelete(f: FeedbackRow) {
    if (!window.confirm(`Feedback von ${f.email ?? 'Unbekannt'} unwiderruflich löschen?`)) return;
    setDeletingId(f.id);
    try {
      const res = await apiFetch('/api/feedback', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedbackId: f.id }),
      });
      if (!res.ok) throw new Error();
      await load();
    } catch {
      setError('Löschen fehlgeschlagen.');
    } finally {
      setDeletingId(null);
    }
  }

  const filteredFeedback = useMemo(() => {
    if (!feedback) return [];
    const query = search.trim().toLowerCase();
    return feedback.filter((f) => {
      if (ratingFilter !== null && f.rating !== ratingFilter) return false;
      if (onlyUnanswered && f.reply) return false;
      if (query) {
        const haystack = `${f.message ?? ''} ${f.email ?? ''}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [feedback, ratingFilter, search, onlyUnanswered]);

  if (error) return <p style={{ color: colors.danger }}>{error}</p>;
  if (!feedback) return <LoadingSpinner label="Wird geladen ..." />;
  if (feedback.length === 0) return <EmptyState icon="⭐" text="Noch kein Feedback." />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setRatingFilter(null)}
            style={ratingFilter === null ? primaryBtnStyle : secondaryBtnStyle}
          >
            Alle
          </button>
          {RATING_FILTERS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRatingFilter(r)}
              style={ratingFilter === r ? primaryBtnStyle : secondaryBtnStyle}
            >
              {r}★
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="search"
            placeholder="Suche nach Kommentar oder E-Mail ..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...inputStyle, flex: '1 1 220px' }}
          />
          <label style={{ fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={onlyUnanswered}
              onChange={(e) => setOnlyUnanswered(e.target.checked)}
            />
            Nur unbeantwortet
          </label>
        </div>
      </div>

      {filteredFeedback.length === 0 && <EmptyState icon="🔍" text="Kein Feedback gefunden." />}

      {filteredFeedback.map((f) => (
        <div key={f.id} style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <strong>{f.email ?? 'Unbekannt'}</strong>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12, opacity: 0.6 }}>{new Date(f.createdAt).toLocaleString('de-CH')}</span>
              <button
                type="button"
                disabled={deletingId === f.id}
                onClick={() => handleDelete(f)}
                style={{ cursor: 'pointer', color: colors.danger, fontSize: 12.5, border: 'none', background: 'none' }}
              >
                Löschen
              </button>
            </div>
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
