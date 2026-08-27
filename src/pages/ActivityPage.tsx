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

export function ActivityPage() {
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
