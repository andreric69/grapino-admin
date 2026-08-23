import { apiFetch } from './apiClient';

export interface FinancialSummary {
  paidPaymentsTotal: number;
  manualIncomeTotal: number;
  incomeTotal: number;
  oneTimeCostsTotal: number;
  monthlyCostsTotal: number;
  profitLoss: number;
}

/**
 * Gewinn/Verlust = alle bisher bezahlten Zahlungsanfragen (Zugangsgebuehren +
 * Auftraege) + manuell erfasste Einnahmen, minus einmalige Kosten. Laufende
 * Kosten (monatlich) werden bewusst NICHT in die kumulierte Rechnung
 * eingerechnet - ohne erfasstes Start-/Laufzeit-Datum pro Kostenposten waere
 * eine Hochrechnung reine Spekulation. Stattdessen werden sie separat als
 * "CHF/Monat laufend" angezeigt, damit trotzdem sichtbar ist, was regelmaessig
 * abgeht.
 */
export async function fetchFinancialSummary(): Promise<FinancialSummary> {
  const [paymentsRes, incomeRes, costsRes] = await Promise.all([
    apiFetch('/api/commerce?resource=payments'),
    apiFetch('/api/reports?resource=income'),
    apiFetch('/api/reports?resource=costs'),
  ]);
  if (!paymentsRes.ok || !incomeRes.ok || !costsRes.ok) {
    throw new Error('Finanz-Kennzahlen konnten nicht geladen werden.');
  }

  const payments = ((await paymentsRes.json()) as { paymentRequests: { amount: number; status: string }[] }).paymentRequests;
  const income = ((await incomeRes.json()) as { income: { amount: number }[] }).income;
  const costs = ((await costsRes.json()) as { costs: { amount: number; recurrence: string }[] }).costs;

  const paidPaymentsTotal = payments.filter((p) => p.status === 'paid').reduce((s, p) => s + p.amount, 0);
  const manualIncomeTotal = income.reduce((s, i) => s + i.amount, 0);
  const oneTimeCostsTotal = costs.filter((c) => c.recurrence === 'einmalig').reduce((s, c) => s + c.amount, 0);
  const monthlyCostsTotal = costs.filter((c) => c.recurrence === 'monatlich').reduce((s, c) => s + c.amount, 0);
  const incomeTotal = paidPaymentsTotal + manualIncomeTotal;

  return {
    paidPaymentsTotal,
    manualIncomeTotal,
    incomeTotal,
    oneTimeCostsTotal,
    monthlyCostsTotal,
    profitLoss: incomeTotal - oneTimeCostsTotal,
  };
}
