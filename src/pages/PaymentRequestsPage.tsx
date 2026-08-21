import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/apiClient';
import { cardStyle, colors, inputStyle, primaryBtnStyle, secondaryBtnStyle } from '../theme';

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

  async function load() {
    setError(null);
    const [reqRes, usersRes] = await Promise.all([apiFetch('/api/payment-requests'), apiFetch('/api/users')]);
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
      const res = await apiFetch('/api/payment-requests', {
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
      const res = await apiFetch('/api/payment-requests', {
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <strong style={{ fontSize: 14 }}>Neue Zahlungsanfrage</strong>
        <div style={{ fontSize: 12, opacity: 0.6 }}>
          Rein informell - der Nutzer sieht das in der App, bezahlt aber ausserhalb (TWINT/Ueberweisung). Kein
          echtes Bezahlsystem.
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select value={targetUserId} onChange={(e) => setTargetUserId(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: 160 }}>
            <option value="">Nutzer waehlen ...</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.email ?? u.id}
              </option>
            ))}
          </select>
          <input placeholder="Betrag CHF" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ ...inputStyle, width: 120 }} />
        </div>
        <input placeholder="Grund" value={reason} onChange={(e) => setReason(e.target.value)} style={inputStyle} />
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
      {!requests && <p>Wird geladen ...</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {requests?.map((r) => (
          <div key={r.id} style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <strong>{r.email ?? 'Unbekannt'}</strong>
              <span style={{ fontSize: 12, opacity: 0.6 }}>{new Date(r.created_at).toLocaleString('de-CH')}</span>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>{r.amount.toFixed(2)} CHF</div>
            <div style={{ fontSize: 13 }}>{r.reason}</div>
            <div style={{ fontSize: 12, marginTop: 4, color: r.status === 'open' ? colors.accent : r.status === 'paid' ? colors.success : colors.textMuted }}>
              {r.status === 'open' && 'Offen'}
              {r.status === 'paid' && `Bezahlt${r.paid_at ? ' am ' + new Date(r.paid_at).toLocaleDateString('de-CH') : ''}`}
              {r.status === 'cancelled' && 'Storniert'}
            </div>
            {r.status === 'open' && (
              <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                <button type="button" disabled={busyId === r.id} onClick={() => updateStatus(r, 'paid')} style={secondaryBtnStyle}>
                  Als bezahlt markieren
                </button>
                <button type="button" disabled={busyId === r.id} onClick={() => updateStatus(r, 'cancelled')} style={secondaryBtnStyle}>
                  Stornieren
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
