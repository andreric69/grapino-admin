import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/apiClient';
import { colors } from '../theme';
import { LoadingSpinner } from '../components/LoadingSpinner';

type Recurrence = 'einmalig' | 'monatlich';

interface CostRow {
  id: string;
  created_at: string;
  label: string;
  amount: number;
  note: string | null;
  recurrence: Recurrence;
}

export function CostsPage() {
  const [costs, setCosts] = useState<CostRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [recurrence, setRecurrence] = useState<Recurrence>('einmalig');
  const [sending, setSending] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [editId, setEditId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editRecurrence, setEditRecurrence] = useState<Recurrence>('einmalig');

  async function load() {
    setError(null);
    const res = await apiFetch('/api/reports?resource=costs');
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
      const res = await apiFetch('/api/reports?resource=costs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, amount: parsedAmount, note, recurrence }),
      });
      if (!res.ok) throw new Error();
      setLabel('');
      setAmount('');
      setNote('');
      setRecurrence('einmalig');
      await load();
    } catch {
      setError('Eintrag konnte nicht gespeichert werden.');
    } finally {
      setSending(false);
    }
  }

  function startEdit(c: CostRow) {
    setEditId(c.id);
    setEditLabel(c.label);
    setEditAmount(String(c.amount));
    setEditNote(c.note ?? '');
    setEditRecurrence(c.recurrence);
  }

  async function handleSaveEdit() {
    if (!editId) return;
    const parsedAmount = parseFloat(editAmount.replace(',', '.'));
    if (!editLabel.trim() || Number.isNaN(parsedAmount)) return;
    setBusyId(editId);
    setError(null);
    try {
      const res = await apiFetch('/api/reports?resource=costs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editId, label: editLabel, amount: parsedAmount, note: editNote, recurrence: editRecurrence }),
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

  async function handleDelete(c: CostRow) {
    if (!window.confirm(`Eintrag "${c.label}" loeschen?`)) return;
    setBusyId(c.id);
    try {
      const res = await apiFetch('/api/reports?resource=costs', {
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

  const monthlyTotal = costs?.filter((c) => c.recurrence === 'monatlich').reduce((sum, c) => sum + c.amount, 0) ?? 0;
  const oneTimeTotal = costs?.filter((c) => c.recurrence === 'einmalig').reduce((sum, c) => sum + c.amount, 0) ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ border: `1px solid ${colors.border}`, borderRadius: 6, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
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
          <select value={recurrence} onChange={(e) => setRecurrence(e.target.value as Recurrence)} style={{ padding: '6px 8px', fontSize: 14 }}>
            <option value="einmalig">Einmalig</option>
            <option value="monatlich">Monatlich</option>
          </select>
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
      {!costs && <LoadingSpinner label="Wird geladen ..." />}

      {costs && (
        <div>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>
            Monatlich: {monthlyTotal.toFixed(2)} · Einmalig: {oneTimeTotal.toFixed(2)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {costs.map((c) =>
              editId === c.id ? (
                <div key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 0', borderBottom: '1px solid #eee' }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} style={{ flex: 2, padding: '6px 8px', fontSize: 14 }} />
                    <input value={editAmount} onChange={(e) => setEditAmount(e.target.value)} style={{ flex: 1, padding: '6px 8px', fontSize: 14 }} />
                    <select value={editRecurrence} onChange={(e) => setEditRecurrence(e.target.value as Recurrence)} style={{ padding: '6px 8px', fontSize: 14 }}>
                      <option value="einmalig">Einmalig</option>
                      <option value="monatlich">Monatlich</option>
                    </select>
                  </div>
                  <input value={editNote} onChange={(e) => setEditNote(e.target.value)} placeholder="Notiz" style={{ padding: '6px 8px', fontSize: 14 }} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" disabled={busyId === c.id} onClick={handleSaveEdit} style={{ cursor: 'pointer' }}>
                      Speichern
                    </button>
                    <button type="button" onClick={() => setEditId(null)} style={{ cursor: 'pointer' }}>
                      Abbrechen
                    </button>
                  </div>
                </div>
              ) : (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #eee', padding: '6px 0', fontSize: 14 }}>
                  <div>
                    <strong>{c.label}</strong>
                    <span style={{ opacity: 0.6 }}> · {c.recurrence === 'monatlich' ? 'monatlich' : 'einmalig'}</span>
                    {c.note && <span style={{ opacity: 0.6 }}> · {c.note}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span>{c.amount.toFixed(2)}</span>
                    <button type="button" onClick={() => startEdit(c)} style={{ cursor: 'pointer' }}>
                      Anpassen
                    </button>
                    <button
                      type="button"
                      disabled={busyId === c.id}
                      onClick={() => handleDelete(c)}
                      style={{ cursor: 'pointer', color: colors.danger }}
                    >
                      Loeschen
                    </button>
                  </div>
                </div>
              ),
            )}
          </div>
        </div>
      )}
    </div>
  );
}
