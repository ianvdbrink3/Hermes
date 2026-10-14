"use client";
import { useId, type ReactNode, type KeyboardEvent } from "react";
import styles from "./view-tabs.module.css";

export function ViewTabs({ items, active, onChange, children }: {
  items: readonly string[]; active: string; onChange: (value: string) => void; children: ReactNode;
}) {
  const id = useId();
  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % items.length;
    else if (event.key === "ArrowLeft") next = (index + items.length - 1) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else return;
    event.preventDefault(); onChange(items[next]);
    document.getElementById(`${id}-tab-${next}`)?.focus();
  }
  const index = items.indexOf(active);
  return <>
    <div className={styles.tabs} role="tablist" aria-label="Weergave">
      {items.map((item, i) => <button key={item} id={`${id}-tab-${i}`} role="tab" type="button" aria-selected={active === item} aria-controls={`${id}-panel`} tabIndex={active === item ? 0 : -1} onClick={() => onChange(item)} onKeyDown={event => navigate(event, i)}>{item}</button>)}
    </div>
    <section id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${index}`} tabIndex={0} className={styles.panel}>{children}</section>
  </>;
}
