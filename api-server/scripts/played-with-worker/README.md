# Played With summary worker

Builds precomputed Played With summaries one account at a time so the site never runs a live
multi-minute band scan. Played With stays hidden on the site; this only fills the store.

- **Queue:** `PLAYED_WITH_SUMMARY_DIR/queue.json` (worker-owned). Seeds (`seeds.json`, priority 0) go first,
  then accounts requested through `POST /played-with/stats` (priority 10, arrival order). A lookup with no
  summary appends the membership ids to `requests.jsonl` and returns `202 { pending: true, position }`.
- **Store:** `summaries/<sorted ids joined by +>.json` (top `PLAYED_WITH_SUMMARY_PARTNERS`, default 1000).
- **Refresh:** when nothing is pending, the oldest summary past `PLAYED_WITH_REFRESH_HOURS` (default 168)
  is checked; it is rebuilt only if the account has a newer instance id in the archive.
- **Recovery:** `run-worker.cmd` restarts the worker 30 s after any exit; the scheduled task
  (`install-task.ps1`) starts it at boot and Task Scheduler restarts the supervisor if it dies.
  An item left `running` by a crash is retried (max 3 attempts, then `failed`; a new lookup re-queues it).
- **Logs:** `worker.log`, JSON lines with the account key, games, partners and ms. No visitor data.
- **Needs:** the archive API (`PLAYED_WITH_SUMMARY_API`) up for activity lists, and the index drives mounted.
- Runs on the home PC for now; move to the OptiPlex with the indexes (same env file, re-run install-task.ps1).