import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/apiClient';
import { colors } from '../theme';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { UndoToast } from '../components/UndoToast';
import { useUndoDelete } from '../hooks/useUndoDelete';

type Recurrence = 'einmalig' | 'monatlich';

interface CostRow {
  id: string;
  created_at: string;
  label: string;
  amount: number;
  note: string | null;
  recurrence: Recurrence;
  ends_at: string | null;
}

// "YYYY-MM-DDTHH:mm:ss..." -> "MM.YYYY", fuer die Kurzanzeige von Start-/
// Endmonat bei laufenden Kosten.
function formatMonthDe(iso: string): string {
  const [year, month] = iso.slice(0, 7).split('-');
  return `${month}.${year}`;
}

// <input type="date"> braucht "YYYY-MM-DD", das Backend liefert/erwartet
// einen vollen ISO-Zeitstempel.
function isoToDateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '';
}

// Ein Enddatum in der Zukunft heisst "laeuft noch, endet spaeter" - erst ab
// dem Monat NACH dem Endmonat ist der Eintrag wirklich beendet (spiegelt die
// inklusive "<=" Grenze aus isCostActiveInMonth() im Backend).
function isEndedCost(endsAt: string): boolean {
  return endsAt.slice(0, 7) < new Date().toISOString().slice(0, 7);
}

export function CostsPage() {
  const [costs, setCosts] = useState<CostRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [recurrence, setRecurrence] = useState<Recurrence>('einmalig');
  const [endsAt, setEndsAt] = useState('');
  const [sending, setSending] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [editId, setEditId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editRecurrence, setEditRecurrence] = useState<Recurrence>('einmalig');
  const [editEndsAt, setEditEndsAt] = useState('');

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
        body: JSON.stringify({
          label,
          amount: parsedAmount,
          note,
          recurrence,
          ends_at: recurrence === 'monatlich' && endsAt ? new Date(endsAt).toISOString() : null,
        }),
      });
      if (!res.ok) throw new Error();
      setLabel('');
      setAmount('');
      setNote('');
      setRecurrence('einmalig');
      setEndsAt('');
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
    setEditEndsAt(isoToDateInput(c.ends_at));
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
        body: JSON.stringify({
          id: editId,
          label: editLabel,
          amount: parsedAmount,
          note: editNote,
          recurrence: editRecurrence,
          ends_at: editRecurrence === 'monatlich' && editEndsAt ? new Date(editEndsAt).toISOString() : null,
        }),
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

  const { isHidden, toast, scheduleDelete, undo, dismissToast } = useUndoDelete<CostRow>(async (c) => {
    try {
      const res = await apiFetch('/api/reports?resource=costs', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: c.id }),
      });
      if (!res.ok) throw new Error();
      await load();
    } catch {
      setError('Löschen fehlgeschlagen.');
    }
  });

  function handleDelete(c: CostRow) {
    scheduleDelete(c.id, c.label, c);
  }

  const visibleCosts = costs?.filter((c) => !isHidden(c.id)) ?? [];
  const monthlyTotal = visibleCosts.filter((c) => c.recurrence === 'monatlich').reduce((sum, c) => sum + c.amount, 0);
  const oneTimeTotal = visibleCosts.filter((c) => c.recurrence === 'einmalig').reduce((sum, c) => sum + c.amount, 0);

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
          <select
            value={recurrence}
            onChange={(e) => {
              const next = e.target.value as Recurrence;
              setRecurrence(next);
              if (next === 'einmalig') setEndsAt('');
            }}
            style={{ padding: '6px 8px', fontSize: 14 }}
          >
            <option value="einmalig">Einmalig</option>
            <option value="monatlich">Monatlich</option>
          </select>
        </div>
        {recurrence === 'monatlich' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: colors.textMuted }}>
            Endet am (optional, leer = läuft weiter)
            <input
              type="date"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              style={{ padding: '6px 8px', fontSize: 14 }}
            />
          </label>
        )}
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
          {sending ? 'Wird gespeichert ...' : 'Hinzufügen'}
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
            {visibleCosts.map((c) =>
              editId === c.id ? (
                <div key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 0', borderBottom: '1px solid #eee' }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} style={{ flex: 2, padding: '6px 8px', fontSize: 14 }} />
                    <input value={editAmount} onChange={(e) => setEditAmount(e.target.value)} style={{ flex: 1, padding: '6px 8px', fontSize: 14 }} />
                    <select
                      value={editRecurrence}
                      onChange={(e) => {
                        const next = e.target.value as Recurrence;
                        setEditRecurrence(next);
                        if (next === 'einmalig') setEditEndsAt('');
                      }}
                      style={{ padding: '6px 8px', fontSize: 14 }}
                    >
                      <option value="einmalig">Einmalig</option>
                      <option value="monatlich">Monatlich</option>
                    </select>
                  </div>
                  {editRecurrence === 'monatlich' && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: colors.textMuted }}>
                      Endet am (optional, leer = läuft weiter)
                      <input
                        type="date"
                        value={editEndsAt}
                        onChange={(e) => setEditEndsAt(e.target.value)}
                        style={{ padding: '6px 8px', fontSize: 14 }}
                      />
                    </label>
                  )}
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
                    {c.recurrence === 'monatlich' ? (
                      <span
                        style={{
                          marginLeft: 8,
                          fontSize: 12,
                          fontWeight: 600,
                          color: c.ends_at && isEndedCost(c.ends_at) ? colors.textMuted : colors.success,
                        }}
                      >
                        {c.ends_at
                          ? `${formatMonthDe(c.created_at)} – ${formatMonthDe(c.ends_at)}`
                          : `seit ${formatMonthDe(c.created_at)}, laufend`}
                      </span>
                    ) : (
                      <span style={{ opacity: 0.6 }}> · einmalig</span>
                    )}
                    {c.note && <span style={{ opacity: 0.6 }}> · {c.note}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span>{c.amount.toFixed(2)}</span>
                    <button type="button" onClick={() => startEdit(c)} style={{ cursor: 'pointer' }}>
                      Anpassen
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(c)}
                      style={{ cursor: 'pointer', color: colors.danger }}
                    >
                      Löschen
                    </button>
                  </div>
                </div>
              ),
            )}
          </div>
        </div>
      )}

      {toast && (
        <UndoToast
          message={`"${toast.label}" gelöscht. Rückgängig?`}
          onUndo={() => undo(toast.id)}
          onDismiss={() => dismissToast(toast.id)}
        />
      )}
    </div>
  );
}
