import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { apiFetch } from '../lib/apiClient';
import { cardStyle, colors, fontHeading, kickerStyle } from '../theme';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { OrderCard, type Order } from '../components/OrderCard';
import { MessageCard, type UserMessage } from '../components/MessageCard';
import { fetchFinancialSummary } from '../lib/financials';

/* Gleiche schlichte Linien-Icons wie auf der Statistik-Seite der Weinapp -
   damit sich Kennzahlen-Kacheln in beiden Apps wiedererkennbar anfühlen. */
function iconProps(size: number) {
  return { width: size, height: size, viewBox: '0 0 24 24', fill: 'none' as const, stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
}
function TrendIcon({ size = 18 }: { size?: number }) {
  return (
    <svg {...iconProps(size)}>
      <path d="M3 16l6-6 4 4 8-9" />
      <path d="M15 5h6v6" />
    </svg>
  );
}
function UsersIcon({ size = 18 }: { size?: number }) {
  return (
    <svg {...iconProps(size)}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20c0-3.3 2.5-5.5 5.5-5.5s5.5 2.2 5.5 5.5" />
      <path d="M16 8.3a3 3 0 010 5.9M19.5 20c0-2.8-1.8-4.8-4-5.3" />
    </svg>
  );
}
function TagIcon({ size = 18 }: { size?: number }) {
  return (
    <svg {...iconProps(size)}>
      <path d="M20 12.6L11.4 21 3 12.6V4h8.6L20 12.6z" />
      <circle cx="7.5" cy="7.5" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}
function CheckIcon({ size = 18 }: { size?: number }) {
  return (
    <svg {...iconProps(size)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.3l2.6 2.6L16 9.5" />
    </svg>
  );
}
function BoxIcon({ size = 18 }: { size?: number }) {
  return (
    <svg {...iconProps(size)}>
      <path d="M3.5 7.5L12 3l8.5 4.5L12 12 3.5 7.5z" />
      <path d="M3.5 7.5V16l8.5 4.5V12M20.5 7.5V16L12 20.5" />
    </svg>
  );
}
function CalendarIcon({ size = 18 }: { size?: number }) {
  return (
    <svg {...iconProps(size)}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  );
}
function ReceiptIcon({ size = 18 }: { size?: number }) {
  return (
    <svg {...iconProps(size)}>
      <path d="M6 3h12v18l-2.5-1.6L13 21l-2.5-1.6L8 21l-2-1.6V3z" />
      <path d="M9 8h6M9 12h6" />
    </svg>
  );
}

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

function StatCard({ icon, label, value, sub, accent }: { icon: ReactNode; label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: accent ? colors.accent : colors.gold, opacity: 0.8, display: 'flex' }}>{icon}</span>
        <div style={kickerStyle}>{label}</div>
      </div>
      <div style={{ fontFamily: fontHeading, fontWeight: 600, fontSize: 24, color: accent ? colors.accent : colors.text }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, opacity: 0.6 }}>{sub}</div>}
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
          icon={<TrendIcon />}
          label="Gewinn/Verlust"
          value={`${metrics.profitLoss >= 0 ? '+' : ''}${metrics.profitLoss.toFixed(2)} CHF`}
          sub="kumuliert, seit Start - Details in Finanzen"
          accent={metrics.profitLoss < 0}
        />
        <StatCard icon={<UsersIcon />} label="Nutzer" value={String(metrics.userCount)} sub={`${metrics.blockedCount} blockiert · ${metrics.activeTrialCount} im Testabo`} />
        <StatCard icon={<TagIcon />} label="Offene Zahlungen" value={`${metrics.openPaymentsTotal.toFixed(2)} CHF`} sub={`${metrics.openPaymentsCount} Anfragen`} />
        <StatCard icon={<CheckIcon />} label="Bezahlt diesen Monat" value={`${metrics.paidThisMonthTotal.toFixed(2)} CHF`} />
        <StatCard icon={<BoxIcon />} label="Offene Aufträge" value={String(openOrders.length)} sub={`${openOrdersValue.toFixed(2)} CHF Volumen`} />
        <StatCard icon={<CalendarIcon />} label="Fixkosten / Monat" value={`${metrics.monthlyCosts.toFixed(2)} CHF`} />
        <StatCard icon={<ReceiptIcon />} label="Einmalige Kosten" value={`${metrics.oneTimeCosts.toFixed(2)} CHF`} />
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
        <SectionHeading text="Offene Aufträge" count={openOrders.length} />
        {openOrders.length === 0 ? (
          <p style={{ fontSize: 13, opacity: 0.55, margin: 0 }}>Keine offenen Aufträge.</p>
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
