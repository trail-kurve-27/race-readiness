"""Build the website's data file from a raw Strava extract.

Reads   source/activities.json  (Strava activity summaries, committed, no GPS)
        source/elevation.json   (Strava altitude streams per activity, committed)
        raw/polylines.json      (encoded GPS polylines by activity id, NEVER committed)
        raw/privacy.json        (secret offset of the privacy circle, NEVER committed)
Writes  data/data.js         (window.DATA = {...}, loaded by index.html)

Privacy: raw/ is never published. GPS points within PRIVACY_RADIUS_M of the
home location (inferred as the median start point of St. Gallen runs) are
removed before anything is written to data/.

Usage:  python3 scripts/build_data.py [YYYY-MM-DD]   (default: today)
"""
import json, math, re, sys, datetime as dt
from statistics import mean, median
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
_args = [x for x in sys.argv[1:] if not x.startswith("--")]
TODAY = dt.date.fromisoformat(_args[0]) if _args else dt.date.today()
PRIVACY_RADIUS_M = 800
RUN_TYPES = {"Run", "TrailRun"}
HM_GOAL_S = 90 * 60
HYROX_DATE = dt.date(2027, 2, 12)

raw = json.loads((ROOT / "source/activities.json").read_text(encoding="utf-8"))["activities"]
alts = json.loads((ROOT / "source/elevation.json").read_text(encoding="utf-8"))
_polys = ROOT / "raw/polylines.json"
polys = json.loads(_polys.read_text()) if _polys.exists() else {}
for a in raw:
    if a["id"] in polys: a["poly"] = polys[a["id"]]

for a in raw:
    a["d"] = dt.date.fromisoformat(a["date"])
    a["km"] = a["dist"] / 1000
    a["is_run"] = a["type"] in RUN_TYPES
    a["vert_per_km"] = a["elev"] / a["km"] if a["km"] else 0
raw = [a for a in raw if a["d"] <= TODAY]
runs = [a for a in raw if a["is_run"]]
last_activity = max(a["d"] for a in raw)

# ---------------------------------------------------------------- GPS
def decode(s):
    i = lat = lng = 0
    out = []
    while i < len(s):
        vals = []
        for _ in range(2):
            shift = res = 0
            while True:
                b = ord(s[i]) - 63; i += 1
                res |= (b & 31) << shift; shift += 5
                if b < 32: break
            vals.append(~(res >> 1) if res & 1 else res >> 1)
        lat += vals[0]; lng += vals[1]
        out.append((lat / 1e5, lng / 1e5))
    return out

def dist_m(p, q):
    la = math.radians((p[0] + q[0]) / 2)
    return math.hypot((p[0] - q[0]) * 110540, (p[1] - q[1]) * 111320 * math.cos(la))

tracks = {a["id"]: decode(a["poly"]) for a in runs if a.get("poly")}
sg_starts = [tracks[a["id"]][0] for a in runs if a["id"] in tracks and 47.3 < tracks[a["id"]][0][0] < 47.5]
HOME = (median(p[0] for p in sg_starts), median(p[1] for p in sg_starts))

# The cut circle is NOT centred on home: a fixed random offset (stored only in
# raw/privacy.json, never published) stops anyone from recovering the address
# as the centre of the empty circle where all tracks end.
_priv = ROOT / "raw/privacy.json"
if not _priv.exists():
    if "--init-privacy" not in sys.argv:
        sys.exit("raw/privacy.json missing. Restore it (north_m, east_m) instead of generating a new one: "
                 "a new offset next to old published versions would narrow down the home location.")
    import random
    ang, off = random.uniform(0, 2 * math.pi), random.uniform(250, 400)
    _priv.write_text(json.dumps({"north_m": off * math.cos(ang), "east_m": off * math.sin(ang)}))
_o = json.loads(_priv.read_text())
CUT_CENTRE = (HOME[0] + _o["north_m"] / 110540, HOME[1] + _o["east_m"] / (111320 * math.cos(math.radians(HOME[0]))))

def public_name(a):
    """Strip companions' names ("... mit Elliott", "Mit Ori") before publishing."""
    n = re.sub(r"\s*\bmit\s+[A-ZÄÖÜ][\wäöüß]*$", "", a["name"]).strip()
    if not n or n.lower().startswith("mit "):
        n = {"Run": "Lauf", "Swim": "Schwimmen"}.get(a["type"], a["type"])
    return n

def private_segments(pts):
    """Drop every point inside the privacy circle; split the line where it was cut."""
    segs, cur = [], []
    for p in pts:
        if dist_m(p, HOME) < PRIVACY_RADIUS_M - 400 or dist_m(p, CUT_CENTRE) < PRIVACY_RADIUS_M:
            if len(cur) > 1: segs.append(cur)
            cur = []
        else:
            cur.append([round(p[1], 5), round(p[0], 5)])
    if len(cur) > 1: segs.append(cur)
    return segs

