import { useState } from 'react';
import { clearToken } from '../lib/apiClient';
import { UsersPage } from './UsersPage';
import { DeletionRequestsPage } from './DeletionRequestsPage';

type Tab = 'users' | 'deletions';

export function DashboardPage({ onLoggedOut }: { onLoggedOut: () => void }) {
  const [tab, setTab] = useState<Tab>('deletions');

  function handleLogout() {
    clearToken();
    onLoggedOut();
  }

  return (
    <div style={{ maxWidth: 800, margin: '32px auto', fontFamily: 'system-ui, sans-serif', padding: '0 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>Grapino Admin</h1>
        <button type="button" onClick={handleLogout} style={{ cursor: 'pointer' }}>
          Abmelden
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '1px solid #ddd' }}>
        <button
          type="button"
          onClick={() => setTab('deletions')}
          style={{
            cursor: 'pointer',
            padding: '8px 4px',
            border: 'none',
            background: 'none',
            fontWeight: tab === 'deletions' ? 700 : 400,
            borderBottom: tab === 'deletions' ? '2px solid #333' : '2px solid transparent',
          }}
        >
          Loeschanfragen
        </button>
        <button
          type="button"
          onClick={() => setTab('users')}
          style={{
            cursor: 'pointer',
            padding: '8px 4px',
            border: 'none',
            background: 'none',
            fontWeight: tab === 'users' ? 700 : 400,
            borderBottom: tab === 'users' ? '2px solid #333' : '2px solid transparent',
          }}
        >
          Nutzer
        </button>
      </div>

      {tab === 'deletions' && <DeletionRequestsPage />}
      {tab === 'users' && <UsersPage />}
    </div>
  );
}
