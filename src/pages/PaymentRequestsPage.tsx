import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../lib/apiClient';
import { cardStyle, colors, inputStyle, primaryBtnStyle, secondaryBtnStyle } from '../theme';
import { LoadingSpinner } from '../components/LoadingSpinner';

type StatusFilter = 'all' | PaymentRequest['status'];
type SortField = 'date' | 'amount';
type SortDir = 'asc' | 'desc';

// Gleicher Schwellenwert wie findOverduePayments in lib/userAttention.ts (dort
// fuer die "Nutzer im Blick"-Karte auf der Uebersichtsseite) - "ueberfaellig"
// soll auf beiden Seiten dasselbe bedeuten.
const OVERDUE_THRESHOLD_DAYS = 14;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysSinceCreated(createdAt: string, now: Date = new Date()): number {
  return Math.floor((now.getTime() - new Date(createdAt).getTime()) / MS_PER_DAY);
}

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Alle' },
  { value: 'open', label: 'Offen' },
  { value: 'paid', label: 'Bezahlt' },
  { value: 'cancelled', label: 'Storniert' },
];

function chipStyle(active: boolean) {
  return {
    ...secondaryBtnStyle,
    padding: '5px 11px',
    fontSize: 12.5,
    background: active ? colors.accent : 'transparent',
    color: active ? '#fff' : colors.text,
    borderColor: active ? colors.accent : colors.border,
  };
}

interface PaymentRequest {
  id: string;
  created_at: string;
  email: string | null;
  amount: number;
  reason: string;
  status: 'open' | 'paid' | 'cancelled';
  paid_at: string | null;
}

interface UserOption {
  id: string;
  email: string | null;
  customAccessFee: number | null;
}

