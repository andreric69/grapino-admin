import { useEffect, useMemo, useRef, useState } from 'react';
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
const UNDO_DELAY_MS = 6000;

interface PendingDeletion {
  row: FeedbackRow;
  timer: ReturnType<typeof setTimeout>;
}

export function FeedbackPage() {
  const [feedback, setFeedback] = useState<FeedbackRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [ratingFilter, setRatingFilter] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [onlyUnanswered, setOnlyUnanswered] = useState(false);
  // Ausstehende Loeschungen, per Feedback-ID, jede mit eigenem Undo-Timer.
  // Nur die zuletzt ausgeloeste wird als Toast angezeigt; laeuft eine
  // aeltere derweil ab, wird sie still im Hintergrund fertig geloescht.
  const pendingDeletionsRef = useRef<Map<string, PendingDeletion>>(new Map());
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [toastId, setToastId] = useState<string | null>(null);

  useEffect(() => {
    // Beim Verlassen der Seite laufende Timer nicht verwaisen lassen.
    return () => {
      pendingDeletionsRef.current.forEach((p) => clearTimeout(p.timer));
      pendingDeletionsRef.current.clear();
    };
  }, []);

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

  // Fuehrt die tatsaechliche Loeschung aus, nachdem das Undo-Fenster
  // ungenutzt abgelaufen ist. Wird die Zeile zwischenzeitlich per
  // "Rückgängig" zurueckgeholt, wird diese Funktion nie aufgerufen.
  async function performDelete(id: string) {
    const pending = pendingDeletionsRef.current.get(id);
    if (!pending) return;
    try {
      const res = await apiFetch('/api/feedback', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedbackId: id }),
      });
      if (!res.ok) throw new Error();
      setFeedback((cur) => (cur ? cur.filter((f) => f.id !== id) : cur));
    } catch {
      setError('Löschen fehlgeschlagen.');
    } finally {
      pendingDeletionsRef.current.delete(id);
      setPendingIds(Array.from(pendingDeletionsRef.current.keys()));
      setToastId((cur) => (cur === id ? null : cur));
    }
  }

  // Klick auf "Löschen": Zeile wird sofort optimistisch ausgeblendet
  // (siehe filteredFeedback) und ein Undo-Toast angezeigt. Erst wenn der
  // Timer ungenutzt ablaeuft, wird performDelete() aufgerufen - vorher
  // passiert kein API-Call. Eine bereits laufende, aeltere Loeschung wird
  // dadurch nicht beeinflusst; sie laeuft mit ihrem eigenen Timer weiter
  // und wird bei Ablauf still im Hintergrund fertig ausgefuehrt.
  function handleDelete(f: FeedbackRow) {
    if (pendingDeletionsRef.current.has(f.id)) return;
    const timer = setTimeout(() => {
      void performDelete(f.id);
    }, UNDO_DELAY_MS);
    pendingDeletionsRef.current.set(f.id, { row: f, timer });
    setPendingIds(Array.from(pendingDeletionsRef.current.keys()));
    setToastId(f.id);
  }

  function handleUndoDelete(id: string) {
    const pending = pendingDeletionsRef.current.get(id);
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingDeletionsRef.current.delete(id);
    setPendingIds(Array.from(pendingDeletionsRef.current.keys()));
    setToastId((cur) => (cur === id ? null : cur));
  }

  const filteredFeedback = useMemo(() => {
    if (!feedback) return [];
    const query = search.trim().toLowerCase();
    return feedback.filter((f) => {
      if (pendingIds.includes(f.id)) return false; // optimistisch ausgeblendet, wartet auf Undo-Timer
      if (ratingFilter !== null && f.rating !== ratingFilter) return false;
      if (onlyUnanswered && f.reply) return false;
      if (query) {
        const haystack = `${f.message ?? ''} ${f.email ?? ''}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [feedback, ratingFilter, search, onlyUnanswered, pendingIds]);

  const toastPending = toastId ? pendingDeletionsRef.current.get(toastId) : undefined;

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

      {toastPending && (
        <div
          style={{
            ...cardStyle,
            position: 'fixed',
            left: '50%',
            bottom: 20,
            transform: 'translateX(-50%)',
            zIndex: 40,
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
            maxWidth: 'calc(100vw - 32px)',
          }}
        >
          <span style={{ fontSize: 13.5 }}>
            Feedback von {toastPending.row.email ?? 'Unbekannt'} gelöscht. Rückgängig?
          </span>
          <button
            type="button"
            onClick={() => handleUndoDelete(toastPending.row.id)}
            style={{ ...secondaryBtnStyle, padding: '5px 12px', fontSize: 13, whiteSpace: 'nowrap' }}
          >
            Rückgängig
          </button>
        </div>
      )}
    </div>
  );
}
