import { describe, expect, it } from 'vitest';
import {
  csvEscape,
  currentMonthKey,
  formatMonthlyReportCsv,
  getLast13Months,
  isCostActiveInMonth,
  isImplausibleFutureVintage,
  isImplausiblePrice,
  isValidMonthKey,
  looksLikeProducerName,
  monthKeyFromIso,
  stripDiacritics,
} from './reports.js';

describe('looksLikeProducerName', () => {
  it('erkennt typische Produzenten-Praefixe', () => {
    expect(looksLikeProducerName('Chateau Margaux')).toBe(true);
    expect(looksLikeProducerName('Domaine de la Romanee-Conti')).toBe(true);
    expect(looksLikeProducerName('Weingut Knoll')).toBe(true);
  });

  it('ignoriert Gross-/Kleinschreibung und Umlaute', () => {
    expect(looksLikeProducerName('WEINGÜTER Sowieso')).toBe(true);
  });

  it('erkennt normale Weinnamen nicht faelschlich', () => {
    expect(looksLikeProducerName('Orma')).toBe(false);
    expect(looksLikeProducerName('Sassicaia')).toBe(false);
  });
});

describe('stripDiacritics', () => {
  it('entfernt Akzente/Umlaute fuer den Vergleich', () => {
    expect(stripDiacritics('Weingüter')).toBe('Weinguter');
  });
});

describe('isImplausibleFutureVintage', () => {
  it('erlaubt den naechsten Jahrgang (en primeur/Subskription)', () => {
    expect(isImplausibleFutureVintage(2027, 2026)).toBe(false);
  });

  it('markiert einen Jahrgang mehr als ein Jahr in der Zukunft', () => {
    expect(isImplausibleFutureVintage(2029, 2026)).toBe(true);
  });

  it('ignoriert fehlenden Jahrgang', () => {
    expect(isImplausibleFutureVintage(null, 2026)).toBe(false);
  });
});

describe('isImplausiblePrice', () => {
  it('markiert negative Preise', () => {
    expect(isImplausiblePrice(-5)).toBe(true);
  });

  it('markiert absurd hohe Preise (vermutlich Zahlendreher)', () => {
    expect(isImplausiblePrice(500_000)).toBe(true);
  });

  it('laesst echte, auch teure Weine unbeanstandet', () => {
    expect(isImplausiblePrice(0)).toBe(false);
    expect(isImplausiblePrice(45)).toBe(false);
    expect(isImplausiblePrice(4000)).toBe(false); // seltene Spitzenweine koennen so viel kosten
  });

  it('ignoriert fehlenden Preis', () => {
    expect(isImplausiblePrice(null)).toBe(false);
  });
});

describe('monthKeyFromIso', () => {
  it('extrahiert "YYYY-MM" aus einem ISO-Zeitstempel mit Z', () => {
    expect(monthKeyFromIso('2026-01-15T10:23:00.000Z')).toBe('2026-01');
  });

  it('extrahiert "YYYY-MM" aus einem ISO-Zeitstempel mit Offset', () => {
    expect(monthKeyFromIso('2026-12-31T23:59:59+00:00')).toBe('2026-12');
  });
});

describe('currentMonthKey', () => {
  it('liefert den UTC-Monat des uebergebenen Datums', () => {
    expect(currentMonthKey(new Date('2026-09-12T08:00:00.000Z'))).toBe('2026-09');
  });
});

describe('isValidMonthKey', () => {
  it('akzeptiert gueltige "YYYY-MM"-Werte', () => {
    expect(isValidMonthKey('2026-01')).toBe(true);
    expect(isValidMonthKey('2026-12')).toBe(true);
  });

  it('lehnt fehlerhafte Werte ab', () => {
    expect(isValidMonthKey('2026-13')).toBe(false);
    expect(isValidMonthKey('2026-00')).toBe(false);
    expect(isValidMonthKey('2026-1')).toBe(false);
    expect(isValidMonthKey('26-01')).toBe(false);
    expect(isValidMonthKey('nicht-ein-monat')).toBe(false);
  });
});

describe('getLast13Months', () => {
  it('liefert 13 Monate, aeltester zuerst, endet im aktuellen Monat', () => {
    const months = getLast13Months(new Date('2026-09-12T08:00:00.000Z'));
    expect(months).toHaveLength(13);
    expect(months[0]).toBe('2025-09');
    expect(months[12]).toBe('2026-09');
  });

  it('rechnet ueber einen Jahreswechsel hinweg korrekt', () => {
    const months = getLast13Months(new Date('2026-02-15T08:00:00.000Z'));
    expect(months[0]).toBe('2025-02');
    expect(months).toContain('2025-12');
    expect(months).toContain('2026-01');
    expect(months[12]).toBe('2026-02');
  });
});

describe('isCostActiveInMonth', () => {
  it('zaehlt eine "monatlich" laufende Kosten ab ihrem Erstellungsmonat', () => {
    const cost = { createdAt: '2026-03-10T00:00:00.000Z', recurrence: 'monatlich' };
    expect(isCostActiveInMonth(cost, '2026-03')).toBe(true);
    expect(isCostActiveInMonth(cost, '2026-06')).toBe(true);
  });

  it('zaehlt eine "monatlich" laufende Kosten NICHT vor ihrem Erstellungsmonat', () => {
    const cost = { createdAt: '2026-03-10T00:00:00.000Z', recurrence: 'monatlich' };
    expect(isCostActiveInMonth(cost, '2026-02')).toBe(false);
  });

  it('zaehlt eine "einmalig"e Kosten nur im Erstellungsmonat', () => {
    const cost = { createdAt: '2026-03-10T00:00:00.000Z', recurrence: 'einmalig' };
    expect(isCostActiveInMonth(cost, '2026-03')).toBe(true);
    expect(isCostActiveInMonth(cost, '2026-04')).toBe(false);
    expect(isCostActiveInMonth(cost, '2026-02')).toBe(false);
  });
});

describe('csvEscape', () => {
  it('laesst einfache Zahlen und Labels unveraendert', () => {
    expect(csvEscape(42)).toBe('42');
    expect(csvEscape('Umsatz (CHF)')).toBe('Umsatz (CHF)');
  });

  it('setzt Werte mit Komma in Anfuehrungszeichen', () => {
    expect(csvEscape('a,b')).toBe('"a,b"');
  });

  it('escaped enthaltene Anfuehrungszeichen', () => {
    expect(csvEscape('Sagt "Hallo"')).toBe('"Sagt ""Hallo"""');
  });
});

describe('formatMonthlyReportCsv', () => {
  it('baut eine CSV mit Kopfzeile und einer Zeile pro Kennzahl', () => {
    const csv = formatMonthlyReportCsv({
      month: '2026-01',
      revenueChf: 123.45,
      costsChf: 50,
      incomeChf: 10,
      netProfitChf: 83.45,
      newUsers: 3,
      scans: 45,
    });
    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe('Kennzahl,Wert');
    expect(lines).toContain('Monat,2026-01');
    expect(lines).toContain('Umsatz (CHF),123.45');
    expect(lines).toContain('Nettogewinn (CHF),83.45');
    expect(lines).toContain('Neue Nutzer,3');
    expect(lines).toContain('Scans,45');
  });
});
