import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/apiClient';
import { cardStyle, colors, secondaryBtnStyle } from '../theme';

interface UserMessage {
  id: string;
  created_at: string;
  email: string | null;
  category: 'allgemein' | 'vorschlag';
  message: string;
  read_at: string | null;
}

const CATEGORY_LABELS: Record<UserMessage['category'], string> = {
  allgemein: 'Allgemein',
  vorschlag: 'Aenderungsvorschlag',
};

export function MessagesPage() {
  const [messages, setMessages] = useState<UserMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setError(null);
    const res = await apiFetch('/api/messages');
    if (!res.ok) {
      setError('Nachrichten konnten nicht geladen werden.');
      return;
    }
    const data = (await res.json()) as { messages: UserMessage[] };
    setMessages(data.messages);
  }

  useEffect(() => {
    load();
  }, []);

  async function markRead(m: UserMessage) {
    setBusyId(m.id);
    try {
      const res = await apiFetch('/api/messages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: m.id }),
      });
      if (!res.ok) throw new Error();
      await load();
    } catch {
      setError('Aktion fehlgeschlagen.');
    } finally {
      setBusyId(null);
    }
  }

  if (error) return <p style={{ color: colors.danger }}>{error}</p>;
  if (!messages) return <p>Wird geladen ...</p>;
  if (messages.length === 0) return <p style={{ opacity: 0.7 }}>Noch keine Nachrichten.</p>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {messages.map((m) => (
        <div key={m.id} style={{ ...cardStyle, opacity: m.read_at ? 0.65 : 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 13 }}>
            <strong>{m.email ?? 'Unbekannt'}</strong>
            <span style={{ opacity: 0.6 }}>{new Date(m.created_at).toLocaleString('de-CH')}</span>
          </div>
          <div style={{ fontSize: 11.5, color: colors.accent, marginTop: 2 }}>{CATEGORY_LABELS[m.category]}</div>
          <div style={{ fontSize: 14, marginTop: 6, whiteSpace: 'pre-wrap' }}>{m.message}</div>
          {!m.read_at && (
            <button type="button" disabled={busyId === m.id} onClick={() => markRead(m)} style={{ ...secondaryBtnStyle, marginTop: 10 }}>
              Als gelesen markieren
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
