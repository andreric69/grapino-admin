import { cardStyle, colors, secondaryBtnStyle } from '../theme';

export interface UserMessage {
  id: string;
  created_at: string;
  email: string | null;
  category: 'allgemein' | 'vorschlag';
  message: string;
  read_at: string | null;
}

const CATEGORY_LABELS: Record<UserMessage['category'], string> = {
  allgemein: 'Allgemein',
  vorschlag: 'Änderungsvorschlag',
};

/** Eine Nachrichtenkarte - gemeinsam von MessagesPage und OverviewPage genutzt. */
export function MessageCard({
  message,
  busy,
  onMarkRead,
}: {
  message: UserMessage;
  busy: boolean;
  onMarkRead: () => void;
}) {
  return (
    <div style={{ ...cardStyle, opacity: message.read_at ? 0.65 : 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 13 }}>
        <strong>{message.email ?? 'Unbekannt'}</strong>
        <span style={{ opacity: 0.6 }}>{new Date(message.created_at).toLocaleString('de-CH')}</span>
      </div>
      <div style={{ fontSize: 11.5, color: colors.accent, marginTop: 2 }}>{CATEGORY_LABELS[message.category]}</div>
      <div style={{ fontSize: 14, marginTop: 6, whiteSpace: 'pre-wrap' }}>{message.message}</div>
      {!message.read_at && (
        <button type="button" disabled={busy} onClick={onMarkRead} style={{ ...secondaryBtnStyle, marginTop: 10 }}>
          Als gelesen markieren
        </button>
      )}
    </div>
  );
}
