import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/apiClient';
import { cardStyle, colors } from '../theme';

interface StorageUsage {
  perUser: { userId: string; email: string | null; bytes: number }[];
  totalBytes: number;
  totalQuotaBytes: number;
  estimatedAdditionalUsers: number | null;
}

function formatMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export function StoragePage() {
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch('/api/reports?resource=storage').then(async (res) => {
      if (!res.ok) {
        setError('Speicherinfo konnte nicht geladen werden.');
        return;
      }
      setUsage((await res.json()) as StorageUsage);
    });
  }, []);

  if (error) return <p style={{ color: colors.danger }}>{error}</p>;
  if (!usage) return <p>Wird geladen (kann bei vielen Fotos etwas dauern) ...</p>;

  const percent = usage.totalQuotaBytes > 0 ? Math.min(100, (usage.totalBytes / usage.totalQuotaBytes) * 100) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
          <strong>{formatMB(usage.totalBytes)}</strong>
          <span style={{ opacity: 0.6 }}>von {formatMB(usage.totalQuotaBytes)}</span>
        </div>
        <div style={{ marginTop: 8, height: 8, borderRadius: 4, background: colors.border, overflow: 'hidden' }}>
          <div style={{ width: `${percent}%`, height: '100%', background: colors.accent }} />
        </div>
        <div style={{ fontSize: 12.5, opacity: 0.65, marginTop: 10 }}>
          {usage.estimatedAdditionalUsers !== null
            ? `Bei aehnlichem Verbrauch pro Nutzer noch Platz fuer ca. ${usage.estimatedAdditionalUsers} weitere Nutzer.`
            : 'Noch keine Fotos vorhanden - Hochrechnung noch nicht moeglich.'}
        </div>
        <div style={{ fontSize: 11, opacity: 0.5, marginTop: 6 }}>
          Limit manuell hinterlegt (Umgebungsvariable/Konstante) - im Supabase-Dashboard unter Settings → Billing →
          Usage pruefen, falls sich der Plan geaendert hat.
        </div>
      </div>

      <div>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Pro Nutzer</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {usage.perUser.map((u) => (
            <div key={u.userId} style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', fontSize: 13.5 }}>
              <span>{u.email ?? u.userId}</span>
              <strong>{formatMB(u.bytes)}</strong>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
