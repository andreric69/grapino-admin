import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../lib/apiClient';
import { colors, inputStyle, primaryBtnStyle, secondaryBtnStyle } from '../theme';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';
import { OrderCard, type Order } from '../components/OrderCard';

const STATUS_FILTERS: { value: Order['status'] | 'all'; label: string }[] = [
  { value: 'all', label: 'Alle' },
  { value: 'pending', label: 'Wartet' },
  { value: 'in_progress', label: 'In Bearbeitung' },
  { value: 'done', label: 'Erledigt' },
  { value: 'cancelled', label: 'Storniert' },
];

export function OrdersPage() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<Order['status'] | 'all'>('all');
  const [search, setSearch] = useState('');
  const [sortOldestFirst, setSortOldestFirst] = useState(false);

  async function load() {
    setError(null);
    const res = await apiFetch('/api/commerce?resource=orders');
    if (!res.ok) {
      setError('Aufträge konnten nicht geladen werden.');
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

  const visibleOrders = useMemo(() => {
    if (!orders) return [];
    const needle = search.trim().toLowerCase();
    const filtered = orders.filter((o) => {
      if (statusFilter !== 'all' && o.status !== statusFilter) return false;
      if (!needle) return true;
      return (o.email ?? '').toLowerCase().includes(needle) || o.categoryLabel.toLowerCase().includes(needle);
    });
    const sorted = [...filtered].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    return sortOldestFirst ? sorted : sorted.reverse();
  }, [orders, statusFilter, search, sortOldestFirst]);

  if (error) return <p style={{ color: colors.danger }}>{error}</p>;
  if (!orders) return <LoadingSpinner label="Wird geladen ..." />;
  if (orders.length === 0) return <EmptyState icon="📋" text="Noch keine Aufträge." />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setStatusFilter(f.value)}
            style={{
              ...(statusFilter === f.value ? primaryBtnStyle : secondaryBtnStyle),
              padding: '5px 11px',
              fontSize: 12.5,
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Suche nach E-Mail oder Kategorie ..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ ...inputStyle, flex: '1 1 220px' }}
        />
        <button
          type="button"
          onClick={() => setSortOldestFirst((v) => !v)}
          style={{ ...secondaryBtnStyle, padding: '5px 11px', fontSize: 12.5, whiteSpace: 'nowrap' }}
        >
          {sortOldestFirst ? 'Älteste zuerst' : 'Neueste zuerst'}
        </button>
      </div>

      {visibleOrders.length === 0 ? (
        <EmptyState icon="🔍" text="Keine Aufträge gefunden." />
      ) : (
        visibleOrders.map((o) => (
          <OrderCard key={o.id} order={o} busy={busyId === o.id} onUpdateStatus={(status) => updateStatus(o, status)} />
        ))
      )}
    </div>
  );
}
