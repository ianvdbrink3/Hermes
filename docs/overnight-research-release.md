# Overnight research UI release

Frontend: /home/ubuntu/Hermes-OS-g11.
Reviewed base: 1afdb128b2e71c6dfb792b601a245a96c2dd2611 on os-redesign-v1.
The UI reads the authenticated /api/os/council snapshot; optional overnight schema_version 1 contains persisted counts and ranking. No UI-generated prices, opportunities or scores are substituted when the cache is absent.
The optional ranking is rejected when numeric values are not finite, completeness is outside 0–100 or the counts contradict their subset relationship. Older snapshots without overnight remain compatible.

The five independent specialist roles are FUNDAMENTAL, MACRO, QUANT, TECHNICAL and SENTIMENT. CIO remains the final decision role. TECHNICAL messages require the same hashed attempt identity and source references as other specialist messages. The conversation retains the complete message body and links replies to their parent message; the original archive remains accessible.

## Units
Financial valuation multiples and beta are ratios. Financial yield, growth, margins and quant returns, volatility and drawdown are fractional values (0.2 displays 20%). Treasury and Fed fields ending _pct are already percentage points (4.2 displays 4.2%). RSI is 0–100 and VIX is an index. Balance sheet amounts and absolute moving averages use the row's reported currency. Missing values display Niet beschikbaar.

## Vercel check to exclude
GitHub combined status for ianvdbrink3/Hermes at reviewed base reports:
- Vercel – hermes: failure; https://vercel.com/ianvdbrink3s-projects/hermes/HBsoU9szFwYTvDrBjyfYigoHtCAi
- Vercel – hermestradingos: success; https://vercel.com/ianvdbrink3s-projects/hermestradingos/7uDF1sn5DM1fnBBUAxauw4qbdRYH

The duplicate project/check Vercel – hermes is excluded from this release's success assessment. Target hermestradingos; existing production alias is https://hermestradingosian.vercel.app. Do not treat the duplicate project's failure as the intended application's deployment result. No webhook or project was disabled: the connected Vercel API team listed zero projects and direct project lookups returned 404, so changing the duplicate configuration could not be verified safely.

## Release gate
Run full npm test, npm run typecheck, npm run build and git diff --check, then independently review the diff and validate a real overnight snapshot. The coordinating owner performs the authorized main integration and Vercel publication after the backend's full sandbox gates. This implementation task does not commit, push or deploy.

## Local validation evidence
Full Vitest: 8 files, 109 passed and 1 existing skip, exit 0.
Default npm run build (Turbopack) was inconclusive: after more than eight minutes it still showed Creating an optimized production build, with no compiler error. The 954 MB host was swapping heavily. The known build process was terminated to free resources. A full production webpack build is the fallback, invoked with NODE_OPTIONS=--max-old-space-size=512 npm run build -- --webpack; this changes no source configuration.
