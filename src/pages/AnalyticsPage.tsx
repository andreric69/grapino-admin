import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  Bar,
  BarChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { apiFetch } from '../lib/apiClient';
import { cardStyle, colors, fontHeading, kickerStyle, inputStyle, primaryBtnStyle } from '../theme';
import { LoadingSpinner } from '../components/LoadingSpinner';

interface RevenueMonth {
  month: string; // "YYYY-MM"
  amountChf: number;
}
interface UserGrowthMonth {
  month: string;
  newUsers: number;
  totalUsers: number;
}
interface ScansMonth {
  month: string;
  scans: number;
}
interface AnalyticsData {
  revenueByMonth: RevenueMonth[];
  userGrowthByMonth: UserGrowthMonth[];
  scansByMonth: ScansMonth[];
}

function formatChf(amount: number): string {
  return amount.toLocaleString('de-CH', { style: 'currency', currency: 'CHF' });
}

function formatMonthShort(month: string): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return month;
  return new Date(y, m - 1, 1).toLocaleDateString('de-CH', { month: 'short', year: '2-digit' });
}

function formatMonthLong(month: string): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return month;
  return new Date(y, m - 1, 1).toLocaleDateString('de-CH', { month: 'long', year: 'numeric' });
}

function addOneMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m, 1); // m ist bereits 1-basiert -> ergibt den Folgemonat
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function lastNMonths(n: number): string[] {
  const now = new Date();
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

/**
 * Grobe Trend-Fortschreibung: Durchschnitt der Monat-zu-Monat-Veraenderung
 * der letzten (bis zu) 6 Monate, ein Monat in die Zukunft projiziert. Bewusst
 * simpel gehalten (keine echte Regression) - siehe Auftrag: "nicht
 * ueberkonstruieren". Explizit als grobe Schaetzung gekennzeichnet, kein
 * Versprechen.
 */
function computeForecast(revenue: RevenueMonth[]): { month: string; amountChf: number } | null {
  if (revenue.length < 2) return null;
  const window = revenue.slice(-6);
  const deltas: number[] = [];
  for (let i = 1; i < window.length; i++) {
    deltas.push(window[i].amountChf - window[i - 1].amountChf);
  }
  const avgDelta = deltas.reduce((s, d) => s + d, 0) / deltas.length;
  const last = window[window.length - 1];
  return { month: addOneMonth(last.month), amountChf: Math.max(0, last.amountChf + avgDelta) };
}

function ChartSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 style={{ fontFamily: fontHeading, fontSize: 17, fontWeight: 600, color: colors.text, margin: '0 0 12px' }}>{title}</h2>
      <div style={cardStyle}>{children}</div>
    </div>
  );
}

function EmptyChartNote({ text }: { text: string }) {
  return <p style={{ fontSize: 13, opacity: 0.6, margin: '8px 0' }}>{text}</p>;
}

// Recharts v3 tippt Tooltip-/Label-Formatter recht streng (ValueType | undefined,
// beliebiger ReactNode als Label) - kleine Wrapper mit weiten (unknown-)
// Parametertypen statt genauer Recharts-Typen, die intern robust auf die
// tatsaechlich erwarteten Werte pruefen/faellen.
function tooltipLabelFormatter(label: unknown): string {
  return typeof label === 'string' ? formatMonthLong(label) : String(label ?? '');
}

function revenueTooltipFormatter(value: unknown, name: unknown): [string, string] {
  const amount = typeof value === 'number' ? value : 0;
  return [formatChf(amount), name === 'forecastChf' ? 'Prognose' : 'Umsatz'];
}

function scansTooltipFormatter(value: unknown): [string, string] {
  return [typeof value === 'number' ? String(value) : '0', 'Scans'];
}

function userGrowthLegendFormatter(value: unknown): string {
  return value === 'newUsers' ? 'Neue Nutzer' : 'Nutzer gesamt';
}

