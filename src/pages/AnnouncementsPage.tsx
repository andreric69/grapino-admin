import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/apiClient';

interface Announcement {
  id: string;
  createdAt: string;
  title: string;
  body: string;
  isActive: boolean;
}

interface AnnouncementRow {
  id: string;
  created_at: string;
  title: string;
  body: string;
  is_active: boolean;
}

export function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setError(null);
    const res = await apiFetch('/api/announcements');
    if (!res.ok) {
      setError('Ankuendigungen konnten nicht geladen werden.');
      return;
    }
    const data = (await res.json()) as { announcements: AnnouncementRow[] };
    setAnnouncements(
      data.announcements.map((a) => ({
        id: a.id,
        createdAt: a.created_at,
        title: a.title,
        body: a.body,
        isActive: a.is_active,
      })),
    );
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate() {
    if (!title.trim() || !body.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await apiFetch('/api/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body }),
      });
      if (!res.ok) throw new Error();
      setTitle('');
      setBody('');
      await load();
    } catch {
      setError('Ankuendigung konnte nicht erstellt werden.');
    } finally {
      setSending(false);
    }
  }

  async function toggleActive(a: Announcement) {
    setBusyId(a.id);
    try {
      const res = await apiFetch('/api/announcements', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: a.id, is_active: !a.isActive }),
      });
      if (!res.ok) throw new Error();
      await load();
    } catch {
      setError('Aktion fehlgeschlagen.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(a: Announcement) {
    if (!window.confirm(`Ankuendigung "${a.title}" endgueltig loeschen?`)) return;
    setBusyId(a.id);
    try {
      const res = await apiFetch('/api/announcements', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: a.id }),
      });
      if (!res.ok) throw new Error();
      await load();
    } catch {
      setError('Loeschen fehlgeschlagen.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ border: '1px solid #ccc', borderRadius: 6, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <strong style={{ fontSize: 14 }}>Neue Ankuendigung</strong>
        <input
          placeholder="Titel"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{ padding: '6px 8px', fontSize: 14 }}
        />
        <textarea
          placeholder="Text"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          style={{ padding: '6px 8px', fontSize: 14, fontFamily: 'inherit', resize: 'vertical' }}
        />
        <button
          type="button"
          disabled={sending || !title.trim() || !body.trim()}
          onClick={handleCreate}
          style={{ cursor: 'pointer', alignSelf: 'flex-start' }}
        >
          {sending ? 'Wird gesendet ...' : 'Veroeffentlichen'}
        </button>
      </div>

      {error && <p style={{ color: '#b3261e' }}>{error}</p>}
      {!announcements && <p>Wird geladen ...</p>}
      {announcements && announcements.length === 0 && <p style={{ opacity: 0.7 }}>Noch keine Ankuendigungen.</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {announcements?.map((a) => (
          <div key={a.id} style={{ border: '1px solid #ccc', borderRadius: 6, padding: 12, fontSize: 14, opacity: a.isActive ? 1 : 0.5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <strong>{a.title}</strong>
              <span style={{ fontSize: 12, opacity: 0.6 }}>{new Date(a.createdAt).toLocaleString('de-CH')}</span>
            </div>
            <div style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{a.body}</div>
            <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
              <button type="button" disabled={busyId === a.id} onClick={() => toggleActive(a)} style={{ cursor: 'pointer' }}>
                {a.isActive ? 'Deaktivieren' : 'Aktivieren'}
              </button>
              <button
                type="button"
                disabled={busyId === a.id}
                onClick={() => handleDelete(a)}
                style={{ cursor: 'pointer', color: '#b3261e' }}
              >
                Loeschen
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
