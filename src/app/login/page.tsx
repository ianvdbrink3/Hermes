"use client";

import { FormEvent, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import styles from "./login.module.css";

export default function LoginPage() {
  const searchParams = useSearchParams();
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
        setError(data.error || "Login failed");
        return;
      }
      window.location.assign(next);
    } catch {
      setError("Login service is unreachable");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={`${styles.card} ${configMissing ? styles.missing : ""}`}>
        <div className={styles.mark}>H</div>
        <span className={styles.eyebrow}>HERMES INVESTMENT OS</span>
        <h1>Owner access</h1>
        <p>Authenticate before accessing the Hermes control plane, risk controls or agent proxy.</p>
        {configMissing ? (
          <p><strong>Authentication is not configured.</strong> Set OS_ACCESS_PASSWORD and OS_SESSION_SECRET in Vercel, then redeploy.</p>
        ) : (
          <form className={styles.form} onSubmit={submit}>
            <label htmlFor="password">Access password</label>
            <input id="password" name="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus />
            <button disabled={busy || !password}>{busy ? "AUTHENTICATING…" : "ENTER OS"}</button>
          </form>
        )}
        {error && <p className={styles.error}>{error}</p>}
        <div className={styles.meta}>Signed HttpOnly session · SameSite=Strict · 12-hour expiry</div>
      </section>
    </main>
  );
}
