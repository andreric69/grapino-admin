import { Fragment, useEffect, useState } from 'react';
import { apiFetch } from '../lib/apiClient';
import { cardStyle, colors, inputStyle, primaryBtnStyle, secondaryBtnStyle } from '../theme';
import { UserDetailPanel } from './UserDetailPanel';
import { LoadingSpinner } from '../components/LoadingSpinner';

interface AdminUser {
  id: string;
  email: string | null;
  displayName: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  bannedUntil: string | null;
  wineCount: number;
  isBlocked: boolean;
  trialEndsAt: string | null;
  lastPayment: { reason: string; status: string; createdAt: string } | null;
  plan: PlanTier;
}

type PlanTier = 'basis' | 'pro' | 'ultra';

const PLAN_LABELS: Record<PlanTier, string> = { basis: 'Basis', pro: 'Pro', ultra: 'Ultra' };

// Eigene, vom Segment-Badge (power/karteileiche) klar unterscheidbare Farben:
// bordeaux fuer die hoechste Stufe, damit "Ultra" auf den ersten Blick als
// Premium erkennbar ist, nicht mit dem goldenen "Power-Nutzer"-Segment
// verwechselbar.
const PLAN_STYLES: Record<PlanTier, { background: string; color: string }> = {
  basis: { background: 'rgba(32, 31, 29, 0.08)', color: colors.textMuted },
  pro: { background: 'rgba(182, 130, 53, 0.16)', color: colors.gold },
  ultra: { background: 'rgba(124, 45, 58, 0.14)', color: colors.accent },
};

const PAYMENT_STATUS_LABELS: Record<string, string> = { paid: 'bezahlt', open: 'offen', cancelled: 'storniert' };
const PAYMENT_STATUS_COLORS: Record<string, string> = { paid: colors.success, open: colors.gold, cancelled: colors.textMuted };

const DAY_MS = 24 * 60 * 60 * 1000;

type UserSegment = 'power' | 'karteileiche' | null;

const SEGMENT_LABELS: Record<Exclude<UserSegment, null>, string> = {
  power: 'Power-Nutzer',
  karteileiche: 'Karteileiche',
};

// Muted, non-alarming tones - deliberately distinct from colors.danger.
const SEGMENT_STYLES: Record<Exclude<UserSegment, null>, { background: string; color: string }> = {
  power: { background: 'rgba(182, 130, 53, 0.16)', color: colors.gold },
  karteileiche: { background: 'rgba(32, 31, 29, 0.08)', color: colors.textMuted },
};

