import Link from "next/link";
import styles from "./autonomy-status-link.module.css";

export function AutonomyStatusLink() {
  return (
    <Link className={styles.link} href="/brain/autonomy" aria-label="Open Autonomous Investment Lab dashboard">
      <span className={styles.pulse} />
      <strong>Autonomy</strong>
      <span>Control Center</span>
    </Link>
  );
}
