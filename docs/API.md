# Archive API

The site calls `<API_ROOT>`. Development uses the `/dc-archive` prefix, which is forwarded to the same API. Responses are JSON.

## Activities

`GET /players/:membershipId/activities`

Query: `game` (`D1` or `D2`), `from` and `to` (ISO periods), `limit`, `includePartial=1`, and a hubs flag the site sends when social spaces should be included.

The membership id must be digits. A bad id is HTTP 400.

```json
{
  "membershipId": "<id>",
  "coverage": {
    "level": "full",
    "source": "archive",
    "rowCount": 0,
    "minPeriod": null,
    "maxPeriod": null,
    "notes": []
  },
  "activities": []
}
```

`level` is `full`, `partial`, or `absent`. Destiny 1 is never `full`. An empty archive is `absent`, not `full`. Each activity includes the instance id, period, activity hash, mode, membership, character, completed flag, and game when known.

`POST /players/activities/batch` asks for several memberships in one call. The body is the list of ids plus the same filters.

## Reports

`GET /pgcr/:instanceId` returns one report. `POST /pgcr/batch` returns several. Destiny 1 and Destiny 2 share instance numbers, so a Destiny 1 read must not reuse a Destiny 2 report stored under the bare id.

`GET /api/pgcr/watermark` returns the newest archived instance id, the archive-complete line, and related marks the site uses to decide where Bungie catch-up starts.

`GET /api/pgcr/:instanceId` and `GET /api/pgcr/activities` are the older report routes. The site prefers `/pgcr`.

## Played With

`POST /played-with/stats`

```json
{ "membershipIds": ["<id>"], "limit": 500, "game": "D2" }
```

At most 10 ids. The site sends Destiny 2 accounts only.

While a summary is still building, the response is HTTP 202 with `pending: true`. When it is ready, the body has `partners` (games together, time, first played, last played, and the instance ids for those two games when known), `coverage`, and `partial` when not every requested account is ready. A partner with no public name is `Private Guardian`.

## Health

`GET /health` reports that the process is up and whether its data roots are readable. It does not return secrets.

`GET /admin/usage` is an admin summary of recent calls. It is not used by the public site.
