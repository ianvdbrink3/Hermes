# G11 read-only feed correction — 2026-10-09

The authenticated production Trading page returned HTTP 503 even though the state health endpoint succeeded. The installed state service runs with ProtectHome=read-only and ProtectSystem=strict. Its real child-process traceback showed budget_status opening budget.lock in append mode, raising EROFS.

The OS projection now reads the existing budget ledger with the same hash/checkpoint validation, opens an existing lock read-only with a shared flock, and checks that ledger/checkpoint/pending fingerprints did not change. It never creates budget directories or files. Missing locks for existing ledgers, corrupted ledgers and incomplete writes fail closed. No permissions, limits, scheduler, model activation or journals were changed.

A measured projection took 7.18 seconds; the prior handler deadline was 6 seconds. The bounded service deadline is now 20 seconds and the OS server deadline 25 seconds. Safe diagnostics distinguish HTTP, timeout, JSON and transport errors without exposing upstream content.

Live authenticated verification showed all 20 stock rows, last scan 2026-10-09 20:05 UTC, zero new research reports and zero new paper days. Research remains disabled. Market data older than an hour is visibly marked stale. The historical MSFT pilot remains separate.
