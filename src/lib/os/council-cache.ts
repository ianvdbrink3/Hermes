import { unstable_cache } from "next/cache";
import { councilRequest, parseCouncilSnapshot, presentCouncilSnapshot } from "./council";

// Cache only successfully validated, source-bound read-only snapshots. Keeping
// this in one server module lets the Council and overview reuse the same
// upstream response instead of downloading the 1.4 MB source snapshot twice.
export const verifiedCouncilSnapshot = unstable_cache(
  async (query: string) => presentCouncilSnapshot(
    parseCouncilSnapshot(await councilRequest("snapshot", undefined, query)),
  ),
  ["hermes-council-verified-read-only-v2"],
  { revalidate: 60 },
);
