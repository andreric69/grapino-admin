import { Fragment, useEffect, useState } from 'react';
import { apiFetch } from '../lib/apiClient';

interface AdminUser {
  id: string;
  email: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  bannedUntil: string | null;
  wineCount: number;
}

interface UserWine {
  id: string;
  name: string;
  producer: string | null;
  vintage: number | null;
  quantity: number;
  is_consumed: boolean;
  is_wishlist: boolean;
}

function formatDate(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('de-CH', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

export function UsersPage() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [userWines, setUserWines] = useState<UserWine[] | null>(null);
  const [wineLoadError, setWineLoadError] = useState<string | null>(null);

  const [openFeedbackRequestUserIds, setOpenFeedbackRequestUserIds] = useState<Set<string>>(new Set());
  const [requestingFeedbackFor, setRequestingFeedbackFor] = useState<string | null>(null);

  async function load() {
    setError(null);
    const [usersRes, feedbackRequestRes] = await Promise.all([
      apiFetch('/api/users'),
      apiFetch('/api/feedback-request'),
    ]);
    if (!usersRes.ok) {
      setError('Nutzerliste konnte nicht geladen werden.');
      return;
    }
    const body = (await usersRes.json()) as { users: AdminUser[] };
    setUsers(body.users);
    if (feedbackRequestRes.ok) {
      const fbBody = (await feedbackRequestRes.json()) as { openUserIds: string[] };
      setOpenFeedbackRequestUserIds(new Set(fbBody.openUserIds));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleBan(user: AdminUser) {
    const nextAction = user.bannedUntil ? 'unban' : 'ban';
    const confirmMsg = nextAction === 'ban'
      ? `${user.email ?? user.id} deaktivieren? Der Login wird gesperrt, alle Daten bleiben erhalten.`
      : `${user.email ?? user.id} wieder aktivieren?`;
    if (!window.confirm(confirmMsg)) return;

    setBusyId(user.id);
    try {
      const res = await apiFetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, action: nextAction }),
      });
      if (!res.ok) throw new Error();
      await load();
    } catch {
      setError('Aktion fehlgeschlagen.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleCreateUser() {
    setCreateError(null);
    setCreateSuccess(null);
    const email = newEmail.trim();
    if (!email || newPassword.length < 8) {
      setCreateError('E-Mail und ein Passwort mit mindestens 8 Zeichen erforderlich.');
      return;
    }
    setCreating(true);
    try {
      const res = await apiFetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', email, password: newPassword }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Anlegen fehlgeschlagen.');
      }
      setCreateSuccess(`Konto fuer ${email} angelegt. Passwort dem Nutzer selbst mitteilen: ${newPassword}`);
      setNewEmail('');
      setNewPassword('');
      await load();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Anlegen fehlgeschlagen.');
    } finally {
      setCreating(false);
    }
  }

  async function requestFeedback(user: AdminUser) {
    if (!window.confirm(`Bei ${user.email ?? user.id} Feedback anfragen? Das Popup erscheint beim naechsten App-Start.`)) return;
    setRequestingFeedbackFor(user.id);
    try {
      const res = await apiFetch('/api/feedback-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
      if (!res.ok) throw new Error();
      setOpenFeedbackRequestUserIds((s) => new Set(s).add(user.id));
    } catch {
      setError('Feedback-Anfrage fehlgeschlagen.');
    } finally {
      setRequestingFeedbackFor(null);
    }
  }

  async function toggleDetails(user: AdminUser) {
    if (expandedUserId === user.id) {
      setExpandedUserId(null);
      return;
    }
    setExpandedUserId(user.id);
    setUserWines(null);
    setWineLoadError(null);
    const res = await apiFetch(`/api/user-wines?userId=${encodeURIComponent(user.id)}`);
    if (!res.ok) {
      setWineLoadError('Weinliste konnte nicht geladen werden.');
      return;
    }
    const body = (await res.json()) as { wines: UserWine[] };
    setUserWines(body.wines);
  }

  if (error) return <p style={{ color: '#b3261e' }}>{error}</p>;
  if (!users) return <p>Wird geladen ...</p>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ border: '1px solid #ccc', borderRadius: 6, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <strong style={{ fontSize: 14 }}>Neuen Nutzer anlegen</strong>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            placeholder="E-Mail"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            style={{ flex: 1, padding: '6px 8px', fontSize: 14 }}
          />
          <input
            placeholder="Startpasswort (mind. 8 Zeichen)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            style={{ flex: 1, padding: '6px 8px', fontSize: 14 }}
          />
        </div>
        <button
          type="button"
          disabled={creating}
          onClick={handleCreateUser}
          style={{ cursor: 'pointer', alignSelf: 'flex-start' }}
        >
          {creating ? 'Wird angelegt ...' : 'Konto anlegen'}
        </button>
        {createError && <p style={{ color: '#b3261e', margin: 0, fontSize: 13 }}>{createError}</p>}
        {createSuccess && <p style={{ color: '#1e7d32', margin: 0, fontSize: 13 }}>{createSuccess}</p>}
        <p style={{ fontSize: 12, opacity: 0.6, margin: 0 }}>
          Kein E-Mail-Versand - das Passwort muss selbst an den Nutzer weitergegeben werden.
        </p>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
            <th style={{ padding: '6px 8px' }}>E-Mail</th>
            <th style={{ padding: '6px 8px' }}>Registriert</th>
            <th style={{ padding: '6px 8px' }}>Letzte Aktivitaet</th>
            <th style={{ padding: '6px 8px' }}>Weine</th>
            <th style={{ padding: '6px 8px' }}>Status</th>
            <th style={{ padding: '6px 8px' }}></th>
            <th style={{ padding: '6px 8px' }}></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <Fragment key={u.id}>
              <tr style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '6px 8px' }}>{u.email ?? u.id}</td>
                <td style={{ padding: '6px 8px' }}>{formatDate(u.createdAt)}</td>
                <td style={{ padding: '6px 8px' }}>{formatDate(u.lastSignInAt)}</td>
                <td style={{ padding: '6px 8px' }}>
                  <button type="button" onClick={() => toggleDetails(u)} style={{ cursor: 'pointer' }}>
                    {u.wineCount} {expandedUserId === u.id ? '▲' : '▼'}
                  </button>
                </td>
                <td style={{ padding: '6px 8px' }}>{u.bannedUntil ? 'Deaktiviert' : 'Aktiv'}</td>
                <td style={{ padding: '6px 8px' }}>
                  <button type="button" disabled={busyId === u.id} onClick={() => toggleBan(u)} style={{ cursor: 'pointer' }}>
                    {u.bannedUntil ? 'Reaktivieren' : 'Deaktivieren'}
                  </button>
                </td>
                <td style={{ padding: '6px 8px' }}>
                  <button
                    type="button"
                    disabled={requestingFeedbackFor === u.id || openFeedbackRequestUserIds.has(u.id)}
                    onClick={() => requestFeedback(u)}
                    style={{ cursor: 'pointer' }}
                  >
                    {openFeedbackRequestUserIds.has(u.id) ? 'Angefragt' : 'Feedback anfragen'}
                  </button>
                </td>
              </tr>
              {expandedUserId === u.id && (
                <tr>
                  <td colSpan={7} style={{ padding: '6px 8px 14px', background: '#fafafa' }}>
                    {wineLoadError && <span style={{ color: '#b3261e' }}>{wineLoadError}</span>}
                    {!wineLoadError && !userWines && <span>Wird geladen ...</span>}
                    {userWines && userWines.length === 0 && <span style={{ opacity: 0.6 }}>Keine Weine.</span>}
                    {userWines && userWines.length > 0 && (
                      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                        {userWines.map((w) => (
                          <li key={w.id}>
                            {w.name}
                            {w.producer ? ` · ${w.producer}` : ''}
                            {w.vintage ? ` · ${w.vintage}` : ''} · {w.quantity}x
                            {w.is_wishlist ? ' · Wunschliste' : w.is_consumed ? ' · Getrunken' : ''}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
