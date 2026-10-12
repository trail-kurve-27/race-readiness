# Formkurve

Private training dashboard built from Strava data: weekly load, load ratio,
aerobic efficiency, half-marathon projection, HYROX notes, a 3D route map and
the plan for the next seven days.

## Structure
- `index.html`, `assets/` — the website (static, no build step)
- `data/data.js` — processed data the page reads (GPS already trimmed around home)
- `scripts/build_data.py` — turns a raw Strava extract into `data/data.js`
- `raw/` — raw extract, local only, excluded by `.gitignore`

## Update the data
    python3 scripts/build_data.py            # uses today's date
    python3 scripts/build_data.py 2026-10-12 # or a fixed date

## Hosting
Cloudflare Pages (build command: none, output directory: `/`), protected by
Cloudflare Access so only the owner's e-mail can open it.

Map: OpenFreeMap (© OpenStreetMap contributors). Terrain: AWS Terrain Tiles.
