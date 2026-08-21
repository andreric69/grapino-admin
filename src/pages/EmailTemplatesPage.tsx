import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/apiClient';
import { cardStyle, colors, inputStyle, primaryBtnStyle } from '../theme';

interface UserOption {
  id: string;
  email: string | null;
  displayName: string | null;
}

interface Template {
  key: string;
  title: string;
  subject: string;
  body: (name: string) => string;
}

const TEMPLATES: Template[] = [
  {
    key: 'einrichtung',
    title: 'App-Einrichtung',
    subject: 'Grapino - erste Schritte',
    body: (name) =>
      `Hallo ${name}\n\n` +
      `Schoen, dass du Grapino nutzt! Kurz die wichtigsten Schritte:\n\n` +
      `1. App auf dem Homescreen installieren: in Safari auf "Teilen" -> "Zum Home-Bildschirm" tippen.\n` +
      `2. Wein hinzufuegen: unten rechts auf das Plus tippen, Etikett fotografieren - Name/Jahrgang werden automatisch vorgeschlagen.\n` +
      `3. In den Einstellungen kannst du deinen Namen hinterlegen und die Sammlung sichern.\n\n` +
      `Bei Fragen einfach ueber die Chat-Blase oben links melden.\n\nAndrin`,
  },
  {
    key: 'vivino',
    title: 'Vivino-Import',
    subject: 'Grapino - Sammlung aus Vivino importieren',
    body: (name) =>
      `Hallo ${name}\n\n` +
      `So bekommst du deine bestehende Vivino-Sammlung in Grapino:\n\n` +
      `1. In der Vivino-App: Profil -> Einstellungen -> "Weinkeller exportieren" (CSV).\n` +
      `2. Die CSV-Datei per Mail/AirDrop auf das Geraet mit Grapino holen.\n` +
      `3. In Grapino: Einstellungen -> "CSV importieren" -> Datei auswaehlen, Spalten zuordnen, importieren.\n\n` +
      `Duplikate werden automatisch erkannt und zusammengefuehrt.\n\nAndrin`,
  },
  {
    key: 'backup',
    title: 'Sicherung erklaert',
    subject: 'Grapino - Sammlung sichern',
    body: (name) =>
      `Hallo ${name}\n\n` +
      `Kurzer Hinweis: unter Einstellungen -> "Sicherung herunterladen" kannst du jederzeit eine Kopie deiner ganzen Sammlung als Datei speichern. ` +
      `Praktisch vor grossen Aenderungen oder einfach ab und zu zwischendurch.\n\nAndrin`,
  },
];

export function EmailTemplatesPage() {
  const [users, setUsers] = useState<UserOption[]>([]);
  const [targetUserId, setTargetUserId] = useState('');
  const [templateKey, setTemplateKey] = useState(TEMPLATES[0].key);
  const [subject, setSubject] = useState(TEMPLATES[0].subject);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    apiFetch('/api/users').then(async (res) => {
      if (res.ok) {
        const data = (await res.json()) as { users: UserOption[] };
        setUsers(data.users);
      }
    });
  }, []);

  function applyTemplate(key: string, userId: string) {
    const template = TEMPLATES.find((t) => t.key === key) ?? TEMPLATES[0];
    const user = users.find((u) => u.id === userId);
    const name = user?.displayName || user?.email?.split('@')[0] || 'zusammen';
    setTemplateKey(key);
    setSubject(template.subject);
    setBody(template.body(name));
  }

  async function handleSend() {
    if (!targetUserId || !subject.trim() || !body.trim()) return;
    setSending(true);
    setResult(null);
    try {
      const res = await apiFetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: targetUserId, subject, body }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? 'Versand fehlgeschlagen.');
      setResult({ ok: true, message: 'Gesendet.' });
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : 'Versand fehlgeschlagen.' });
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select
            value={targetUserId}
            onChange={(e) => {
              setTargetUserId(e.target.value);
              applyTemplate(templateKey, e.target.value);
            }}
            style={{ ...inputStyle, flex: 1, minWidth: 160 }}
          >
            <option value="">Empfaenger waehlen ...</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.email ?? u.id}
              </option>
            ))}
          </select>
          <select
            value={templateKey}
            onChange={(e) => applyTemplate(e.target.value, targetUserId)}
            style={{ ...inputStyle, flex: 1, minWidth: 160 }}
          >
            {TEMPLATES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.title}
              </option>
            ))}
          </select>
        </div>

        <input value={subject} onChange={(e) => setSubject(e.target.value)} style={inputStyle} placeholder="Betreff" />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={10}
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
        />

        <button
          type="button"
          disabled={sending || !targetUserId || !subject.trim() || !body.trim()}
          onClick={handleSend}
          style={{ ...primaryBtnStyle, alignSelf: 'flex-start' }}
        >
          {sending ? 'Wird gesendet ...' : 'Senden'}
        </button>
        {result && <div style={{ fontSize: 13, color: result.ok ? colors.success : colors.danger }}>{result.message}</div>}
        <div style={{ fontSize: 11.5, opacity: 0.55 }}>
          Braucht RESEND_API_KEY/RESEND_FROM_ADDRESS in den Umgebungsvariablen. Ohne verifizierte Domain bei Resend
          kann nur an die eigene, bei Resend registrierte Adresse gesendet werden.
        </div>
      </div>
    </div>
  );
}
