"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./owner-action-center.module.css";

type RecordLike = Record<string, unknown>;
type AutonomyResponse = { connected?: boolean; snapshot?: RecordLike };
type BrainRun = { run_id?: string; status?: string; output?: string; error?: string };

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

function isGitAuthorGate(gate: string, blockers: string) {
  const source = `${gate} ${blockers}`.toLowerCase();
  return (
    source.includes("git author") || source.includes("author identity") || source.includes("author name") ||
    source.includes("author email") || source.includes("identity-bearing") || source.includes("git config user") ||
    (source.includes("commit") && (source.includes("name") || source.includes("email")))
  );
}

function explainAction(gate: string, blockers: string): ActionExplanation {
  const source = `${gate} ${blockers}`.toLowerCase();

  if (isGitAuthorGate(gate, blockers)) {
    return {
      title: "Kies de afzender voor autonome Git-checkpoints",
      instruction: "Hermes heeft een echte naam en e-mailadres nodig waarmee lokale Git-checkpoints worden ondertekend. Je kunt dit hieronder rechtstreeks in het OS controleren of instellen.",
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

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function OwnerActionCenter() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [gate, setGate] = useState("");
  const [blockers, setBlockers] = useState("");
  const [objective, setObjective] = useState("");
  const [connected, setConnected] = useState(false);
  const [authorName, setAuthorName] = useState("");
  const [authorEmail, setAuthorEmail] = useState("");
  const [resolving, setResolving] = useState(false);
  const [resolutionMessage, setResolutionMessage] = useState("");
  const [resolutionError, setResolutionError] = useState("");

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
  const gitAuthorAction = isGitAuthorGate(gate, blockers);
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

  async function resolveGitAuthor(mode: "verify" | "set") {
    if (resolving) return;
    const name = authorName.trim();
    const email = authorEmail.trim();
    if (mode === "set" && (!name || !validEmail(email))) {
      setResolutionError("Vul een naam en een geldig e-mailadres in.");
      return;
    }

    setResolving(true);
    setResolutionError("");
    setResolutionMessage(mode === "verify" ? "Hermes controleert de bestaande repository-instelling…" : "Hermes stelt de repository-afzender in en controleert hem…");

    const identityInstruction = mode === "verify"
      ? "Do not change the existing Git identity. Verify only that repository-local git config user.name and user.email are both present and non-empty."
      : `Set repository-local Git author identity exactly to user.name=${JSON.stringify(name)} and user.email=${JSON.stringify(email)}. Do not use --global.`;

    const prompt = `OWNER HUMAN GATE RESOLUTION — GIT AUTHOR ONLY.\n\nWork only in the Hermes investment-machine repository associated with this research profile.\n\n${identityInstruction}\n\nAfter that:\n1. Verify with repository-local git config that both user.name and user.email are non-empty.\n2. Do not reveal credentials or tokens. The supplied author name/email are identity metadata, not credentials.\n3. Do not push anything, do not enable broker access, do not enable paper/live trading, do not change production, and do not weaken any risk control.\n4. If and only if the repository-local Git author is now valid, update state/autonomy/CURRENT.md so the Git-author human gate is cleared (NEEDS HUMAN: None.) and remove only the Git-author-related blocker. Preserve unrelated blockers, the current objective, NEXT, and evidence.\n5. Do not invent or overwrite unrelated state.\n6. Return exactly one final marker: GIT_AUTHOR_RESOLVED if verified and CURRENT.md was updated; otherwise GIT_AUTHOR_NOT_RESOLVED with the reason.\n\nThis is a narrow human-gate resolution, not an investment research task.`;

    try {
      const startedResponse = await fetch("/api/brain/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: prompt,
          environment: "research",
          session_id: "owner-action-git-author",
        }),
      });
      const started = await startedResponse.json() as BrainRun;
      if (!startedResponse.ok || started.error || !started.run_id) {
        throw new Error(started.error || "Hermes kon de controle niet starten.");
      }

      let run = started;
      for (let attempt = 0; attempt < 120; attempt += 1) {
        if (["completed", "failed", "cancelled", "stopped"].includes(String(run.status).toLowerCase())) break;
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
        const poll = await fetch(`/api/brain/runs/${encodeURIComponent(started.run_id)}?environment=research`, { cache: "no-store" });
        run = await poll.json() as BrainRun;
        if (!poll.ok) throw new Error(run.error || "De status van de controle kon niet worden gelezen.");
      }

      if (String(run.status).toLowerCase() !== "completed") {
        throw new Error(run.error || `De controle eindigde met status ${run.status || "onbekend"}.`);
      }

      const output = text(run.output);
      if (!output.includes("GIT_AUTHOR_RESOLVED")) {
        throw new Error(output || "Hermes kon de Git-afzender niet bevestigen.");
      }

      setResolutionMessage("✓ Git-afzender is geverifieerd. Hermes werkt de open actie nu bij.");
      for (let attempt = 0; attempt < 8; attempt += 1) {
        await load();
        await new Promise((resolve) => window.setTimeout(resolve, 1200));
      }
      await load();
    } catch (error) {
      setResolutionMessage("");
      setResolutionError(error instanceof Error ? error.message : "De actie kon niet worden opgelost.");
    } finally {
      setResolving(false);
    }
  }

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

          {gitAuthorAction && <section className={styles.actionForm}>
            <span>Direct oplossen in het OS</span>
            <p className={styles.formIntro}>Heb je dit eerder al ingesteld? Laat Hermes eerst controleren. Alleen als de instelling ontbreekt hoef je naam en e-mailadres opnieuw in te vullen.</p>
            <button className={styles.verifyButton} onClick={() => void resolveGitAuthor("verify")} disabled={resolving}>
              {resolving ? "Bezig met controleren…" : "Controleer bestaande Git-afzender"}
            </button>
            <div className={styles.divider}><span>of stel hem in</span></div>
            <label>Naam<input value={authorName} onChange={(event) => setAuthorName(event.target.value)} placeholder="Bijvoorbeeld: Jan Jansen" disabled={resolving} /></label>
            <label>E-mailadres<input type="email" value={authorEmail} onChange={(event) => setAuthorEmail(event.target.value)} placeholder="naam@voorbeeld.nl" disabled={resolving} /></label>
            <button className={styles.resolveButton} onClick={() => void resolveGitAuthor("set")} disabled={resolving || !authorName.trim() || !validEmail(authorEmail)}>
              {resolving ? "Hermes controleert…" : "Opslaan en actie oplossen"}
            </button>
            <small>Alleen repository-local Git-identiteit. Geen globale Git-instelling, geen GitHub-push en geen tradingrechten.</small>
            {resolutionMessage && <div className={styles.resolveSuccess}>{resolutionMessage}</div>}
            {resolutionError && <div className={styles.resolveError}>{resolutionError}</div>}
          </section>}

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
