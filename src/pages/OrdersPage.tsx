import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/apiClient';
import { colors } from '../theme';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';
import { OrderCard, type Order } from '../components/OrderCard';

export function OrdersPage() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

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

  if (error) return <p style={{ color: colors.danger }}>{error}</p>;
  if (!orders) return <LoadingSpinner label="Wird geladen ..." />;
  if (orders.length === 0) return <EmptyState icon="📋" text="Noch keine Auftraege." />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {orders.map((o) => (
        <OrderCard key={o.id} order={o} busy={busyId === o.id} onUpdateStatus={(status) => updateStatus(o, status)} />
      ))}
    </div>
  );
}
