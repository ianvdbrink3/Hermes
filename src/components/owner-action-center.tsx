"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./owner-action-center.module.css";

type RecordLike = Record<string, unknown>;
type AutonomyResponse = { connected?: boolean; snapshot?: RecordLike };

type ActionExplanation = {
  title: string;
  instruction: string;
  reason: string;
  consequence: string;
  note?: string;
};

function record(value: unknown): RecordLike {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordLike : {};
}

function text(value: unknown) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(String).join(" · ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value).replace(/\s+/g, " ").trim();
}

function gateIsClear(value: unknown) {
  const normalized = text(value).toLowerCase().replace(/[.!?;:,]+$/g, "").trim();
  return !normalized || [
    "none", "nothing", "geen", "n/a", "null", "no human gate", "no human action",
    "nothing required", "geen actie nodig", "no action required",
  ].includes(normalized);
}

function explainAction(gate: string, blockers: string): ActionExplanation {
  const source = `${gate} ${blockers}`.toLowerCase();

  if (
    source.includes("git author") || source.includes("author identity") || source.includes("author name") ||
    source.includes("author email") || source.includes("identity-bearing") || source.includes("git config user") ||
    (source.includes("commit") && (source.includes("name") || source.includes("email")))
  ) {
    return {
      title: "Kies de afzender voor autonome Git-checkpoints",
      instruction: "Hermes heeft een echte naam en e-mailadres nodig waarmee lokale Git-checkpoints worden ondertekend. Hij heeft die gegevens bewust niet zelf verzonnen.",
      reason: "Een Git-commit krijgt een auteur. Zelf een naam of e-mailadres bedenken zou de geschiedenis misleidend maken, daarom wacht Hermes hiervoor op jou.",
      consequence: "Zonder deze keuze kan Hermes andere veilige research blijven doen, maar een geverifieerde lokale checkpoint-commit kan blijven wachten.",
      note: "Dit geeft geen brokerrechten, geen live-tradingtoestemming en geen toestemming om naar productie te pushen.",
    };
  }

  if (source.includes("credential") || source.includes("api key") || source.includes("token") || source.includes("secret")) {
    return {
      title: "Hermes heeft toegang nodig tot een externe dienst",
      instruction: "Beslis eerst of je deze koppeling echt wilt. Voeg een credential alleen via de daarvoor bedoelde beveiligde instelling toe; plak geheime waarden niet in gewone chat, logs of Git.",
      reason: "Hermes mag credentials niet zelf verzinnen, opvragen uit andere bestanden of onbeheerd opslaan.",
      consequence: "Zonder toegang blijft alleen de taak die die externe dienst nodig heeft geblokkeerd; ander veilig onderzoek kan doorgaan.",
    };
  }

  if (source.includes("production") && (source.includes("promot") || source.includes("approval") || source.includes("approve"))) {
    return {
      title: "Beslis of een wijziging naar productie mag",
      instruction: "Bekijk eerst het bewijs en de controles van de kandidaat. Productiepromotie gebeurt pas na jouw expliciete goedkeuring.",
      reason: "Hermes mag zichzelf niet zelfstandig naar de productieomgeving promoveren.",
      consequence: "Zonder goedkeuring blijft de bestaande productieversie actief en kan research veilig doorgaan.",
    };
  }

  if (source.includes("broker") || source.includes("live execution") || source.includes("live trading") || source.includes("paper execution")) {
    return {
      title: "Beslis over uitvoerings- of brokerrechten",
      instruction: "Geef alleen toestemming als je deze stap bewust wilt activeren en alle veiligheidscontroles hebt beoordeeld. Standaard blijft uitvoering geblokkeerd.",
      reason: "Brokerbinding en financiële uitvoering zijn harde menselijke grenzen.",
      consequence: "Zonder toestemming blijft Hermes in researchmodus en worden geen orders geplaatst.",
    };
  }

  if (source.includes("permission") || source.includes("approval") || source.includes("human")) {
    return {
      title: "Hermes wacht op jouw toestemming",
      instruction: gate || "Bekijk de technische omschrijving hieronder om te zien welke expliciete toestemming Hermes nodig heeft.",
      reason: blockers || "Deze stap valt buiten de acties die Hermes zelfstandig mag uitvoeren.",
      consequence: "Alleen dit geblokkeerde onderdeel wacht; ander veilig werk mag waar mogelijk doorgaan.",
    };
  }

  return {
    title: "Bekijk de open menselijke blokkade",
    instruction: gate || "Hermes heeft een menselijke beslissing nodig voordat deze specifieke stap verder kan.",
    reason: blockers || "Hermes heeft deze stap als menselijke grens gemarkeerd.",
    consequence: "Andere veilige taken kunnen doorgaan, maar deze specifieke stap blijft wachten totdat jij beslist.",
  };
}

