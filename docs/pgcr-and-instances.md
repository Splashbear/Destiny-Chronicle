# PGCRs, instances, and who appears on a report

This doc summarizes how Bungie uses **instances** and **Post Game Carnage Reports (PGCRs)** so Destiny Chronicle’s “firsts”, history sync, and PGCR lookups stay conceptually aligned with the API.

## What a PGCR is

A **Post Game Carnage Report** is the data structure that describes what happened in an **instance**: players, characters, kill counts, scores, teams, fireteams, medals, etc. You fetch it with the **instance id** (activity instance identifier).

## What an “instance” is

An **instance** is one continuous run of an activity: from **start** until **no one remains** in that copy of the activity (rules differ slightly by activity class—see below).

---

## Fireteam-only instances (e.g. raids)

- A fireteam launches a raid and **clears** it → instance ends → PGCR is tied to that instance id.
- A fireteam launches a raid, **aborts** (everyone leaves) → instance ends → still a PGCR for that attempt.
- A fireteam clears **some** encounters, **everyone leaves**, plan to continue later → that instance **ends**. Coming back (even from a checkpoint) is a **new** instance and a **new** PGCR: new world state, ammo, counters, etc.
- Players leave and **replacements** join; eventually **none** of the original fireteam are present → the instance is **not** over until **everyone** (including replacements) has left.

## Shared instances (Crucible, matchmade PvE, etc.)

- A player enters **Crucible** → match ends → instance ends → PGCR lists **teammates and opponents**.
- A player **leaves mid-match** → instance continues until **all** players are done; replacements who backfill appear on the PGCR too.
- **Matchmade strikes, hunts, seasonal activities** → instance ends when the activity ends (or all participants are done per Bungie rules); **teammates** on that instance appear on the PGCR.

## Patrols and open-world matchmaking

**Planetary patrol** and **ambient matchmaking** behave differently: blueberries on the Tangled Shore or passers-by during a strike **do not** necessarily appear on **your** PGCR the way a strike fireteam does. The instance (for patrol-style flows) often ends when **you / your fireteam leave** the relevant space, and the PGCR reflects **that** scope—not every player you ever saw in the zone.

---

## Instance id, attempts, and “completed”

- **Starting** an activity creates an instance and thus an **instance id** you can use to request a PGCR.
- A PGCR exists for **attempts** as well as **successful objective completion**. The API / history layer may expose **“completed”** (or equivalent) when the **mission objective** was satisfied; that is separate from “was there an instance / PGCR at all.”
- **New raid session after everyone left** = **new** instance id and **new** PGCR, even if the raid definition (`referenceId`) is the same.

---

## Implications for Destiny Chronicle

| Concept | App usage |
|--------|-----------|
| **Instance id** | Primary key for PGCR fetch/cache; history rows tie a play to one instance. |
| **Reference id** | Which **activity definition** was played; many instances / PGCRs can share one reference id. |
| **`completed` in history** | Whether that **row** represents an objective clear (when Bungie populates it). Missing or ambiguous D1 fields are handled in code where needed; instance id still identifies the PGCR. |

This guide is intentionally API/PGCR-focused; implementation details for temporary debugging traces are kept out of the long-term docs.
