import { useEffect, useState } from 'react';
import { clearToken } from '../lib/apiClient';
import { colors, fontBody, fontHeading, navGroupLabelStyle } from '../theme';
import { NavIcon, type NavIconName } from '../components/NavIcon';
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
import { DataQualityPage } from './DataQualityPage';
import { EmailTemplatesPage } from './EmailTemplatesPage';
import { FinancesPage } from './FinancesPage';
import { OverviewPage } from './OverviewPage';
import { HealthPage } from './HealthPage';
import { AnalyticsPage } from './AnalyticsPage';

type Tab =
  | 'overview'
  | 'analytics'
  | 'users'
  | 'deletions'
  | 'messages'
  | 'payments'
  | 'orders'
  | 'finances'
  | 'announcements'
  | 'feedback'
  | 'email'
  | 'activity'
  | 'storage'
  | 'aiUsage'
  | 'dataQuality'
  | 'health';

// Frueher eine einzige flache Liste von 16 Tabs - kaum mehr ueberschaubar.
// Jetzt nach Zusammengehoerigkeit gruppiert: was mit Geld zu tun hat steht
// beisammen, was mit Kommunikation nach aussen zu tun hat auch, technischer
// Betrieb ("System") ist vom Tagesgeschaeft (Nutzer/Zahlungen) klar getrennt.
const NAV_GROUPS: { label: string; items: { key: Tab; label: string; icon: NavIconName }[] }[] = [
  {
    label: 'Übersicht',
    items: [
      { key: 'overview', label: 'Übersicht', icon: 'overview' },
      { key: 'analytics', label: 'Auswertungen', icon: 'analytics' },
    ],
  },
  {
    label: 'Nutzer',
    items: [
      { key: 'users', label: 'Nutzer', icon: 'users' },
      { key: 'deletions', label: 'Löschanfragen', icon: 'deletions' },
    ],
  },
  {
    label: 'Zahlungen & Preise',
    items: [
      { key: 'payments', label: 'Zahlungen', icon: 'payments' },
      { key: 'orders', label: 'Aufträge', icon: 'orders' },
      { key: 'finances', label: 'Finanzen', icon: 'finances' },
    ],
  },
  {
    label: 'Kommunikation',
    items: [
      { key: 'messages', label: 'Nachrichten', icon: 'messages' },
      { key: 'announcements', label: 'Ankündigungen', icon: 'announcements' },
      { key: 'feedback', label: 'Feedback', icon: 'feedback' },
      { key: 'email', label: 'E-Mail-Vorlagen', icon: 'email' },
    ],
  },
  {
    label: 'System',
    items: [
      { key: 'activity', label: 'Aktivität', icon: 'activity' },
      { key: 'storage', label: 'Speicher', icon: 'storage' },
      { key: 'aiUsage', label: 'KI-Nutzung', icon: 'aiUsage' },
      { key: 'dataQuality', label: 'Datenqualität', icon: 'dataQuality' },
      { key: 'health', label: 'Gesundheit', icon: 'health' },
    ],
  },
];

const NAV = NAV_GROUPS.flatMap((g) => g.items);

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
        width: isMobile ? '78vw' : 226,
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
      <div style={{ padding: '18px 18px', borderBottom: `1px solid ${colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontFamily: fontHeading, fontSize: 19, fontWeight: 600, color: colors.accent }}>Grapino Admin</div>
        {isMobile && (
          <button
            type="button"
            aria-label="Menü schliessen"
            onClick={() => setNavOpen(false)}
            style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: colors.textMuted, padding: 4 }}
          >
            ×
          </button>
        )}
      </div>
      <nav style={{ flex: 1, overflowY: 'auto', padding: '14px 10px' }}>
        {NAV_GROUPS.map((group, i) => (
          <div key={group.label} style={{ marginTop: i === 0 ? 0 : 18 }}>
            <div style={{ ...navGroupLabelStyle, padding: '0 8px 6px' }}>{group.label}</div>
            {group.items.map((n) => (
              <button
                key={n.key}
                type="button"
                onClick={() => selectTab(n.key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  width: '100%',
                  textAlign: 'left',
                  cursor: 'pointer',
                  padding: '8px 10px',
                  marginBottom: 2,
                  fontSize: 14,
                  fontFamily: fontBody,
                  border: 'none',
                  borderRadius: 6,
                  background: tab === n.key ? colors.accentSoft : 'transparent',
                  color: tab === n.key ? colors.accent : colors.text,
                  fontWeight: tab === n.key ? 600 : 400,
                }}
              >
                <NavIcon name={n.icon} />
                {n.label}
              </button>
            ))}
          </div>
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
              aria-label="Menü öffnen"
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
          {tab === 'analytics' && <AnalyticsPage />}
          {tab === 'deletions' && <DeletionRequestsPage />}
          {tab === 'users' && <UsersPage />}
          {tab === 'messages' && <MessagesPage />}
          {tab === 'payments' && <PaymentRequestsPage />}
          {tab === 'orders' && <OrdersPage />}
          {tab === 'finances' && <FinancesPage />}
          {tab === 'announcements' && <AnnouncementsPage />}
          {tab === 'feedback' && <FeedbackPage />}
          {tab === 'email' && <EmailTemplatesPage />}
          {tab === 'activity' && <ActivityPage />}
          {tab === 'storage' && <StoragePage />}
          {tab === 'aiUsage' && <AiUsagePage />}
          {tab === 'dataQuality' && <DataQualityPage />}
          {tab === 'health' && <HealthPage />}
        </div>
      </div>
    </div>
  );
}
