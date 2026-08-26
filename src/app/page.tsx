import Link from "next/link";
import { InvestmentOS } from "@/components/investment-os";
import styles from "./home.module.css";

export default function Home() {
  return <>
    <InvestmentOS />
    <Link href="/brain" className={styles.brainLink}>Hermes Control <span>BRAIN →</span></Link>
  </>;
}