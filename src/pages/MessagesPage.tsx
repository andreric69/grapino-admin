import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/apiClient';
import { colors } from '../theme';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';
import { MessageCard, type UserMessage } from '../components/MessageCard';

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
  if (!messages) return <LoadingSpinner label="Wird geladen ..." />;
  if (messages.length === 0) return <EmptyState icon="💬" text="Noch keine Nachrichten." />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {messages.map((m) => (
        <MessageCard key={m.id} message={m} busy={busyId === m.id} onMarkRead={() => markRead(m)} />
      ))}
    </div>
  );
}