export function PaymentRequestsPage() {
  const [requests, setRequests] = useState<PaymentRequest[] | null>(null);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [targetUserId, setTargetUserId] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [sending, setSending] = useState(false);
  const [globalAccessFee, setGlobalAccessFee] = useState<number | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  async function load() {
    setError(null);
    const [reqRes, usersRes, pricingRes] = await Promise.all([
      apiFetch('/api/commerce?resource=payments'),
      apiFetch('/api/users'),
      apiFetch('/api/commerce?resource=pricing'),
    ]);
    if (!reqRes.ok) {
      setError('Zahlungsanfragen konnten nicht geladen werden.');
      return;
    }
    const data = (await reqRes.json()) as { paymentRequests: PaymentRequest[] };
    setRequests(data.paymentRequests);
    if (usersRes.ok) {
      const usersData = (await usersRes.json()) as { users: UserOption[] };
      setUsers(usersData.users);
    }
    if (pricingRes.ok) {
      const pricingData = (await pricingRes.json()) as { pricing: { access_fee: number } };
      setGlobalAccessFee(pricingData.pricing.access_fee);
    }
  }

  function useAccessFeeReason() {
    const user = users.find((u) => u.id === targetUserId);
    const fee = user?.customAccessFee ?? globalAccessFee;
    setReason('Zugangsgebühr');
    if (fee !== null && fee !== undefined) setAmount(fee.toFixed(2));
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate() {
    const parsedAmount = parseFloat(amount.replace(',', '.'));
    if (!targetUserId || Number.isNaN(parsedAmount) || parsedAmount <= 0 || !reason.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await apiFetch('/api/commerce?resource=payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: targetUserId, amount: parsedAmount, reason }),
      });
      if (!res.ok) throw new Error();
      setAmount('');
      setReason('');
      await load();
    } catch {
      setError('Anfrage konnte nicht erstellt werden.');
    } finally {
      setSending(false);
    }
  }

  async function updateStatus(r: PaymentRequest, status: 'paid' | 'cancelled') {
    setBusyId(r.id);
    try {
      const res = await apiFetch('/api/commerce?resource=payments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: r.id, status }),
      });
      if (!res.ok) throw new Error();
      await load();
    } catch {
      setError('Aktion fehlgeschlagen.');
    } finally {
      setBusyId(null);
    }
  }

  const filteredRequests = useMemo(() => {
    if (!requests) return [];
    const q = search.trim().toLowerCase();
    const filtered = requests.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (!q) return true;
      return (r.email ?? '').toLowerCase().includes(q) || r.reason.toLowerCase().includes(q);
    });
    const sorted = [...filtered].sort((a, b) => {
      const diff =
        sortField === 'date'
          ? new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          : a.amount - b.amount;
      return sortDir === 'asc' ? diff : -diff;
    });
    return sorted;
  }, [requests, search, statusFilter, sortField, sortDir]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  }

  const visibleOpenIds = useMemo(
    () => filteredRequests.filter((r) => r.status === 'open').map((r) => r.id),
    [filteredRequests],
  );
  const allVisibleOpenSelected = visibleOpenIds.length > 0 && visibleOpenIds.every((id) => selectedIds.has(id));

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllVisibleOpen() {
    setSelectedIds((prev) => {
      if (allVisibleOpenSelected) {
        const next = new Set(prev);
        visibleOpenIds.forEach((id) => next.delete(id));
        return next;
      }
      return new Set([...prev, ...visibleOpenIds]);
    });
  }

  async function bulkMarkPaid() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setBulkBusy(true);
    setError(null);
    try {
      const results = await Promise.all(
        ids.map(async (id) => {
          try {
            const res = await apiFetch('/api/commerce?resource=payments', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id, status: 'paid' }),
            });
            return res.ok;
          } catch {
            return false;
          }
        }),
      );
      const failedCount = results.filter((ok) => !ok).length;
      await load();
      if (failedCount > 0) {
        setError(`${failedCount} von ${ids.length} Zahlungen konnten nicht als bezahlt markiert werden.`);
      }
    } finally {
      setSelectedIds(new Set());
      setBulkBusy(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <strong style={{ fontSize: 14 }}>Neue Zahlungsanfrage</strong>
        <div style={{ fontSize: 12, opacity: 0.6 }}>
          Rein informell - der Nutzer sieht das in der App, bezahlt aber ausserhalb (TWINT/Überweisung). Kein
          echtes Bezahlsystem.
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select value={targetUserId} onChange={(e) => setTargetUserId(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: 160 }}>
            <option value="">Nutzer wählen ...</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.email ?? u.id}
              </option>
            ))}
          </select>
          <input placeholder="Betrag CHF" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ ...inputStyle, width: 120 }} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input placeholder="Grund" value={reason} onChange={(e) => setReason(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
          <button type="button" disabled={!targetUserId} onClick={useAccessFeeReason} style={secondaryBtnStyle}>
            Zugangsgebühr
          </button>
        </div>
        <button
          type="button"
          disabled={sending || !targetUserId || !amount.trim() || !reason.trim()}
          onClick={handleCreate}
          style={{ ...primaryBtnStyle, alignSelf: 'flex-start' }}
        >
          {sending ? 'Wird gesendet ...' : 'Anfrage senden'}
        </button>
      </div>

      {error && <p style={{ color: colors.danger }}>{error}</p>}
      {!requests && <LoadingSpinner label="Wird geladen ..." />}

      {requests && (
        <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            placeholder="Suche nach E-Mail oder Grund ..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={inputStyle}
          />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setStatusFilter(f.value)}
                style={chipStyle(statusFilter === f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 12, opacity: 0.6 }}>Sortieren:</span>
            <button type="button" onClick={() => toggleSort('date')} style={chipStyle(sortField === 'date')}>
              Datum {sortField === 'date' ? (sortDir === 'desc' ? '(neueste zuerst)' : '(älteste zuerst)') : ''}
            </button>
            <button type="button" onClick={() => toggleSort('amount')} style={chipStyle(sortField === 'amount')}>
              Betrag {sortField === 'amount' ? (sortDir === 'desc' ? '(höchster zuerst)' : '(niedrigster zuerst)') : ''}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', borderTop: `1px solid ${colors.border}`, paddingTop: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
              <input
                type="checkbox"
                checked={allVisibleOpenSelected}
                disabled={visibleOpenIds.length === 0 || bulkBusy}
                onChange={toggleSelectAllVisibleOpen}
              />
              Alle sichtbaren offenen auswählen
            </label>
            <button
              type="button"
              disabled={selectedIds.size === 0 || bulkBusy}
              onClick={bulkMarkPaid}
              style={primaryBtnStyle}
            >
              {bulkBusy ? 'Wird markiert ...' : `Als bezahlt markieren (${selectedIds.size})`}
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {requests && filteredRequests.length === 0 && (
          <p style={{ fontSize: 13, opacity: 0.6 }}>Keine Zahlungsanfragen gefunden.</p>
        )}
        {filteredRequests.map((r) => {
          const daysOpen = r.status === 'open' ? daysSinceCreated(r.created_at) : 0;
          const isOverdue = r.status === 'open' && daysOpen > OVERDUE_THRESHOLD_DAYS;
          return (
          <div key={r.id} style={isOverdue ? { ...cardStyle, borderLeft: `3px solid ${colors.danger}` } : cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                {r.status === 'open' && (
                  <input
                    type="checkbox"
                    checked={selectedIds.has(r.id)}
                    disabled={bulkBusy}
                    onChange={() => toggleSelected(r.id)}
                  />
                )}
                <strong>{r.email ?? 'Unbekannt'}</strong>
              </div>
              <span style={{ fontSize: 12, opacity: 0.6 }}>{new Date(r.created_at).toLocaleString('de-CH')}</span>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>{r.amount.toFixed(2)} CHF</div>
            <div style={{ fontSize: 13 }}>{r.reason}</div>
            <div style={{ fontSize: 12, marginTop: 4, color: r.status === 'open' ? colors.accent : r.status === 'paid' ? colors.success : colors.textMuted }}>
              {r.status === 'open' && 'Offen'}
              {r.status === 'paid' && `Bezahlt${r.paid_at ? ' am ' + new Date(r.paid_at).toLocaleDateString('de-CH') : ''}`}
              {r.status === 'cancelled' && 'Storniert'}
            </div>
            {isOverdue && (
              <div style={{ fontSize: 12, marginTop: 2, color: colors.danger, fontWeight: 600 }}>
                Seit {daysOpen} Tagen überfällig
              </div>
            )}
            {r.status === 'open' && (
              <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                <button type="button" disabled={busyId === r.id || bulkBusy} onClick={() => updateStatus(r, 'paid')} style={secondaryBtnStyle}>
                  Als bezahlt markieren
                </button>
                <button type="button" disabled={busyId === r.id || bulkBusy} onClick={() => updateStatus(r, 'cancelled')} style={secondaryBtnStyle}>
                  Stornieren
                </button>
              </div>
            )}
          </div>
          );
        })}
      </div>
    </div>
  );
}
