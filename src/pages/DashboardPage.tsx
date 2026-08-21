import { useState } from 'react';
import { clearToken } from '../lib/apiClient';
import { colors } from '../theme';
import { UsersPage } from './UsersPage';
import { DeletionRequestsPage } from './DeletionRequestsPage';
import { AnnouncementsPage } from './AnnouncementsPage';
import { FeedbackPage } from './FeedbackPage';
import { ActivityPage } from './ActivityPage';
import { CostsPage } from './CostsPage';
import { MessagesPage } from './MessagesPage';
import { PaymentRequestsPage } from './PaymentRequestsPage';
import { OrdersPage } from './OrdersPage';
import { StoragePage } from './StoragePage';
import { EmailTemplatesPage } from './EmailTemplatesPage';

type Tab =
  | 'users'
  | 'deletions'
  | 'messages'
  | 'payments'
  | 'orders'
  | 'announcements'
  | 'feedback'
  | 'email'
  | 'activity'
  | 'storage'
  | 'costs';

const NAV: { key: Tab; label: string; icon: string }[] = [
  { key: 'users', label: 'Nutzer', icon: '\u{1F464}' },
  { key: 'deletions', label: 'Loeschanfragen', icon: '\u{1F5D1}\u{FE0F}' },
  { key: 'messages', label: 'Nachrichten', icon: '\u{1F4AC}' },
  { key: 'payments', label: 'Zahlungen', icon: '\u{1F4B0}' },
  { key: 'orders', label: 'Auftraege', icon: '\u{1F4CB}' },
  { key: 'announcements', label: 'Ankuendigungen', icon: '\u{1F4E3}' },
  { key: 'feedback', label: 'Feedback', icon: '\u{2B50}' },
  { key: 'email', label: 'E-Mail-Vorlagen', icon: '\u{2709}\u{FE0F}' },
  { key: 'activity', label: 'Aktivitaet', icon: '\u{1F4C8}' },
  { key: 'storage', label: 'Speicher', icon: '\u{1F5C3}\u{FE0F}' },
  { key: 'costs', label: 'Kosten', icon: '\u{1F4B8}' },
];

export function DashboardPage({ onLoggedOut }: { onLoggedOut: () => void }) {
  const [tab, setTab] = useState<Tab>('users');

  function handleLogout() {
    clearToken();
    onLoggedOut();
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'system-ui, sans-serif', background: colors.bg, color: colors.text }}>
      <div
        style={{
          width: 210,
          flexShrink: 0,
          borderRight: `1px solid ${colors.border}`,
          background: colors.surface,
          display: 'flex',
          flexDirection: 'column',
          position: 'sticky',
          top: 0,
          height: '100vh',
        }}
      >
        <div style={{ padding: '18px 16px', borderBottom: `1px solid ${colors.border}` }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: colors.accent }}>Grapino Admin</div>
        </div>
        <nav style={{ flex: 1, overflowY: 'auto', padding: '10px 8px' }}>
          {NAV.map((n) => (
            <button
              key={n.key}
              type="button"
              onClick={() => setTab(n.key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                textAlign: 'left',
                cursor: 'pointer',
                padding: '8px 10px',
                marginBottom: 2,
                fontSize: 13.5,
                border: 'none',
                borderRadius: 6,
                background: tab === n.key ? colors.accentSoft : 'transparent',
                color: tab === n.key ? colors.accent : colors.text,
                fontWeight: tab === n.key ? 600 : 400,
              }}
            >
              <span style={{ fontSize: 14 }}>{n.icon}</span>
              {n.label}
            </button>
          ))}
        </nav>
        <div style={{ padding: 12, borderTop: `1px solid ${colors.border}` }}>
          <button
            type="button"
            onClick={handleLogout}
            style={{
              width: '100%',
              cursor: 'pointer',
              padding: '8px 10px',
              fontSize: 13,
              border: `1px solid ${colors.border}`,
              borderRadius: 6,
              background: colors.surface,
              color: colors.textMuted,
            }}
          >
            Abmelden
          </button>
        </div>
      </div>

      <div style={{ flex: 1, padding: '28px 32px', maxWidth: 1000 }}>
        <h1 style={{ fontSize: 19, margin: '0 0 20px', color: colors.text }}>
          {NAV.find((n) => n.key === tab)?.label}
        </h1>
        {tab === 'deletions' && <DeletionRequestsPage />}
        {tab === 'users' && <UsersPage />}
        {tab === 'messages' && <MessagesPage />}
        {tab === 'payments' && <PaymentRequestsPage />}
        {tab === 'orders' && <OrdersPage />}
        {tab === 'announcements' && <AnnouncementsPage />}
        {tab === 'feedback' && <FeedbackPage />}
        {tab === 'email' && <EmailTemplatesPage />}
        {tab === 'activity' && <ActivityPage />}
        {tab === 'storage' && <StoragePage />}
        {tab === 'costs' && <CostsPage />}
      </div>
    </div>
  );
}
