import { useState } from 'react';
import { clearToken } from '../lib/apiClient';
import { UsersPage } from './UsersPage';
import { DeletionRequestsPage } from './DeletionRequestsPage';
import { AnnouncementsPage } from './AnnouncementsPage';
import { FeedbackPage } from './FeedbackPage';
import { ActivityPage } from './ActivityPage';
import { CostsPage } from './CostsPage';

type Tab = 'users' | 'deletions' | 'announcements' | 'feedback' | 'activity' | 'costs';

const TABS: { key: Tab; label: string }[] = [
  { key: 'deletions', label: 'Loeschanfragen' },
  { key: 'users', label: 'Nutzer' },
  { key: 'announcements', label: 'Ankuendigungen' },
  { key: 'feedback', label: 'Feedback' },
  { key: 'activity', label: 'Aktivitaet' },
  { key: 'costs', label: 'Kosten' },
];

export function DashboardPage({ onLoggedOut }: { onLoggedOut: () => void }) {
  const [tab, setTab] = useState<Tab>('deletions');

  function handleLogout() {
    clearToken();
    onLoggedOut();
  }

  return (
    <div style={{ maxWidth: 960, margin: '32px auto', fontFamily: 'system-ui, sans-serif', padding: '0 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>Grapino Admin</h1>
        <button type="button" onClick={handleLogout} style={{ cursor: 'pointer' }}>
          Abmelden
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '1px solid #ddd', flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            style={{
              cursor: 'pointer',
              padding: '8px 4px',
              border: 'none',
              background: 'none',
              fontWeight: tab === t.key ? 700 : 400,
              borderBottom: tab === t.key ? '2px solid #333' : '2px solid transparent',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'deletions' && <DeletionRequestsPage />}
      {tab === 'users' && <UsersPage />}
      {tab === 'announcements' && <AnnouncementsPage />}
      {tab === 'feedback' && <FeedbackPage />}
      {tab === 'activity' && <ActivityPage />}
      {tab === 'costs' && <CostsPage />}
    </div>
  );
}
