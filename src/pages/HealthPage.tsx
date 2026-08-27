import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../lib/apiClient';
import { cardStyle, colors, fontHeading, kickerStyle, primaryBtnStyle } from '../theme';
import { LoadingSpinner } from '../components/LoadingSpinner';

const POLL_INTERVAL_MS = 20_000;

interface PingResult {
  ok: boolean;
  ms: number;
}
interface ErrorLogRow {
  id: string;
  created_at: string;
  endpoint: string;
  message: string;
  detail: string | null;
}
interface HealthData {
  supabase: PingResult;
  weinapp: PingResult;
  pushConfigured: boolean;
  recentErrors: ErrorLogRow[];
}

function urlBase64ToUint8Array(base64: string): BufferSource {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0))).buffer;
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 9,
        height: 9,
        borderRadius: '50%',
        background: ok ? colors.success : colors.danger,
        flex: '0 0 auto',
      }}
    />
  );
}

function StatusCard({ label, ping }: { label: string; ping: PingResult }) {
  return (
    <div style={cardStyle}>
      <div style={kickerStyle}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontFamily: fontHeading, fontWeight: 600, fontSize: 18 }}>
        <StatusDot ok={ping.ok} />
        {ping.ok ? 'Erreichbar' : 'Nicht erreichbar'}
      </div>
      <div style={{ fontSize: 11.5, opacity: 0.6, marginTop: 2 }}>{ping.ms} ms</div>
    </div>
  );
}

type PushState = 'unsupported' | 'unknown' | 'denied' | 'subscribing' | 'subscribed' | 'off';

export function HealthPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pushState, setPushState] = useState<PushState>('unknown');
  const [pushError, setPushError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function load() {
    try {
      const res = await apiFetch('/api/health');
      if (!res.ok) throw new Error();
      setHealth((await res.json()) as HealthData);
      setError(null);
    } catch {
      setError('Gesundheitsdaten konnten nicht geladen werden.');
    }
  }

  useEffect(() => {
    load();
    function startPolling() {
      if (pollRef.current) return;
      pollRef.current = setInterval(load, POLL_INTERVAL_MS);
    }
    function stopPolling() {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }
    function onVisibility() {
      if (document.hidden) stopPolling();
      else {
        load();
        startPolling();
      }
    }
    startPolling();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPushState('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setPushState('denied');
      return;
    }
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setPushState(sub ? 'subscribed' : 'off'))
      .catch(() => setPushState('off'));
  }, []);

  async function enablePush() {
    setPushError(null);
    setPushState('subscribing');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setPushState('denied');
        return;
      }
      const keyRes = await apiFetch('/api/push?resource=vapid-public-key');
      if (!keyRes.ok) throw new Error();
      const { publicKey } = (await keyRes.json()) as { publicKey: string | null };
      if (!publicKey) throw new Error('VAPID-Schlüssel ist serverseitig noch nicht konfiguriert.');

      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const saveRes = await apiFetch('/api/push?resource=subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });
      if (!saveRes.ok) throw new Error();
      setPushState('subscribed');
    } catch (e) {
      setPushError(e instanceof Error ? e.message : 'Aktivieren fehlgeschlagen.');
      setPushState('off');
    }
  }

  if (!health && !error) return <LoadingSpinner label="Wird geladen ..." />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {error && <p style={{ color: colors.danger }}>{error}</p>}

      {health && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
            <StatusCard label="Supabase" ping={health.supabase} />
            <StatusCard label="Weinapp" ping={health.weinapp} />
            <div style={cardStyle}>
              <div style={kickerStyle}>Push-Benachrichtigungen</div>
              {pushState === 'unsupported' && <div style={{ marginTop: 6, fontSize: 13 }}>In diesem Browser nicht unterstützt.</div>}
              {pushState === 'denied' && <div style={{ marginTop: 6, fontSize: 13, color: colors.danger }}>Berechtigung verweigert - im Browser manuell erlauben.</div>}
              {(pushState === 'off' || pushState === 'unknown') && (
                <button type="button" style={{ ...primaryBtnStyle, marginTop: 6 }} onClick={enablePush}>
                  Aktivieren
                </button>
              )}
              {pushState === 'subscribing' && <div style={{ marginTop: 6, fontSize: 13 }}>Wird aktiviert ...</div>}
              {pushState === 'subscribed' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontFamily: fontHeading, fontWeight: 600, fontSize: 16 }}>
                  <StatusDot ok={true} />
                  Aktiv
                </div>
              )}
              {!health.pushConfigured && <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>Server-Konfiguration (VAPID) fehlt noch.</div>}
              {pushError && <div style={{ fontSize: 12, color: colors.danger, marginTop: 4 }}>{pushError}</div>}
            </div>
          </div>

          <div>
            <h2 style={{ fontFamily: fontHeading, fontSize: 16, fontWeight: 600, color: colors.text, margin: '0 0 10px' }}>
              Letzte Fehler {health.recentErrors.length > 0 && `(${health.recentErrors.length})`}
            </h2>
            {health.recentErrors.length === 0 ? (
              <p style={{ fontSize: 13, opacity: 0.55, margin: 0 }}>Keine Fehler protokolliert.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 480, overflowY: 'auto' }}>
                {health.recentErrors.map((e) => (
                  <div key={e.id} style={cardStyle}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, opacity: 0.6 }}>
                      <span>{e.endpoint}</span>
                      <span>{new Date(e.created_at).toLocaleString('de-CH')}</span>
                    </div>
                    <div style={{ fontSize: 13.5, marginTop: 4 }}>{e.message}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
