import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/apiClient';
import { cardStyle, colors } from '../theme';

interface AiUsagePerUser {
  userId: string;
  email: string | null;
  total: number;
  today: number;
  dailyLimit: number;
  lastUsed: string | null;
  estimatedCostChf: number;
}

interface AiUsage {
  perUser: AiUsagePerUser[];
  totalScans: number;
  estimatedTotalCostChf: number;
  estimatedCostPerScanChf: number;
}

function formatChf(amount: number): string {
  return amount.toLocaleString('de-CH', { style: 'currency', currency: 'CHF' });
}

function formatDate(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('de-CH', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function AiUsagePage() {
  const [usage, setUsage] = useState<AiUsage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch('/api/reports?resource=ai-usage').then(async (res) => {
      if (!res.ok) {
        setError('KI-Nutzung konnte nicht geladen werden.');
        return;
      }
      setUsage((await res.json()) as AiUsage);
    });
  }, []);

  if (error) return <p style={{ color: colors.danger }}>{error}</p>;
  if (!usage) return <p>Wird geladen ...</p>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ ...cardStyle, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 600 }}>{usage.totalScans}</div>
          <div style={{ fontSize: 12, opacity: 0.6 }}>Scans insgesamt</div>
        </div>
        <div>
          <div style={{ fontSize: 22, fontWeight: 600 }}>{formatChf(usage.estimatedTotalCostChf)}</div>
          <div style={{ fontSize: 12, opacity: 0.6 }}>geschaetzte Kosten insgesamt</div>
        </div>
        <div>
          <div style={{ fontSize: 22, fontWeight: 600 }}>{formatChf(usage.estimatedCostPerScanChf)}</div>
          <div style={{ fontSize: 12, opacity: 0.6 }}>geschaetzt pro Scan</div>
        </div>
      </div>
      <div style={{ fontSize: 11, opacity: 0.5 }}>
        Grobe Schaetzung, keine exakte Abrechnung - echte Kosten im Anthropic Console-Dashboard pruefen. Tageslimit
        pro Nutzer: {usage.perUser[0]?.dailyLimit ?? 100} Scans (reines Sicherheitsnetz gegen einen Bug, siehe
        api/recognize-label.ts).
      </div>

      {usage.perUser.length === 0 ? (
        <p style={{ fontSize: 13.5, opacity: 0.6 }}>Noch niemand hat die KI-Etikett-Erkennung genutzt.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {usage.perUser.map((u) => (
            <div
              key={u.userId}
              style={{
                ...cardStyle,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap',
                fontSize: 13.5,
              }}
            >
              <div>
                <div>{u.email ?? u.userId}</div>
                <div style={{ fontSize: 11, opacity: 0.55, marginTop: 2 }}>Zuletzt genutzt: {formatDate(u.lastUsed)}</div>
              </div>
              <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 600 }}>{u.total}</div>
                  <div style={{ fontSize: 10.5, opacity: 0.55 }}>gesamt</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 600, color: u.today >= u.dailyLimit ? colors.danger : colors.text }}>
                    {u.today} / {u.dailyLimit}
                  </div>
                  <div style={{ fontSize: 10.5, opacity: 0.55 }}>heute</div>
                </div>
                <div style={{ textAlign: 'right', minWidth: 64 }}>
                  <div style={{ fontWeight: 600 }}>{formatChf(u.estimatedCostChf)}</div>
                  <div style={{ fontSize: 10.5, opacity: 0.55 }}>geschaetzt</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
