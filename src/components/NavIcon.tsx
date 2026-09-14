// Schlichte, einheitliche Linien-Icons fuer die Seitenleiste - ersetzen die
// bunten Emojis (wirkten neben den ueberarbeiteten Seiten unpassend/informell)
// durch dieselbe Bildsprache wie in der Weinapp selbst (siehe z. B.
// BlockScreen.tsx dort): einfache geometrische Formen, eine Strichstaerke,
// aktuelle Textfarbe - keine aufwendigen Illustrationen, bewusst schlicht
// gehalten, damit sie in 15px auch wirklich lesbar bleiben.
import type { ReactNode } from 'react';

export type NavIconName =
  | 'overview'
  | 'analytics'
  | 'users'
  | 'deletions'
  | 'messages'
  | 'payments'
  | 'orders'
  | 'finances'
  | 'announcements'
  | 'feedback'
  | 'email'
  | 'activity'
  | 'storage'
  | 'aiUsage'
  | 'dataQuality'
  | 'health';

const PATHS: Record<NavIconName, ReactNode> = {
  overview: (
    <>
      <rect x="4" y="12" width="4" height="8" />
      <rect x="10" y="7" width="4" height="13" />
      <rect x="16" y="4" width="4" height="16" />
    </>
  ),
  analytics: <polyline points="3,17 9,11 13,14 21,5" />,
  users: (
    <>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 20c1.2-4 3.8-6 7-6s5.8 2 7 6" />
    </>
  ),
  deletions: (
    <>
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="M6 7l1 13h10l1-13" />
    </>
  ),
  messages: <path d="M4 5h16v11H9l-4 4V5z" />,
  payments: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
      <circle cx="12" cy="12" r="2.6" />
    </>
  ),
  orders: (
    <>
      <rect x="6" y="4" width="12" height="16" rx="1.5" />
      <path d="M9 4V2.5h6V4" />
      <path d="M9 10h6M9 14h6" />
    </>
  ),
  finances: (
    <>
      <circle cx="9" cy="9" r="6" />
      <circle cx="15" cy="15" r="6" />
    </>
  ),
  announcements: (
    <>
      <path d="M3 10v4h3l6 4V6l-6 4H3z" />
      <path d="M15 9a4 4 0 010 6" />
    </>
  ),
  feedback: <path d="M12 3l2.5 5.5L21 9l-4.5 4.5L17.5 21 12 17.5 6.5 21l1-7.5L3 9l6.5-.5z" />,
  email: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="1.5" />
      <path d="M3 7l9 6 9-6" />
    </>
  ),
  activity: <path d="M3 12h4l2 7 4-14 2 7h6" />,
  storage: (
    <>
      <rect x="3" y="8" width="18" height="12" rx="1" />
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M10 12h4" />
    </>
  ),
  aiUsage: (
    <>
      <rect x="7" y="7" width="10" height="10" rx="1.5" />
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
    </>
  ),
  dataQuality: (
    <>
      <circle cx="10" cy="10" r="6" />
      <path d="M14.5 14.5L20 20" />
    </>
  ),
  health: <path d="M12 20s-7-4.2-9.3-8.6C1 8 2.2 4.8 5.6 4.3c2-.3 3.7.7 4.7 2.2 1-1.5 2.7-2.5 4.7-2.2 3.4.5 4.6 3.7 2.9 7.1C19 15.8 12 20 12 20z" />,
};

export function NavIcon({ name, size = 16 }: { name: NavIconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
    >
      {PATHS[name]}
    </svg>
  );
}
