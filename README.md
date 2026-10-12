# Formkurve

Private training dashboard built from Strava data: weekly load, load ratio,
aerobic efficiency, half-marathon projection, HYROX notes, a 3D route map and
the plan for the next seven days.

## Structure
- `index.html`, `assets/`: the website (static, no build step)
- `data/data.js`: processed data the page reads (GPS already trimmed)
- `data/plan.js`: plan for the current week, rewritten every Monday
- `source/`: Strava activity summaries and altitude streams (no GPS)
- `scripts/build_data.py`: builds `data/data.js` from `source/` and `raw/`
- `raw/`: GPS polylines and privacy offset, local only, excluded by `.gitignore`
- `RUNBOOK.md`: steps of the weekly update

## Update the data
    python3 scripts/build_data.py            # uses today's date
    python3 scripts/build_data.py 2026-10-12 # or a fixed date

## Hosting
Cloudflare Pages (build command: none, output directory: `/`), protected by
Cloudflare Access so only the owner's e-mail can open it.

Map: OpenFreeMap (© OpenStreetMap contributors). Terrain: AWS Terrain Tiles.
