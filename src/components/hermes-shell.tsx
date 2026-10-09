"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import styles from "./hermes-shell.module.css";

export type HermesSection = "overzicht" | "onderzoek" | "beslissingen" | "trading" | "instellingen";
export type HermesTone = "good" | "warn" | "bad" | "muted";

const nav: Array<{ section: HermesSection; href: string; label: string; icon: string }> = [
  { section: "overzicht", href: "/", label: "Overzicht", icon: "◫" },
  { section: "onderzoek", href: "/onderzoek", label: "Onderzoek", icon: "⌁" },
  { section: "beslissingen", href: "/beslissingen", label: "Jouw acties", icon: "◇" },
  { section: "trading", href: "/trading", label: "Trading", icon: "↗" },
];

const secondaryNav = [
  { href: "/analyses", label: "Uitgebreide analyses", icon: "≡" },
  { href: "/instellingen/systeem", label: "Systeemstatus", icon: "◎" },
  { href: "/instellingen/geavanceerd", label: "Hermes verbeteren", icon: "✦" },
  { href: "/instellingen", label: "Instellingen", icon: "⚙" },
];

function toneLabel(tone: HermesTone) {
  if (tone === "good") return "Actueel";
  if (tone === "warn") return "Aandacht";
  if (tone === "bad") return "Controle nodig";
  return "Onbekend";
}

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
  const pathname = usePathname();
  const currentLabel = [...nav, ...secondaryNav].find(item => item.href === pathname)?.label || "Hermes";
  return (
    <div className={styles.shell}>
      <a className={styles.skip} href="#hermes-content">Ga naar inhoud</a>
      <aside className={styles.sidebar}>
        <Link href="/" className={styles.brand}>
          <b>H</b>
          <span>
            <strong>Hermes</strong>
            <small>Beleggingsomgeving</small>
          </span>
        </Link>

        <div className={styles.navLabel}>Dagelijks</div>
        <nav className={styles.nav} aria-label="Hoofdnavigatie">
          {nav.map((item) => (
            <Link
              key={item.section}
              href={item.href}
              aria-current={pathname === item.href ? "page" : undefined}
              title={item.label}
              className={pathname === item.href ? styles.active : ""}
            >
              <span className={styles.navIcon}>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className={styles.sidebarSpacer} />

        <div className={styles.navLabel}>Beheer</div>
        <nav className={styles.nav + " " + styles.secondaryNav} aria-label="Systeemnavigatie">
          {secondaryNav.map((item) => (
            <Link key={item.href} href={item.href} title={item.label} aria-current={pathname === item.href ? "page" : undefined} className={pathname === item.href ? styles.active : ""}>
              <span className={styles.navIcon}>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className={styles.sidebarStatus}>
          <div className={styles.statusHeader}>
            <i className={styles.dot + " " + styles["dot_" + statusTone]} />
            <strong>{toneLabel(statusTone)}</strong>
          </div>
          <p>{status || "Systeemstatus laden…"}</p>
        </div>
      </aside>

      <section className={styles.workspace}>
        <header className={styles.topbar}>
          <div className={styles.mobileBrand}>
            <Link href="/">H</Link>
          </div>
          <div className={styles.breadcrumb}>
            <span>Hermes</span>
            <b>/</b>
            <strong>
              {currentLabel}
            </strong>
          </div>

          <div className={styles.topRight}>
            {status ? (
              <div className={styles.topStatus}>
                <i className={styles.dot + " " + styles["dot_" + statusTone]} />
                <span>{status}</span>
              </div>
            ) : null}
            <button type="button" onClick={() => window.dispatchEvent(new Event("hermes:open-chat"))}>Praat met Hermes</button>
            {actions}
          </div>
        </header>

        <main id="hermes-content" tabIndex={-1} className={styles.main + (wide ? " " + styles.wide : "")}>{children}</main>
      </section>
      <nav className={styles.mobileNav} aria-label="Mobiele hoofdnavigatie">
        {[...nav, { section: "instellingen", href: "/instellingen", label: "Instellingen", icon: "⚙" }].map(item => <Link key={item.href} href={item.href} aria-current={pathname === item.href ? "page" : undefined}><span aria-hidden="true">{item.icon}</span><span>{item.label}</span></Link>)}
      </nav>
    </div>
  );
}
