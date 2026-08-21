import { colors } from '../theme';

export function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '40px 20px', color: colors.textMuted }}>
      <div style={{ fontSize: 28, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 13.5 }}>{text}</div>
    </div>
  );
}
