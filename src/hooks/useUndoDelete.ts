import { useCallback, useEffect, useRef, useState } from 'react';

// Zeitfenster, in dem ein geloeschter Eintrag per "Rueckgaengig" wiederhergestellt
// werden kann, bevor der DELETE-Request tatsaechlich rausgeht.
const UNDO_DELAY_MS = 6000;

interface PendingDelete<T> {
  id: string;
  item: T;
  timer: ReturnType<typeof setTimeout>;
}

interface UndoToastState {
  id: string;
  label: string;
}

/**
 * Gemeinsame "Optimistisch loeschen + Rueckgaengig-Toast" Logik fuer Kosten-
 * und Einnahmen-Listen (ersetzt window.confirm()). Jeder Eintrag bekommt
 * seinen eigenen Timer: wird waehrend eines Toasts ein zweiter Eintrag
 * geloescht, laeuft der erste Timer im Hintergrund unbeeinflusst weiter -
 * es wird immer nur der zuletzt ausgeloeste Toast angezeigt.
 */
export function useUndoDelete<T>(commitDelete: (item: T) => Promise<void>) {
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<UndoToastState | null>(null);
  const pendingRef = useRef<Map<string, PendingDelete<T>>>(new Map());

  // Beim Verlassen der Seite mit noch offenem Toast: Loeschung sofort
  // nachholen statt sie stillschweigend zu verlieren (die Zeile ist ja
  // bereits optisch ausgeblendet).
  useEffect(() => {
    const pending = pendingRef.current;
    return () => {
      pending.forEach((p) => {
        clearTimeout(p.timer);
        void commitDelete(p.item);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scheduleDelete = useCallback(
    (id: string, label: string, item: T) => {
      // Schutz gegen doppeltes Ausloesen (z.B. schneller Doppelklick, bevor
      // die Zeile durch das State-Update ausgeblendet wird) - sonst wuerde
      // ein zweiter Timer fuer dieselbe id gestartet und der DELETE-Call
      // doppelt rausgehen.
      if (pendingRef.current.has(id)) return;
      setHiddenIds((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      const timer = setTimeout(() => {
        pendingRef.current.delete(id);
        void commitDelete(item).finally(() => {
          setToast((current) => (current?.id === id ? null : current));
        });
      }, UNDO_DELAY_MS);
      pendingRef.current.set(id, { id, item, timer });
      setToast({ id, label });
    },
    [commitDelete],
  );

  const undo = useCallback((id: string) => {
    const pending = pendingRef.current.get(id);
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingRef.current.delete(id);
    setHiddenIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setToast((current) => (current?.id === id ? null : current));
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToast((current) => (current?.id === id ? null : current));
  }, []);

  const isHidden = useCallback((id: string) => hiddenIds.has(id), [hiddenIds]);

  return { isHidden, toast, scheduleDelete, undo, dismissToast };
}
