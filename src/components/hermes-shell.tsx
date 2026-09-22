import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./hermes-shell.module.css";

export type HermesSection = "overzicht" | "onderzoek" | "beslissingen" | "trading" | "instellingen";
export type HermesTone = "good" | "warn" | "bad" | "muted";

const nav: Array<{ section: HermesSection; href: string; label: string; icon: string }> = [
  { section: "overzicht", href: "/", label: "Overzicht", icon: "◫" },
  { section: "onderzoek", href: "/onderzoek", label: "Research", icon: "⌁" },
  { section: "beslissingen", href: "/beslissingen", label: "Beslissingen", icon: "◇" },
  { section: "trading", href: "/trading", label: "Trading", icon: "↗" },
];

const secondaryNav = [
  { href: "/instellingen/systeem", label: "System", icon: "◎" },
  { href: "/instellingen/geavanceerd", label: "Brain Studio", icon: "✦" },
  { href: "/instellingen", label: "Instellingen", icon: "⚙" },
];

function toneLabel(tone: HermesTone) {
  if (tone === "good") return "Healthy";
  if (tone === "warn") return "Attention";
  if (tone === "bad") return "Blocked";
  return "Unknown";
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
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <Link href="/" className={styles.brand}>
          <b>H</b>
          <span>
            <strong>Hermes</strong>
            <small>Investment OS</small>
          </span>
        </Link>

        <div className={styles.navLabel}>Workspace</div>
        <nav className={styles.nav} aria-label="Hoofdnavigatie">
          {nav.map((item) => (
            <Link
              key={item.section}
              href={item.href}
              className={active === item.section ? styles.active : ""}
            >
              <span className={styles.navIcon}>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className={styles.sidebarSpacer} />

        <div className={styles.navLabel}>System</div>
        <nav className={styles.nav + " " + styles.secondaryNav} aria-label="Systeemnavigatie">
          {secondaryNav.map((item) => (
            <Link key={item.href} href={item.href}>
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
          <p>{status || "Runtime status laden…"}</p>
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
              {active === "overzicht"
                ? "Overzicht"
                : active === "onderzoek"
                  ? "Research"
                  : active === "beslissingen"
                    ? "Beslissingen"
                    : active === "trading"
                      ? "Trading"
                      : "Instellingen"}
            </strong>
          </div>

          <div className={styles.topRight}>
            {status ? (
              <div className={styles.topStatus}>
                <i className={styles.dot + " " + styles["dot_" + statusTone]} />
                <span>{status}</span>
              </div>
            ) : null}
            <button type="button">Praat met Hermes</button>
            {actions}
          </div>
        </header>

        <main className={styles.main + (wide ? " " + styles.wide : "")}>{children}</main>
      </section>
    </div>
  );
}
