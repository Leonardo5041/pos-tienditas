import { useEffect, useRef } from "react";

/**
 * Intercepts keyboard input from physical barcode scanners (USB/Bluetooth).
 * Scanners emulate a keyboard but type all chars in < 50ms + send Enter.
 * Fires onScan when a rapid burst of keys ending in Enter (or timeout) is detected.
 *
 * Skips when an input/textarea/select has focus so it doesn't interfere with forms.
 */
export function useGlobalScanner(
  onScan: (code: string) => void,
  enabled = true,
) {
  const callbackRef = useRef(onScan);
  const bufferRef   = useRef("");
  const lastKeyMs   = useRef(0);
  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { callbackRef.current = onScan; }, [onScan]);

  useEffect(() => {
    if (!enabled) return;

    const flush = () => {
      const code = bufferRef.current.trim();
      bufferRef.current = "";
      // Minimum 4 chars — avoids false positives from stray keypresses
      if (code.length >= 4) callbackRef.current(code);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't steal input from form fields
      const tag = (document.activeElement?.tagName ?? "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;

      if (e.key === "Escape") {
        bufferRef.current = "";
        if (timerRef.current) clearTimeout(timerRef.current);
        return;
      }

      if (e.key === "Enter") {
        if (timerRef.current) clearTimeout(timerRef.current);
        flush();
        return;
      }

      // Only accept printable single characters
      if (e.key.length !== 1) return;

      const now = Date.now();
      const gap = now - lastKeyMs.current;
      lastKeyMs.current = now;

      // Gap > 100ms → new sequence (human typing or first char of scan)
      if (gap > 100 && bufferRef.current.length > 0) {
        bufferRef.current = "";
      }

      bufferRef.current += e.key;

      // Auto-flush if scanner doesn't send Enter (some don't)
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, 100);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled]);
}
