export const OS_VERSION = "0.5.4";
export const OS_RELEASE = "Run Failure Diagnostics";

export function getDeploymentMetadata() {
  const commit = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || "local";
  return {
    version: OS_VERSION,
    release: OS_RELEASE,
    commit,
    shortCommit: commit === "local" ? "local" : commit.slice(0, 7),
    branch: process.env.VERCEL_GIT_COMMIT_REF || process.env.GITHUB_REF_NAME || "local",
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "unknown",
    url: process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || null,
  };
}
