import { useState, type FormEvent } from 'react';
import { setToken } from '../lib/apiClient';
import { colors, fontBody, fontHeading, inputStyle, primaryBtnStyle } from '../theme';

export function LoginPage({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? 'Anmeldung fehlgeschlagen.');
        return;
      }
      const { token } = (await res.json()) as { token: string };
      setToken(token);
      onLoggedIn();
    } catch {
      setError('Keine Verbindung zum Server.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', fontFamily: fontBody, background: colors.bg }}>
      <form onSubmit={handleSubmit} style={{ width: 280, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h1 style={{ fontFamily: fontHeading, fontWeight: 600, fontSize: 24, margin: '0 0 4px', color: colors.accent, textAlign: 'center' }}>
          Grapino Admin
        </h1>
        <input
          type="password"
          placeholder="Admin-Passwort"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          style={inputStyle}
        />
        {error && <div style={{ color: colors.danger, fontSize: 13 }}>{error}</div>}
        <button type="submit" disabled={busy || !password} style={primaryBtnStyle}>
          {busy ? 'Wird geprüft ...' : 'Anmelden'}
        </button>
      </form>
    </div>
  );
}
