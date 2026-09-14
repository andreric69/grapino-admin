import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/apiClient';
import { cardStyle, colors, inputStyle, secondaryBtnStyle } from '../theme';
import { LoadingSpinner } from '../components/LoadingSpinner';

interface UserDetail {
  profile: {
    id: string;
    email: string | null;
    displayName: string | null;
    createdAt: string;
    lastSignInAt: string | null;
    bannedUntil: string | null;
  };
  access: {
    isBlocked: boolean;
    blockReason: string | null;
    blockAmount: number | null;
    trialEndsAt: string | null;
    aiDailyLimit: number | null;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    plan: PlanTier;
    paidOutsideStripe: boolean;
  };
  wineStats: { total: number; active: number; totalValue: number; withPrice: number };
  wines: { id: string; name: string | null; created_at: string; price: number | null; is_consumed: boolean }[];
  announcements: { id: string; created_at: string; title: string; type: string; target_user_id: string | null; seenAt: string | null }[];
  feedback: { id: string; created_at: string; rating: number }[];
  deletionRequests: { id: string; created_at: string; status: string }[];
  paymentRequests: { id: string; created_at: string; amount: number; reason: string; status: string; paid_at: string | null }[];
  orders: { id: string; created_at: string; category: string; wine_count: number; estimated_price: number; status: string }[];
  notes: { id: string; created_at: string; note: string }[];
}

interface TimelineEvent {
  id: string;
  at: string;
  label: string;
  color: string;
}

type PlanTier = 'basis' | 'pro' | 'ultra';

const PLAN_LABELS: Record<PlanTier, string> = { basis: 'Basis', pro: 'Pro', ultra: 'Ultra' };

// Gleiche Liste wie STRIPE_BLOCK_REASONS in claude weinapp/api/stripe-webhook.ts
// - rein informativ hier: zeigt an, ob ein aktueller Block vom Webhook
// automatisch gesetzt wurde (Zahlungsproblem) statt von Andrin von Hand
// (z. B. Missbrauch), damit vor dem Freischalten klar ist, was den Block
// eigentlich ausgeloest hat.
const STRIPE_BLOCK_REASONS = new Set([
  'Zahlung ausstehend - bitte Zahlungsmethode aktualisieren.',
  'Abo beendet.',
  'Die letzte Zahlung ist fehlgeschlagen - bitte Zahlungsmethode pruefen.',
]);

