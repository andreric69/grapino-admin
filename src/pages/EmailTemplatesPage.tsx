import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/apiClient';
import { cardStyle, inputStyle, primaryBtnStyle, secondaryBtnStyle } from '../theme';

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
      `Bei Fragen einfach ueber die Chat-Blase unten links melden.\n\nAndrin`,
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

// Kein eigener E-Mail-Versand (kein Resend/Dienst noetig) - Text wird nur
// vorbereitet, kopiert oder ans eigene Mail-Programm uebergeben. Versendet
// wird von Andrin selbst aus seinem eigenen Postfach.
export function EmailTemplatesPage() {
  const [users, setUsers] = useState<UserOption[]>([]);
  const [targetUserId, setTargetUserId] = useState('');
  const [templateKey, setTemplateKey] = useState(TEMPLATES[0].key);
  const [subject, setSubject] = useState(TEMPLATES[0].subject);
  const [body, setBody] = useState('');
  const [copied, setCopied] = useState(false);

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
    setCopied(false);
  }

  const targetEmail = users.find((u) => u.id === targetUserId)?.email ?? '';

  async function handleCopy() {
    const text = `An: ${targetEmail}\nBetreff: ${subject}\n\n${body}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const mailtoHref = `mailto:${encodeURIComponent(targetEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

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

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" disabled={!subject.trim() || !body.trim()} onClick={handleCopy} style={primaryBtnStyle}>
            {copied ? 'Kopiert!' : 'Text kopieren'}
          </button>
          <a
            href={mailtoHref}
            style={{ ...secondaryBtnStyle, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
          >
            In Mail-App oeffnen
          </a>
        </div>
        <div style={{ fontSize: 11.5, opacity: 0.55 }}>
          Kein automatischer Versand - Text kopieren und selbst versenden, oder direkt im eigenen Mail-Programm
          oeffnen (Empfaenger/Betreff/Text sind schon ausgefuellt).
        </div>
      </div>
    </div>
  );
}