# ---------------------------------------------------------------- weekly volume
def monday(d): return d - dt.timedelta(days=d.weekday())
weeks, w = [], monday(min(a["d"] for a in raw))
while w <= monday(TODAY):
    acts = [a for a in raw if monday(a["d"]) == w]
    r = [a for a in acts if a["is_run"]]
    weeks.append({"week": w.isoformat(),
                  "run_km": round(sum(a["km"] for a in r), 1),
                  "run_vert": round(sum(a["elev"] for a in r)),
                  "hike_km": round(sum(a["km"] for a in acts if a["type"] == "Hike"), 1)})
    w += dt.timedelta(days=7)

# ---------------------------------------------------------------- load ratio
def run_km(d0, d1): return sum(a["km"] for a in runs if d0 < a["d"] <= d1)
acwr, d = [], dt.date(2026, 4, 1)
while d <= TODAY:
    acute, chronic = run_km(d - dt.timedelta(7), d), run_km(d - dt.timedelta(28), d) / 4
    acwr.append({"date": d.isoformat(), "acute": round(acute, 1), "chronic": round(chronic, 1),
                 "ratio": round(acute / chronic, 2) if chronic >= 5 else None})
    d += dt.timedelta(1)
recent = [x for x in acwr if x["ratio"] and x["date"] > (TODAY - dt.timedelta(14)).isoformat()]
peak = max(recent, key=lambda x: x["ratio"]) if recent else None   # highest ratio in the last 14 days

# ---------------------------------------------------------------- efficiency
eff = []
for a in runs:
    if a.get("hr") and a.get("w"):
        eff.append({"date": a["date"], "name": public_name(a), "ef": round(a["w"] / a["hr"], 3),
                    "hr": round(a["hr"]), "pace": round(a["mov"] / a["km"]), "km": round(a["km"], 1),
                    "flat": a["vert_per_km"] < 15 and "downhill" not in a.get("flag", ""),
                    "race": a.get("race")})
ef_spring = mean(e["ef"] for e in eff if e["flat"] and e["date"] < "2026-07-01")
ef_now = mean([e["ef"] for e in eff if e["flat"] and e["date"] >= "2026-09-01"][-3:])
hm = next(a for a in runs if a.get("race") == "HM")
hm_now = hm["mov"] * ef_spring / ef_now

# ---------------------------------------------------------------- routes
routes = []
for a in sorted(runs, key=lambda a: a["date"], reverse=True):
    if a["id"] not in tracks: continue
    segs = private_segments(tracks[a["id"]])
    if not segs: continue
    routes.append({"id": a["id"], "name": public_name(a).split(":")[0], "date": a["date"],
                   "km": round(a["km"], 1), "elev": round(a["elev"]),
                   "time_s": round(a["mov"] / 60) * 60, "pace_s": round(a["mov"] / a["km"]),
                   "hr": round(a["hr"]) if a.get("hr") else None,
                   "segments": segs, "alt": alts.get(a["id"])})

last28 = [a for a in runs if (TODAY - a["d"]).days < 28]
summary = {
    "today": TODAY.isoformat(), "last_activity": last_activity.isoformat(),
    "days_since_last": (TODAY - last_activity).days,
    "hyrox_days": (HYROX_DATE - TODAY).days,
    "km28": round(sum(a["km"] for a in last28), 1), "vert28": round(sum(a["elev"] for a in last28)),
    "runs28": len(last28), "longest28_km": round(max([a["km"] for a in last28] or [0]), 1),
    "acwr_now": acwr[-1]["ratio"], "acute_now": acwr[-1]["acute"], "chronic_now": acwr[-1]["chronic"],
    "acwr_peak": peak,
    "ef_spring": round(ef_spring, 3), "ef_now": round(ef_now, 3), "ef_pct": round(100 * ef_now / ef_spring, 1),
    "hm_base_s": round(hm["mov"] / 60) * 60, "hm_base_min": round(hm["mov"] / 60), "hm_now_s": round(hm_now), "hm_goal_s": HM_GOAL_S,
    "privacy_radius_m": PRIVACY_RADIUS_M,
}

activities = [{"date": a["date"], "name": public_name(a), "type": a["type"], "km": round(a["km"], 1),
               "elev": round(a["elev"]), "min": round(a["mov"] / 60),
               "pace_s": round(a["mov"] / a["km"]) if a["is_run"] and a["km"] else None,
               "hr": round(a["hr"]) if a.get("hr") else None}
              for a in sorted(raw, key=lambda a: a["date"], reverse=True)]

out = {"summary": summary, "weeks": weeks, "acwr": acwr, "eff": eff, "routes": routes, "activities": activities}
(ROOT / "data").mkdir(exist_ok=True)
(ROOT / "data/data.js").write_text("window.DATA=" + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")

# report
print(json.dumps(summary, indent=1))
print("home (not published):", HOME)
for r in routes:
    first = r["segments"][0][0]
    print(f'{r["date"]} {r["name"][:28]:28} segs={len(r["segments"])} start_off_home={dist_m((first[1], first[0]), HOME):.0f} m')