function formatDateTime(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('de-CH', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

// Fuehrt alle Ereignisse aus den verschiedenen Quellen zu einer einzigen,
// chronologisch sortierten Liste zusammen (neuste zuerst). Rein
// praesentational - liest nur, veraendert keine Daten.
function buildTimeline(detail: UserDetail): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  events.push({ id: 'account-created', at: detail.profile.createdAt, label: 'Konto erstellt', color: colors.border });

  for (const w of detail.wines) {
    events.push({
      id: `wine-${w.id}`,
      at: w.created_at,
      label: `Wein hinzugefügt: ${w.name?.trim() || '(ohne Namen)'}`,
      color: colors.gold,
    });
  }

  for (const f of detail.feedback) {
    events.push({ id: `feedback-${f.id}`, at: f.created_at, label: `Feedback gegeben (${f.rating} Sterne)`, color: colors.accent });
  }

  for (const d of detail.deletionRequests) {
    events.push({ id: `deletion-${d.id}`, at: d.created_at, label: `Löschanfrage (${d.status})`, color: colors.danger });
  }

  for (const p of detail.paymentRequests) {
    events.push({
      id: `payment-${p.id}`,
      at: p.created_at,
      label: `Zahlungsanfrage: ${p.reason} (${p.status})`,
      color: colors.text,
    });
    if (p.paid_at && p.paid_at !== p.created_at) {
      events.push({ id: `payment-paid-${p.id}`, at: p.paid_at, label: `Zahlung eingegangen: ${p.reason}`, color: colors.success });
    }
  }

  for (const o of detail.orders) {
    events.push({
      id: `order-${o.id}`,
      at: o.created_at,
      label: `Auftrag: ${o.category} (${o.status})`,
      color: colors.accentSoftBorder,
    });
  }

  for (const n of detail.notes) {
    events.push({ id: `note-${n.id}`, at: n.created_at, label: `Notiz: ${truncate(n.note, 80)}`, color: colors.textMuted });
  }

  return events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

function TimelineSection({ detail }: { detail: UserDetail }) {
  const events = buildTimeline(detail);

  if (events.length === 0) {
    return <div style={{ opacity: 0.55 }}>Keine Ereignisse.</div>;
  }

  return (
    <div style={{ maxHeight: 480, overflowY: 'auto', paddingRight: 4 }}>
      {events.map((e) => (
        <div key={e.id} style={{ display: 'flex', gap: 10, padding: '6px 0', borderBottom: `1px solid ${colors.border}` }}>
          <div style={{ flexShrink: 0, width: 9, height: 9, borderRadius: '50%', background: e.color, marginTop: 4 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div>{e.label}</div>
            <div style={{ opacity: 0.55, fontSize: 11 }}>{formatDateTime(e.at)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function UserDetailPanel({ userId }: { userId: string }) {
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const [blockReason, setBlockReason] = useState('');
  const [blockAmount, setBlockAmount] = useState('');
  const [trialEndsAt, setTrialEndsAt] = useState('');
  const [extendDays, setExtendDays] = useState('7');
  const [aiDailyLimit, setAiDailyLimit] = useState('');
  const [plan, setPlan] = useState<PlanTier>('ultra');
  const [paidOutsideStripe, setPaidOutsideStripe] = useState(false);
  const [savingAccess, setSavingAccess] = useState(false);

  const [loginLink, setLoginLink] = useState<string | null>(null);
  const [loadingLink, setLoadingLink] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const [activeTab, setActiveTab] = useState<'overview' | 'timeline'>('overview');

  async function load() {
    setError(null);
    const res = await apiFetch(`/api/users?userId=${encodeURIComponent(userId)}`);
    if (!res.ok) {
      setError('Details konnten nicht geladen werden.');
      return;
    }
    const data = (await res.json()) as UserDetail;
    setDetail(data);
    setBlockReason(data.access.blockReason ?? '');
    setBlockAmount(data.access.blockAmount !== null ? String(data.access.blockAmount) : '');
    setTrialEndsAt(data.access.trialEndsAt ?? '');
    setAiDailyLimit(data.access.aiDailyLimit !== null ? String(data.access.aiDailyLimit) : '');
    setPlan(data.access.plan ?? 'ultra');
    setPaidOutsideStripe(data.access.paidOutsideStripe ?? false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function saveAccess(isBlocked: boolean, planOverride?: PlanTier, paidOutsideStripeOverride?: boolean) {
    setSavingAccess(true);
    setError(null);
    try {
      const res = await apiFetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'setAccess',
          userId,
          isBlocked,
          blockReason: blockReason.trim() || null,
          blockAmount: blockAmount.trim() ? parseFloat(blockAmount.replace(',', '.')) : null,
          trialEndsAt: trialEndsAt || null,
          aiDailyLimit: aiDailyLimit.trim() ? parseInt(aiDailyLimit, 10) : null,
          plan: planOverride ?? plan,
          paidOutsideStripe: paidOutsideStripeOverride ?? paidOutsideStripe,
        }),
      });
      if (!res.ok) throw new Error();
      await load();
    } catch {
      setError('Zugangsstatus konnte nicht gespeichert werden.');
    } finally {
      setSavingAccess(false);
    }
  }

  // Verlaengert ab dem SPAETEREN von "heute" und dem aktuell gesetzten Datum -
  // ein bereits abgelaufenes Testabo wird also ab heute neu gerechnet (nicht
  // von einem Datum in der Vergangenheit aus), ein noch laufendes einfach um
  // die angegebene Tageszahl verlaengert. Setzt nur das Formularfeld - wie
  // die anderen Felder hier erst mit "Einstellungen speichern" wirksam.
  function extendTrial() {
    const days = parseInt(extendDays, 10);
    if (!days || days <= 0) return;
    const today = new Date();
    const current = trialEndsAt ? new Date(`${trialEndsAt}T00:00:00`) : null;
    const base = current && current.getTime() > today.getTime() ? current : today;
    base.setDate(base.getDate() + days);
    setTrialEndsAt(base.toISOString().slice(0, 10));
  }

  async function generateLoginLink() {
    setLoadingLink(true);
    setLinkCopied(false);
    setError(null);
    try {
      const res = await apiFetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generateRecoveryLink', userId }),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { link: string };
      setLoginLink(data.link);
    } catch {
      setError('Login-Link konnte nicht erzeugt werden.');
    } finally {
      setLoadingLink(false);
    }
  }

  async function addNote() {
    if (!noteText.trim()) return;
    setSavingNote(true);
    try {
      const res = await apiFetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'addNote', userId, note: noteText.trim() }),
      });
      if (!res.ok) throw new Error();
      setNoteText('');
      await load();
    } catch {
      setError('Notiz konnte nicht gespeichert werden.');
    } finally {
      setSavingNote(false);
    }
  }

  if (error) return <span style={{ color: colors.danger }}>{error}</span>;
  if (!detail) return <LoadingSpinner label="Wird geladen ..." />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, fontSize: 13 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        <div>
          <div style={{ opacity: 0.55, fontSize: 11 }}>Registriert</div>
          <div>{formatDateTime(detail.profile.createdAt)}</div>
        </div>
        <div>
          <div style={{ opacity: 0.55, fontSize: 11 }}>Letzter Login</div>
          <div>{formatDateTime(detail.profile.lastSignInAt)}</div>
        </div>
        <div>
          <div style={{ opacity: 0.55, fontSize: 11 }}>Weine (aktiv / gesamt)</div>
          <div>
            {detail.wineStats.active} / {detail.wineStats.total}
          </div>
        </div>
        <div>
          <div style={{ opacity: 0.55, fontSize: 11 }}>Wert (mit Preis: {detail.wineStats.withPrice})</div>
          <div>{detail.wineStats.totalValue.toFixed(2)}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, borderBottom: `1px solid ${colors.border}`, marginBottom: -4 }}>
        {(
          [
            ['overview', 'Übersicht'],
            ['timeline', 'Zeitleiste'],
          ] as const
        ).map(([tab, tabLabel]) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            style={{
              cursor: 'pointer',
              padding: '7px 12px',
              fontSize: 13,
              fontFamily: 'inherit',
              fontWeight: 600,
              border: 'none',
              borderBottom: activeTab === tab ? `2px solid ${colors.accent}` : '2px solid transparent',
              background: 'transparent',
              color: activeTab === tab ? colors.accent : colors.textMuted,
            }}
          >
            {tabLabel}
          </button>
        ))}
      </div>

      {activeTab === 'timeline' && (
        <div style={cardStyle}>
          <TimelineSection detail={detail} />
        </div>
      )}

      {activeTab === 'overview' && (
        <>
      <div style={{ ...cardStyle, background: detail.access.isBlocked ? 'rgba(179, 38, 30, 0.06)' : colors.surface }}>
        <div style={{ fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          Zugang
          <span
            style={{
              fontSize: 11,
              padding: '2px 8px',
              borderRadius: 10,
              background: detail.access.isBlocked ? colors.danger : colors.success,
              color: '#fff',
            }}
          >
            {detail.access.isBlocked ? 'Blockiert' : 'Frei'}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
          <input
            value={blockReason}
            onChange={(e) => setBlockReason(e.target.value)}
            placeholder="Grund (z. B. Missbrauch)"
            style={inputStyle}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              value={blockAmount}
              onChange={(e) => setBlockAmount(e.target.value)}
              placeholder="Betrag CHF"
              style={{ ...inputStyle, flex: 1 }}
            />
            <input
              type="date"
              value={trialEndsAt}
              onChange={(e) => setTrialEndsAt(e.target.value)}
              title="Testabo-Ende (zeigt dem Nutzer beim Login einen Hinweis, blockiert nichts automatisch)"
              style={{ ...inputStyle, flex: 1 }}
            />
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="number"
              min={1}
              value={extendDays}
              onChange={(e) => setExtendDays(e.target.value)}
              style={{ ...inputStyle, width: 64 }}
            />
            <button
              type="button"
              onClick={extendTrial}
              title="Zaehlt die Tage zum aktuellen Testabo-Datum dazu (oder ab heute, falls abgelaufen/leer) - danach unten speichern"
              style={{ ...secondaryBtnStyle, whiteSpace: 'nowrap', padding: '6px 10px', fontSize: 12.5 }}
            >
              Tage verlängern
            </button>
          </div>
          <input
            type="number"
            min={0}
            value={aiDailyLimit}
            onChange={(e) => setAiDailyLimit(e.target.value)}
            placeholder="KI-Tageslimit (leer = Standard 100)"
            style={{ ...inputStyle, width: '100%' }}
          />
          <div style={{ fontSize: 11, opacity: 0.55 }}>
            KI-Tageslimit: 0 deaktiviert die Etikett-Erkennung für diesen Nutzer komplett.
            {detail.access.blockReason && STRIPE_BLOCK_REASONS.has(detail.access.blockReason) && (
              <>
                {' '}
                <strong>Dieser Block wurde automatisch von Stripe gesetzt</strong> (Zahlungsproblem) - beim
                Freischalten wird der Zugang erst wieder gesperrt, wenn Stripe erneut ein Problem meldet.
              </>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {detail.access.isBlocked ? (
            <button type="button" disabled={savingAccess} onClick={() => saveAccess(false)} style={secondaryBtnStyle}>
              Freischalten
            </button>
          ) : (
            <button
              type="button"
              disabled={savingAccess || !blockReason.trim()}
              onClick={() => saveAccess(true)}
              style={{ ...secondaryBtnStyle, background: colors.danger, color: '#fff', border: 'none' }}
            >
              Blockieren
            </button>
          )}
          <button type="button" disabled={savingAccess} onClick={() => saveAccess(detail.access.isBlocked)} style={secondaryBtnStyle}>
            Einstellungen speichern
          </button>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Abo-Stufe</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['basis', 'pro', 'ultra'] as const).map((p) => (
            <button
              key={p}
              type="button"
              disabled={savingAccess}
              onClick={() => saveAccess(detail.access.isBlocked, p)}
              style={{
                ...secondaryBtnStyle,
                flex: 1,
                background: plan === p ? colors.accent : 'transparent',
                color: plan === p ? '#fff' : colors.text,
                border: plan === p ? 'none' : secondaryBtnStyle.border,
              }}
            >
              {PLAN_LABELS[p]}
            </button>
          ))}
        </div>
        {plan !== 'basis' && !detail.access.stripeSubscriptionId && !paidOutsideStripe && (
          <div style={{ fontSize: 11, opacity: 0.55, marginTop: 6 }}>
            Kein aktives Stripe-Abo hinter dieser Stufe - manuell vergeben oder nie bezahlt (siehe "Stripe-Abo" unten).
          </div>
        )}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, marginTop: 10 }}>
          <input
            type="checkbox"
            checked={paidOutsideStripe}
            disabled={savingAccess}
            onChange={(e) => {
              setPaidOutsideStripe(e.target.checked);
              saveAccess(detail.access.isBlocked, undefined, e.target.checked);
            }}
          />
          Ausserhalb Stripe bezahlt (bar/TWINT)
        </label>
        {paidOutsideStripe && (
          <div style={{ fontSize: 11, opacity: 0.55, marginTop: 4 }}>
            Zaehlt wie ein echtes Stripe-Abo - Betrag/Datum bitte als Admin-Notiz unten festhalten.
          </div>
        )}
      </div>

      <div style={cardStyle}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Stripe-Abo</div>
        {detail.access.stripeCustomerId ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5 }}>
            <div>
              Kunde:{' '}
              <a
                href={`https://dashboard.stripe.com/test/customers/${detail.access.stripeCustomerId}`}
                target="_blank"
                rel="noreferrer"
                style={{ color: colors.accent }}
              >
                {detail.access.stripeCustomerId}
              </a>
            </div>
            <div style={{ opacity: 0.75 }}>
              {detail.access.stripeSubscriptionId ? `Abo: ${detail.access.stripeSubscriptionId}` : 'Kein aktives Abo (Checkout begonnen, aber nicht abgeschlossen, oder gekündigt).'}
            </div>
            <div style={{ fontSize: 11, opacity: 0.55 }}>
              Details, Kündigung oder Rückerstattung direkt im Stripe-Dashboard. Link geht aktuell zum Test-Modus -
              nach dem Wechsel auf Live-Zahlungen hier den Pfad "/test/" entfernen.
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 12.5, opacity: 0.55 }}>Noch kein Stripe-Kunde (kein Checkout begonnen).</div>
        )}
      </div>

      <div style={cardStyle}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Login-Link</div>
        <div style={{ fontSize: 11, opacity: 0.55, marginBottom: 8 }}>
          Erzeugt einen einmaligen Anmelde-Link für diesen Nutzer (kein Passwort nötig). Per Mail verschicken, damit
          sich der Nutzer erstmals anmelden und selbst ein Passwort setzen kann - oder selbst öffnen, um sich direkt
          als dieser Nutzer einzuloggen und dessen Weine zu prüfen/ändern.
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: loginLink ? 8 : 0 }}>
          <button type="button" disabled={loadingLink} onClick={generateLoginLink} style={secondaryBtnStyle}>
            {loadingLink ? 'Wird erzeugt ...' : 'Login-Link generieren'}
          </button>
        </div>
        {loginLink && (
          <div style={{ display: 'flex', gap: 6 }}>
            <input readOnly value={loginLink} style={{ ...inputStyle, flex: 1, fontSize: 11 }} onFocus={(e) => e.target.select()} />
            <button
              type="button"
              style={secondaryBtnStyle}
              onClick={async () => {
                await navigator.clipboard.writeText(loginLink);
                setLinkCopied(true);
              }}
            >
              {linkCopied ? 'Kopiert!' : 'Kopieren'}
            </button>
            <button type="button" style={secondaryBtnStyle} onClick={() => window.open(loginLink, '_blank')}>
              Öffnen
            </button>
          </div>
        )}
      </div>

      <div>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Ankündigungen an diesen Nutzer</div>
        {detail.announcements.length === 0 && <div style={{ opacity: 0.55 }}>Keine.</div>}
        {detail.announcements.map((a) => (
          <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
            <span>{a.title}</span>
            <span style={{ opacity: 0.6 }}>{a.seenAt ? `gesehen ${formatDateTime(a.seenAt)}` : 'ungesehen'}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Feedback ({detail.feedback.length})</div>
          {detail.feedback.slice(0, 5).map((f) => (
            <div key={f.id}>
              {'★'.repeat(f.rating)} - {formatDateTime(f.created_at)}
            </div>
          ))}
        </div>
        <div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Löschanfragen ({detail.deletionRequests.length})</div>
          {detail.deletionRequests.map((d) => (
            <div key={d.id}>
              {d.status} - {formatDateTime(d.created_at)}
            </div>
          ))}
        </div>
        <div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Zahlungsanfragen ({detail.paymentRequests.length})</div>
          {detail.paymentRequests.map((p) => (
            <div key={p.id}>
              {p.amount.toFixed(2)} CHF - {p.reason} ({p.status})
            </div>
          ))}
        </div>
        <div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Aufträge ({detail.orders.length})</div>
          {detail.orders.map((o) => (
            <div key={o.id}>
              {o.category} - {o.wine_count} Weine ({o.status})
            </div>
          ))}
        </div>
      </div>

      <div>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Admin-Notizen (nur intern)</div>
        {detail.notes.map((n) => (
          <div key={n.id} style={{ padding: '4px 0', borderBottom: `1px solid ${colors.border}` }}>
            <div style={{ opacity: 0.55, fontSize: 11 }}>{formatDateTime(n.created_at)}</div>
            <div>{n.note}</div>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <input
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Notiz hinzufügen ..."
            style={{ ...inputStyle, flex: 1 }}
          />
          <button type="button" disabled={savingNote || !noteText.trim()} onClick={addNote} style={secondaryBtnStyle}>
            Speichern
          </button>
        </div>
      </div>
        </>
      )}
    </div>
  );
}
