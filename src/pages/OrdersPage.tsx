import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/apiClient';
import { cardStyle, colors, primaryBtnStyle, secondaryBtnStyle } from '../theme';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';

interface Order {
  id: string;
  created_at: string;
  email: string | null;
  categoryLabel: string;
  wine_count: number;
  estimated_price: number;
  status: 'pending' | 'in_progress' | 'done' | 'cancelled';
  note: string | null;
  prompt: string;
}

const STATUS_LABELS: Record<Order['status'], string> = {
  pending: 'Wartet',
  in_progress: 'In Bearbeitung',
  done: 'Erledigt',
  cancelled: 'Storniert',
};

export function OrdersPage() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function load() {
    setError(null);
    const res = await apiFetch('/api/commerce?resource=orders');
    if (!res.ok) {
      setError('Auftraege konnten nicht geladen werden.');
      return;
    }
    const data = (await res.json()) as { orders: Order[] };
    setOrders(data.orders);
  }

  useEffect(() => {
    load();
  }, []);

  async function updateStatus(o: Order, status: Order['status']) {
    setBusyId(o.id);
    try {
      const res = await apiFetch('/api/commerce?resource=orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: o.id, status }),
      });
      if (!res.ok) throw new Error();
      await load();
    } catch {
      setError('Aktion fehlgeschlagen.');
    } finally {
      setBusyId(null);
    }
  }

  async function copyPrompt(o: Order) {
    await navigator.clipboard.writeText(o.prompt);
    setCopiedId(o.id);
    setTimeout(() => setCopiedId((id) => (id === o.id ? null : id)), 2000);
  }

  if (error) return <p style={{ color: colors.danger }}>{error}</p>;
  if (!orders) return <LoadingSpinner label="Wird geladen ..." />;
  if (orders.length === 0) return <EmptyState icon="📋" text="Noch keine Auftraege." />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {orders.map((o) => (
        <div key={o.id} style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <strong>{o.email ?? 'Unbekannt'}</strong>
            <span style={{ fontSize: 12, opacity: 0.6 }}>{new Date(o.created_at).toLocaleString('de-CH')}</span>
          </div>
          <div style={{ fontSize: 14, marginTop: 4 }}>
            {o.categoryLabel} · {o.wine_count} {o.wine_count === 1 ? 'Wein' : 'Weine'} ·{' '}
            <strong>{o.estimated_price.toFixed(2)} CHF</strong>
          </div>
          {o.note && <div style={{ fontSize: 13, opacity: 0.8, marginTop: 4 }}>Notiz: {o.note}</div>}
          <div style={{ fontSize: 12, marginTop: 4, color: o.status === 'pending' ? colors.accent : colors.textMuted }}>
            {STATUS_LABELS[o.status]}
          </div>

          <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setExpandedId(expandedId === o.id ? null : o.id)} style={secondaryBtnStyle}>
              {expandedId === o.id ? 'Prompt ausblenden' : 'Prompt anzeigen'}
            </button>
            <button type="button" onClick={() => copyPrompt(o)} style={secondaryBtnStyle}>
              {copiedId === o.id ? 'Kopiert!' : 'Prompt kopieren'}
            </button>
            {o.status === 'pending' && (
              <button type="button" disabled={busyId === o.id} onClick={() => updateStatus(o, 'in_progress')} style={primaryBtnStyle}>
                Annehmen
              </button>
            )}
            {o.status === 'in_progress' && (
              <button type="button" disabled={busyId === o.id} onClick={() => updateStatus(o, 'done')} style={primaryBtnStyle}>
                Als erledigt markieren
              </button>
            )}
            {o.status !== 'done' && o.status !== 'cancelled' && (
              <button type="button" disabled={busyId === o.id} onClick={() => updateStatus(o, 'cancelled')} style={secondaryBtnStyle}>
                Stornieren
              </button>
            )}
          </div>

          {expandedId === o.id && (
            <pre
              style={{
                marginTop: 10,
                padding: 10,
                background: colors.bg,
                border: `1px solid ${colors.border}`,
                borderRadius: 6,
                fontSize: 12,
                whiteSpace: 'pre-wrap',
                fontFamily: 'ui-monospace, monospace',
              }}
            >
              {o.prompt}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}
