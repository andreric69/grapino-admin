import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/apiClient';
import { cardStyle, colors } from '../theme';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';

interface DataQualityFlag {
  source: 'wines' | 'wine_knowledge_cache';
  id: string;
  name: string;
  producer: string | null;
  vintage: number | null;
  email: string | null;
  reason: 'missing_producer_looks_like_name';
}

const REASON_LABELS: Record<DataQualityFlag['reason'], string> = {
  missing_producer_looks_like_name: 'Produzent-Feld leer, Name sieht wie ein Produzentenname aus',
};

/**
 * Rein informativ - listet Verdachtsfaelle auf, in denen der Produzent beim
 * Import/Scan vermutlich versehentlich ins Namensfeld gerutscht ist, aendert
 * aber NIE selbst etwas (siehe Standing-Regel: Name/Produzent nie ohne
 * gruendliche Verifikation aendern). Absichtlich NICHT geprueft: "Name ==
 * Produzent" - das ist bei vielen hochwertigen Weinen (nicht nur Bordeaux-
 * Chateaux) die korrekte Namensgebung fuer ein Flaggschiff-/Monopol-Gewaechs,
 * kein Datenfehler (siehe buildDataQuality() in api/reports.ts). Der
 * "wine_knowledge_cache"-Teil betrifft die geteilte Referenzdatenbank, nicht
 * die Weine eines einzelnen Nutzers - eine Korrektur dort wirkt sich erst
 * beim naechsten erledigten Aktualisierungs-Auftrag fuer den betroffenen
 * Wein aus.
 */
export function DataQualityPage() {
  const [flags, setFlags] = useState<DataQualityFlag[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch('/api/reports?resource=data-quality').then(async (res) => {
      if (!res.ok) {
        setError('Datenqualitaet konnte nicht geprueft werden.');
        return;
      }
      const data = (await res.json()) as { flags: DataQualityFlag[] };
      setFlags(data.flags);
    });
  }, []);

  if (error) return <p style={{ color: colors.danger }}>{error}</p>;
  if (!flags) return <LoadingSpinner label="Wird geprueft ..." />;

  const wineFlags = flags.filter((f) => f.source === 'wines');
  const cacheFlags = flags.filter((f) => f.source === 'wine_knowledge_cache');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <p style={{ fontSize: 12, opacity: 0.6, margin: 0 }}>
        Automatische Verdachtsliste fuer moeglicherweise vertauschte Name/Produzent-Felder (z.B. aus einem
        CSV-Import oder einer Etikett-Erkennung). Nur ein Hinweis zum Pruefen - hier wird nichts automatisch
        geaendert.
      </p>

      {flags.length === 0 && <EmptyState icon="✅" text="Keine Verdachtsfaelle gefunden." />}

      {wineFlags.length > 0 && (
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 10px' }}>Weine einzelner Nutzer ({wineFlags.length})</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {wineFlags.map((f) => (
              <div key={f.id} style={cardStyle}>
                <div style={{ fontSize: 14 }}>
                  <strong>{f.name}</strong>
                  {f.producer && <span> / {f.producer}</span>}
                  {f.vintage && <span> {f.vintage}</span>}
                </div>
                <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>
                  {f.email ?? 'Unbekannt'} · {REASON_LABELS[f.reason]}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {cacheFlags.length > 0 && (
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 10px' }}>
            Geteilter Wissens-Cache ({cacheFlags.length})
          </h3>
          <p style={{ fontSize: 11.5, opacity: 0.55, margin: '0 0 8px' }}>
            Name hier kleingeschrieben (technischer Schluessel, keine Original-Schreibweise gespeichert).
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {cacheFlags.map((f) => (
              <div key={f.id} style={cardStyle}>
                <div style={{ fontSize: 14 }}>
                  <strong>{f.name}</strong>
                  {f.producer && <span> / {f.producer}</span>}
                  {f.vintage && <span> {f.vintage}</span>}
                </div>
                <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>{REASON_LABELS[f.reason]}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
