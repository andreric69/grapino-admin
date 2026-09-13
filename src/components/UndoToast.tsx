import { colors, fontHeading } from '../theme';

interface UndoToastProps {
  message: string;
  onUndo: () => void;
  onDismiss: () => void;
}

// Kleiner Toast fuer "Eintrag geloescht, Rueckgaengig?" - gemeinsame Optik
// fuer Kosten- und Einnahmen-Seite (siehe useUndoDelete.ts).
export function UndoToast({ message, onUndo, onDismiss }: UndoToastProps) {
  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 24,
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 14px',
        borderRadius: 6,
        background: colors.text,
        color: '#fff',
        fontSize: 13.5,
        boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
        zIndex: 1000,
      }}
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={onUndo}
        style={{
          cursor: 'pointer',
          background: 'transparent',
          border: '1px solid rgba(255,255,255,0.5)',
          borderRadius: 4,
          color: '#fff',
          fontFamily: fontHeading,
          fontWeight: 600,
          fontSize: 13,
          padding: '4px 10px',
        }}
      >
        Rückgängig
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Schliessen"
        style={{
          cursor: 'pointer',
          background: 'transparent',
          border: 'none',
          color: 'rgba(255,255,255,0.7)',
          fontSize: 16,
          lineHeight: 1,
          padding: 0,
        }}
      >
        ×
      </button>
    </div>
  );
}
