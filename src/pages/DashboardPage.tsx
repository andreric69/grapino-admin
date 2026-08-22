import { useEffect, useState } from 'react';
import { clearToken } from '../lib/apiClient';
import { colors, fontBody, fontHeading } from '../theme';
import { UsersPage } from './UsersPage';
import { DeletionRequestsPage } from './DeletionRequestsPage';
import { AnnouncementsPage } from './AnnouncementsPage';
import { FeedbackPage } from './FeedbackPage';
import { ActivityPage } from './ActivityPage';
import { MessagesPage } from './MessagesPage';
import { PaymentRequestsPage } from './PaymentRequestsPage';
import { OrdersPage } from './OrdersPage';
import { StoragePage } from './StoragePage';
import { AiUsagePage } from './AiUsagePage';
import { EmailTemplatesPage } from './EmailTemplatesPage';
import { PricingAndCostsPage } from './PricingAndCostsPage';
import { OverviewPage } from './OverviewPage';

type Tab =
  | 'overview'
  | 'users'
  | 'deletions'
  | 'messages'
  | 'payments'
  | 'orders'
  | 'pricingCosts'
  | 'announcements'
  | 'feedback'
  | 'email'
  | 'activity'
  | 'storage'
  | 'aiUsage';

const NAV: { key: Tab; label: string; icon: string }[] = [
  { key: 'overview', label: 'Uebersicht', icon: '\u{1F4CA}' },
  { key: 'users', label: 'Nutzer', icon: '\u{1F464}' },
  { key: 'deletions', label: 'Loeschanfragen', icon: '\u{1F5D1}\u{FE0F}' },
  { key: 'messages', label: 'Nachrichten', icon: '\u{1F4AC}' },
  { key: 'payments', label: 'Zahlungen', icon: '\u{1F4B0}' },
  { key: 'orders', label: 'Auftraege', icon: '\u{1F4CB}' },
  { key: 'pricingCosts', label: 'Preise & Kosten', icon: '\u{1F4B8}' },
  { key: 'announcements', label: 'Ankuendigungen', icon: '\u{1F4E3}' },
  { key: 'feedback', label: 'Feedback', icon: '\u{2B50}' },
  { key: 'email', label: 'E-Mail-Vorlagen', icon: '\u{2709}\u{FE0F}' },
  { key: 'activity', label: 'Aktivitaet', icon: '\u{1F4C8}' },
  { key: 'storage', label: 'Speicher', icon: '\u{1F5C3}\u{FE0F}' },
  { key: 'aiUsage', label: 'KI-Nutzung', icon: '\u{1F916}' },
];

const MOBILE_BREAKPOINT = '(max-width: 768px)';

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(MOBILE_BREAKPOINT).matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_BREAKPOINT);
    const onChange = () => setIsMobile(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return isMobile;
}

export function DashboardPage({ onLoggedOut }: { onLoggedOut: () => void }) {
  const [tab, setTab] = useState<Tab>('overview');
  const isMobile = useIsMobile();
  const [navOpen, setNavOpen] = useState(false);

  function handleLogout() {
    clearToken();
    onLoggedOut();
  }

  function selectTab(key: Tab) {
    setTab(key);
    setNavOpen(false);
  }

  const sidebar = (
    <div
      style={{
        width: isMobile ? '78vw' : 210,
        maxWidth: isMobile ? 280 : undefined,
        flexShrink: 0,
        borderRight: `1px solid ${colors.border}`,
        background: colors.surface,
        display: 'flex',
        flexDirection: 'column',
        ...(isMobile
          ? {
              position: 'fixed' as const,
              inset: 0,
              zIndex: 30,
              transform: navOpen ? 'translateX(0)' : 'translateX(-100%)',
              transition: 'transform 0.2s ease',
              paddingTop: 'env(safe-area-inset-top)',
              paddingBottom: 'env(safe-area-inset-bottom)',
            }
          : { position: 'sticky' as const, top: 0, height: '100vh' }),
      }}
    >
      <div style={{ padding: '18px 16px', borderBottom: `1px solid ${colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontFamily: fontHeading, fontSize: 18, fontWeight: 600, color: colors.accent }}>Grapino Admin</div>
        {isMobile && (
          <button
            type="button"
            aria-label="Menue schliessen"
            onClick={() => setNavOpen(false)}
            style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: colors.textMuted, padding: 4 }}
          >
            ×
          </button>
        )}
      </div>
      <nav style={{ flex: 1, overflowY: 'auto', padding: '10px 8px' }}>
        {NAV.map((n) => (
          <button
            key={n.key}
            type="button"
            onClick={() => selectTab(n.key)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              textAlign: 'left',
              cursor: 'pointer',
              padding: '10px 10px',
              marginBottom: 2,
              fontSize: 14,
              border: 'none',
              borderRadius: 6,
              background: tab === n.key ? colors.accentSoft : 'transparent',
              color: tab === n.key ? colors.accent : colors.text,
              fontWeight: tab === n.key ? 600 : 400,
            }}
          >
            <span style={{ fontSize: 15 }}>{n.icon}</span>
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
            padding: '10px 10px',
            fontSize: 13.5,
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
  );

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: fontBody, background: colors.bg, color: colors.text }}>
      {sidebar}
      {isMobile && navOpen && (
        <div
          onClick={() => setNavOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 25 }}
        />
      )}

      <div style={{ flex: 1, minWidth: 0, maxWidth: isMobile ? undefined : 1000 }}>
        {isMobile && (
          <div
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 10,
              background: colors.surface,
              borderBottom: `1px solid ${colors.border}`,
              padding: 'calc(10px + env(safe-area-inset-top)) 14px 10px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <button
              type="button"
              aria-label="Menue oeffnen"
              onClick={() => setNavOpen(true)}
              style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', padding: 4, color: colors.text }}
            >
              ☰
            </button>
            <strong style={{ fontSize: 15 }}>{NAV.find((n) => n.key === tab)?.label}</strong>
          </div>
        )}

        <div style={{ padding: isMobile ? '16px' : '28px 32px' }}>
          {!isMobile && (
            <h1 style={{ fontFamily: fontHeading, fontWeight: 600, fontSize: 22, margin: '0 0 20px', color: colors.text }}>
              {NAV.find((n) => n.key === tab)?.label}
            </h1>
          )}
          {tab === 'overview' && <OverviewPage />}
          {tab === 'deletions' && <DeletionRequestsPage />}
          {tab === 'users' && <UsersPage />}
          {tab === 'messages' && <MessagesPage />}
          {tab === 'payments' && <PaymentRequestsPage />}
          {tab === 'orders' && <OrdersPage />}
          {tab === 'pricingCosts' && <PricingAndCostsPage />}
          {tab === 'announcements' && <AnnouncementsPage />}
          {tab === 'feedback' && <FeedbackPage />}
          {tab === 'email' && <EmailTemplatesPage />}
          {tab === 'activity' && <ActivityPage />}
          {tab === 'storage' && <StoragePage />}
          {tab === 'aiUsage' && <AiUsagePage />}
        </div>
      </div>
    </div>
  );
}
