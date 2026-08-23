import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/apiClient';
import { cardStyle, colors, fontHeading, kickerStyle } from '../theme';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { OrderCard, type Order } from '../components/OrderCard';
import { MessageCard, type UserMessage } from '../components/MessageCard';
import { fetchFinancialSummary } from '../lib/financials';

interface Metrics {
  userCount: number;
  blockedCount: number;
  activeTrialCount: number;
  openPaymentsTotal: number;
  openPaymentsCount: number;
  paidThisMonthTotal: number;
  monthlyCosts: number;
  oneTimeCosts: number;
  profitLoss: number;
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

function SectionHeading({ text, count }: { text: string; count: number }) {
  return (
    <h2 style={{ fontFamily: fontHeading, fontSize: 16, fontWeight: 600, color: colors.text, margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
      {text}
      {count > 0 && (
        <span
          style={{
            fontSize: 11,
            fontFamily: 'inherit',
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: 10,
            background: colors.accent,
            color: '#fff',
          }}
        >
          {count}
        </span>
      )}
    </h2>
  );
}

/**
 * Zeigt direkt auf dem Dashboard, was gerade Aufmerksamkeit braucht -
 * ungelesene Nachrichten und offene Auftraege - statt dass man dafuer erst
 * in die jeweiligen Tabs wechseln muss. Volle Historie bleibt weiterhin in
 * "Nachrichten"/"Auftraege" einsehbar.
 */
export function OverviewPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [messages, setMessages] = useState<UserMessage[] | null>(null);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyMessageId, setBusyMessageId] = useState<string | null>(null);
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const [usersRes, paymentsRes, ordersRes, costsRes, messagesRes, financials] = await Promise.all([
        apiFetch('/api/users'),
        apiFetch('/api/commerce?resource=payments'),
        apiFetch('/api/commerce?resource=orders'),
        apiFetch('/api/reports?resource=costs'),
        apiFetch('/api/messages'),
        fetchFinancialSummary(),
      ]);
      if (!usersRes.ok || !paymentsRes.ok || !ordersRes.ok || !costsRes.ok || !messagesRes.ok) throw new Error();

      const users = (
        (await usersRes.json()) as { users: { isBlocked: boolean; trialEndsAt: string | null }[] }
      ).users;
      const payments = (
        (await paymentsRes.json()) as { paymentRequests: { amount: number; status: string; paid_at: string | null }[] }
      ).paymentRequests;
      const ordersData = ((await ordersRes.json()) as { orders: Order[] }).orders;
      const costs = ((await costsRes.json()) as { costs: { amount: number; recurrence: string }[] }).costs;
      const messagesData = ((await messagesRes.json()) as { messages: UserMessage[] }).messages;

      const today = new Date();
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

      const openPayments = payments.filter((p) => p.status === 'open');
      const paidThisMonth = payments.filter((p) => p.status === 'paid' && p.paid_at && new Date(p.paid_at) >= startOfMonth);

      setMetrics({
        userCount: users.length,
        blockedCount: users.filter((u) => u.isBlocked).length,
        activeTrialCount: users.filter((u) => u.trialEndsAt && new Date(u.trialEndsAt) >= today).length,
        openPaymentsTotal: openPayments.reduce((s, p) => s + p.amount, 0),
        openPaymentsCount: openPayments.length,
        paidThisMonthTotal: paidThisMonth.reduce((s, p) => s + p.amount, 0),
        monthlyCosts: costs.filter((c) => c.recurrence === 'monatlich').reduce((s, c) => s + c.amount, 0),
        oneTimeCosts: costs.filter((c) => c.recurrence === 'einmalig').reduce((s, c) => s + c.amount, 0),
        profitLoss: financials.profitLoss,
      });
      setOrders(ordersData);
      setMessages(messagesData);
    } catch {
      setError('Kennzahlen konnten nicht geladen werden.');
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function markMessageRead(m: UserMessage) {
    setBusyMessageId(m.id);
    try {
      const res = await apiFetch('/api/messages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: m.id }),
      });
      if (!res.ok) throw new Error();
      await load();
    } catch {
      setError('Aktion fehlgeschlagen.');
    } finally {
      setBusyMessageId(null);
    }
  }

  async function updateOrderStatus(o: Order, status: Order['status']) {
    setBusyOrderId(o.id);
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
      setBusyOrderId(null);
    }
  }

  if (error) return <p style={{ color: colors.danger }}>{error}</p>;
  if (!metrics || !messages || !orders) return <LoadingSpinner label="Wird geladen ..." />;

  const unreadMessages = messages.filter((m) => !m.read_at);
  const openOrders = orders.filter((o) => o.status === 'pending' || o.status === 'in_progress');
  const openOrdersValue = openOrders.reduce((s, o) => s + o.estimated_price, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
        <StatCard
          label="Gewinn/Verlust"
          value={`${metrics.profitLoss >= 0 ? '+' : ''}${metrics.profitLoss.toFixed(2)} CHF`}
          sub="kumuliert, seit Start - Details in Finanzen"
        />
        <StatCard label="Nutzer" value={String(metrics.userCount)} sub={`${metrics.blockedCount} blockiert · ${metrics.activeTrialCount} im Testabo`} />
        <StatCard label="Offene Zahlungen" value={`${metrics.openPaymentsTotal.toFixed(2)} CHF`} sub={`${metrics.openPaymentsCount} Anfragen`} />
        <StatCard label="Bezahlt diesen Monat" value={`${metrics.paidThisMonthTotal.toFixed(2)} CHF`} />
        <StatCard label="Offene Auftraege" value={String(openOrders.length)} sub={`${openOrdersValue.toFixed(2)} CHF Volumen`} />
        <StatCard label="Fixkosten / Monat" value={`${metrics.monthlyCosts.toFixed(2)} CHF`} />
        <StatCard label="Einmalige Kosten" value={`${metrics.oneTimeCosts.toFixed(2)} CHF`} />
      </div>

      <div>
        <SectionHeading text="Ungelesene Nachrichten" count={unreadMessages.length} />
        {unreadMessages.length === 0 ? (
          <p style={{ fontSize: 13, opacity: 0.55, margin: 0 }}>Keine ungelesenen Nachrichten.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {unreadMessages.map((m) => (
              <MessageCard key={m.id} message={m} busy={busyMessageId === m.id} onMarkRead={() => markMessageRead(m)} />
            ))}
          </div>
        )}
      </div>

      <div>
        <SectionHeading text="Offene Auftraege" count={openOrders.length} />
        {openOrders.length === 0 ? (
          <p style={{ fontSize: 13, opacity: 0.55, margin: 0 }}>Keine offenen Auftraege.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {openOrders.map((o) => (
              <OrderCard key={o.id} order={o} busy={busyOrderId === o.id} onUpdateStatus={(status) => updateOrderStatus(o, status)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