export function OwnerActionCenter() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [gate, setGate] = useState("");
  const [blockers, setBlockers] = useState("");
  const [objective, setObjective] = useState("");
  const [connected, setConnected] = useState(false);

  const load = useCallback(async () => {
    if (pathname === "/login") return;
    try {
      const response = await fetch("/api/brain/autonomy", { cache: "no-store" });
      const payload = await response.json() as AutonomyResponse;
      const snapshot = record(payload.snapshot);
      const current = record(snapshot.current);
      setConnected(Boolean(payload.connected));
      setGate(text(current.needs_human));
      setBlockers(text(current.blockers));
      setObjective(text(current.current_objective));
    } catch {
      setConnected(false);
    }
  }, [pathname]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const needsAction = connected && !gateIsClear(gate);
  const explanation = useMemo(() => explainAction(gate, blockers), [gate, blockers]);

  useEffect(() => {
    if (!needsAction || pathname === "/login") return;

    const cleanups: Array<() => void> = [];
    const bound = new WeakSet<Element>();

    function makeTrigger(element: HTMLElement, label: string) {
      if (bound.has(element)) return;
      bound.add(element);
      const onClick = (event: Event) => {
        event.preventDefault();
        setOpen(true);
      };
      const onKey = (event: KeyboardEvent) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setOpen(true);
        }
      };
      element.setAttribute("role", "button");
      element.setAttribute("tabindex", "0");
      element.setAttribute("aria-label", label);
      element.setAttribute("title", label);
      element.style.cursor = "pointer";
      element.addEventListener("click", onClick);
      element.addEventListener("keydown", onKey);
      cleanups.push(() => {
        element.removeEventListener("click", onClick);
        element.removeEventListener("keydown", onKey);
      });
    }

    function bindVisibleTriggers() {
      document.querySelectorAll("span").forEach((node) => {
        if (node.textContent?.trim() === "Jouw actie nodig") {
          const target = node.closest("div") as HTMLElement | null;
          if (target) makeTrigger(target, "Bekijk wat jij moet doen");
        }
      });

      document.querySelectorAll("article").forEach((node) => {
        const firstLabel = node.querySelector("span")?.textContent?.trim();
        const strong = node.querySelector("strong")?.textContent?.trim();
        if (firstLabel === "Jouw actie" && strong === "Actie nodig") {
          makeTrigger(node as HTMLElement, "Bekijk wat jij moet doen");
        }
      });

      document.querySelectorAll("p").forEach((node) => {
        if (node.textContent?.includes("Bekijk de details")) {
          node.textContent = "Er is een blokkade. Klik hier om te zien wat jij moet doen →";
          node.style.color = "#ff9aa1";
          node.style.textDecoration = "underline";
          node.style.textUnderlineOffset = "3px";
          makeTrigger(node as HTMLElement, "Bekijk de open actie");
        }
      });
    }

    bindVisibleTriggers();
    const observer = new MutationObserver(bindVisibleTriggers);
    observer.observe(document.body, { subtree: true, childList: true });

    return () => {
      observer.disconnect();
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [needsAction, pathname]);

  if (pathname === "/login" || !needsAction) return null;

  return <>
    <button className={styles.mobileAction} onClick={() => setOpen(true)}>
      <span>!</span><strong>Jouw actie nodig</strong><small>Bekijk wat Hermes van je nodig heeft</small>
    </button>

    {open && <div className={styles.backdrop} onMouseDown={() => setOpen(false)}>
      <aside className={styles.panel} onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="owner-action-title">
        <header className={styles.header}>
          <div><span>Jouw actie</span><h2 id="owner-action-title">{explanation.title}</h2></div>
          <button onClick={() => setOpen(false)} aria-label="Sluiten">×</button>
        </header>

        <div className={styles.body}>
          <section className={styles.primary}>
            <span>Wat moet je doen?</span>
            <p>{explanation.instruction}</p>
          </section>

          <section>
            <span>Waarom vraagt Hermes dit?</span>
            <p>{explanation.reason}</p>
          </section>

          <section>
            <span>Als je nu niets doet</span>
            <p>{explanation.consequence}</p>
          </section>

          {explanation.note && <div className={styles.safetyNote}>✓ {explanation.note}</div>}

          <details className={styles.details}>
            <summary>Technische bron bekijken</summary>
            <div><strong>Open menselijke gate</strong><pre>{gate || "Geen brontekst"}</pre></div>
            <div><strong>Blokkades</strong><pre>{blockers || "Geen aparte blokkadetekst"}</pre></div>
            <div><strong>Huidig onderzoek</strong><pre>{objective || "Geen objective geladen"}</pre></div>
          </details>
        </div>

        <footer className={styles.footer}>
          <Link href="/onderzoek" onClick={() => setOpen(false)}>Open onderzoek</Link>
          <button onClick={() => setOpen(false)}>Sluiten</button>
        </footer>
      </aside>
    </div>}
  </>;
}
