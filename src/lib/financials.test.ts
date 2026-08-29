import { describe, expect, it } from 'vitest';
import { computeFinancialSummary } from './financials';

describe('computeFinancialSummary', () => {
  it('summiert nur bezahlte Zahlungsanfragen, nicht offene/stornierte', () => {
    const result = computeFinancialSummary(
      [
        { amount: 100, status: 'paid' },
        { amount: 50, status: 'open' },
        { amount: 30, status: 'cancelled' },
        { amount: 20, status: 'paid' },
      ],
      [],
      [],
    );
    expect(result.paidPaymentsTotal).toBe(120);
  });

  it('trennt einmalige und monatliche Kosten korrekt', () => {
    const result = computeFinancialSummary(
      [],
      [],
      [
        { amount: 10, recurrence: 'monatlich' },
        { amount: 200, recurrence: 'einmalig' },
        { amount: 15, recurrence: 'monatlich' },
      ],
    );
    expect(result.monthlyCostsTotal).toBe(25);
    expect(result.oneTimeCostsTotal).toBe(200);
  });

  it('Gewinn/Verlust = bezahlte Zahlungen + manuelle Einnahmen - einmalige Kosten (laufende Kosten NICHT eingerechnet)', () => {
    const result = computeFinancialSummary(
      [{ amount: 500, status: 'paid' }],
      [{ amount: 100 }],
      [
        { amount: 50, recurrence: 'einmalig' },
        { amount: 9999, recurrence: 'monatlich' }, // darf das Ergebnis NICHT beeinflussen
      ],
    );
    expect(result.incomeTotal).toBe(600);
    expect(result.profitLoss).toBe(550); // 600 - 50, die 9999 laufenden Kosten bleiben aussen vor
  });

  it('liefert 0 bei komplett leeren Daten, kein Fehler', () => {
    const result = computeFinancialSummary([], [], []);
    expect(result).toEqual({
      paidPaymentsTotal: 0,
      manualIncomeTotal: 0,
      incomeTotal: 0,
      oneTimeCostsTotal: 0,
      monthlyCostsTotal: 0,
      profitLoss: 0,
    });
  });
});
