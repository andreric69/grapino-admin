import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/apiClient';
import { colors } from '../theme';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';

interface Announcement {
  id: string;
  createdAt: string;
  title: string;
  body: string;
  isActive: boolean;
  targetUserId: string | null;
  targetEmail: string | null;
  type: 'news' | 'update';
  repeatEveryDays: number | null;
  isTakeover: boolean;
}

interface AnnouncementRow {
  id: string;
  created_at: string;
  title: string;
  body: string;
  is_active: boolean;
  target_user_id: string | null;
  target_email: string | null;
  type: 'news' | 'update';
  repeat_every_days: number | null;
  is_takeover: boolean;
}

interface UserOption {
  id: string;
  email: string | null;
}

/** Mehrere Ankuendigungen, die als ein Batch-Versand an mehrere Nutzer
 * erstellt wurden (gleicher Titel/Text/Zeitstempel), fuer die Listenansicht
 * zu einer Zeile zusammengefasst - sonst sieht Andrin dieselbe Nachricht
 * N-mal hintereinander. */
interface AnnouncementGroup {
  ids: string[];
  createdAt: string;
  title: string;
  body: string;
  isActive: boolean;
  type: 'news' | 'update';
  repeatEveryDays: number | null;
  isTakeover: boolean;
  targetEmails: (string | null)[];
}

function groupAnnouncements(list: Announcement[]): AnnouncementGroup[] {
  const groups: AnnouncementGroup[] = [];
  const indexByKey = new Map<string, number>();
  for (const a of list) {
    const key = [a.title, a.body, a.createdAt, a.type, a.repeatEveryDays, a.isTakeover].join('|');
    const existingIndex = indexByKey.get(key);
    if (existingIndex === undefined) {
      indexByKey.set(key, groups.length);
      groups.push({
        ids: [a.id],
        createdAt: a.createdAt,
        title: a.title,
        body: a.body,
        isActive: a.isActive,
        type: a.type,
        repeatEveryDays: a.repeatEveryDays,
        isTakeover: a.isTakeover,
        targetEmails: [a.targetEmail],
      });
    } else {
      const g = groups[existingIndex];
      g.ids.push(a.id);
      g.targetEmails.push(a.targetEmail);
      if (a.isActive) g.isActive = true;
    }
  }
  return groups;
}

function targetLabel(g: AnnouncementGroup): string {
  if (g.ids.length <= 1) return g.targetEmails[0] ?? 'Alle Nutzer';
  const emails = g.targetEmails.filter((e): e is string => !!e);
  if (emails.length === 0) return `${g.ids.length} Nutzer`;
  if (emails.length === 1) return emails[0];
  const rest = emails.length - 1;
  return `${emails[0]} und ${rest} weitere${rest === 1 ? 'r' : ''} Nutzer`;
}

// Exakte Farb-/Schrift-Tokens aus der Kunden-App (claude weinapp/src/styles/tokens.css),
// hier hart codiert statt importiert, damit diese Vorschau ohne Abhaengigkeit auf das
// andere Repo auskommt. Nur fuer die Live-Vorschau unten - sonst nichts in dieser Datei
// benutzt diese Werte.
const previewTokens = {
  bg: '#f3f2f2',
  text: '#201f1d',
  bordeaux: '#7c2d3a',
  bordeauxSoft: 'rgba(124, 45, 58, 0.10)',
  bordeauxBadge: 'rgba(124, 45, 58, 0.14)',
  divider: 'rgba(32, 31, 29, 0.16)',
  fontHeading: "'Cormorant Garamond', system-ui, sans-serif",
  fontBody: "'Lora', system-ui, sans-serif",
  radiusMd: 4,
  shadowLg: '0 12px 32px rgba(45, 43, 43, 0.22)',
};

/** Gleiches Megafon-Icon wie AnnouncementTakeover.tsx in der Kunden-App (viewBox 0 0 24 24,
 * strokeWidth 1.7), hier dupliziert damit die Vorschau exakt aussieht. */
function MegaphonePreviewIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11v2a2 2 0 002 2h1l3.4 4.5c.4.5 1.2.2 1.2-.4V6.9c0-.6-.8-.9-1.2-.4L6 11H5a2 2 0 00-2 0z" />
      <path d="M14 9.5a3.5 3.5 0 010 5" />
      <path d="M17 6.5a7.5 7.5 0 010 11" />
    </svg>
  );
}

