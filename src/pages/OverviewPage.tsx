import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/apiClient';
import { cardStyle, colors, kickerStyle } from '../theme';
import { LoadingSpinner } from '../components/LoadingSpinner';

interface Metrics {
  userCount: number;
  blockedCount: number;
  activeTrialCount: number;
  openPaymentsTotal: number;
  openPaymentsCount: number;
  paidThisMonthTotal: number;
  openOrdersCount: number;
  openOrdersValue: number;
  monthlyCosts: number;
  oneTimeCosts: number;
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={cardStyle}>
      <div style={kickerStyle}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, opacity: 0.6, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

/** Sammelt die wichtigsten Kennzahlen aus den bereits bestehenden Endpunkten - keine eigene Server-Aggregation, wenig Traffic, einmal pro Seitenaufruf. */
export function OverviewPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const [usersRes, paymentsRes, ordersRes, costsRes] = await Promise.all([
        apiFetch('/api/users'),
        apiFetch('/api/commerce?resource=payments'),
        apiFetch('/api/commerce?resource=orders'),
        apiFetch('/api/reports?resource=costs'),
      ]);
      if (!usersRes.ok || !paymentsRes.ok || !ordersRes.ok || !costsRes.ok) throw new Error();

      const users = (
        (await usersRes.json()) as { users: { isBlocked: boolean; trialEndsAt: string | null }[] }
      ).users;
      const payments = (
        (await paymentsRes.json()) as { paymentRequests: { amount: number; status: string; paid_at: string | null }[] }
      ).paymentRequests;
      const orders = (
        (await ordersRes.json()) as { orders: { estimated_price: number; status: string }[] }
      ).orders;
      const costs = ((await costsRes.json()) as { costs: { amount: number; recurrence: string }[] }).costs;

      const today = new Date();
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

      const openPayments = payments.filter((p) => p.status === 'open');
      const paidThisMonth = payments.filter((p) => p.status === 'paid' && p.paid_at && new Date(p.paid_at) >= startOfMonth);
      const openOrders = orders.filter((o) => o.status === 'pending' || o.status === 'in_progress');

      setMetrics({
        userCount: users.length,
        blockedCount: users.filter((u) => u.isBlocked).length,
        activeTrialCount: users.filter((u) => u.trialEndsAt && new Date(u.trialEndsAt) >= today).length,
        openPaymentsTotal: openPayments.reduce((s, p) => s + p.amount, 0),
        openPaymentsCount: openPayments.length,
        paidThisMonthTotal: paidThisMonth.reduce((s, p) => s + p.amount, 0),
        openOrdersCount: openOrders.length,
        openOrdersValue: openOrders.reduce((s, o) => s + o.estimated_price, 0),
        monthlyCosts: costs.filter((c) => c.recurrence === 'monatlich').reduce((s, c) => s + c.amount, 0),
        oneTimeCosts: costs.filter((c) => c.recurrence === 'einmalig').reduce((s, c) => s + c.amount, 0),
      });
    } catch {
      setError('Kennzahlen konnten nicht geladen werden.');
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (error) return <p style={{ color: colors.danger }}>{error}</p>;
  if (!metrics) return <LoadingSpinner label="Wird geladen ..." />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
        <StatCard label="Nutzer" value={String(metrics.userCount)} sub={`${metrics.blockedCount} blockiert · ${metrics.activeTrialCount} im Testabo`} />
        <StatCard label="Offene Zahlungen" value={`${metrics.openPaymentsTotal.toFixed(2)} CHF`} sub={`${metrics.openPaymentsCount} Anfragen`} />
        <StatCard label="Bezahlt diesen Monat" value={`${metrics.paidThisMonthTotal.toFixed(2)} CHF`} />
        <StatCard label="Offene Auftraege" value={String(metrics.openOrdersCount)} sub={`${metrics.openOrdersValue.toFixed(2)} CHF Volumen`} />
        <StatCard label="Fixkosten / Monat" value={`${metrics.monthlyCosts.toFixed(2)} CHF`} />
        <StatCard label="Einmalige Kosten" value={`${metrics.oneTimeCosts.toFixed(2)} CHF`} />
      </div>
    </div>
  );
}
