"use client";
import { useEffect, useRef, type RefObject } from "react";

export function useDialogFocus(open: boolean, container: RefObject<HTMLElement | null>, close: () => void) {
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!open || !container.current) return;
    const previous = document.activeElement as HTMLElement | null;
    const element = container.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const controls = () => Array.from(element.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]')).filter(control => control.getClientRects().length > 0);
    (controls()[0] || element).focus();
    function keyboard(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); }
      if (event.key !== "Tab") return;
      const items = controls();
      if (!items.length) { event.preventDefault(); element.focus(); return; }
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || !element.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !element.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    }
    element.addEventListener("keydown", keyboard);
    return () => { element.removeEventListener("keydown", keyboard); document.body.style.overflow = previousOverflow; previous?.focus(); };
  }, [open, container]);
}
