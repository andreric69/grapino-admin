import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../lib/apiClient';
import { cardStyle, inputStyle, kickerStyle, primaryBtnStyle, secondaryBtnStyle } from '../theme';

interface UserOption {
  id: string;
  email: string | null;
  displayName: string | null;
  trialEndsAt: string | null;
}
interface PaymentRow {
  id: string;
  user_id: string;
  amount: number;
  reason: string;
  status: 'open' | 'paid' | 'cancelled';
}
interface OrderRow {
  id: string;
  user_id: string;
  categoryLabel: string;
  wine_count: number;
  status: 'pending' | 'in_progress' | 'done' | 'cancelled';
  created_at: string;
}

interface TemplateContext {
  name: string;
  openPayment: PaymentRow | null;
  lastDoneOrder: OrderRow | null;
  trialEndsAt: string | null;
  loginLink: string | null;
}

interface Template {
  key: string;
  title: string;
  hint: string;
  subject: string;
  body: (ctx: TemplateContext) => string;
}

const APP_URL = 'https://weinsammlung-two.vercel.app';
const ANLEITUNG_ONBOARDING = `${APP_URL}/Grapino-Anleitung.pdf`;
const ANLEITUNG_WEINE_ANLEGEN = `${APP_URL}/Grapino-Anleitung-Weine-Anlegen.pdf`;
const ANLEITUNG_APP = `${APP_URL}/Grapino-Anleitung-App.pdf`;
const ANLEITUNG_NACHRICHTEN = `${APP_URL}/Grapino-Anleitung-Nachrichten.pdf`;

function formatDate(iso: string | null): string {
  if (!iso) return '[DATUM]';
  return new Date(iso).toLocaleDateString('de-CH');
}
function formatAmount(n: number | undefined): string {
  return n !== undefined ? n.toFixed(2) : '[BETRAG]';
}

