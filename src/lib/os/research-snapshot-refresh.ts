const RESEARCH_SNAPSHOT_REFRESH_EVENT = "hermes:research-snapshot-refresh";

export function requestResearchSnapshotRefresh() {
  window.dispatchEvent(new Event(RESEARCH_SNAPSHOT_REFRESH_EVENT));
}

export function subscribeResearchSnapshotRefresh(listener: () => void) {
  window.addEventListener(RESEARCH_SNAPSHOT_REFRESH_EVENT, listener);
  return () => window.removeEventListener(RESEARCH_SNAPSHOT_REFRESH_EVENT, listener);
}
