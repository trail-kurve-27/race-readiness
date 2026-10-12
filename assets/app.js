/* Formkurve: renders data/data.js (window.DATA) into the page. No build step. */
(function () {
  "use strict";
  const D = window.DATA, S = D.summary;
  const $ = (id) => document.getElementById(id);
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const LOC = "de-DE";
  const nf = (x, d = 0) => Number(x).toLocaleString(LOC, { minimumFractionDigits: d, maximumFractionDigits: d });
  const day = (iso) => new Date(iso + "T12:00:00");
  const dShort = (iso) => day(iso).toLocaleDateString(LOC, { day: "numeric", month: "short" });
  const dLong = (iso) => day(iso).toLocaleDateString(LOC, { day: "numeric", month: "long", year: "numeric" });
  const hms = (s) => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(x).padStart(2, "0"); };
  const pace = (s) => hms(s) + "/km";
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const today = day(S.today);

  /* ------------------------------------------------------------ hero */
  $("asof").textContent = "Stand " + dLong(S.today);
  $("lastact").textContent = "Letzte Aktivität " + dShort(S.last_activity);
  $("headline").innerHTML = nf(S.hyrox_days) + " Tage<br>bis <em>Basel</em>.";
  $("lede").textContent = "HYROX solo am 12. Februar 2027, Ziel unter 1:10. Dazu ein Halbmarathon unter 1:30 und ein Trailmarathon.";
  const gap = S.hm_now_s - S.hm_goal_s;
  const goals = [
    { l: "HYROX Basel, solo", big: nf(Math.floor(S.hyrox_days / 7)) + " Wochen", sub: "Ziel unter 1:10. Berlin 1:18 war im Doppel." },
    { l: "Halbmarathon, Schätzung", big: hms(S.hm_now_s), sub: "Ziel 1:30:00, Lücke " + hms(gap) + ". Stuttgart im Mai: rund " + hms(S.hm_base_min * 60).replace(/:00$/, "") + "." },
    { l: "Trailmarathon", big: "offen", sub: "Noch kein Rennen gewählt. Längster Lauf zuletzt " + nf(S.longest28_km, 1) + " km." },
  ];
  $("goals").innerHTML = goals.map((g) => `<div class="goal"><span class="label">${g.l}</span><span class="big num">${g.big}</span><span class="sub">${g.sub}</span></div>`).join("");

  const st = $("status");
  const pk = S.acwr_peak;
  if (S.days_since_last >= 5) {
    st.classList.add("warn");
    $("statusT").textContent = "Seit " + S.days_since_last + " Tagen keine Aktivität in Strava";
    $("statusB").textContent = "Letzte Einheit am " + dShort(S.last_activity) + ". Falls du trainiert hast: Synchronisierung Garmin zu Strava prüfen. Falls es eine Pause war: nach der Spitzenwoche (Belastungsquote " + nf(pk ? pk.ratio : 0, 2) + " am " + (pk ? dShort(pk.date) : "") + ") war sie sinnvoll.";
  } else if (S.acwr_now > 1.5) {
    st.classList.add("crit");
    $("statusT").textContent = "Belastungsquote " + nf(S.acwr_now, 2) + ": deutlich über deinem Schnitt";
    $("statusB").textContent = nf(S.acute_now, 1) + " km in 7 Tagen gegen " + nf(S.chronic_now, 1) + " km Wochenschnitt. Nächste Woche bei etwa " + nf(S.chronic_now * 1.2, 0) + " km bleiben.";
  } else if (S.acwr_now > 1.3) {
    st.classList.add("warn");
    $("statusT").textContent = "Belastungsquote " + nf(S.acwr_now, 2) + ": oberer Rand";
    $("statusB").textContent = "Diese Woche nicht weiter steigern.";
  } else {
    st.classList.add("good");
    $("statusT").textContent = "Belastungsquote " + nf(S.acwr_now, 2) + ": im grünen Bereich";
    $("statusB").textContent = nf(S.acute_now, 1) + " km in 7 Tagen, " + nf(S.chronic_now, 1) + " km Wochenschnitt.";
  }

  /* ------------------------------------------------------------ chart defaults */
  if (window.Chart) {
    Chart.defaults.font.family = '"Instrument Sans","Helvetica Neue",Arial,sans-serif';
    Chart.defaults.font.size = 12;
    Chart.defaults.color = css("--ink-3");
    Chart.defaults.animation = false;
    Chart.defaults.maintainAspectRatio = false;
    Chart.defaults.plugins.legend.display = false;
    Object.assign(Chart.defaults.plugins.tooltip, { backgroundColor: css("--ink"), padding: 10, cornerRadius: 6, displayColors: false, titleFont: { weight: "600" } });
  }
  const axisX = () => ({ grid: { display: false }, border: { color: css("--rule") }, ticks: { maxRotation: 0, autoSkip: true, autoSkipPadding: 14 } });
  const axisY = () => ({ grid: { color: css("--rule") }, border: { display: false }, ticks: { padding: 6 } });

  /* ------------------------------------------------------------ map */
  const routes = D.routes;
  let ri = Math.max(0, routes.findIndex((r) => r.id === "20451600461"));
  let map = null, mapReady = false, profileChart = null;
  const MAP_STYLE = "https://tiles.openfreemap.org/styles/positron";
  const DEM = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";

  function routeGeo(r) { return { type: "Feature", properties: {}, geometry: { type: "MultiLineString", coordinates: r.segments } }; }

  function initMap() {
    if (!window.maplibregl) return fail("Die Kartenbibliothek konnte nicht geladen werden.");
    try {
      map = new maplibregl.Map({
        container: "map", style: MAP_STYLE, center: [9.38, 47.38], zoom: 10.5, pitch: 55, bearing: -15, maxPitch: 75,
        attributionControl: { compact: true, customAttribution: "Gelände: AWS Terrain Tiles" },
        cooperativeGestures: true,
        locale: {
          "CooperativeGesturesHandler.WindowsHelpText": "Strg + Scrollen zum Zoomen",
          "CooperativeGesturesHandler.MacHelpText": "⌘ + Scrollen zum Zoomen",
          "CooperativeGesturesHandler.MobileHelpText": "Mit zwei Fingern bewegen",
        },
      });
    } catch (e) { return fail("Dein Browser kann die 3D-Karte nicht darstellen (WebGL fehlt)."); }
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(new maplibregl.FullscreenControl(), "top-right");
    map.on("load", () => {
      const dem = { type: "raster-dem", tiles: [DEM], encoding: "terrarium", tileSize: 256, maxzoom: 14 };
      map.addSource("dem", dem);
      map.addSource("dem-hs", dem);
      const firstSymbol = (map.getStyle().layers.find((l) => l.type === "symbol") || {}).id;
      map.addLayer({ id: "hillshade", type: "hillshade", source: "dem-hs",
        paint: { "hillshade-exaggeration": 0.45, "hillshade-shadow-color": "#4f5753", "hillshade-highlight-color": "#ffffff", "hillshade-accent-color": "#6c7470" } }, firstSymbol);
      map.setTerrain({ source: "dem", exaggeration: 1.5 });
      try { map.setSky({ "sky-color": "#dfe7ec", "horizon-color": "#f4f5f2", "fog-color": "#f4f5f2", "sky-horizon-blend": 0.6, "horizon-fog-blend": 0.6, "fog-ground-blend": 0.4 }); } catch (e) { /* older renderer */ }
      map.addSource("route", { type: "geojson", data: routeGeo(routes[ri]) });
      map.addLayer({ id: "route-casing", type: "line", source: "route", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#ffffff", "line-width": 8 } });
      map.addLayer({ id: "route", type: "line", source: "route", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": css("--signal"), "line-width": 4.5 } });
      mapReady = true;
      showRoute(ri, true);
    });
  }
  function fail(msg) { $("map").innerHTML = `<div class="mapfail"><p>${esc(msg)}</p></div>`; }

  function fit(r, instant) {
    if (!map || !mapReady) return;
    let w = 180, e = -180, s = 90, n = -90;
    r.segments.forEach((seg) => seg.forEach(([x, y]) => { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }));
    const narrow = window.innerWidth <= 700;
    map.fitBounds([[w, s], [e, n]], {
      padding: narrow ? { top: 50, bottom: 30, left: 30, right: 50 } : { top: 70, bottom: 70, left: 470, right: 80 },
      pitch: 55, bearing: -15, duration: instant ? 0 : 1400, maxZoom: 15,
    });
  }

  function showRoute(i, instant) {
    ri = (i + routes.length) % routes.length;
    const r = routes[ri];
    $("rDate").textContent = dLong(r.date);
    $("rName").textContent = r.name;
    $("rStats").innerHTML = [
      [nf(r.km, 1) + " km", "Distanz"], [nf(r.elev) + " m", "Höhenmeter"], [hms(r.time_s), "Zeit"], [hms(r.pace_s), "Pace /km"],
    ].map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join("");
    $("routeSel").value = String(ri);
    if (mapReady) { map.getSource("route").setData(routeGeo(r)); fit(r, instant); }
    drawProfile(r);
  }

  function drawProfile(r) {
    const wrap = $("profileWrap");
    if (!r.alt || !window.Chart) { wrap.hidden = true; return; }
    wrap.hidden = false;
    const n = r.alt.length, step = r.km / (n - 1);
    const pts = r.alt.map((a, i) => ({ x: i * step, y: a }));
    if (profileChart) profileChart.destroy();
    const ctx = $("profile").getContext("2d");
    const g = ctx.createLinearGradient(0, 0, 0, 84);
    g.addColorStop(0, "rgba(226,70,42,.28)"); g.addColorStop(1, "rgba(226,70,42,0)");
    profileChart = new Chart($("profile"), {
      type: "line",
      data: { datasets: [{ data: pts, borderColor: css("--signal"), borderWidth: 1.8, backgroundColor: g, fill: "start", pointRadius: 0, tension: 0.25 }] },
      options: {
        interaction: { mode: "index", intersect: false },
        scales: {
          x: { type: "linear", min: 0, max: r.km, grid: { display: false }, border: { display: false }, ticks: { callback: (v) => nf(v) + " km", maxTicksLimit: 5, font: { size: 11 } } },
          y: { grid: { color: css("--rule") }, border: { display: false }, ticks: { callback: (v) => nf(v) + " m", maxTicksLimit: 3, font: { size: 11 } } },
        },
        plugins: { tooltip: { callbacks: { title: (c) => nf(c[0].parsed.x, 1) + " km", label: (c) => nf(c.parsed.y) + " m ü. M." } } },
      },
    });
  }

  $("routeSel").innerHTML = routes.map((r, i) => `<option value="${i}">${esc(dShort(r.date))} · ${esc(r.name)} · ${nf(r.km, 1)} km</option>`).join("");
  $("routeSel").addEventListener("change", (e) => showRoute(+e.target.value));
  $("prev").addEventListener("click", () => showRoute(ri - 1));
  $("next").addEventListener("click", () => showRoute(ri + 1));
  showRoute(ri, true);
  initMap();
  let rt; window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => fit(routes[ri], true), 200); });

  /* ------------------------------------------------------------ load */
  $("kpis").innerHTML = [
    [nf(S.km28, 1), "Kilometer, letzte 28 Tage"], [nf(S.vert28), "Höhenmeter, letzte 28 Tage"],
    [nf(S.runs28), "Läufe, letzte 28 Tage"], [nf(S.longest28_km, 1) + " km", "Längster Lauf, letzte 28 Tage"],
  ].map(([v, l]) => `<div class="kpi"><b>${v}</b><span>${l}</span></div>`).join("");

  const bands = (ranges) => ({ id: "bands", beforeDatasetsDraw(c) {
    const { ctx, chartArea: a, scales: { y } } = c; ctx.save();
    ranges.forEach(([lo, hi, col]) => { const t = y.getPixelForValue(Math.min(hi, y.max)), b = y.getPixelForValue(Math.max(lo, y.min)); ctx.fillStyle = col; ctx.fillRect(a.left, t, a.right - a.left, b - t); });
    ctx.restore(); } });

  if (window.Chart) {
    const wk = D.weeks;
    const o1 = { scales: { x: { ...axisX(), stacked: true }, y: { ...axisY(), stacked: true, title: { display: true, text: "km" } },
      y2: { position: "right", grid: { display: false }, border: { display: false }, title: { display: true, text: "Hm" } } },
      plugins: { tooltip: { callbacks: { title: (c) => "Woche ab " + dShort(wk[c[0].dataIndex].week), label: (c) => c.dataset.label + ": " + nf(c.raw, c.datasetIndex === 2 ? 0 : 1) } } } };
    new Chart($("cWeeks"), { type: "bar", data: { labels: wk.map((w) => dShort(w.week)), datasets: [
      { label: "Laufen km", data: wk.map((w) => w.run_km), backgroundColor: css("--ink"), borderRadius: 3, stack: "k", maxBarThickness: 22 },
      { label: "Wandern km", data: wk.map((w) => w.hike_km), backgroundColor: "#c9ccc8", borderRadius: 3, stack: "k", maxBarThickness: 22 },
      { type: "line", label: "Höhenmeter", data: wk.map((w) => w.run_vert), borderColor: css("--signal"), backgroundColor: css("--signal"), borderWidth: 2, pointRadius: 0, tension: 0.3, yAxisID: "y2" },
    ] }, options: o1 });

    const ac = D.acwr.filter((x) => x.date >= "2026-08-20");
    new Chart($("cAcwr"), { type: "line", data: { labels: ac.map((x) => dShort(x.date)), datasets: [{
      data: ac.map((x) => x.ratio), borderColor: css("--ink"), borderWidth: 2, tension: 0.2, spanGaps: false,
      pointRadius: ac.map((x) => (S.acwr_peak && x.date === S.acwr_peak.date ? 5 : 0)), pointBackgroundColor: css("--signal"), pointBorderColor: css("--signal") }] },
      options: { scales: { x: axisX(), y: { ...axisY(), min: 0, max: 2.4, ticks: { callback: (v) => nf(v, 1) } } },
        plugins: { tooltip: { callbacks: { label: (c) => { const x = ac[c.dataIndex]; return x.ratio == null ? "zu wenig Daten" : ["Quote " + nf(x.ratio, 2), "7 Tage: " + nf(x.acute, 1) + " km", "Schnitt: " + nf(x.chronic, 1) + " km/Woche"]; } } } } },
      plugins: [bands([[0.8, 1.3, css("--alpine-soft")], [1.5, 2.4, css("--signal-soft")]])] });

    /* -------------------------------------------------------- fitness */
    $("fitH").textContent = "Effizienz bei " + nf(S.ef_pct, 1) + " % der Frühjahrsform";
    const pts = D.eff.map((e) => ({ x: day(e.date).getTime(), y: e.ef, e }));
    const flat = pts.filter((p) => p.e.flat), hilly = pts.filter((p) => !p.e.flat);
    new Chart($("cEff"), { type: "scatter", data: { datasets: [
      { data: flat, backgroundColor: css("--ink"), pointRadius: flat.map((p) => (p.e.race ? 8 : 5)), pointStyle: flat.map((p) => (p.e.race ? "rectRot" : "circle")) },
      { data: hilly, backgroundColor: "transparent", borderColor: css("--ink-3"), borderWidth: 1.5, pointRadius: 5 },
      { type: "line", data: [{ x: day("2026-03-25").getTime(), y: S.ef_spring }, { x: day("2026-06-25").getTime(), y: S.ef_spring }], borderColor: css("--ink-3"), borderDash: [4, 4], borderWidth: 1.2, pointRadius: 0 },
      { type: "line", data: [{ x: day("2026-08-25").getTime(), y: S.ef_now }, { x: today.getTime(), y: S.ef_now }], borderColor: css("--signal"), borderDash: [4, 4], borderWidth: 1.5, pointRadius: 0 },
    ] }, options: {
      scales: { x: { type: "linear", ...axisX(), ticks: { callback: (v) => dShort(new Date(v).toISOString().slice(0, 10)), maxTicksLimit: 7 } },
        y: { ...axisY(), title: { display: true, text: "Watt pro bpm" }, ticks: { callback: (v) => nf(v, 1) } } },
      plugins: { tooltip: { filter: (c) => c.datasetIndex < 2, callbacks: { title: (c) => c[0].raw.e.name, label: (c) => { const e = c.raw.e;
        return [dLong(e.date), "Effizienz " + nf(e.ef, 2), "Puls " + e.hr + ", " + pace(e.pace) + ", " + nf(e.km, 1) + " km", e.flat ? "flach" : "hügelig oder bergab"]; } } } } } });
  }

  /* ------------------------------------------------------------ projector */
  const RATES = { low: 0.0025, mid: 0.004, high: 0.006 };
  function project(rate, weeks) {
    let t = S.hm_now_s, j = 0; const out = [t];
    for (let i = 0; i < weeks; i++) {
      if (t > S.hm_base_s) t = Math.max(S.hm_base_s, t * 0.99);
      else { t = t * (1 - rate * Math.pow(0.97, j)); j++; }
      out.push(t);
    }
    return out;
  }
  const weeksTo = (rate) => { const i = project(rate, 104).findIndex((t) => t <= S.hm_goal_s); return i < 0 ? null : i; };
  let scen = "mid", projChart = null;
  function drawProj() {
    const v = $("raceDate").value || "2027-03-28";
    const wk = Math.max(1, Math.round((day(v) - today) / (7 * 864e5)));
    const n = Math.max(wk + 2, 30);
    const P = {}; for (const k in RATES) P[k] = project(RATES[k], n);
    $("projT").textContent = hms(P[scen][wk]);
    $("projR").textContent = hms(P.high[wk]) + " bis " + hms(P.low[wk]);
    const w = weeksTo(RATES[scen]);
    const when = (w2) => new Date(today.getTime() + w2 * 7 * 864e5).toLocaleDateString(LOC, { month: "long", year: "numeric" });
    $("projHit").innerHTML = w === null ? '<span class="pill crit">nicht innerhalb von 2 Jahren</span>'
      : w <= wk ? '<span class="pill good">ja, nach etwa ' + w + " Wochen</span>"
      : '<span class="pill warn">erst ab ' + when(w) + "</span>";
    if (!window.Chart) return;
    if (projChart) projChart.destroy();
    const labels = Array.from({ length: n + 1 }, (_, i) => i);
    projChart = new Chart($("cProj"), { type: "line", data: { labels, datasets: [
      { label: "locker", data: P.low, borderColor: "#c9ccc8", borderWidth: 1.2, pointRadius: 0, fill: false },
      { label: "ambitioniert", data: P.high, borderColor: "#c9ccc8", borderWidth: 1.2, pointRadius: 0, fill: "-1", backgroundColor: "rgba(17,19,18,.05)" },
      { label: "gewählt", data: P[scen], borderColor: css("--ink"), borderWidth: 2.5, pointRadius: labels.map((i) => (i === wk ? 6 : 0)), pointBackgroundColor: css("--signal"), pointBorderColor: css("--signal") },
      { label: "Ziel 1:30", data: labels.map(() => S.hm_goal_s), borderColor: css("--signal"), borderWidth: 1.5, borderDash: [5, 4], pointRadius: 0 },
    ] }, options: {
      interaction: { mode: "index", intersect: false },
      scales: { x: { ...axisX(), ticks: { autoSkip: false, callback: (v) => (v % 6 === 0 ? dShort(new Date(today.getTime() + v * 7 * 864e5).toISOString().slice(0, 10)) : "") } },
        y: { ...axisY(), ticks: { callback: (v) => hms(v) } } },
      plugins: { tooltip: { callbacks: { title: (c) => dShort(new Date(today.getTime() + c[0].dataIndex * 7 * 864e5).toISOString().slice(0, 10)), label: (c) => c.dataset.label + ": " + hms(c.raw) } } } } });
  }
  document.querySelectorAll(".seg button").forEach((b) => b.addEventListener("click", () => {
    scen = b.dataset.r; document.querySelectorAll(".seg button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); drawProj(); }));
  $("raceDate").addEventListener("input", drawProj);
  drawProj();

  /* ------------------------------------------------------------ hyrox */
  const hx = D.activities.filter((a) => /hyrox/i.test(a.name) && a.date >= "2026-08-28" && a.type !== "Hyrox");
  $("hyroxCount").innerHTML = "<b>Seit dem Umzug nach St. Gallen sind " + hx.length + " HYROX-Einheiten in Strava erfasst.</b> Für die Stationen als Engpass ist das wenig. Ziel bis Basel: mindestens eine pro Woche.";

  /* ------------------------------------------------------------ week plan */
  const PLAN = window.PLAN || [];
  if (PLAN.length) { $("weekLbl").textContent = "Nächste 7 Tage · " + dShort(PLAN[0].d) + " bis " + dShort(PLAN[PLAN.length - 1].d);
  const PM = window.PLAN_META || {};
  if (PM.title) $("weekH").textContent = PM.title;
  $("weekLede").textContent = PM.lede || "";
  $("week").innerHTML = PLAN.map((p) => `<article class="day"><div class="dd"><b>${day(p.d).toLocaleDateString(LOC, { weekday: "short" })}</b><span class="small">${dShort(p.d)}</span></div>
    <span class="kind ${p.k}">${p.t}</span><p>${esc(p.s)}</p>${p.w ? `<span class="where">${esc(p.w)}</span>` : ""}<span class="vol">${p.v}</span></article>`).join(""); }

  /* ------------------------------------------------------------ feed */
  const TYPE = { Run: "Lauf", TrailRun: "Traillauf", Hike: "Wanderung", Hyrox: "HYROX-Rennen", Workout: "Workout", Ride: "Rad", Swim: "Schwimmen", WeightTraining: "Kraft", RockClimbing: "Bouldern" };
  let shown = 15;
  function drawFeed() {
    const rows = D.activities.slice(0, shown).map((a) => {
      const dist = a.km ? `<div class="v">${nf(a.km, 1)}<small>km</small></div>` : `<div class="v"></div>`;
      const elev = a.elev ? `<div class="v opt">${nf(a.elev)}<small>Hm</small></div>` : `<div class="v opt"></div>`;
      const time = `<div class="v">${hms(a.min * 60).replace(/:00$/, "")}<small>Zeit</small></div>`;
      const last = a.pace_s ? `<div class="v opt">${hms(a.pace_s)}<small>/km</small></div>` : a.hr ? `<div class="v opt">${a.hr}<small>bpm</small></div>` : `<div class="v opt"></div>`;
      return `<div class="row"><span class="d">${dShort(a.date)}</span><div style="min-width:0"><div class="t">${esc(a.name)}</div><div class="ty">${TYPE[a.type] || a.type}</div></div>${dist}${time}${elev}${last}</div>`;
    });
    $("feed").innerHTML = rows.join("");
    $("more").hidden = shown >= D.activities.length;
  }
  $("more").addEventListener("click", () => { shown += 25; drawFeed(); });
  drawFeed();

  /* ------------------------------------------------------------ method */
  $("method").innerHTML = [
    "Effizienz = mittlere Laufleistung (Watt) geteilt durch mittleren Puls. Verglichen werden nur flache Läufe: unter 15 Höhenmeter pro km und keine Strecken mit Gefälle.",
    "Frühjahrswert = Mittel der flachen Läufe März bis Juni 2026. Aktueller Wert = Mittel der letzten drei flachen Läufe seit September.",
    "Halbmarathon-Schätzung = Stuttgart-Zeit vom Mai mal Frühjahrseffizienz geteilt durch aktuelle Effizienz. Ein 10-km-Testlauf ersetzt diese Schätzung durch einen echten Wert.",
    "Prognose: Zuerst wird der Abstand zum Stuttgart-Niveau mit etwa 1 % pro Woche aufgeholt. Danach verbessert sich die Zeit pro Woche um 0,25 %, 0,40 % oder 0,60 % je nach Umfang, und dieser Zuwachs nimmt jede Woche um 3 % ab.",
    "Belastungsquote = Laufkilometer der letzten 7 Tage geteilt durch den Wochenschnitt der letzten 28 Tage. Unter 5 km Wochenschnitt wird keine Quote berechnet.",
    "Doppelt erfasste Einheiten (8. Mai, 2. Oktober) sind zusammengeführt. „Main Lauf“ am 25. September hat keinen Puls und fehlt in der Effizienz.",
  ].map((t) => `<li>${esc(t)}</li>`).join("");
  $("privR").textContent = nf(S.privacy_radius_m);

  /* ------------------------------------------------------------ nav highlight */
  const links = [...document.querySelectorAll(".nav a.link")];
  const secs = links.map((l) => document.querySelector(l.getAttribute("href")));
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) links.forEach((l) => l.classList.toggle("on", l.getAttribute("href") === "#" + e.target.id)); }), { rootMargin: "-40% 0px -55% 0px" });
    secs.forEach((s) => s && io.observe(s));
  }
})();
