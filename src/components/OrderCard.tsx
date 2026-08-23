import { useState } from 'react';
import { cardStyle, colors, primaryBtnStyle, secondaryBtnStyle } from '../theme';

export interface Order {
  id: string;
  created_at: string;
  email: string | null;
  categoryLabel: string;
  wine_count: number;
  estimated_price: number;
  status: 'pending' | 'in_progress' | 'done' | 'cancelled';
  note: string | null;
  prompt: string;
}

const STATUS_LABELS: Record<Order['status'], string> = {
  pending: 'Wartet',
  in_progress: 'In Bearbeitung',
  done: 'Erledigt',
  cancelled: 'Storniert',
};

/** Eine Auftragskarte mit allen Aktionen - gemeinsam von OrdersPage und OverviewPage genutzt, damit ein Auftrag ueberall gleich aussieht/funktioniert. */
export function OrderCard({
  order,
  busy,
  onUpdateStatus,
}: {
  order: Order;
  busy: boolean;
  onUpdateStatus: (status: Order['status']) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copyPrompt() {
    await navigator.clipboard.writeText(order.prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <strong>{order.email ?? 'Unbekannt'}</strong>
        <span style={{ fontSize: 12, opacity: 0.6 }}>{new Date(order.created_at).toLocaleString('de-CH')}</span>
      </div>
      <div style={{ fontSize: 14, marginTop: 4 }}>
        {order.categoryLabel} · {order.wine_count} {order.wine_count === 1 ? 'Wein' : 'Weine'} ·{' '}
        <strong>{order.estimated_price.toFixed(2)} CHF</strong>
      </div>
      {order.note && <div style={{ fontSize: 13, opacity: 0.8, marginTop: 4 }}>Notiz: {order.note}</div>}
      <div style={{ fontSize: 12, marginTop: 4, color: order.status === 'pending' ? colors.accent : colors.textMuted }}>
        {STATUS_LABELS[order.status]}
      </div>

      <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setExpanded((v) => !v)} style={secondaryBtnStyle}>
          {expanded ? 'Prompt ausblenden' : 'Prompt anzeigen'}
        </button>
        <button type="button" onClick={copyPrompt} style={secondaryBtnStyle}>
          {copied ? 'Kopiert!' : 'Prompt kopieren'}
        </button>
        {order.status === 'pending' && (
          <button type="button" disabled={busy} onClick={() => onUpdateStatus('in_progress')} style={primaryBtnStyle}>
            Annehmen
          </button>
        )}
        {order.status === 'in_progress' && (
          <button type="button" disabled={busy} onClick={() => onUpdateStatus('done')} style={primaryBtnStyle}>
            Als erledigt markieren
          </button>
        )}
        {order.status !== 'done' && order.status !== 'cancelled' && (
          <button type="button" disabled={busy} onClick={() => onUpdateStatus('cancelled')} style={secondaryBtnStyle}>
            Stornieren
          </button>
        )}
      </div>

      {expanded && (
        <pre
          style={{
            marginTop: 10,
            padding: 10,
            background: colors.bg,
            border: `1px solid ${colors.border}`,
            borderRadius: 6,
            fontSize: 12,
            whiteSpace: 'pre-wrap',
            fontFamily: 'ui-monospace, monospace',
          }}
        >
          {order.prompt}
        </pre>
      )}
    </div>
  );
}
