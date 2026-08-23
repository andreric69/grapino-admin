import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/apiClient';
import { colors } from '../theme';
import { LoadingSpinner } from '../components/LoadingSpinner';

interface IncomeRow {
  id: string;
  created_at: string;
  label: string;
  amount: number;
  note: string | null;
}

/**
 * Manuelle Einnahmen ausserhalb der automatisch erfassten payment_requests
 * (z.B. Bar- oder Twint-Zahlung direkt erhalten, ohne Zahlungsanfrage in der
 * App). Bezahlte Zahlungsanfragen selbst erscheinen automatisch in der
 * Gewinn/Verlust-Uebersicht - hier nur, was sonst gar nicht erfasst waere.
 */
export function IncomePage() {
  const [income, setIncome] = useState<IncomeRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [editId, setEditId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editNote, setEditNote] = useState('');

  async function load() {
    setError(null);
    const res = await apiFetch('/api/reports?resource=income');
    if (!res.ok) {
      setError('Einnahmen konnten nicht geladen werden.');
      return;
    }
    const data = (await res.json()) as { income: IncomeRow[] };
    setIncome(data.income);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd() {
    const parsedAmount = parseFloat(amount.replace(',', '.'));
    if (!label.trim() || Number.isNaN(parsedAmount)) return;
    setSending(true);
    setError(null);
    try {
      const res = await apiFetch('/api/reports?resource=income', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, amount: parsedAmount, note }),
      });
      if (!res.ok) throw new Error();
      setLabel('');
      setAmount('');
      setNote('');
      await load();
    } catch {
      setError('Eintrag konnte nicht gespeichert werden.');
    } finally {
      setSending(false);
    }
  }

  function startEdit(i: IncomeRow) {
    setEditId(i.id);
    setEditLabel(i.label);
    setEditAmount(String(i.amount));
    setEditNote(i.note ?? '');
  }

  async function handleSaveEdit() {
    if (!editId) return;
    const parsedAmount = parseFloat(editAmount.replace(',', '.'));
    if (!editLabel.trim() || Number.isNaN(parsedAmount)) return;
    setBusyId(editId);
    setError(null);
    try {
      const res = await apiFetch('/api/reports?resource=income', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editId, label: editLabel, amount: parsedAmount, note: editNote }),
      });
      if (!res.ok) throw new Error();
      setEditId(null);
      await load();
    } catch {
      setError('Eintrag konnte nicht gespeichert werden.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(i: IncomeRow) {
    if (!window.confirm(`Eintrag "${i.label}" loeschen?`)) return;
    setBusyId(i.id);
    try {
      const res = await apiFetch('/api/reports?resource=income', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: i.id }),
      });
      if (!res.ok) throw new Error();
      await load();
    } catch {
      setError('Loeschen fehlgeschlagen.');
    } finally {
      setBusyId(null);
    }
  }

  const total = income?.reduce((sum, i) => sum + i.amount, 0) ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <p style={{ fontSize: 12, opacity: 0.6, margin: 0 }}>
        Nur fuer Einnahmen ausserhalb der App-Zahlungsanfragen (z.B. Bar oder Twint direkt erhalten). Bezahlte
        Zahlungsanfragen (Zugangsgebuehren, Auftraege) zaehlen automatisch zur Gewinn/Verlust-Uebersicht dazu, ohne
        hier eingetragen werden zu muessen.
      </p>
      <div style={{ border: `1px solid ${colors.border}`, borderRadius: 6, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <strong style={{ fontSize: 14 }}>Neuer Einnahmen-Eintrag</strong>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            placeholder="Bezeichnung (z.B. Bar-Zahlung Thomas)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            style={{ flex: 2, padding: '6px 8px', fontSize: 14 }}
          />
          <input
            placeholder="Betrag"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={{ flex: 1, padding: '6px 8px', fontSize: 14 }}
          />
        </div>
        <input
          placeholder="Notiz (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          style={{ padding: '6px 8px', fontSize: 14 }}
        />
        <button
          type="button"
          disabled={sending || !label.trim() || !amount.trim()}
          onClick={handleAdd}
          style={{ cursor: 'pointer', alignSelf: 'flex-start' }}
        >
          {sending ? 'Wird gespeichert ...' : 'Hinzufuegen'}
        </button>
      </div>

      {error && <p style={{ color: colors.danger }}>{error}</p>}
      {!income && <LoadingSpinner label="Wird geladen ..." />}

      {income && (
        <div>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Manuell erfasst: {total.toFixed(2)} CHF</div>
          {income.length === 0 ? (
            <p style={{ fontSize: 13, opacity: 0.55, margin: 0 }}>Noch keine manuellen Einnahmen erfasst.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {income.map((i) =>
                editId === i.id ? (
                  <div key={i.id} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 0', borderBottom: '1px solid #eee' }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} style={{ flex: 2, padding: '6px 8px', fontSize: 14 }} />
                      <input value={editAmount} onChange={(e) => setEditAmount(e.target.value)} style={{ flex: 1, padding: '6px 8px', fontSize: 14 }} />
                    </div>
                    <input value={editNote} onChange={(e) => setEditNote(e.target.value)} placeholder="Notiz" style={{ padding: '6px 8px', fontSize: 14 }} />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" disabled={busyId === i.id} onClick={handleSaveEdit} style={{ cursor: 'pointer' }}>
                        Speichern
                      </button>
                      <button type="button" onClick={() => setEditId(null)} style={{ cursor: 'pointer' }}>
                        Abbrechen
                      </button>
                    </div>
                  </div>
                ) : (
                  <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #eee', padding: '6px 0', fontSize: 14 }}>
                    <div>
                      <strong>{i.label}</strong>
                      {i.note && <span style={{ opacity: 0.6 }}> · {i.note}</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <span>{i.amount.toFixed(2)}</span>
                      <button type="button" onClick={() => startEdit(i)} style={{ cursor: 'pointer' }}>
                        Anpassen
                      </button>
                      <button
                        type="button"
                        disabled={busyId === i.id}
                        onClick={() => handleDelete(i)}
                        style={{ cursor: 'pointer', color: colors.danger }}
                      >
                        Loeschen
                      </button>
                    </div>
                  </div>
                ),
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
