import { HermesControlV033 } from "@/components/hermes-control-v033";
import { SystemStatusLink } from "@/components/system-status-link";
import { AutonomyStatusLink } from "@/components/autonomy-status-link";

export default function BrainPage() {
  return (
    <>
      <HermesControlV033 />
      <AutonomyStatusLink />
      <SystemStatusLink />
    </>
  );
}