const TEMPLATES: Template[] = [
  {
    key: 'onboarding',
    title: 'Onboarding',
    hint: 'Erste Nachricht an einen neuen Nutzer - Login-Link wird automatisch erzeugt, sobald ein Empfänger gewählt ist.',
    subject: 'Willkommen bei Grapino',
    body: ({ name, loginLink }) =>
      `Hallo ${name}\n\n` +
      `Schön, dass du Grapino nutzt! Kurz die wichtigsten Schritte:\n\n` +
      `1. App auf dem Homescreen installieren: ${APP_URL}/ öffnen, in Safari auf "Teilen" -> "Zum Home-Bildschirm" tippen.\n` +
      `2. Über diesen Link einmalig anmelden${loginLink ? `: ${loginLink}` : ' [LOGIN-LINK wird erzeugt ...]'} - danach kannst du dir unter Einstellungen ein eigenes Passwort setzen.\n` +
      `3. Wein hinzufügen: unten rechts auf das Plus tippen, Etikett fotografieren - Name, Produzent und Jahrgang werden automatisch erkannt.\n` +
      `4. Hast du schon eine Sammlung (z. B. aus Vivino)? Lässt sich unter Einstellungen -> "CSV importieren" komplett übernehmen - oder schick mir die Datei einfach zu, dann mach ich das für dich.\n\n` +
      `Anleitungen zum Nachlesen:\n` +
      `- Erste Schritte: ${ANLEITUNG_ONBOARDING}\n` +
      `- Weine anlegen: ${ANLEITUNG_WEINE_ANLEGEN}\n` +
      `- So funktioniert die App: ${ANLEITUNG_APP}\n` +
      `- Kontakt und Nachrichten: ${ANLEITUNG_NACHRICHTEN}\n\n` +
      `Bei Fragen einfach über die Chat-Blase unten links oder direkt bei mir melden.\n\nAndrin`,
  },
  {
    key: 'weine-anlegen',
    title: 'Weine anlegen',
    hint: 'Wenn jemand nicht weiss, wie er Weine erfasst.',
    subject: 'Grapino - Weine anlegen',
    body: ({ name }) =>
      `Hallo ${name}\n\n` +
      `Hier die kurze Anleitung, wie du neue Weine in Grapino anlegst - per Foto mit automatischer Erkennung, per Barcode-Scan oder von Hand:\n\n` +
      `${ANLEITUNG_WEINE_ANLEGEN}\n\n` +
      `Bei Fragen einfach melden.\n\nAndrin`,
  },
  {
    key: 'app-bedienung',
    title: 'So funktioniert die App',
    hint: 'Allgemeine Bedienung - Suchen, Bearbeiten, als getrunken markieren, Statistik.',
    subject: 'Grapino - So funktioniert die App',
    body: ({ name }) =>
      `Hallo ${name}\n\n` +
      `Hier eine Anleitung zu den wichtigsten Funktionen von Grapino - Suchen/Filtern, einen Wein bearbeiten, als getrunken markieren, Favoriten, Wunschliste, Statistik und Datensicherung:\n\n` +
      `${ANLEITUNG_APP}\n\n` +
      `Bei Fragen einfach melden.\n\nAndrin`,
  },
  {
    key: 'nachrichten',
    title: 'Nachrichten-Funktion',
    hint: 'Erklärt den Kontakt-Button und seine 4 Reiter.',
    subject: 'Grapino - Kontakt und Nachrichten',
    body: ({ name }) =>
      `Hallo ${name}\n\n` +
      `Kurz erklärt, wie du mich über die App erreichst und wie du Aktualisierungs-Aufträge gibst:\n\n` +
      `${ANLEITUNG_NACHRICHTEN}\n\n` +
      `Bei Fragen einfach melden.\n\nAndrin`,
  },
  {
    key: 'vivino',
    title: 'Vivino-Import',
    hint: 'Bestehende Sammlung aus Vivino übernehmen.',
    subject: 'Grapino - Sammlung aus Vivino importieren',
    body: ({ name }) =>
      `Hallo ${name}\n\n` +
      `So bekommst du deine bestehende Vivino-Sammlung in Grapino:\n\n` +
      `1. In der Vivino-App: Profil -> Einstellungen -> "Weinkeller exportieren" (CSV).\n` +
      `2. Die CSV-Datei per Mail/AirDrop auf das Gerät mit Grapino holen.\n` +
      `3. In Grapino: Einstellungen -> "CSV importieren" -> Datei auswählen, Spalten zuordnen, importieren.\n\n` +
      `Duplikate werden automatisch erkannt und zusammengeführt.\n\nAndrin`,
  },
  {
    key: 'backup',
    title: 'Sicherung erklärt',
    hint: 'Hinweis auf die manuelle Datensicherung.',
    subject: 'Grapino - Sammlung sichern',
    body: ({ name }) =>
      `Hallo ${name}\n\n` +
      `Kurzer Hinweis: unter Einstellungen -> "Sicherung herunterladen" kannst du jederzeit eine Kopie deiner ganzen Sammlung als Datei speichern. ` +
      `Praktisch vor grossen Änderungen oder einfach ab und zu zwischendurch.\n\nAndrin`,
  },
  {
    key: 'zahlungserinnerung',
    title: 'Zahlungserinnerung',
    hint: 'Freundliche Erinnerung an eine offene Zahlung - Betrag wird automatisch eingesetzt, falls vorhanden.',
    subject: 'Grapino - kurze Erinnerung',
    body: ({ name, openPayment }) =>
      `Hallo ${name}\n\n` +
      `Kurze, freundliche Erinnerung: es steht noch eine offene Zahlung für Grapino aus - ` +
      `${formatAmount(openPayment?.amount)} CHF${openPayment ? ` (${openPayment.reason})` : ''}.\n\n` +
      `Details siehst du in der App unter Einstellungen -> "Kosten & Zahlungen". Keine Eile, ` +
      `nur damit es nicht untergeht.\n\nAndrin`,
  },
  {
    key: 'auftrag-erledigt',
    title: 'Auftrag erledigt',
    hint: 'Info, dass eine Aktualisierungs-Anfrage fertig ist - Details werden automatisch eingesetzt, falls vorhanden.',
    subject: 'Grapino - dein Auftrag ist fertig',
    body: ({ name, lastDoneOrder }) =>
      `Hallo ${name}\n\n` +
      `Dein Auftrag "${lastDoneOrder?.categoryLabel ?? '[AUFTRAG]'}" ` +
      `(${lastDoneOrder ? lastDoneOrder.wine_count + ' Weine' : '[ANZAHL] Weine'}) ist fertig - ` +
      `schau gern in der App vorbei, ob alles passt. Bei Rückfragen einfach melden.\n\nAndrin`,
  },
  {
    key: 'testphase-endet',
    title: 'Testphase endet bald',
    hint: 'Erinnerung kurz vor Ablauf des Testabos - Datum wird automatisch eingesetzt, falls vorhanden.',
    subject: 'Grapino - deine Testphase läuft bald aus',
    body: ({ name, trialEndsAt }) =>
      `Hallo ${name}\n\n` +
      `Kurzer Hinweis: deine Testphase bei Grapino läuft am ${formatDate(trialEndsAt)} aus. ` +
      `Falls du weitermachen möchtest, sag einfach Bescheid, dann kümmere ich mich um alles Weitere. ` +
      `Bei Fragen zur Sammlung oder zur App gerne jederzeit melden.\n\nAndrin`,
  },
  {
    key: 'wartung-störung',
    title: 'Wartung / Störung',
    hint: 'Kurze Info bei einer laufenden Störung oder geplanten Wartung.',
    subject: 'Grapino - kurze Info',
    body: ({ name }) =>
      `Hallo ${name}\n\n` +
      `Kurzer Hinweis: [Grapino ist gerade für eine kurze Wartung nicht erreichbar / es gab kurzzeitig ein Problem mit ...]. ` +
      `Deine Daten sind davon nicht betroffen, alles bleibt gespeichert. ` +
      `[Ich melde mich, sobald wieder alles läuft. / Ist bereits behoben.]\n\n` +
      `Sorry für die Umstände - bei Fragen einfach melden.\n\nAndrin`,
  },
];

