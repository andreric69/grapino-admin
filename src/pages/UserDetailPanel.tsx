import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/apiClient';
import { colors, inputStyle, secondaryBtnStyle } from '../theme';

interface UserDetail {
  profile: {
    id: string;
    email: string | null;
    displayName: string | null;
    createdAt: string;
    lastSignInAt: string | null;
    bannedUntil: string | null;
  };
  wineStats: { total: number; active: number; totalValue: number; withPrice: number };
  announcements: { id: string; created_at: string; title: string; type: string; target_user_id: string | null; seenAt: string | null }[];
  feedback: { id: string; created_at: string; rating: number }[];
  deletionRequests: { id: string; created_at: string; status: string }[];
  paymentRequests: { id: string; created_at: string; amount: number; reason: string; status: string }[];
  orders: { id: string; created_at: string; category: string; wine_count: number; estimated_price: number; status: string }[];
  notes: { id: string; created_at: string; note: string }[];
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('de-CH', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function UserDetailPanel({ userId }: { userId: string }) {
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  async function load() {
    setError(null);
    const res = await apiFetch(`/api/users?userId=${encodeURIComponent(userId)}`);
    if (!res.ok) {
      setError('Details konnten nicht geladen werden.');
      return;
    }
    setDetail((await res.json()) as UserDetail);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function addNote() {
    if (!noteText.trim()) return;
    setSavingNote(true);
    try {
      const res = await apiFetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'addNote', userId, note: noteText.trim() }),
      });
      if (!res.ok) throw new Error();
      setNoteText('');
      await load();
    } catch {
      setError('Notiz konnte nicht gespeichert werden.');
    } finally {
      setSavingNote(false);
    }
  }

  if (error) return <span style={{ color: colors.danger }}>{error}</span>;
  if (!detail) return <span>Wird geladen ...</span>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, fontSize: 13 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        <div>
          <div style={{ opacity: 0.55, fontSize: 11 }}>Registriert</div>
          <div>{formatDateTime(detail.profile.createdAt)}</div>
        </div>
        <div>
          <div style={{ opacity: 0.55, fontSize: 11 }}>Letzter Login</div>
          <div>{formatDateTime(detail.profile.lastSignInAt)}</div>
        </div>
        <div>
          <div style={{ opacity: 0.55, fontSize: 11 }}>Weine (aktiv / gesamt)</div>
          <div>
            {detail.wineStats.active} / {detail.wineStats.total}
          </div>
        </div>
        <div>
          <div style={{ opacity: 0.55, fontSize: 11 }}>Wert (mit Preis: {detail.wineStats.withPrice})</div>
          <div>{detail.wineStats.totalValue.toFixed(2)}</div>
        </div>
      </div>

      <div>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Ankuendigungen an diesen Nutzer</div>
        {detail.announcements.length === 0 && <div style={{ opacity: 0.55 }}>Keine.</div>}
        {detail.announcements.map((a) => (
          <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
            <span>{a.title}</span>
            <span style={{ opacity: 0.6 }}>{a.seenAt ? `gesehen ${formatDateTime(a.seenAt)}` : 'ungesehen'}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Feedback ({detail.feedback.length})</div>
          {detail.feedback.slice(0, 5).map((f) => (
            <div key={f.id}>
              {'★'.repeat(f.rating)} - {formatDateTime(f.created_at)}
            </div>
          ))}
        </div>
        <div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Loeschanfragen ({detail.deletionRequests.length})</div>
          {detail.deletionRequests.map((d) => (
            <div key={d.id}>
              {d.status} - {formatDateTime(d.created_at)}
            </div>
          ))}
        </div>
        <div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Zahlungsanfragen ({detail.paymentRequests.length})</div>
          {detail.paymentRequests.map((p) => (
            <div key={p.id}>
              {p.amount.toFixed(2)} CHF - {p.reason} ({p.status})
            </div>
          ))}
        </div>
        <div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Auftraege ({detail.orders.length})</div>
          {detail.orders.map((o) => (
            <div key={o.id}>
              {o.category} - {o.wine_count} Weine ({o.status})
            </div>
          ))}
        </div>
      </div>

      <div>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Admin-Notizen (nur intern)</div>
        {detail.notes.map((n) => (
          <div key={n.id} style={{ padding: '4px 0', borderBottom: `1px solid ${colors.border}` }}>
            <div style={{ opacity: 0.55, fontSize: 11 }}>{formatDateTime(n.created_at)}</div>
            <div>{n.note}</div>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <input
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Notiz hinzufuegen ..."
            style={{ ...inputStyle, flex: 1 }}
          />
          <button type="button" disabled={savingNote || !noteText.trim()} onClick={addNote} style={secondaryBtnStyle}>
            Speichern
          </button>
        </div>
      </div>
    </div>
  );
}
