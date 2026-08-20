import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/apiClient';

interface CostRow {
  id: string;
  created_at: string;
  label: string;
  amount: number;
  note: string | null;
}

export function CostsPage() {
  const [costs, setCosts] = useState<CostRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setError(null);
    const res = await apiFetch('/api/costs');
    if (!res.ok) {
      setError('Kosten konnten nicht geladen werden.');
      return;
    }
    const data = (await res.json()) as { costs: CostRow[] };
    setCosts(data.costs);
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
      const res = await apiFetch('/api/costs', {
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

  async function handleDelete(c: CostRow) {
    if (!window.confirm(`Eintrag "${c.label}" loeschen?`)) return;
    setBusyId(c.id);
    try {
      const res = await apiFetch('/api/costs', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: c.id }),
      });
      if (!res.ok) throw new Error();
      await load();
    } catch {
      setError('Loeschen fehlgeschlagen.');
    } finally {
      setBusyId(null);
    }
  }

  const total = costs?.reduce((sum, c) => sum + c.amount, 0) ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ border: '1px solid #ccc', borderRadius: 6, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <strong style={{ fontSize: 14 }}>Neuer Kosten-Eintrag</strong>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            placeholder="Bezeichnung (z.B. Domain)"
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

      {error && <p style={{ color: '#b3261e' }}>{error}</p>}
      {!costs && <p>Wird geladen ...</p>}

      {costs && (
        <div>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Summe: {total.toFixed(2)}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {costs.map((c) => (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #eee', padding: '6px 0', fontSize: 14 }}>
                <div>
                  <strong>{c.label}</strong>
                  {c.note && <span style={{ opacity: 0.6 }}> · {c.note}</span>}
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span>{c.amount.toFixed(2)}</span>
                  <button
                    type="button"
                    disabled={busyId === c.id}
                    onClick={() => handleDelete(c)}
                    style={{ cursor: 'pointer', color: '#b3261e' }}
                  >
                    Loeschen
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
