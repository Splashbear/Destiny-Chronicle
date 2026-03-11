# PGCR Database Integration Plan

Plan for integrating an external 10-year PGCR database into Destiny Chronicle to speed up PGCR-dependent features while keeping Bungie API and local caches as fallbacks.

---

## 1. Goals and constraints

- **Goal**: Use a curated 10-year PGCR database as the **primary source** for PGCR-like data to make Destiny Chronicle faster and more reliable, while **keeping Bungie API + IndexedDB** as fallbacks.
- **Scope**:
  - Reads only (no in-app writes to the PGCR DB).
  - Focus on features that are PGCR-heavy: **Guardian Firsts**, **Dungeon solos**, and any PGCR-derived stats.
- **Constraints**:
  - Frontend is a **static Angular app on GitHub Pages** – cannot talk directly to a raw database driver.
  - All access to the DB must be via an **HTTP API layer** (server on home PC, VPS, or serverless).

---

## 2. High-level architecture

**Current flow (simplified):**
- `player-search` → `ActivityDbService` / `BungieApiService` → Bungie API (e.g. via `netlify/functions/bungie-proxy.ts`) → IndexedDB via `ActivityDbService` + `PGCRCacheService`.

**Target flow with PGCR DB:**
- For PGCR-dependent operations, the app tries **external PGCR API** first, then **local `PGCRCacheService`**, then **Bungie API**.

```
User in browser → Angular app → [1] PGCR API (your DB) → if 404/missing → [2] IndexedDB cache → if missing → [3] Bungie API
```

**Key principle**: The Angular app only ever speaks HTTP (JSON). The database is hidden behind the PGCR API.

---

## 3. External PGCR API contract

### Endpoints (proposal)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/pgcr/:instanceId` | Return one reduced PGCR document. Use query `?game=D1` or `?game=D2` if needed. |
| POST | `/pgcr/batch` | Body: `{ instanceIds: string[], game: 'D1' \| 'D2' }`. Returns `{ [instanceId]: pgcrLite }`. |

### Response semantics

- **200** – JSON body is the PGCR document (see PgcrLite shape below).
- **404** – Not found in DB; DC will fall back to Bungie API.
- **429 / 5xx** – Throttling or error; DC will fall back to Bungie for that request.

### Required response shape (PgcrLite)

The DC app expects a JSON object compatible with `processPGCRData` in `ActivityDbService`. Minimum usable shape:

```ts
{
  activityDetails?: {
    period?: string;   // ISO date string; used for completion date
  };
  entries?: Array<{
    player?: {
      destinyUserInfo?: {
        membershipId?: string;
        membershipType?: number;
      };
      characterClass?: string;
    };
    characterId?: string;
    values?: {
      deaths?: { basic?: { value?: number } };
    };
  }>;
  players?: Array<{
    id?: string;       // membershipId
    deaths?: number;
    charId?: string;
  }>;
}
```

- **entries** (or **players**) are used to derive: fireteam size, solo, solo flawless, flawless, and per-player class/membershipType.
- **activityDetails.period** is the authoritative completion timestamp.

Full TypeScript interfaces live in `src/app/services/activity-db.service.ts` (`PgcrLite`, `PgcrLiteEntry`, `PgcrLitePlayer`).

### Security

- Require an **API key** or token (e.g. header `X-API-Key` or `Authorization`).
- Configure **CORS** for the DC origin (e.g. `https://splashbear.github.io`).
- Rate-limit per IP or per API key on the server.

---

## 4. DC app integration status

- **Environment**: `environment.prod.ts` (and dev) include:
  - `pgcrApiRoot` – base URL of the PGCR API (e.g. `https://api.yourdomain.com`).
  - `useExternalPgcr` – when `true`, DC will call the external API in the lookup chain.
- **Lookup order** (when `useExternalPgcr` is true):
  1. Local IndexedDB (`PGCRCacheService`)
  2. External PGCR API (`PgcrApiService` – to be wired or already present)
  3. Bungie API (`BungieApiService.getPGCR`)
- **Key file**: `src/app/services/activity-db.service.ts` – PGCR fetch and `processPGCRData(first, pgcr, game, membershipId)`.

---

## 5. Hosting the PGCR API (home PC vs cloud)

- **Home PC**: Run a small HTTP server (Node/Express, Go, etc.) that connects to your existing PGCR database. Expose it via port forwarding + Dynamic DNS, or via a tunnel (e.g. Cloudflare Tunnel, ngrok). Use HTTPS (e.g. Caddy with Let’s Encrypt) in front.
- **Existing selfhost guide**: See **`docs/pgcr-selfhost-guide.rtf`** for a full stack (proxy-service, pgcr-crawler, pgcr-processing, rivenbot-api-service, Postgres, MinIO, Redis, Caddy) you can run on a home Linux box. The API service in that guide should expose the endpoints and response shape described above.
- **Cloud**: Alternatively deploy the same API (or a thin wrapper) on a VPS/cloud; DC only needs the base URL and CORS/API key set.

---

## 6. Phased rollout

1. **Phase 1** – Stand up PGCR API with `GET /pgcr/:instanceId` (and optionally batch), returning PgcrLite-compatible JSON. Test with a subset of instanceIds.
2. **Phase 2** – In DC, set `pgcrApiRoot` and `useExternalPgcr: true`; deploy and verify fallback to Bungie when API returns 404 or errors.
3. **Phase 3** – Add batch endpoint and tune DB indices; optionally cache hot PGCRs in memory or Redis on the server.

---

## 7. References in this repo

| Item | Location |
|------|----------|
| PgcrLite interfaces | `src/app/services/activity-db.service.ts` (lines ~36–67) |
| PGCR processing | `src/app/services/activity-db.service.ts` – `processPGCRData`, batch/fallback logic |
| Env config | `src/environments/environment.prod.ts` – `pgcrApiRoot`, `useExternalPgcr` |
| Selfhost stack guide | `docs/pgcr-selfhost-guide.rtf` |
| Handoff for home PC setup | `docs/pgcr-api-handoff-for-home-pc.md` |