export function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exportMonth, setExportMonth] = useState<string>(lastNMonths(1)[0]);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  function load() {
    setError(null);
    apiFetch('/api/reports?resource=analytics')
      .then(async (res) => {
        if (!res.ok) {
          setError('Auswertungen konnten nicht geladen werden.');
          return;
        }
        const json = (await res.json()) as AnalyticsData;
        setData(json);
        if (json.revenueByMonth.length > 0) {
          setExportMonth(json.revenueByMonth[json.revenueByMonth.length - 1].month);
        }
      })
      .catch(() => {
        // Ohne catch bliebe die Seite bei einem Netzwerk-/Parse-Fehler
        // (z.B. keine gueltige JSON-Antwort) fuer immer im Ladezustand haengen,
        // statt wie der Rest der App einen Fehler mit Neu-laden-Moeglichkeit
        // zu zeigen.
        setError('Auswertungen konnten nicht geladen werden.');
      });
  }

  useEffect(load, []);

  const forecast = useMemo(() => (data ? computeForecast(data.revenueByMonth) : null), [data]);

  const revenueChartData = useMemo(() => {
    if (!data) return [];
    const base = data.revenueByMonth.map((r) => ({
      month: r.month,
      amountChf: r.amountChf,
      forecastChf: null as number | null,
    }));
    if (forecast && base.length > 0) {
      base[base.length - 1] = { ...base[base.length - 1], forecastChf: base[base.length - 1].amountChf };
      base.push({ month: forecast.month, amountChf: null as unknown as number, forecastChf: forecast.amountChf });
    }
    return base;
  }, [data, forecast]);

  const yearComparison = useMemo(() => {
    if (!data) return null;
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonthNum = now.getMonth() + 1;

    const thisYear = data.revenueByMonth.filter((r) => {
      const [y, m] = r.month.split('-').map(Number);
      return y === currentYear && m <= currentMonthNum;
    });
    const lastYear = data.revenueByMonth.filter((r) => {
      const [y, m] = r.month.split('-').map(Number);
      return y === currentYear - 1 && m <= currentMonthNum;
    });

    const thisYearTotal = thisYear.reduce((s, r) => s + r.amountChf, 0);
    const lastYearTotal = lastYear.reduce((s, r) => s + r.amountChf, 0);
    const deltaPercent = lastYearTotal > 0 ? ((thisYearTotal - lastYearTotal) / lastYearTotal) * 100 : null;
    // Das 13-Monats-Fenster deckt das Vorjahr nur ab dem aktuellen Monat minus
    // 12 ab - je spaeter im Jahr, desto mehr fehlende Vorjahresmonate fuer
    // einen vollstaendigen Jahresvergleich. Hinweis nur zeigen, wenn das
        // tatsaechlich zutrifft, statt den Nutzer immer zu verunsichern.
    const incomplete = lastYear.length < currentMonthNum;

    return { thisYearTotal, lastYearTotal, deltaPercent, incomplete };
  }, [data]);

  const monthOptions = useMemo(() => {
    if (data && data.revenueByMonth.length > 0) {
      return [...data.revenueByMonth].map((r) => r.month).reverse();
    }
    return lastNMonths(13);
  }, [data]);

  async function downloadReport() {
    setExportBusy(true);
    setExportError(null);
    try {
      const res = await apiFetch(`/api/reports?resource=monthly-report&month=${exportMonth}`);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `grapino-bericht-${exportMonth}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setExportError('Bericht konnte nicht heruntergeladen werden.');
    } finally {
      setExportBusy(false);
    }
  }

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
        <p style={{ color: colors.danger, margin: 0 }}>{error}</p>
        <p style={{ fontSize: 12.5, opacity: 0.6, margin: 0 }}>
          Meist ein vorübergehender Verbindungsaussetzer - ein erneuter Versuch hilft in der Regel.
        </p>
        <button type="button" onClick={load} style={primaryBtnStyle}>
          Erneut versuchen
        </button>
      </div>
    );
  }
  if (!data) return <LoadingSpinner label="Wird geladen ..." />;

  const hasRevenue = data.revenueByMonth.some((r) => r.amountChf > 0);
  const hasGrowth = data.userGrowthByMonth.length > 0;
  const hasScans = data.scansByMonth.some((s) => s.scans > 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <ChartSection title="Umsatz">
        {data.revenueByMonth.length === 0 ? (
          <EmptyChartNote text="Noch keine Umsatzdaten vorhanden." />
        ) : (
          <>
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={revenueChartData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid stroke={colors.border} vertical={false} />
                <XAxis dataKey="month" tickFormatter={formatMonthShort} tick={{ fontSize: 11, fill: colors.textMuted }} />
                <YAxis tick={{ fontSize: 11, fill: colors.textMuted }} width={70} tickFormatter={(v: number) => formatChf(v)} />
                <Tooltip formatter={revenueTooltipFormatter} labelFormatter={tooltipLabelFormatter} />
                <Area type="monotone" dataKey="amountChf" name="Umsatz" stroke={colors.accent} fill={colors.accent} fillOpacity={0.15} strokeWidth={2} connectNulls={false} />
                <Line
                  type="monotone"
                  dataKey="forecastChf"
                  name="Prognose"
                  stroke={colors.gold}
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  dot={false}
                  connectNulls
                />
              </ComposedChart>
            </ResponsiveContainer>
            {!hasRevenue && <EmptyChartNote text="Bisher keine bezahlten Umsätze - Verlauf zeigt aktuell nur Nullen." />}
            {forecast && (
              <div style={{ fontSize: 11, opacity: 0.55, marginTop: 4 }}>
                Prognose für {formatMonthLong(forecast.month)}: {formatChf(forecast.amountChf)} - Grobe Schätzung
                (Trend der letzten Monate fortgeschrieben), kein Versprechen.
              </div>
            )}
          </>
        )}
      </ChartSection>

      <ChartSection title="Nutzerwachstum">
        {!hasGrowth ? (
          <EmptyChartNote text="Noch keine Nutzerdaten vorhanden." />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={data.userGrowthByMonth} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid stroke={colors.border} vertical={false} />
              <XAxis dataKey="month" tickFormatter={formatMonthShort} tick={{ fontSize: 11, fill: colors.textMuted }} />
              <YAxis yAxisId="left" tick={{ fontSize: 11, fill: colors.textMuted }} width={36} allowDecimals={false} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: colors.textMuted }} width={36} allowDecimals={false} />
              <Tooltip labelFormatter={tooltipLabelFormatter} />
              <Legend wrapperStyle={{ fontSize: 12 }} formatter={userGrowthLegendFormatter} />
              <Bar yAxisId="left" dataKey="newUsers" name="newUsers" fill={colors.gold} radius={[3, 3, 0, 0]} />
              <Line yAxisId="right" type="monotone" dataKey="totalUsers" name="totalUsers" stroke={colors.accent} strokeWidth={2} dot={{ r: 2 }} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </ChartSection>

      <ChartSection title="Scan-Nutzung (KI-Etikett-Erkennung)">
        {data.scansByMonth.length === 0 ? (
          <EmptyChartNote text="Noch keine Scan-Daten vorhanden." />
        ) : (
          <>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.scansByMonth} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid stroke={colors.border} vertical={false} />
                <XAxis dataKey="month" tickFormatter={formatMonthShort} tick={{ fontSize: 11, fill: colors.textMuted }} />
                <YAxis tick={{ fontSize: 11, fill: colors.textMuted }} width={36} allowDecimals={false} />
                <Tooltip labelFormatter={tooltipLabelFormatter} formatter={scansTooltipFormatter} />
                <Bar dataKey="scans" name="Scans" fill={colors.accent} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            {!hasScans && <EmptyChartNote text="Bisher wurde die KI-Etikett-Erkennung noch nicht genutzt." />}
          </>
        )}
      </ChartSection>

      <div>
        <h2 style={{ fontFamily: fontHeading, fontSize: 17, fontWeight: 600, color: colors.text, margin: '0 0 12px' }}>
          Jahresvergleich (Umsatz)
        </h2>
        {!yearComparison ? (
          <EmptyChartNote text="Noch keine Daten für einen Jahresvergleich." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
              <div style={cardStyle}>
                <div style={kickerStyle}>Dieses Jahr (bisher)</div>
                <div style={{ fontFamily: fontHeading, fontWeight: 600, fontSize: 22, marginTop: 4 }}>
                  {formatChf(yearComparison.thisYearTotal)}
                </div>
              </div>
              <div style={cardStyle}>
                <div style={kickerStyle}>Vorjahr (gleicher Zeitraum)</div>
                <div style={{ fontFamily: fontHeading, fontWeight: 600, fontSize: 22, marginTop: 4 }}>
                  {formatChf(yearComparison.lastYearTotal)}
                </div>
              </div>
              <div style={cardStyle}>
                <div style={kickerStyle}>Veränderung</div>
                <div
                  style={{
                    fontFamily: fontHeading,
                    fontWeight: 600,
                    fontSize: 22,
                    marginTop: 4,
                    color:
                      yearComparison.deltaPercent === null
                        ? colors.text
                        : yearComparison.deltaPercent >= 0
                          ? colors.success
                          : colors.danger,
                  }}
                >
                  {yearComparison.deltaPercent === null
                    ? '–'
                    : `${yearComparison.deltaPercent >= 0 ? '+' : ''}${yearComparison.deltaPercent.toFixed(1)} %`}
                </div>
              </div>
            </div>
            {yearComparison.incomplete && (
              <div style={{ fontSize: 11, opacity: 0.55 }}>
                Die Auswertung deckt nur ein rollierendes 13-Monats-Fenster ab - für weiter zurückliegende Monate
                fehlen ggf. Vorjahresdaten, der Vergleich kann daher unvollständig sein.
              </div>
            )}
          </div>
        )}
      </div>

      <div>
        <h2 style={{ fontFamily: fontHeading, fontSize: 17, fontWeight: 600, color: colors.text, margin: '0 0 12px' }}>
          Bericht exportieren
        </h2>
        <div style={{ ...cardStyle, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <select
            value={exportMonth}
            onChange={(e) => setExportMonth(e.target.value)}
            style={{ ...inputStyle, minWidth: 180 }}
          >
            {monthOptions.map((m) => (
              <option key={m} value={m}>
                {formatMonthLong(m)}
              </option>
            ))}
          </select>
          <button type="button" onClick={downloadReport} disabled={exportBusy} style={primaryBtnStyle}>
            {exportBusy ? 'Wird heruntergeladen ...' : 'Als CSV herunterladen'}
          </button>
          {exportError && <span style={{ color: colors.danger, fontSize: 13 }}>{exportError}</span>}
        </div>
      </div>
    </div>
  );
}
