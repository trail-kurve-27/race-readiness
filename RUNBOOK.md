# Weekly update (every Monday)

Instructions for the Claude session that refreshes Formkurve. Language on the site: German. No em dashes or en dashes in any text.

## 0. Rules that must never be broken
- Never commit anything under `raw/` (GPS polylines, privacy offset). `.gitignore` excludes it; check `git status` before committing.
- `raw/privacy.json` must contain exactly the values given in the task prompt. Never run `build_data.py --init-privacy`.
- Never publish people's names, the home location, exact race times to the second, or any real name of the owner.

## 1. Setup
1. Attach `trail-kurve-27/race-readiness` with push access and clone it.
2. Create `raw/privacy.json`: `{"north_m": <value>, "east_m": <value>}` with the values from the prompt.

## 2. Pull Strava data
1. `list_activities` from `2026-03-01T00:00:00`, `include_polyline: true`, `ordering: StartDateLocalAsc`, page until done.
2. Write `raw/polylines.json` = `{ "<activity id>": "<reduced_polyline>" }` for every Run and TrailRun that has one.
3. Append every activity not yet in `source/activities.json` (match on `id`). Fields:
   - `id`, `name`, `type` (= `sport_type`), `date` (date part of `start_local`), `dist` (m), `mov` (moving_time s), `elev` (m), `re` (relative_effort or null).
   - Runs: call `get_activity_performance`; set `hr` = average_heartrate (1 decimal) when `has_heartrate`, `w` = average_watts (1 decimal) when `has_device_watts`. No heart rate: `"flag": "no HR recorded"`.
   - Races: half marathon (about 21.1 km, race in name) gets `"race": "HM"`; a HYROX race gets `"type": "Hyrox", "race": "HYROX"`.
   - Duplicates (same day, one manual entry with distance and no GPS, one watch entry with 0 km): keep one entry with the distance, take `hr`/`re` from the watch entry, add `"merged": "<other id>"` and `"flag": "manual distance, HR from watch entry"`.
   - HYROX workouts: if the Strava description lists station times (e.g. "Sled Push 3:10, Wall Balls 6:05"), store them as `"stations": {"Sled Push": 190, ...}` in seconds.
4. For every new run with a polyline: `get_activity_streams` with `["distance","altitude"]`, `resolution: 100`; store the altitude list (1 decimal) in `source/elevation.json` under the id. If start minus end altitude is more than 1.5 % of the distance, add `"flag": "net downhill"`.

## 3. Rebuild
`python3 scripts/build_data.py` (uses today's date). Read the printed summary: `km28`, `acwr_now`, `acute_now`, `chronic_now`, `days_since_last`, `ef_pct`, `hm_now_s`.

## 4. New weekly plan (`data/plan.js`)
Rewrite `window.PLAN_META` (`title`: a short declarative German heading; `lede`: 2 to 3 sentences with target km, the reason, and the HM estimate used for paces) and `window.PLAN` for Monday to Sunday of the current week. Same object shape as the existing file.

Goals: HYROX Basel solo 12 Feb 2027, under 1:10 (stations are the limiter: sleds, wall balls). Half marathon under 1:30. A trail marathon, date open.

Rules:
- Weekly km ≈ chronic weekly average × 1.1, never more than +15 % on last week. If the load ratio was above 1.5, stay at or below the chronic average.
- 4 runs: 2 easy (HR under 150), 1 quality, 1 long. Long run at most 30 % of weekly km and +2 km on the previous long run; flat while the ratio is above 1.3.
- Quality pace from the current estimate: HM pace = `hm_now_s / 21.1`; threshold = HM pace minus 5 to 10 s/km; intervals 1 km at HM pace minus 15 s/km.
- At least 1 HYROX station session per week (sled push/pull at race weight, wall balls with full depth, burpee broad jumps, lunges). From 14 Dec 2026: one session of compromised running (1 km run + station, repeated). From 2 Feb 2027: taper, volume −40 %, keep some intensity. Race week: only short easy runs plus strides.
- 1 rest or BJJ day. Sunday may include easy cycling.
- If `days_since_last` ≥ 5: assume a break, restart at about 70 % of the chronic average and say so in the lede.
- Places (St. Gallen): flat loops Burgweiher and Kreuzbleiche; Sitterweg; long flat runs along the lake from Rorschach towards Arbon; hills at Freudenberg / Peter und Paul; trail days in the Appenzell area (Wasserauen, Seealpsee).

## 5. Check and publish
1. `node --check assets/app.js`; `node -e "global.window={};require('./data/plan.js')"`.
2. `git status`: only `source/`, `data/` and intentional files changed, nothing under `raw/`.
3. Commit as `Claude <noreply@anthropic.com>`, message `Wochenupdate <YYYY-MM-DD>`, push to `main`.
4. Report to the owner in German, 3 to 5 lines: km last week, load ratio and status, HM estimate, the week's focus, link https://trail-kurve-27.github.io/race-readiness/
