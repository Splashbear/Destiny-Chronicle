# Handoff: Connecting Destiny Chronicle to a Home PC–Hosted PGCR Database

This document is for an agent or developer setting up the **backend (PGCR API + database)** on a home PC so that **Destiny Chronicle (DC)** can use it to speed up searches. DC is the Angular app in this repo; it runs in the browser and on GitHub Pages and can only talk to your database via **HTTP/JSON**.

---

## Current home-PC status (2026-09-17)

CharacterLookup consolidate **finished**. This is a membership → instance index, not full PGCRs.

| Field | Value |
|-------|--------|
| DuckDB | `D:\DestinyChronicleDB\chronicle.duckdb` (~236 GB) |
| Rows | 13,606,328,282 from 6804/6804 files |
| Splashbear membership | `4611686018465122437` |
| Splashbear distinct instances | 7387 |
| Sample columns | `activity_instance_id`, `character_id` (plus the membership id used to filter) |
| Indexes | **skipped** (`CREATE INDEX` OOM on ~48 GB RAM) |
| Summary | `D:\DestinyChronicleDB\consolidate_cl_summary.json` |

**What this unlocks:** given a `membershipId`, list that player's `activity_instance_id`s without calling Bungie GetActivityHistory.

**What this does not unlock yet:** activity name, date, mode, deaths, fireteam size, solo/flawless. Those need lean activity/PGCR rows inside the ingest watermark. `GET /pgcr/:instanceId` must keep returning 404 until that layer exists.

**Do not `CREATE INDEX` on the DuckDB file.** Next query path is hash-partitioned Parquet:

```powershell
cd <repo>\tools\pgcr-db
python -m pip install -r requirements.txt
python cli.py inspect
python cli.py export
python cli.py query --membership-id 4611686018465122437
python cli.py serve
```

`export` rewrites the 13.6B rows to `D:\DestinyChronicleDB\cl_parts\part=N\*.parquet`. Budget another ~150–250 GB of disk and leave it running. After it finishes, `query` should report `instanceCount: 7387` for Splashbear.

The Angular app still has `useExternalPgcr: false`. Do not flip that flag until `/pgcr/:id` returns PgcrLite JSON, not just instance ids.

---

## Quick start for home PC agent

**Start here.** Your job is to run a small **PGCR API** on the home PC that talks to the existing PGCR database and exposes HTTP/JSON. DC never talks to the database directly—only to your API. When DC needs a PGCR it tries: (1) local IndexedDB cache, (2) your PGCR API, (3) Bungie API. If your API returns 404 or an error, DC falls back to Bungie with no extra config.

**Key docs in this repo:**

| Doc | Use it for |
|-----|-------------|
| **`docs/pgcr-database-integration-plan.md`** | Full architecture, API contract, rollout, and code references |
| **`docs/pgcr-selfhost-guide.rtf`** | Full home PC stack (Postgres, crawler, API, Caddy, etc.) if you’re reusing or aligning with it |
| **This file** | Exact endpoints, response shape (PgcrLite), security, and step-by-step setup |

**In the codebase:** PgcrLite interfaces and `processPGCRData` live in `src/app/services/activity-db.service.ts`. DC’s API base URL and feature flag are in `src/environments/environment.prod.ts` (`pgcrApiRoot`, `useExternalPgcr`).

---

## What you’re building

- A **PGCR API** server that:
  - Connects to the existing **PGCR database** (10 years of reduced PGCR data) on the home PC.
  - Exposes **HTTP endpoints** that return PGCR data in the shape DC expects.
  - Is reachable from the internet (or via a tunnel) so the DC site can call it.

- **No changes to the database schema are required** for the first version, as long as you can map your existing tables/views into the response shape below.

---

## What Destiny Chronicle expects

### 1. Base URL and config

- DC is configured via **environment variables / build-time config**:
  - `pgcrApiRoot`: base URL of your API (e.g. `https://api.yourdomain.com` or `https://your-tunnel.example.com`).
  - `useExternalPgcr`: when `true`, DC will call your API when it needs a PGCR (after checking local cache, before calling Bungie).
