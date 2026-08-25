import { Suspense } from "react";
import { LoginForm } from "./login-form";
import styles from "./login.module.css";

export default function LoginPage() {
  return (
    <main className={styles.page}>
      <Suspense fallback={<section className={styles.card}>Loading secure login…</section>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
