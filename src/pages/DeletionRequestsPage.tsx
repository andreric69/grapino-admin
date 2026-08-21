import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/apiClient';
import { cardStyle, colors, secondaryBtnStyle } from '../theme';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';

interface DeletionRequest {
  id: string;
  userId: string;
  email: string | null;
  createdAt: string;
  status: 'pending' | 'approved' | 'rejected';
  wineCount: number;
}

export function DeletionRequestsPage() {
  const [requests, setRequests] = useState<DeletionRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setError(null);
    const res = await apiFetch('/api/deletion-requests');
    if (!res.ok) {
      setError('Loeschanfragen konnten nicht geladen werden.');
      return;
    }
    const body = (await res.json()) as { requests: DeletionRequest[] };
    setRequests(body.requests);
  }

  useEffect(() => {
    load();
  }, []);

  async function handle(request: DeletionRequest, action: 'approve' | 'reject') {
    const confirmMsg =
      action === 'approve'
        ? `WIRKLICH loeschen? "${request.email ?? request.userId}" verliert unwiderruflich alle ${request.wineCount} Weine.`
        : `Anfrage von "${request.email ?? request.userId}" ablehnen? Die Daten bleiben erhalten.`;
    if (!window.confirm(confirmMsg)) return;

    setBusyId(request.id);
    try {
      const res = await apiFetch('/api/deletion-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: request.id, action }),
      });
      if (!res.ok) throw new Error();
      await load();
    } catch {
      setError('Aktion fehlgeschlagen.');
    } finally {
      setBusyId(null);
    }
  }

  if (error) return <p style={{ color: colors.danger }}>{error}</p>;
  if (!requests) return <LoadingSpinner label="Wird geladen ..." />;
  if (requests.length === 0) return <EmptyState icon="🗑️" text="Keine offenen Loeschanfragen." />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {requests.map((r) => (
        <div key={r.id} style={cardStyle}>
          <div>
            <strong>{r.email ?? r.userId}</strong> moechte die gesamte Sammlung loeschen ({r.wineCount}{' '}
            {r.wineCount === 1 ? 'Wein' : 'Weine'})
          </div>
          <div style={{ opacity: 0.6, fontSize: 12, marginTop: 2 }}>
            Angefragt am {new Date(r.createdAt).toLocaleString('de-CH')}
          </div>
          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            <button
              type="button"
              disabled={busyId === r.id}
              onClick={() => handle(r, 'approve')}
              style={{ ...secondaryBtnStyle, color: colors.danger, borderColor: colors.danger }}
            >
              Bestaetigen &amp; loeschen
            </button>
            <button type="button" disabled={busyId === r.id} onClick={() => handle(r, 'reject')} style={secondaryBtnStyle}>
              Ablehnen
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
