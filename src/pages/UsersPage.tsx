import { Fragment, useEffect, useState } from 'react';
import { apiFetch } from '../lib/apiClient';
import { cardStyle, colors, inputStyle, primaryBtnStyle, secondaryBtnStyle } from '../theme';
import { UserDetailPanel } from './UserDetailPanel';

interface AdminUser {
  id: string;
  email: string | null;
  displayName: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  bannedUntil: string | null;
  wineCount: number;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('de-CH', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function UsersPage() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  const [openFeedbackRequestUserIds, setOpenFeedbackRequestUserIds] = useState<Set<string>>(new Set());
  const [requestingFeedbackFor, setRequestingFeedbackFor] = useState<string | null>(null);

  async function load() {
    setError(null);
    const [usersRes, feedbackRequestRes] = await Promise.all([
      apiFetch('/api/users'),
      apiFetch('/api/feedback?resource=requests'),
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
        body: JSON.stringify({ action: 'create', email, password: newPassword, displayName: newDisplayName }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Anlegen fehlgeschlagen.');
      }
      setCreateSuccess(`Konto fuer ${email} angelegt. Passwort dem Nutzer selbst mitteilen: ${newPassword}`);
      setNewEmail('');
      setNewPassword('');
      setNewDisplayName('');
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
      const res = await apiFetch('/api/feedback?resource=requests', {
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

  if (error) return <p style={{ color: colors.danger }}>{error}</p>;
  if (!users) return <p>Wird geladen ...</p>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <strong style={{ fontSize: 14 }}>Neuen Nutzer anlegen</strong>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input placeholder="E-Mail" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: 140 }} />
          <input placeholder="Name" value={newDisplayName} onChange={(e) => setNewDisplayName(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: 100 }} />
          <input
            placeholder="Startpasswort (mind. 8 Zeichen)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            style={{ ...inputStyle, flex: 1, minWidth: 160 }}
          />
        </div>
        <button type="button" disabled={creating} onClick={handleCreateUser} style={{ ...primaryBtnStyle, alignSelf: 'flex-start' }}>
          {creating ? 'Wird angelegt ...' : 'Konto anlegen'}
        </button>
        {createError && <p style={{ color: colors.danger, margin: 0, fontSize: 13 }}>{createError}</p>}
        {createSuccess && <p style={{ color: colors.success, margin: 0, fontSize: 13 }}>{createSuccess}</p>}
        <p style={{ fontSize: 12, opacity: 0.6, margin: 0 }}>
          Kein E-Mail-Versand fuer das Passwort - selbst an den Nutzer weitergeben (E-Mail-Vorlagen koennen fuer den
          Rest helfen).
        </p>
      </div>

      <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, minWidth: 640 }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: `1px solid ${colors.border}` }}>
            <th style={{ padding: '6px 8px' }}>Name / E-Mail</th>
            <th style={{ padding: '6px 8px' }}>Letzter Login</th>
            <th style={{ padding: '6px 8px' }}>Weine</th>
            <th style={{ padding: '6px 8px' }}>Status</th>
            <th style={{ padding: '6px 8px' }}></th>
            <th style={{ padding: '6px 8px' }}></th>
            <th style={{ padding: '6px 8px' }}></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <Fragment key={u.id}>
              <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                <td style={{ padding: '6px 8px' }}>
                  {u.displayName && <div style={{ fontWeight: 600 }}>{u.displayName}</div>}
                  <div style={{ opacity: u.displayName ? 0.6 : 1, fontSize: u.displayName ? 12 : 13.5 }}>{u.email ?? u.id}</div>
                </td>
                <td style={{ padding: '6px 8px' }}>{formatDateTime(u.lastSignInAt)}</td>
                <td style={{ padding: '6px 8px' }}>{u.wineCount}</td>
                <td style={{ padding: '6px 8px' }}>{u.bannedUntil ? 'Deaktiviert' : 'Aktiv'}</td>
                <td style={{ padding: '6px 8px' }}>
                  <button type="button" onClick={() => setExpandedUserId(expandedUserId === u.id ? null : u.id)} style={secondaryBtnStyle}>
                    {expandedUserId === u.id ? 'Details ausblenden' : 'Details'}
                  </button>
                </td>
                <td style={{ padding: '6px 8px' }}>
                  <button type="button" disabled={busyId === u.id} onClick={() => toggleBan(u)} style={secondaryBtnStyle}>
                    {u.bannedUntil ? 'Reaktivieren' : 'Deaktivieren'}
                  </button>
                </td>
                <td style={{ padding: '6px 8px' }}>
                  <button
                    type="button"
                    disabled={requestingFeedbackFor === u.id || openFeedbackRequestUserIds.has(u.id)}
                    onClick={() => requestFeedback(u)}
                    style={secondaryBtnStyle}
                  >
                    {openFeedbackRequestUserIds.has(u.id) ? 'Angefragt' : 'Feedback anfragen'}
                  </button>
                </td>
              </tr>
              {expandedUserId === u.id && (
                <tr>
                  <td colSpan={7} style={{ padding: '10px 8px 18px', background: colors.bg }}>
                    <UserDetailPanel userId={u.id} />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
