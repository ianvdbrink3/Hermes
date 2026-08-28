"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./git-author-gate-bridge.module.css";

type ActionState = {
  tone: "working" | "success" | "error";
  title: string;
  detail: string;
} | null;

type StartResponse = { run_id?: string; status?: string; error?: string };
type PollResponse = { status?: string; terminal?: boolean; resolved?: boolean; output?: string; error?: string };

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function findActionPanel(button: HTMLButtonElement) {
  return button.closest("aside") || button.closest("[role=dialog]") || document.body;
}

function readIdentity(button: HTMLButtonElement) {
  const panel = findActionPanel(button);
  const inputs = Array.from(panel.querySelectorAll("input")) as HTMLInputElement[];
  const emailInput = inputs.find((input) => input.type === "email" || input.name.toLowerCase().includes("email")) || inputs[1];
  const nameInput = inputs.find((input) => input !== emailInput && (input.name.toLowerCase().includes("name") || input.type === "text")) || inputs[0];
  return { name: nameInput?.value?.trim() || "", email: emailInput?.value?.trim() || "" };
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function GitAuthorGateBridge() {
  const [state, setState] = useState<ActionState>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    async function execute(mode: "verify" | "set", sourceButton: HTMLButtonElement) {
      if (busyRef.current) return;
      const identity = mode === "set" ? readIdentity(sourceButton) : { name: "", email: "" };
      if (mode === "set" && (!identity.name || !validEmail(identity.email))) {
        setState({ tone: "error", title: "Controleer je invoer", detail: "Vul een naam en een geldig e-mailadres in." });
        return;
      }

      busyRef.current = true;
      setState({
        tone: "working",
        title: mode === "verify" ? "Bestaande Git-afzender controleren" : "Git-afzender opslaan en controleren",
        detail: "Builder voert alleen deze repository-local actie uit. Dit kan even duren.",
      });

      try {
        const startResponse = await fetch("/api/brain/owner-actions/git-author", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode, name: identity.name, email: identity.email }),
        });
        const started = await startResponse.json().catch(() => ({})) as StartResponse;
        if (!startResponse.ok || started.error || !started.run_id) {
          throw new Error(started.error || "De Builder-actie kon niet worden gestart.");
        }

        setState({ tone: "working", title: "Hermes werkt aan de actie", detail: "De repository wordt gecontroleerd en de verouderde human gate wordt alleen bij succesvolle verificatie opgeruimd." });

        let result: PollResponse = {};
        for (let attempt = 0; attempt < 180; attempt += 1) {
          await sleep(2000);
          const pollResponse = await fetch(`/api/brain/owner-actions/git-author?run_id=${encodeURIComponent(started.run_id)}`, { cache: "no-store" });
          result = await pollResponse.json().catch(() => ({})) as PollResponse;
          if (!pollResponse.ok) throw new Error(result.error || "De status van de Builder-actie kon niet worden gelezen.");
          if (result.terminal) break;
        }

        if (!result.terminal) throw new Error("De controle duurt langer dan verwacht. De actie is niet als mislukt gemarkeerd; probeer over enkele minuten opnieuw te controleren.");
        if (!result.resolved) {
          const detail = result.error || result.output || `De Builder-run eindigde met status ${result.status || "onbekend"}.`;
          throw new Error(detail);
        }

        setState({ tone: "success", title: "Actie opgelost", detail: "De Git-afzender is repository-local geverifieerd en de verouderde Git-author gate is uit de autonomy-state verwijderd. Het OS wordt vernieuwd…" });
        await sleep(1400);
        window.location.reload();
      } catch (error) {
        setState({ tone: "error", title: "Actie niet opgelost", detail: error instanceof Error ? error.message : "Onbekende fout tijdens de Builder-actie." });
      } finally {
        busyRef.current = false;
      }
    }

    const intercept = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest("button") : null;
      if (!(target instanceof HTMLButtonElement)) return;
      const label = (target.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
      const mode = label.includes("controleer bestaande git-afzender")
        ? "verify"
        : label.includes("opslaan en actie oplossen")
          ? "set"
          : null;
      if (!mode) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      void execute(mode, target);
    };

    document.addEventListener("click", intercept, true);
    return () => document.removeEventListener("click", intercept, true);
  }, []);

  if (!state) return null;

  return <div className={`${styles.toast} ${styles[state.tone]}`} role="status" aria-live="polite">
    <div className={styles.icon}>{state.tone === "working" ? "…" : state.tone === "success" ? "✓" : "!"}</div>
    <div><strong>{state.title}</strong><p>{state.detail}</p></div>
    {state.tone !== "working" && <button onClick={() => setState(null)} aria-label="Melding sluiten">×</button>}
  </div>;
}
