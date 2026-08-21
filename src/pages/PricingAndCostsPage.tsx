import { colors, fontHeading } from '../theme';
import { PricingPage } from './PricingPage';
import { CostsPage } from './CostsPage';

/** Preise (was Kunden zahlen) und Kosten (was der Betrieb kostet) auf einer Seite - beides gehoert fuer die Kalkulation zusammen. */
export function PricingAndCostsPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <div>
        <h2 style={{ fontFamily: fontHeading, fontSize: 17, fontWeight: 600, color: colors.text, margin: '0 0 12px' }}>
          Preise (was Kunden zahlen)
        </h2>
        <PricingPage />
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
