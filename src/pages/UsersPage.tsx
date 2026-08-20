import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/apiClient';

interface AdminUser {
  id: string;
  email: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  bannedUntil: string | null;
  wineCount: number;
}

function formatDate(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('de-CH', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

export function UsersPage() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setError(null);
    const res = await apiFetch('/api/users');
    if (!res.ok) {
      setError('Nutzerliste konnte nicht geladen werden.');
      return;
    }
    const body = (await res.json()) as { users: AdminUser[] };
    setUsers(body.users);
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

  if (error) return <p style={{ color: '#b3261e' }}>{error}</p>;
  if (!users) return <p>Wird geladen ...</p>;

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
      <thead>
        <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
          <th style={{ padding: '6px 8px' }}>E-Mail</th>
          <th style={{ padding: '6px 8px' }}>Registriert</th>
          <th style={{ padding: '6px 8px' }}>Letzte Aktivitaet</th>
          <th style={{ padding: '6px 8px' }}>Weine</th>
          <th style={{ padding: '6px 8px' }}>Status</th>
          <th style={{ padding: '6px 8px' }}></th>
        </tr>
      </thead>
      <tbody>
        {users.map((u) => (
          <tr key={u.id} style={{ borderBottom: '1px solid #eee' }}>
            <td style={{ padding: '6px 8px' }}>{u.email ?? u.id}</td>
            <td style={{ padding: '6px 8px' }}>{formatDate(u.createdAt)}</td>
            <td style={{ padding: '6px 8px' }}>{formatDate(u.lastSignInAt)}</td>
            <td style={{ padding: '6px 8px' }}>{u.wineCount}</td>
            <td style={{ padding: '6px 8px' }}>{u.bannedUntil ? 'Deaktiviert' : 'Aktiv'}</td>
            <td style={{ padding: '6px 8px' }}>
              <button type="button" disabled={busyId === u.id} onClick={() => toggleBan(u)} style={{ cursor: 'pointer' }}>
                {u.bannedUntil ? 'Reaktivieren' : 'Deaktivieren'}
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
