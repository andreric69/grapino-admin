import { colors } from '../theme';

// Gleiches Muster wie in der Haupt-Weinapp (src/components/LoadingSpinner.tsx),
// damit "die App tut gerade etwas" ueberall gleich aussieht statt als reiner Text.
export function LoadingSpinner({ label }: { label?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: 24 }}>
      <div
        style={{
          width: 24,
          height: 24,
          borderRadius: '50%',
          border: `2.5px solid ${colors.border}`,
          borderTopColor: colors.gold,
          animation: 'grapino-admin-spin 0.8s linear infinite',
        }}
      />
      {label && <div style={{ fontSize: 13, color: colors.textMuted }}>{label}</div>}
      <style>{`@keyframes grapino-admin-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