- The app runs on GitHub Pages; your API must allow **CORS** from that origin (and optionally from `localhost` for dev).

### 2. Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/pgcr/:instanceId` | Return one PGCR. Optional query: `?game=D1` or `?game=D2` if your DB distinguishes D1 vs D2. |
| POST | `/pgcr/batch` | (Optional but recommended.) Body: `{ "instanceIds": ["id1","id2",...], "game": "D2" }`. Response: `{ "id1": { ...pgcr }, "id2": { ...pgcr } }`. |

- **instanceId** = Bungie’s PGCR instance id (same as in GetActivityHistory); it’s the unique key for a single activity completion.

### 3. Response shape (PgcrLite)

DC’s `ActivityDbService` only needs a **reduced** PGCR. Your API should return JSON in this shape (or compatible):

```json
{
  "activityDetails": {
    "period": "2024-01-15T19:30:00Z"
  },
  "entries": [
    {
      "player": {
        "destinyUserInfo": {
          "membershipId": "123456789",
          "membershipType": 2
        },
        "characterClass": "Titan"
      },
      "characterId": "987654321",
      "values": {
        "deaths": { "basic": { "value": 0 } }
      }
    }
  ]
}
```

- **activityDetails.period** – Used as the completion timestamp.
- **entries** – List of participants. From this DC derives:
  - Fireteam size (length), solo (size === 1), solo flawless (solo + 0 total deaths), flawless (all 0 deaths).
  - For the requesting user: characterClass, membershipType (from the entry whose membershipId matches).
- You can also support a **players** array (flat list with `id`, `deaths`, `charId`) as an alternative; see `activity-db.service.ts` for the exact fallback logic.

If a given **instanceId** is not in your database, return **404**. DC will then fetch that PGCR from Bungie and continue normally.

### 4. Security

- **API key**: Require a key (e.g. `X-API-Key` or `Authorization: Bearer <token>`). DC can send it once `pgcrApiRoot` and the key are configured.
- **HTTPS**: Use TLS in production (e.g. Caddy with Let’s Encrypt, or a tunnel that provides HTTPS).
- **Rate limiting**: Recommended per IP or per API key so the home PC isn’t overloaded.

---

## Where things live in this repo

| Need | Document / file |
|------|------------------|
| Full integration plan (architecture, rollout, references) | **`docs/pgcr-database-integration-plan.md`** |
| PgcrLite TypeScript interfaces | **`src/app/services/activity-db.service.ts`** (search for `PgcrLite`, `PgcrLiteEntry`, `PgcrLitePlayer`) |
| How DC uses PGCR (solo, flawless, dates) | **`src/app/services/activity-db.service.ts`** – `processPGCRData` |
| DC env config for API URL and feature flag | **`src/environments/environment.prod.ts`** – `pgcrApiRoot`, `useExternalPgcr` |
| Home-PC CharacterLookup toolkit | **`tools/pgcr-db/`** (`inspect` / `export` / `query` / `serve`) |

---

## Suggested steps for the home PC agent

1. **Read** `docs/pgcr-database-integration-plan.md` and `docs/pgcr-selfhost-guide.rtf` to align with the intended architecture and existing stack (if using the Rivenbot services).
2. **Implement** a minimal PGCR API that:
   - Connects to the existing PGCR DB on the home PC.
   - Exposes `GET /pgcr/:instanceId` (and optionally `POST /pgcr/batch`) returning PgcrLite-compatible JSON.
   - Returns 404 when instanceId is not in the DB.
3. **Expose** the API to the internet (port forward + DDNS + Caddy/HTTPS, or Cloudflare Tunnel / ngrok).
4. **Configure** CORS for `https://splashbear.github.io` (and `http://localhost:4200` for dev).
5. **Provide** the user with:
   - The base URL (e.g. `https://api.yourdomain.com`).
   - An API key (if used).
   - They will set `pgcrApiRoot` and `useExternalPgcr: true` in DC’s environment and redeploy.

After that, DC will use your API first for PGCR lookups and fall back to Bungie when your API returns 404 or an error, with no further backend changes required for basic operation.
