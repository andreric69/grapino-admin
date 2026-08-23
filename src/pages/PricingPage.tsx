import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/apiClient';
import { cardStyle, colors, inputStyle, primaryBtnStyle } from '../theme';
import { LoadingSpinner } from '../components/LoadingSpinner';

interface PricingConfig {
  trinkfenster_price: number;
  name_price: number;
  refresh_price: number;
  neue_weine_price: number;
  ultra_price: number;
  minimum_price: number;
  access_fee: number;
  updated_at: string;
}

const FIELDS: { key: keyof Omit<PricingConfig, 'updated_at' | 'access_fee'>; label: string; hint: string }[] = [
  { key: 'trinkfenster_price', label: 'Nur Trinkfenster (CHF/Wein)', hint: '' },
  { key: 'name_price', label: 'Nur Name (CHF/Wein)', hint: '' },
  { key: 'neue_weine_price', label: 'Neue Weine, ohne Foto (CHF/Wein)', hint: 'Fuer per Foto hinzugefuegte Weine - Etikett ist schon da.' },
  { key: 'refresh_price', label: 'Aktualisierung aller Weine (CHF/Wein)', hint: '' },
  { key: 'ultra_price', label: 'Import-Aktualisierung, inkl. Foto (CHF/Wein)', hint: 'Fuer importierte Weine ohne Foto - deutlich aufwendiger, darf teurer sein.' },
  { key: 'minimum_price', label: 'Mindestbetrag pro Auftrag (CHF)', hint: 'Gilt fuer jede Kategorie, unabhaengig von der Weinzahl.' },
];

// Gleiche Formel wie computeOrderPrice() in der Weinapp (src/lib/pricingConfig.ts)
// - hier dupliziert, da beide Apps getrennte Codebasen ohne gemeinsames
// Paket sind (gleiches Muster wie CATEGORY_LABELS in api/commerce.ts).
function computeOrderPrice(pricePerWine: number, minimum: number, wineCount: number): number {
  const raw = pricePerWine * Math.sqrt(wineCount);
  return Math.max(minimum, Math.round(raw * 20) / 20);
}

const PRICE_TABLE_COUNTS = [10, 50, 100, 200, 500, 1000];

/**
 * Alle Preise wirken in der Weinapp progressiv (Quadratwurzel der
 * Flaschenzahl statt linear) - der hier eingestellte Wert ist jeweils der
 * Basis-Preis bei 1 Flasche, siehe estimateOrderPrice() in der Weinapp.
 */
export function PricingPage() {
  const [pricing, setPricing] = useState<PricingConfig | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function load() {
    setError(null);
    const res = await apiFetch('/api/commerce?resource=pricing');
    if (!res.ok) {
      setError('Preise konnten nicht geladen werden.');
      return;
    }
    const data = (await res.json()) as { pricing: PricingConfig };
    setPricing(data.pricing);
    setDraft({
      ...Object.fromEntries(FIELDS.map((f) => [f.key, String(data.pricing[f.key])])),
      access_fee: String(data.pricing.access_fee),
    });
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const body: Record<string, number> = {};
      for (const f of FIELDS) {
        const parsed = parseFloat(draft[f.key]?.replace(',', '.') ?? '');
        if (Number.isNaN(parsed) || parsed < 0) {
          throw new Error(`${f.label}: ungueltiger Wert.`);
        }
        body[f.key] = parsed;
      }
      const accessFeeParsed = parseFloat(draft.access_fee?.replace(',', '.') ?? '');
      if (Number.isNaN(accessFeeParsed) || accessFeeParsed < 0) {
        throw new Error('Einmalige Zugangsgebuehr: ungueltiger Wert.');
      }
      body.access_fee = accessFeeParsed;
      const res = await apiFetch('/api/commerce?resource=pricing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Speichern fehlgeschlagen.');
      setSaved(true);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen.');
    } finally {
      setSaving(false);
    }
  }

  if (error && !pricing) return <p style={{ color: colors.danger }}>{error}</p>;
  if (!pricing) return <LoadingSpinner label="Wird geladen ..." />;

  const draftMinimum = parseFloat(draft.minimum_price?.replace(',', '.') ?? '') || 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 480 }}>
      <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label style={{ display: 'block', fontSize: 12.5, opacity: 0.7, marginBottom: 4 }}>
            Einmalige Zugangsgebuehr pro Nutzer (CHF)
          </label>
          <input
            value={draft.access_fee ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, access_fee: e.target.value }))}
            style={{ ...inputStyle, width: '100%' }}
          />
          <div style={{ fontSize: 11, opacity: 0.55, marginTop: 2 }}>
            Wird in der Weinapp im Impressum angezeigt - kein Auftragspreis, gilt einmalig pro neuem Nutzer.
          </div>
        </div>
        <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 12 }} />
        {FIELDS.map((f) => (
          <div key={f.key}>
            <label style={{ display: 'block', fontSize: 12.5, opacity: 0.7, marginBottom: 4 }}>{f.label}</label>
            <input
              value={draft[f.key] ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
              style={{ ...inputStyle, width: '100%' }}
            />
            {f.hint && <div style={{ fontSize: 11, opacity: 0.55, marginTop: 2 }}>{f.hint}</div>}
          </div>
        ))}
        <button type="button" disabled={saving} onClick={handleSave} style={{ ...primaryBtnStyle, alignSelf: 'flex-start' }}>
          {saving ? 'Wird gespeichert ...' : 'Preise speichern'}
        </button>
        {saved && <p style={{ color: colors.success, margin: 0, fontSize: 13 }}>Gespeichert.</p>}
        {error && <p style={{ color: colors.danger, margin: 0, fontSize: 13 }}>{error}</p>}
      </div>
      <p style={{ fontSize: 12, opacity: 0.6 }}>
        Zaehlt die Anzahl unterschiedlicher Weine im Auftrag, nicht Flaschen (mehrere Flaschen desselben Weins zaehlen
        als 1). Die Weinapp rechnet progressiv (Quadratwurzel der Weinzahl statt linear) - der Preis oben gilt fuer 1
        Wein, bei grossen Mengen wird es automatisch guenstiger pro Wein. Aenderungen wirken sofort fuer alle neuen
        Auftraege.
      </p>

      <div style={{ ...cardStyle, overflowX: 'auto' }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>
          Vorschau (mit den Werten oben, auch ungespeichert)
        </div>
        <table style={{ borderCollapse: 'collapse', fontSize: 12.5, width: '100%' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '4px 8px', borderBottom: `1px solid ${colors.border}` }}>Kategorie</th>
              {PRICE_TABLE_COUNTS.map((n) => (
                <th key={n} style={{ textAlign: 'right', padding: '4px 8px', borderBottom: `1px solid ${colors.border}` }}>
                  {n}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FIELDS.filter((f) => f.key !== 'minimum_price').map((f) => {
              const perWine = parseFloat(draft[f.key]?.replace(',', '.') ?? '') || 0;
              return (
                <tr key={f.key}>
                  <td style={{ padding: '4px 8px' }}>{f.label.replace(/\s*\(CHF\/Wein\)/, '')}</td>
                  {PRICE_TABLE_COUNTS.map((n) => (
                    <td key={n} style={{ textAlign: 'right', padding: '4px 8px' }}>
                      {computeOrderPrice(perWine, draftMinimum, n).toFixed(2)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
