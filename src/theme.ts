// Kleine, gemeinsame Stil-Konstanten fuer einen einheitlicheren Look - kein
// Redesign-Meisterwerk, nur konsistente Akzentfarbe/Radien statt Inline-Grau
// ueberall einzeln.
import type { CSSProperties } from 'react';

export const colors = {
  accent: '#7c2d3a', // Bordeaux, wie in der Haupt-Weinapp
  accentSoft: 'rgba(124, 45, 58, 0.08)',
  accentSoftBorder: 'rgba(124, 45, 58, 0.25)',
  border: '#e2ddd8',
  bg: '#faf8f6',
  surface: '#ffffff',
  text: '#2b2624',
  textMuted: '#7a726c',
  danger: '#b3261e',
  success: '#1e7d32',
};

export const cardStyle: CSSProperties = {
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  padding: 14,
  background: colors.surface,
};

export const inputStyle: CSSProperties = {
  padding: '7px 9px',
  fontSize: 14,
  border: `1px solid ${colors.border}`,
  borderRadius: 6,
  fontFamily: 'inherit',
};

export const primaryBtnStyle: CSSProperties = {
  cursor: 'pointer',
  padding: '7px 14px',
  fontSize: 13.5,
  border: 'none',
  borderRadius: 6,
  background: colors.accent,
  color: '#fff',
  fontWeight: 600,
};

export const secondaryBtnStyle: CSSProperties = {
  cursor: 'pointer',
  padding: '7px 14px',
  fontSize: 13.5,
  border: `1px solid ${colors.border}`,
  borderRadius: 6,
  background: colors.surface,
  color: colors.text,
};
