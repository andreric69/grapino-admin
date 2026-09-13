import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/apiClient';
import { colors } from '../theme';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';

interface ActivityEntry {
  at: string;
  type: 'wine_added' | 'wine_consumed' | 'deletion_requested' | 'feedback';
  email: string | null;
  detail: string;
}

const TYPE_ICON: Record<ActivityEntry['type'], string> = {
  wine_added: '🍷',
  wine_consumed: '🥂',
  deletion_requested: '🗑️',
  feedback: '💬',
};

// Admin-Aktions-Protokoll (eigene, separate Tabelle - siehe
// api/_activityLog.ts) - NICHT die Nutzer-Aktivitaet oben. Zeigt Andrins
// eigene wichtige Aenderungen (Nutzer sperren/entsperren, Testabo
// verlaengern, Preise aendern) zur eigenen Nachvollziehbarkeit.
interface AdminActivityEntry {
  id: string;
  created_at: string;
  action: string;
  detail: string | null;
  user_id: string | null;
}

const ADMIN_ACTION_LABEL: Record<string, string> = {
  user_blocked: 'Nutzer gesperrt',
  user_unblocked: 'Nutzer entsperrt',
  trial_extended: 'Testabo geändert',
  pricing_changed: 'Preise geändert',
};

const ADMIN_ACTION_ICON: Record<string, string> = {
  user_blocked: '🚫',
  user_unblocked: '✅',
  trial_extended: '⏳',
  pricing_changed: '💰',
};

function useUserActivity() {
  const [entries, setEntries] = useState<ActivityEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch('/api/reports?resource=activity').then(async (res) => {
      if (!res.ok) {
        setError('Aktivität konnte nicht geladen werden.');
        return;
      }
      const data = (await res.json()) as { entries: ActivityEntry[] };
      setEntries(data.entries);
    });
  }, []);

  return { entries, error };
}

function useAdminActivity(enabled: boolean) {
  const [entries, setEntries] = useState<AdminActivityEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Erst laden, wenn der Tab tatsaechlich geoeffnet wird - spart den
    // Request, solange nur der Nutzer-Aktivitaets-Tab angesehen wird.
    if (!enabled || entries !== null) return;
    apiFetch('/api/reports?resource=admin-activity').then(async (res) => {
      if (!res.ok) {
        setError('Admin-Aktivität konnte nicht geladen werden.');
        return;
      }
      const data = (await res.json()) as { entries: AdminActivityEntry[] };
      setEntries(data.entries);
    });
  }, [enabled, entries]);

  return { entries, error };
}

function UserActivityFeed() {
  const { entries, error } = useUserActivity();

  if (error) return <p style={{ color: colors.danger }}>{error}</p>;
  if (!entries) return <LoadingSpinner label="Wird geladen ..." />;
  if (entries.length === 0) return <EmptyState icon="📈" text="Noch keine Aktivität." />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <p style={{ fontSize: 12, opacity: 0.6, marginTop: 0 }}>
        Zeigt Wein-Einträge, Trinkverlauf, Löschanfragen und Feedback. Login-Historie wird nicht gespeichert -
        nur der letzte Login ist unter "Nutzer" sichtbar.
      </p>
      {entries.map((e, i) => (
        <div
          key={i}
          style={{ display: 'flex', gap: 10, alignItems: 'baseline', fontSize: 13.5, borderBottom: `1px solid ${colors.border}`, padding: '6px 0' }}
        >
          <span>{TYPE_ICON[e.type]}</span>
          <span style={{ opacity: 0.6, whiteSpace: 'nowrap' }}>{new Date(e.at).toLocaleString('de-CH')}</span>
          <span style={{ fontWeight: 600 }}>{e.email ?? 'Unbekannt'}</span>
          <span>{e.detail}</span>
        </div>
      ))}
    </div>
  );
}

function AdminActivityFeed({ enabled }: { enabled: boolean }) {
  const { entries, error } = useAdminActivity(enabled);

  if (error) return <p style={{ color: colors.danger }}>{error}</p>;
  if (!entries) return <LoadingSpinner label="Wird geladen ..." />;
  if (entries.length === 0) return <EmptyState icon="🛠️" text="Noch keine eigenen Admin-Aktionen protokolliert." />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <p style={{ fontSize: 12, opacity: 0.6, marginTop: 0 }}>
        Protokolliert deine eigenen wichtigen Änderungen (Nutzer sperren/entsperren, Testabo, Preise) - nur zur
        eigenen Nachvollziehbarkeit, nicht die Nutzer-Aktivität.
      </p>
      {entries.map((e) => (
        <div
          key={e.id}
          style={{ display: 'flex', gap: 10, alignItems: 'baseline', fontSize: 13.5, borderBottom: `1px solid ${colors.border}`, padding: '6px 0' }}
        >
          <span>{ADMIN_ACTION_ICON[e.action] ?? '🛠️'}</span>
          <span style={{ opacity: 0.6, whiteSpace: 'nowrap' }}>{new Date(e.created_at).toLocaleString('de-CH')}</span>
          <span style={{ fontWeight: 600 }}>{ADMIN_ACTION_LABEL[e.action] ?? e.action}</span>
          {e.detail && <span>{e.detail}</span>}
        </div>
      ))}
    </div>
  );
}

export function ActivityPage() {
  const [activeTab, setActiveTab] = useState<'user' | 'admin'>('user');

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, borderBottom: `1px solid ${colors.border}`, marginBottom: 10 }}>
        {(
          [
            ['user', 'Nutzer-Aktivität'],
            ['admin', 'Admin-Aktivität'],
          ] as const
        ).map(([tab, tabLabel]) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            style={{
              cursor: 'pointer',
              padding: '7px 12px',
              fontSize: 13,
              fontFamily: 'inherit',
              fontWeight: 600,
              border: 'none',
              borderBottom: activeTab === tab ? `2px solid ${colors.accent}` : '2px solid transparent',
              background: 'transparent',
              color: activeTab === tab ? colors.accent : colors.textMuted,
            }}
          >
            {tabLabel}
          </button>
        ))}
      </div>

      {activeTab === 'user' ? <UserActivityFeed /> : <AdminActivityFeed enabled={activeTab === 'admin'} />}
    </div>
  );
}
