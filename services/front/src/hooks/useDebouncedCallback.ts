import { useCallback, useEffect, useRef } from "react";

/**
 * Trailing-edge Debounce. Bündelt schnell aufeinanderfolgende Aufrufe; nur die
 * letzten Argumente feuern nach `delay` ms Ruhe. `flush()` führt einen ausstehenden
 * Aufruf sofort aus (auch beim Unmount), damit der letzte Wert nicht verloren geht.
 */
export function useDebouncedCallback<A extends unknown[]>(
  fn: (...args: A) => void,
  delay: number,
) {
  const fnRef = useRef(fn);
  fnRef.current = fn; // immer die aktuellste Closure aufrufen (frische onRated/argument)

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<A | null>(null);

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (pending.current) {
      const a = pending.current;
      pending.current = null;
      fnRef.current(...a);
    }
  }, []);

  const debounced = useCallback(
    (...args: A) => {
      pending.current = args;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, delay);
    },
    [delay, flush],
  );

  useEffect(() => () => flush(), [flush]); // beim Unmount flushen → letzten Wert nicht verwerfen

  return { debounced, flush };
}