/** Live-Vorschau, wie die Ankuendigung in der Kunden-App aussehen wird - spiegelt
 * AnnouncementBanner.tsx (normal) bzw. AnnouncementTakeover.tsx (Vollbild) 1:1 in Layout,
 * Farben und Schriften wider, damit Andrin vor dem Veroeffentlichen sehen kann, was
 * ankommt. Reine Anzeige, keine echten Buttons (cursor: default, onClick fehlt absichtlich). */
function AnnouncementPreview({
  title,
  body,
  type,
  isTakeover,
}: {
  title: string;
  body: string;
  type: 'news' | 'update';
  isTakeover: boolean;
}) {
  const displayTitle = title.trim() || 'Titel der Ankündigung';
  const displayBody = body.trim() || 'Der Ankündigungstext erscheint hier, so wie er im Formular eingegeben wird.';

  if (isTakeover) {
    return (
      <div
        style={{
          background: previewTokens.bg,
          borderRadius: 8,
          padding: 24,
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <div
          style={{
            maxWidth: 300,
            width: '100%',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            padding: 28,
            borderRadius: previewTokens.radiusMd,
            background: previewTokens.bg,
            border: `1px solid ${previewTokens.divider}`,
            boxShadow: previewTokens.shadowLg,
            fontFamily: previewTokens.fontBody,
            color: previewTokens.text,
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: previewTokens.bordeauxBadge,
              color: previewTokens.bordeaux,
              display: 'grid',
              placeItems: 'center',
              margin: '0 auto',
            }}
          >
            <MegaphonePreviewIcon />
          </div>
          <h1 style={{ fontFamily: previewTokens.fontHeading, fontWeight: 600, fontSize: 20, margin: 0 }}>{displayTitle}</h1>
          <div style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap', textAlign: 'left' }}>{displayBody}</div>
          <button
            type="button"
            disabled
            style={{
              marginTop: 4,
              fontFamily: previewTokens.fontHeading,
              fontWeight: 600,
              fontSize: 14,
              padding: '9px 16px',
              borderRadius: previewTokens.radiusMd,
              border: `1px solid ${previewTokens.bordeaux}`,
              background: 'transparent',
              color: previewTokens.bordeaux,
              cursor: 'default',
              opacity: 1,
            }}
          >
            Verstanden
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: previewTokens.bg, borderRadius: 8, padding: 16 }}>
      <div
        style={{
          padding: '14px 16px',
          border: `1px solid ${previewTokens.bordeaux}`,
          borderRadius: previewTokens.radiusMd,
          background: previewTokens.bordeauxSoft,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          fontFamily: previewTokens.fontBody,
          color: previewTokens.text,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12 }}>{type === 'update' ? '🔄' : '📢'}</span>
          <div style={{ fontFamily: previewTokens.fontHeading, fontWeight: 600, fontSize: 14.5 }}>{displayTitle}</div>
        </div>
        <div style={{ fontSize: 13.5, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{displayBody}</div>
        <button
          type="button"
          disabled
          style={{
            alignSelf: 'flex-start',
            fontFamily: previewTokens.fontHeading,
            fontWeight: 600,
            fontSize: 14,
            padding: '9px 16px',
            borderRadius: previewTokens.radiusMd,
            border: `1px solid ${previewTokens.divider}`,
            background: 'transparent',
            color: previewTokens.text,
            cursor: 'default',
            opacity: 1,
          }}
        >
          Gelesen
        </button>
      </div>
    </div>
  );
}

export function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[] | null>(null);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [targetMode, setTargetMode] = useState<'all' | 'specific'>('all');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [type, setType] = useState<'news' | 'update'>('news');
  const [repeatEveryDays, setRepeatEveryDays] = useState('');
  const [isTakeover, setIsTakeover] = useState(false);
  const [sending, setSending] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setError(null);
    const [annRes, usersRes] = await Promise.all([apiFetch('/api/announcements'), apiFetch('/api/users')]);
    if (!annRes.ok) {
      setError('Ankündigungen konnten nicht geladen werden.');
      return;
    }
    const data = (await annRes.json()) as { announcements: AnnouncementRow[] };
    setAnnouncements(
      data.announcements.map((a) => ({
        id: a.id,
        createdAt: a.created_at,
        title: a.title,
        body: a.body,
        isActive: a.is_active,
        targetUserId: a.target_user_id,
        targetEmail: a.target_email,
        type: a.type,
        repeatEveryDays: a.repeat_every_days,
        isTakeover: a.is_takeover,
      })),
    );
    if (usersRes.ok) {
      const usersData = (await usersRes.json()) as { users: { id: string; email: string | null }[] };
      setUsers(usersData.users);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function toggleSelectedUser(id: string, checked: boolean) {
    setSelectedUserIds((prev) => (checked ? [...prev, id] : prev.filter((existing) => existing !== id)));
  }

  async function handleCreate() {
    if (!title.trim() || !body.trim()) return;
    if (targetMode === 'specific' && selectedUserIds.length === 0) return;
    setSending(true);
    setError(null);
    try {
      const days = parseInt(repeatEveryDays, 10);
      const payload: {
        title: string;
        body: string;
        type: 'news' | 'update';
        repeatEveryDays: number | null;
        isTakeover: boolean;
        targetUserId?: string | null;
        targetUserIds?: string[];
      } = {
        title,
        body,
        type,
        repeatEveryDays: Number.isFinite(days) && days > 0 ? days : null,
        isTakeover,
      };
      if (targetMode === 'specific') {
        payload.targetUserIds = selectedUserIds;
      } else {
        payload.targetUserId = null;
      }
      const res = await apiFetch('/api/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      setTitle('');
      setBody('');
      setTargetMode('all');
      setSelectedUserIds([]);
      setType('news');
      setRepeatEveryDays('');
      setIsTakeover(false);
      await load();
    } catch {
      setError('Ankündigung konnte nicht erstellt werden.');
    } finally {
      setSending(false);
    }
  }

  async function toggleActive(g: AnnouncementGroup) {
    setBusyId(g.ids[0]);
    try {
      const nextActive = !g.isActive;
      const results = await Promise.all(
        g.ids.map((id) =>
          apiFetch('/api/announcements', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, is_active: nextActive }),
          }),
        ),
      );
      if (results.some((r) => !r.ok)) throw new Error();
      await load();
    } catch {
      setError('Aktion fehlgeschlagen.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(g: AnnouncementGroup) {
    const confirmText =
      g.ids.length > 1
        ? `Ankündigung "${g.title}" (an ${g.ids.length} Nutzer) endgültig löschen?`
        : `Ankündigung "${g.title}" endgültig löschen?`;
    if (!window.confirm(confirmText)) return;
    setBusyId(g.ids[0]);
    try {
      const results = await Promise.all(
        g.ids.map((id) =>
          apiFetch('/api/announcements', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id }),
          }),
        ),
      );
      if (results.some((r) => !r.ok)) throw new Error();
      await load();
    } catch {
      setError('Löschen fehlgeschlagen.');
    } finally {
      setBusyId(null);
    }
  }

  const groups = announcements ? groupAnnouncements(announcements) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div
          style={{
            flex: '1 1 320px',
            minWidth: 300,
            border: `1px solid ${colors.border}`,
            borderRadius: 6,
            padding: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <strong style={{ fontSize: 14 }}>Neue Ankündigung</strong>
          <input
            placeholder="Titel"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{ padding: '6px 8px', fontSize: 14 }}
          />
          <textarea
            placeholder="Text"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            style={{ padding: '6px 8px', fontSize: 14, fontFamily: 'inherit', resize: 'vertical' }}
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <label style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 2 }}>
              Zielgruppe
              <select
                value={targetMode}
                onChange={(e) => {
                  const mode = e.target.value as 'all' | 'specific';
                  setTargetMode(mode);
                  if (mode === 'all') setSelectedUserIds([]);
                }}
                style={{ padding: '5px 6px' }}
              >
                <option value="all">Alle Nutzer</option>
                <option value="specific">Nur bestimmte Nutzer</option>
              </select>
            </label>
            <label style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 2 }}>
              Typ
              <select value={type} onChange={(e) => setType(e.target.value as 'news' | 'update')} style={{ padding: '5px 6px' }}>
                <option value="news">Ankündigung</option>
                <option value="update">Update</option>
              </select>
            </label>
            <label style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 2 }}>
              Wiederholen alle (Tage)
              <input
                type="number"
                min={1}
                placeholder="leer = einmalig"
                value={repeatEveryDays}
                onChange={(e) => setRepeatEveryDays(e.target.value)}
                style={{ padding: '5px 6px', width: 130 }}
              />
            </label>
          </div>
          {targetMode === 'specific' && (
            <div
              style={{
                border: `1px solid ${colors.border}`,
                borderRadius: 4,
                padding: 8,
                maxHeight: 160,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              {users.length === 0 && <span style={{ fontSize: 12, opacity: 0.6 }}>Keine Nutzer geladen.</span>}
              {users.map((u) => (
                <label key={u.id} style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={selectedUserIds.includes(u.id)}
                    onChange={(e) => toggleSelectedUser(u.id, e.target.checked)}
                  />
                  {u.email ?? u.id}
                </label>
              ))}
              <span style={{ fontSize: 12, opacity: 0.7 }}>
                {selectedUserIds.length === 0 ? 'Keine Nutzer ausgewählt' : `${selectedUserIds.length} Nutzer ausgewählt`}
              </span>
            </div>
          )}
          <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={isTakeover} onChange={(e) => setIsTakeover(e.target.checked)} />
            Als Vollbild-Popup anzeigen (fuer wirklich wichtige Mitteilungen)
          </label>
          <button
            type="button"
            disabled={sending || !title.trim() || !body.trim() || (targetMode === 'specific' && selectedUserIds.length === 0)}
            onClick={handleCreate}
            style={{ cursor: 'pointer', alignSelf: 'flex-start' }}
          >
            {sending ? 'Wird gesendet ...' : 'Veröffentlichen'}
          </button>
        </div>

        <div style={{ flex: '1 1 300px', minWidth: 280, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <strong style={{ fontSize: 14 }}>Live-Vorschau ({isTakeover ? 'Vollbild' : 'Banner auf der Sammlungs-Seite'})</strong>
          <AnnouncementPreview title={title} body={body} type={type} isTakeover={isTakeover} />
        </div>
      </div>

      {error && <p style={{ color: colors.danger }}>{error}</p>}
      {!announcements && <LoadingSpinner label="Wird geladen ..." />}
      {announcements && announcements.length === 0 && <EmptyState icon="📣" text="Noch keine Ankündigungen." />}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {groups?.map((g) => (
          <div
            key={g.ids.join(',')}
            style={{ border: `1px solid ${colors.border}`, borderRadius: 6, padding: 12, fontSize: 14, opacity: g.isActive ? 1 : 0.5 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <strong>
                {g.type === 'update' ? '🔄' : '📢'} {g.title}
                {g.isTakeover && (
                  <span
                    style={{
                      marginLeft: 8,
                      fontSize: 11,
                      fontWeight: 600,
                      color: colors.danger,
                      border: `1px solid ${colors.danger}`,
                      borderRadius: 4,
                      padding: '1px 6px',
                      verticalAlign: 'middle',
                    }}
                  >
                    Vollbild
                  </span>
                )}
              </strong>
              <span style={{ fontSize: 12, opacity: 0.6 }}>{new Date(g.createdAt).toLocaleString('de-CH')}</span>
            </div>
            <div style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{g.body}</div>
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
              An: {targetLabel(g)} · {g.repeatEveryDays ? `wiederholt alle ${g.repeatEveryDays} Tage` : 'einmalig'} ·{' '}
              {g.isActive ? 'aktiv' : 'deaktiviert'}
            </div>
            <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
              <button
                type="button"
                disabled={busyId !== null && g.ids.includes(busyId)}
                onClick={() => toggleActive(g)}
                style={{ cursor: 'pointer' }}
              >
                {g.isActive ? 'Deaktivieren' : 'Aktivieren'}
              </button>
              <button
                type="button"
                disabled={busyId !== null && g.ids.includes(busyId)}
                onClick={() => handleDelete(g)}
                style={{ cursor: 'pointer', color: colors.danger }}
              >
                Löschen
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
