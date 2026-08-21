import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/apiClient';
import { colors } from '../theme';

interface Announcement {
  id: string;
  createdAt: string;
  title: string;
  body: string;
  isActive: boolean;
  targetUserId: string | null;
  targetEmail: string | null;
  type: 'news' | 'update';
  repeatEveryDays: number | null;
}

interface AnnouncementRow {
  id: string;
  created_at: string;
  title: string;
  body: string;
  is_active: boolean;
  target_user_id: string | null;
  target_email: string | null;
  type: 'news' | 'update';
  repeat_every_days: number | null;
}

interface UserOption {
  id: string;
  email: string | null;
}

export function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[] | null>(null);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [targetUserId, setTargetUserId] = useState('');
  const [type, setType] = useState<'news' | 'update'>('news');
  const [repeatEveryDays, setRepeatEveryDays] = useState('');
  const [sending, setSending] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setError(null);
    const [annRes, usersRes] = await Promise.all([apiFetch('/api/announcements'), apiFetch('/api/users')]);
    if (!annRes.ok) {
      setError('Ankuendigungen konnten nicht geladen werden.');
      return;
    }
    const data = (await annRes.json()) as { announcements: AnnouncementRow[] };
    setAnnouncements(
      data.announcements.map((a) => ({
        id: a.id,
        createdAt: a.created_at,
        title: a.title,
        body: a.body,
        isActive: a.is_active,
        targetUserId: a.target_user_id,
        targetEmail: a.target_email,
        type: a.type,
        repeatEveryDays: a.repeat_every_days,
      })),
    );
    if (usersRes.ok) {
      const usersData = (await usersRes.json()) as { users: { id: string; email: string | null }[] };
      setUsers(usersData.users);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate() {
    if (!title.trim() || !body.trim()) return;
    setSending(true);
    setError(null);
    try {
      const days = parseInt(repeatEveryDays, 10);
      const res = await apiFetch('/api/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          body,
          targetUserId: targetUserId || null,
          type,
          repeatEveryDays: Number.isFinite(days) && days > 0 ? days : null,
        }),
      });
      if (!res.ok) throw new Error();
      setTitle('');
      setBody('');
      setTargetUserId('');
      setType('news');
      setRepeatEveryDays('');
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
      <div style={{ border: `1px solid ${colors.border}`, borderRadius: 6, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
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
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 2 }}>
            Zielgruppe
            <select value={targetUserId} onChange={(e) => setTargetUserId(e.target.value)} style={{ padding: '5px 6px' }}>
              <option value="">Alle Nutzer</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.email ?? u.id}
                </option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 2 }}>
            Typ
            <select value={type} onChange={(e) => setType(e.target.value as 'news' | 'update')} style={{ padding: '5px 6px' }}>
              <option value="news">Ankuendigung</option>
              <option value="update">Update</option>
            </select>
          </label>
          <label style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 2 }}>
            Wiederholen alle (Tage)
            <input
              type="number"
              min={1}
              placeholder="leer = einmalig"
              value={repeatEveryDays}
              onChange={(e) => setRepeatEveryDays(e.target.value)}
              style={{ padding: '5px 6px', width: 130 }}
            />
          </label>
        </div>
        <button
          type="button"
          disabled={sending || !title.trim() || !body.trim()}
          onClick={handleCreate}
          style={{ cursor: 'pointer', alignSelf: 'flex-start' }}
        >
          {sending ? 'Wird gesendet ...' : 'Veroeffentlichen'}
        </button>
      </div>

      {error && <p style={{ color: colors.danger }}>{error}</p>}
      {!announcements && <p>Wird geladen ...</p>}
      {announcements && announcements.length === 0 && <p style={{ opacity: 0.7 }}>Noch keine Ankuendigungen.</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {announcements?.map((a) => (
          <div key={a.id} style={{ border: `1px solid ${colors.border}`, borderRadius: 6, padding: 12, fontSize: 14, opacity: a.isActive ? 1 : 0.5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <strong>
                {a.type === 'update' ? '🔄' : '📢'} {a.title}
              </strong>
              <span style={{ fontSize: 12, opacity: 0.6 }}>{new Date(a.createdAt).toLocaleString('de-CH')}</span>
            </div>
            <div style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{a.body}</div>
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
              An: {a.targetEmail ?? 'Alle Nutzer'} · {a.repeatEveryDays ? `wiederholt alle ${a.repeatEveryDays} Tage` : 'einmalig'} ·{' '}
              {a.isActive ? 'aktiv' : 'deaktiviert'}
            </div>
            <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
              <button type="button" disabled={busyId === a.id} onClick={() => toggleActive(a)} style={{ cursor: 'pointer' }}>
                {a.isActive ? 'Deaktivieren' : 'Aktivieren'}
              </button>
              <button
                type="button"
                disabled={busyId === a.id}
                onClick={() => handleDelete(a)}
                style={{ cursor: 'pointer', color: colors.danger }}
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
