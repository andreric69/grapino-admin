import { describe, expect, it } from 'vitest';
import { isImplausibleFutureVintage, isImplausiblePrice, looksLikeProducerName, stripDiacritics } from './reports.js';

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
