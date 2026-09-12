import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/apiClient';
import { colors, inputStyle, primaryBtnStyle } from '../theme';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';
import { MessageCard, type UserMessage } from '../components/MessageCard';

export function MessagesPage() {
  const [messages, setMessages] = useState<UserMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);

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

  async function markAllRead(toMark: UserMessage[]) {
    setBulkBusy(true);
    try {
      const results = await Promise.all(
        toMark.map((m) =>
          apiFetch('/api/messages', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: m.id }),
          }).then(
            (res) => res.ok,
            () => false,
          ),
        ),
      );
      await load();
      if (results.some((ok) => !ok)) {
        setError('Einige Nachrichten konnten nicht als gelesen markiert werden.');
      }
    } finally {
      setBulkBusy(false);
    }
  }

  if (error) return <p style={{ color: colors.danger }}>{error}</p>;
  if (!messages) return <LoadingSpinner label="Wird geladen ..." />;
  if (messages.length === 0) return <EmptyState icon="💬" text="Noch keine Nachrichten." />;

  const term = search.trim().toLowerCase();
  const filtered = term
    ? messages.filter((m) => (m.email ?? '').toLowerCase().includes(term) || m.message.toLowerCase().includes(term))
    : messages;
  const unread = filtered.filter((m) => !m.read_at);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="search"
          placeholder="Suche nach E-Mail oder Text ..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ ...inputStyle, flex: 1, minWidth: 200 }}
        />
        {unread.length > 0 && (
          <button type="button" disabled={bulkBusy} onClick={() => markAllRead(unread)} style={primaryBtnStyle}>
            {bulkBusy ? 'Wird markiert ...' : 'Alle als gelesen markieren'}
          </button>
        )}
      </div>
      {filtered.length === 0 ? (
        <EmptyState icon="💬" text="Keine Nachrichten gefunden." />
      ) : (
        filtered.map((m) => <MessageCard key={m.id} message={m} busy={busyId === m.id} onMarkRead={() => markRead(m)} />)
      )}
    </div>
  );
}
