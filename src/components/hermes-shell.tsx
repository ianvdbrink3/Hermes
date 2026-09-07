import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./hermes-shell.module.css";

export type HermesSection = "overzicht" | "onderzoek" | "trading" | "instellingen";
export type HermesTone = "good" | "warn" | "bad" | "muted";

const nav: Array<{ section: HermesSection; href: string; label: string }> = [
  { section: "overzicht", href: "/", label: "Overzicht" },
  { section: "onderzoek", href: "/onderzoek", label: "Onderzoek" },
  { section: "trading", href: "/trading", label: "Trading" },
  { section: "instellingen", href: "/instellingen", label: "Instellingen" },
];

export function HermesShell({
  active,
  status,
  statusTone = "muted",
  actions,
  children,
  wide = false,
}: {
  active: HermesSection;
  status?: string;
  statusTone?: HermesTone;
  actions?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          <b>H</b>
          <span><strong>Hermes</strong><small>Investment OS</small></span>
        </Link>
        <nav className={styles.nav} aria-label="Hoofdnavigatie">
          {nav.map((item) => (
            <Link key={item.section} href={item.href} className={active === item.section ? styles.active : ""}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className={styles.right}>
          {status ? <div className={styles.status}><i className={`${styles.dot} ${styles[`dot_${statusTone}`]}`} /><span>{status}</span></div> : null}
          {actions}
        </div>
      </header>
      <main className={`${styles.main} ${wide ? styles.wide : ""}`}>{children}</main>
    </div>
  );
}
