"use client";

import { FormEvent, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import styles from "./login.module.css";

export function LoginForm() {
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const configMissing = searchParams.get("config") === "missing";
  const next = useMemo(() => {
    const requested = searchParams.get("next") || "/";
    return requested.startsWith("/") && !requested.startsWith("//") ? requested : "/";
  }, [searchParams]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "Inloggen is niet gelukt");
        return;
      }
      window.location.assign(next);
    } catch {
      setError("De loginservice is tijdelijk niet bereikbaar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`${styles.card} ${configMissing ? styles.missing : ""}`}>
      <div className={styles.mark}>H</div>
      <span className={styles.eyebrow}>HERMES INVESTMENT OS</span>
      <h1>Welkom bij Hermes</h1>
      <p>Log in om je Hermes-overzicht, onderzoek en beveiligde systeemstatus te openen.</p>
      {configMissing ? (
        <p><strong>De beveiligde toegang is nog niet ingesteld.</strong> Stel OS_ACCESS_PASSWORD en OS_SESSION_SECRET in Vercel in en deploy daarna opnieuw.</p>
      ) : (
        <form className={styles.form} onSubmit={submit}>
          <label htmlFor="password">Wachtwoord</label>
          <input id="password" name="password" type={visible ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus />
          <button type="button" className={styles.reveal} aria-pressed={visible} onClick={() => setVisible(value => !value)}>{visible ? "Verberg wachtwoord" : "Toon wachtwoord"}</button>
          <button disabled={busy || !password}>{busy ? "Inloggen…" : "Open Hermes"}</button>
        </form>
      )}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <div className={styles.meta}>Je sessie verloopt na 12 uur.</div>
    </section>
  );
}
