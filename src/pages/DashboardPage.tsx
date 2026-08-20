import { useEffect, useState } from 'react';
import { apiFetch, clearToken } from '../lib/apiClient';

export function DashboardPage({ onLoggedOut }: { onLoggedOut: () => void }) {
  const [status, setStatus] = useState<'checking' | 'ok' | 'failed'>('checking');

  useEffect(() => {
    apiFetch('/api/ping').then((res) => setStatus(res.ok ? 'ok' : 'failed'));
  }, []);

  function handleLogout() {
    clearToken();
    onLoggedOut();
  }

  return (
    <div style={{ maxWidth: 640, margin: '40px auto', fontFamily: 'system-ui, sans-serif', padding: '0 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>Grapino Admin</h1>
        <button type="button" onClick={handleLogout} style={{ cursor: 'pointer' }}>
          Abmelden
        </button>
      </div>
      {status === 'checking' && <p>Session wird geprueft ...</p>}
      {status === 'ok' && <p>Angemeldet. Weitere Bereiche (Nutzer, Loeschanfragen, News, Kosten) folgen als naechstes.</p>}
      {status === 'failed' && <p>Session ungueltig oder abgelaufen - bitte neu anmelden.</p>}
    </div>
  );
}