function computeSegment(u: AdminUser): UserSegment {
  const now = Date.now();
  if (u.wineCount >= 15 && u.lastSignInAt && now - new Date(u.lastSignInAt).getTime() <= 30 * DAY_MS) {
    return 'power';
  }
  if (u.wineCount === 0 && now - new Date(u.createdAt).getTime() > 14 * DAY_MS) {
    return 'karteileiche';
  }
  return null;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('de-CH', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function formatDate(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('de-CH', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

type SortKey = 'email' | 'createdAt' | 'wineCount' | 'lastSignInAt';
type SortDir = 'asc' | 'desc';

function compareUsers(a: AdminUser, b: AdminUser, key: SortKey, dir: SortDir): number {
  let cmp = 0;
  switch (key) {
    case 'email':
      cmp = (a.email ?? '').localeCompare(b.email ?? '');
      break;
    case 'createdAt':
      cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      break;
    case 'wineCount':
      cmp = a.wineCount - b.wineCount;
      break;
    case 'lastSignInAt':
      cmp = (a.lastSignInAt ? new Date(a.lastSignInAt).getTime() : 0) - (b.lastSignInAt ? new Date(b.lastSignInAt).getTime() : 0);
      break;
  }
  return dir === 'asc' ? cmp : -cmp;
}

export function UsersPage() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('email');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

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
      setCreateSuccess(`Konto für ${email} angelegt. Passwort dem Nutzer selbst mitteilen: ${newPassword}`);
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
    if (!window.confirm(`Bei ${user.email ?? user.id} Feedback anfragen? Das Popup erscheint beim nächsten App-Start.`)) return;
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

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  function sortIndicator(key: SortKey): string {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' ▲' : ' ▼';
  }

  if (error) return <p style={{ color: colors.danger }}>{error}</p>;
  if (!users) return <LoadingSpinner label="Wird geladen ..." />;

  const query = search.trim().toLowerCase();
  const filteredUsers = query
    ? users.filter((u) => (u.email ?? '').toLowerCase().includes(query) || (u.displayName ?? '').toLowerCase().includes(query))
    : users;
  const visibleUsers = [...filteredUsers].sort((a, b) => compareUsers(a, b, sortKey, sortDir));

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
          Kein E-Mail-Versand für das Passwort - selbst an den Nutzer weitergeben (E-Mail-Vorlagen können für den
          Rest helfen).
        </p>
      </div>

      <input
        placeholder="Suche nach E-Mail oder Name..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ ...inputStyle, width: '100%', maxWidth: 360 }}
      />

      <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, minWidth: 640 }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: `1px solid ${colors.border}` }}>
            <th style={{ padding: '6px 8px', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('email')}>
              Name / E-Mail{sortIndicator('email')}
            </th>
            <th style={{ padding: '6px 8px', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('createdAt')}>
              Erstellt am{sortIndicator('createdAt')}
            </th>
            <th style={{ padding: '6px 8px', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('lastSignInAt')}>
              Letzter Login{sortIndicator('lastSignInAt')}
            </th>
            <th style={{ padding: '6px 8px', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('wineCount')}>
              Weine{sortIndicator('wineCount')}
            </th>
            <th style={{ padding: '6px 8px' }}>Status</th>
            <th style={{ padding: '6px 8px' }}></th>
            <th style={{ padding: '6px 8px' }}></th>
            <th style={{ padding: '6px 8px' }}></th>
          </tr>
        </thead>
        <tbody>
          {visibleUsers.length === 0 && (
            <tr>
              <td colSpan={8} style={{ padding: '16px 8px', textAlign: 'center', opacity: 0.6 }}>
                Keine Nutzer gefunden.
              </td>
            </tr>
          )}
          {visibleUsers.map((u) => (
            <Fragment key={u.id}>
              <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                <td style={{ padding: '6px 8px' }}>
                  {u.displayName && <div style={{ fontWeight: 600 }}>{u.displayName}</div>}
                  <div style={{ opacity: u.displayName ? 0.6 : 1, fontSize: u.displayName ? 12 : 13.5 }}>
                    {u.email ?? u.id}
                    <span
                      style={{
                        marginLeft: 6,
                        fontSize: 11,
                        padding: '2px 7px',
                        borderRadius: 10,
                        fontWeight: 600,
                        ...PLAN_STYLES[u.plan],
                      }}
                    >
                      {PLAN_LABELS[u.plan]}
                    </span>
                    {(() => {
                      const segment = computeSegment(u);
                      if (!segment) return null;
                      return (
                        <span
                          style={{
                            marginLeft: 6,
                            fontSize: 11,
                            padding: '2px 7px',
                            borderRadius: 10,
                            fontWeight: 600,
                            ...SEGMENT_STYLES[segment],
                          }}
                        >
                          {SEGMENT_LABELS[segment]}
                        </span>
                      );
                    })()}
                  </div>
                </td>
                <td style={{ padding: '6px 8px' }}>{formatDate(u.createdAt)}</td>
                <td style={{ padding: '6px 8px' }}>{formatDateTime(u.lastSignInAt)}</td>
                <td style={{ padding: '6px 8px' }}>{u.wineCount}</td>
                <td style={{ padding: '6px 8px' }}>
                  {u.bannedUntil ? 'Deaktiviert' : 'Aktiv'}
                  {u.isBlocked && (
                    <span style={{ marginLeft: 6, fontSize: 11, padding: '2px 7px', borderRadius: 10, background: colors.danger, color: '#fff' }}>
                      Blockiert
                    </span>
                  )}
                  {u.trialEndsAt && (
                    <div style={{ fontSize: 11, opacity: 0.55 }}>Testabo bis {u.trialEndsAt}</div>
                  )}
                  {u.lastPayment && (
                    <div style={{ fontSize: 11, marginTop: 2 }}>
                      <span style={{ color: PAYMENT_STATUS_COLORS[u.lastPayment.status] ?? colors.textMuted, fontWeight: 600 }}>
                        {PAYMENT_STATUS_LABELS[u.lastPayment.status] ?? u.lastPayment.status}
                      </span>
                      <span style={{ opacity: 0.55 }}> · {u.lastPayment.reason}</span>
                    </div>
                  )}
                </td>
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
                  <td colSpan={8} style={{ padding: '10px 8px 18px', background: colors.bg }}>
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
