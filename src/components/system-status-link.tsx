import Link from "next/link";
import { getDeploymentMetadata } from "@/lib/os-version";
import styles from "./system-status-link.module.css";

export function SystemStatusLink() {
  const deployment = getDeploymentMetadata();
  return (
    <Link className={styles.statusLink} href="/brain/system" aria-label={`Open System Readiness for Hermes Investment OS v${deployment.version}`}>
      <span className={styles.dot} />
      <span>v{deployment.version}</span>
      <code>{deployment.shortCommit}</code>
      <strong>System</strong>
    </Link>
  );
}
