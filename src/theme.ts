// Kleine, gemeinsame Stil-Konstanten - an die Farb-/Schrift-Tokens der
// Haupt-Weinapp angeglichen (tokens.css dort), damit beide Apps erkennbar
// zum selben Produkt gehoeren. Kein Redesign, nur Angleichung.
import type { CSSProperties } from 'react';

export const colors = {
  accent: '#7c2d3a', // Bordeaux - Haupt-Akzent, wie --color-bordeaux in der Weinapp
  accentSoft: 'rgba(124, 45, 58, 0.08)',
  accentSoftBorder: 'rgba(124, 45, 58, 0.25)',
  gold: '#b68235', // zweiter Akzent, wie --color-accent in der Weinapp (Kicker/Labels)
  border: 'color-mix(in srgb, #201f1d 16%, transparent)', // wie --color-divider
  bg: '#f3f2f2', // wie --color-bg
  surface: '#eae9e9', // wie --color-surface
  text: '#201f1d', // wie --color-text
  textMuted: 'color-mix(in srgb, #201f1d 55%, transparent)',
  danger: '#b3261e',
  success: '#1e7d32',
};

export const fontHeading = "'Cormorant Garamond', system-ui, sans-serif";
export const fontBody = "'Lora', system-ui, sans-serif";

export const cardStyle: CSSProperties = {
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  padding: 14,
  background: colors.surface,
  boxShadow: '0 1px 2px rgba(32, 31, 29, 0.05)',
};

export const kickerStyle: CSSProperties = {
  fontSize: 10,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: colors.gold,
};

// Fuer Gruppen-Ueberschriften in der Seitenleiste (siehe DashboardPage.tsx) -
// dieselbe Kicker-Optik wie kickerStyle, nur etwas gedaempfter, da sie nicht
// wie ein Label ueber echtem Inhalt steht, sondern rein strukturell trennt.
export const navGroupLabelStyle: CSSProperties = {
  fontSize: 10.5,
  letterSpacing: '0.09em',
  textTransform: 'uppercase',
  color: colors.textMuted,
  fontWeight: 600,
};

export const inputStyle: CSSProperties = {
  padding: '7px 9px',
  fontSize: 14,
  fontFamily: fontBody,
  border: `1px solid ${colors.border}`,
  borderRadius: 4,
  background: 'transparent',
  color: colors.text,
};

export const primaryBtnStyle: CSSProperties = {
  cursor: 'pointer',
  padding: '7px 14px',
  fontSize: 13.5,
  fontFamily: fontHeading,
  fontWeight: 600,
  border: 'none',
  borderRadius: 4,
  background: colors.accent,
  color: '#fff',
};

export const secondaryBtnStyle: CSSProperties = {
  cursor: 'pointer',
  padding: '7px 14px',
  fontSize: 13.5,
  fontFamily: fontHeading,
  fontWeight: 600,
  border: `1px solid ${colors.border}`,
  borderRadius: 4,
  background: 'transparent',
  color: colors.text,
};
