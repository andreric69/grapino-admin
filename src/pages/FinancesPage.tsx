import { useEffect, useState } from 'react';
import { colors, fontHeading } from '../theme';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { fetchFinancialSummary, type FinancialSummary } from '../lib/financials';
import { PricingPage } from './PricingPage';
import { IncomePage } from './IncomePage';
import { CostsPage } from './CostsPage';

function ProfitLossSummary() {
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchFinancialSummary()
      .then(setSummary)
      .catch(() => setError('Gewinn/Verlust konnte nicht berechnet werden.'));
  }, []);

  if (error) return <p style={{ color: colors.danger }}>{error}</p>;
  if (!summary) return <LoadingSpinner label="Wird geladen ..." />;

  const inPlus = summary.profitLoss >= 0;

  return (
    <div
      style={{
        border: `1px solid ${colors.border}`,
        borderRadius: 8,
        padding: 16,
        background: inPlus ? 'rgba(30, 125, 50, 0.06)' : 'rgba(179, 38, 30, 0.06)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, opacity: 0.65 }}>Gewinn/Verlust (kumuliert, seit Start)</span>
        <span style={{ fontSize: 26, fontWeight: 700, color: inPlus ? colors.success : colors.danger }}>
          {inPlus ? '+' : ''}
          {summary.profitLoss.toFixed(2)} CHF
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginTop: 12, fontSize: 12.5 }}>
        <div>
          <div style={{ opacity: 0.6 }}>Einnahmen gesamt</div>
          <div style={{ fontWeight: 600 }}>{summary.incomeTotal.toFixed(2)} CHF</div>
        </div>
        <div>
          <div style={{ opacity: 0.6 }}>davon bezahlte Anfragen</div>
          <div style={{ fontWeight: 600 }}>{summary.paidPaymentsTotal.toFixed(2)} CHF</div>
        </div>
        <div>
          <div style={{ opacity: 0.6 }}>davon manuell erfasst</div>
          <div style={{ fontWeight: 600 }}>{summary.manualIncomeTotal.toFixed(2)} CHF</div>
        </div>
        <div>
          <div style={{ opacity: 0.6 }}>Einmalige Kosten</div>
          <div style={{ fontWeight: 600 }}>-{summary.oneTimeCostsTotal.toFixed(2)} CHF</div>
        </div>
      </div>
      <div style={{ fontSize: 11.5, opacity: 0.6, marginTop: 10, borderTop: `1px solid ${colors.border}`, paddingTop: 8 }}>
        Laufende Kosten: {summary.monthlyCostsTotal.toFixed(2)} CHF/Monat (nicht in obiger Summe enthalten - kein
        erfasstes Startdatum pro Kostenposten, daher hier nur als Orientierung statt hochgerechnet).
      </div>
    </div>
  );
}

/** Preise (was Kunden zahlen), Einnahmen und Kosten (was der Betrieb kostet) auf einer Seite - inkl. Gewinn/Verlust-Uebersicht. */
export function FinancesPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <div>
        <h2 style={{ fontFamily: fontHeading, fontSize: 17, fontWeight: 600, color: colors.text, margin: '0 0 12px' }}>
          Gewinn/Verlust
        </h2>
        <ProfitLossSummary />
      </div>
      <div>
        <h2 style={{ fontFamily: fontHeading, fontSize: 17, fontWeight: 600, color: colors.text, margin: '0 0 12px' }}>
          Preise (was Kunden zahlen)
        </h2>
        <PricingPage />
      </div>
      <div>
        <h2 style={{ fontFamily: fontHeading, fontSize: 17, fontWeight: 600, color: colors.text, margin: '0 0 12px' }}>
          Einnahmen (manuell, ausserhalb der App-Zahlungsanfragen)
        </h2>
        <IncomePage />
      </div>
      <div>
        <h2 style={{ fontFamily: fontHeading, fontSize: 17, fontWeight: 600, color: colors.text, margin: '0 0 12px' }}>
          Kosten (was der Betrieb kostet)
        </h2>
        <CostsPage />
      </div>
    </div>
  );
}