export function EmailTemplatesPage() {
  const [users, setUsers] = useState<UserOption[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [targetUserId, setTargetUserId] = useState('');
  const [templateKey, setTemplateKey] = useState(TEMPLATES[0].key);
  const [subject, setSubject] = useState(TEMPLATES[0].subject);
  const [body, setBody] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    apiFetch('/api/users').then(async (res) => {
      if (res.ok) setUsers(((await res.json()) as { users: UserOption[] }).users);
    });
    apiFetch('/api/commerce?resource=payments').then(async (res) => {
      if (res.ok) setPayments(((await res.json()) as { paymentRequests: PaymentRow[] }).paymentRequests);
    });
    apiFetch('/api/commerce?resource=orders').then(async (res) => {
      if (res.ok) setOrders(((await res.json()) as { orders: OrderRow[] }).orders);
    });
  }, []);

  const currentTemplate = useMemo(() => TEMPLATES.find((t) => t.key === templateKey) ?? TEMPLATES[0], [templateKey]);

  function buildContext(userId: string, loginLink: string | null): TemplateContext {
    const user = users.find((u) => u.id === userId);
    const name = user?.displayName || user?.email?.split('@')[0] || 'zusammen';
    const openPayment = payments.find((p) => p.user_id === userId && p.status === 'open') ?? null;
    const doneOrders = orders.filter((o) => o.user_id === userId && o.status === 'done');
    const lastDoneOrder = doneOrders.length > 0 ? doneOrders[0] : null;
    return { name, openPayment, lastDoneOrder, trialEndsAt: user?.trialEndsAt ?? null, loginLink };
  }

  async function applyTemplate(key: string, userId: string) {
    const template = TEMPLATES.find((t) => t.key === key) ?? TEMPLATES[0];
    setTemplateKey(key);
    setSubject(template.subject);
    setCopied(false);
    setBody(template.body(buildContext(userId, null)));

    if (key === 'onboarding' && userId) {
      try {
        const res = await apiFetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'generateRecoveryLink', userId }),
        });
        if (res.ok) {
          const data = (await res.json()) as { link: string };
          setBody(template.body(buildContext(userId, data.link)));
        }
      } catch {
        // Login-Link konnte nicht erzeugt werden - Platzhalter im Text bleibt sichtbar.
      }
    }
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
            <option value="">Empfänger wählen ...</option>
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
        <div style={kickerStyle}>{currentTemplate.hint}</div>

        <input value={subject} onChange={(e) => setSubject(e.target.value)} style={inputStyle} placeholder="Betreff" />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={12}
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
            In Mail-App öffnen
          </a>
        </div>
        <div style={{ fontSize: 11.5, opacity: 0.55 }}>
          Kein automatischer Versand - Text kopieren und selbst versenden, oder direkt im eigenen Mail-Programm
          öffnen (Empfänger/Betreff/Text sind schon ausgefüllt). Platzhalter in [ECKIGEN KLAMMERN] bitte vor dem
          Senden prüfen/ausfüllen.
        </div>
      </div>
    </div>
  );
}
