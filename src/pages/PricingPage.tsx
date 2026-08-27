import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/apiClient';
import { cardStyle, colors, inputStyle, primaryBtnStyle } from '../theme';
import { LoadingSpinner } from '../components/LoadingSpinner';

interface PricingConfig {
  refresh_price: number;
  neue_weine_price: number;
  ultra_price: number;
  standard_min_price: number;
  standard_max_price: number;
  ultra_min_price: number;
  ultra_max_price: number;
  access_fee: number;
  updated_at: string;
}

const RATE_FIELDS: { key: keyof Pick<PricingConfig, 'neue_weine_price' | 'refresh_price' | 'ultra_price'>; label: string; hint: string; isUltra: boolean }[] = [
  { key: 'neue_weine_price', label: 'Neue Weine, ohne Foto (CHF/Wein)', hint: 'Für per Foto hinzugefügte Weine - Etikett ist schon da.', isUltra: false },
  { key: 'refresh_price', label: 'Aktualisierung aller Weine (CHF/Wein)', hint: '', isUltra: false },
  { key: 'ultra_price', label: 'Import-Aktualisierung, inkl. Foto (CHF/Wein)', hint: 'Für importierte Weine ohne Foto - deutlich aufwendiger, darf teurer sein.', isUltra: true },
];

const BOUND_FIELDS: { key: keyof Pick<PricingConfig, 'standard_min_price' | 'standard_max_price' | 'ultra_min_price' | 'ultra_max_price'>; label: string }[] = [
  { key: 'standard_min_price', label: 'Mindestpreis: Neue Weine & Aktualisierung (CHF)' },
  { key: 'standard_max_price', label: 'Höchstpreis: Neue Weine & Aktualisierung (CHF)' },
  { key: 'ultra_min_price', label: 'Mindestpreis: Import-Aktualisierung (CHF)' },
  { key: 'ultra_max_price', label: 'Höchstpreis: Import-Aktualisierung (CHF)' },
];

// Gleiche Formel wie computeOrderPrice() in der Weinapp (src/lib/pricingConfig.ts)
// - hier dupliziert, da beide Apps getrennte Codebasen ohne gemeinsames
// Paket sind (gleiches Muster wie CATEGORY_LABELS in api/commerce.ts).
function computeOrderPrice(pricePerWine: number, min: number, max: number, wineCount: number): number {
  const raw = pricePerWine * Math.sqrt(wineCount);
  return Math.round(Math.min(max, Math.max(min, raw)) * 20) / 20;
}

const PRICE_TABLE_COUNTS = [10, 50, 100, 200, 500, 1000];

/**
 * Alle Preise wirken in der Weinapp progressiv (Quadratwurzel der
 * Flaschenzahl statt linear) - der hier eingestellte Rate-Wert ist jeweils
 * der Basis-Preis bei 1 Flasche, geklemmt zwischen Mindest- und
 * Hoechstpreis der jeweiligen Kategorie, siehe computeOrderPrice() in der Weinapp.
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
      ...Object.fromEntries(RATE_FIELDS.map((f) => [f.key, String(data.pricing[f.key])])),
      ...Object.fromEntries(BOUND_FIELDS.map((f) => [f.key, String(data.pricing[f.key])])),
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
      for (const f of [...RATE_FIELDS, ...BOUND_FIELDS]) {
        const parsed = parseFloat(draft[f.key]?.replace(',', '.') ?? '');
        if (Number.isNaN(parsed) || parsed < 0) {
          throw new Error(`${f.label}: ungültiger Wert.`);
        }
        body[f.key] = parsed;
      }
      const accessFeeParsed = parseFloat(draft.access_fee?.replace(',', '.') ?? '');
      if (Number.isNaN(accessFeeParsed) || accessFeeParsed < 0) {
        throw new Error('Einmalige Zugangsgebühr: ungültiger Wert.');
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

  const draftStandardMin = parseFloat(draft.standard_min_price?.replace(',', '.') ?? '') || 0;
  const draftStandardMax = parseFloat(draft.standard_max_price?.replace(',', '.') ?? '') || 0;
  const draftUltraMin = parseFloat(draft.ultra_min_price?.replace(',', '.') ?? '') || 0;
  const draftUltraMax = parseFloat(draft.ultra_max_price?.replace(',', '.') ?? '') || 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 480 }}>
      <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label style={{ display: 'block', fontSize: 12.5, opacity: 0.7, marginBottom: 4 }}>
            Einmalige Zugangsgebühr pro Nutzer (CHF)
          </label>
          <input
            value={draft.access_fee ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, access_fee: e.target.value }))}
            style={{ ...inputStyle, width: '100%' }}
          />
          <div style={{ fontSize: 11, opacity: 0.55, marginTop: 2 }}>
            Wird in der Weinapp im Impressum angezeigt, solange noch keine Zugangsgebühr bezahlt wurde. Kann pro
            Nutzer in dessen Detailansicht überschrieben werden.
          </div>
        </div>
        <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 12 }} />
        {RATE_FIELDS.map((f) => (
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
        <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 12 }} />
        <div style={{ fontSize: 12.5, opacity: 0.7 }}>Preisgrenzen (unabhängig von der Weinzahl)</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {BOUND_FIELDS.map((f) => (
            <div key={f.key}>
              <label style={{ display: 'block', fontSize: 12, opacity: 0.7, marginBottom: 4 }}>{f.label}</label>
              <input
                value={draft[f.key] ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                style={{ ...inputStyle, width: '100%' }}
              />
            </div>
          ))}
        </div>
        <button type="button" disabled={saving} onClick={handleSave} style={{ ...primaryBtnStyle, alignSelf: 'flex-start' }}>
          {saving ? 'Wird gespeichert ...' : 'Preise speichern'}
        </button>
        {saved && <p style={{ color: colors.success, margin: 0, fontSize: 13 }}>Gespeichert.</p>}
        {error && <p style={{ color: colors.danger, margin: 0, fontSize: 13 }}>{error}</p>}
      </div>
      <p style={{ fontSize: 12, opacity: 0.6 }}>
        Zählt die Anzahl unterschiedlicher Weine im Auftrag, nicht Flaschen (mehrere Flaschen desselben Weins zählen
        als 1). Die Weinapp rechnet progressiv (Quadratwurzel der Weinzahl statt linear) und klemmt das Ergebnis
        zwischen Mindest- und Höchstpreis der jeweiligen Kategorie. Änderungen wirken sofort für alle neuen
        Aufträge.
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
            {RATE_FIELDS.map((f) => {
              const perWine = parseFloat(draft[f.key]?.replace(',', '.') ?? '') || 0;
              const min = f.isUltra ? draftUltraMin : draftStandardMin;
              const max = f.isUltra ? draftUltraMax : draftStandardMax;
              return (
                <tr key={f.key}>
                  <td style={{ padding: '4px 8px' }}>{f.label.replace(/\s*\(CHF\/Wein\)/, '')}</td>
                  {PRICE_TABLE_COUNTS.map((n) => (
                    <td key={n} style={{ textAlign: 'right', padding: '4px 8px' }}>
                      {computeOrderPrice(perWine, min, max, n).toFixed(2)}
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
