// Route planner: picks which Christmas light displays to visit, and in what order, so a drive fits the time
// someone has. Pure functions with no map or network code, so it can be tested on its own (tests/planner.test.mjs).
//
// Nodes are numbered 0 = the start, then 1..n = the displays in the order given.
// matrix.durations[a][b] is driving seconds from node a to node b; matrix.distances[a][b] is metres.

export const SIZES = {
  1: { label: 'Small', hint: 'A few strings of lights', score: 1, view: 1.5 },
  2: { label: 'Medium', hint: 'House and garden lit up', score: 2, view: 2.5 },
  3: { label: 'Large', hint: 'The whole yard', score: 3.5, view: 4 },
  4: { label: 'Huge', hint: 'Worth the trip on its own', score: 5, view: 6 }
};

// Displays with music, or lights synchronised to music, play a song or two on a loop, so people stop for the whole show
export const MUSIC_VIEW_MIN = 15;
export const hasMusic = d => (d.features || []).some(f => f === 'music' || f === 'synced');

// Minutes spent looking at a display (slowing down, pulling over, or parking and walking)
export function viewMinutes(d) {
  let m = (SIZES[d.size] || SIZES[2]).view;
  if (d.viewing === 'walk') m += 5;
  if (hasMusic(d)) m = Math.max(m, MUSIC_VIEW_MIN);
  return m;
}

// ---------- Opening hours ----------
// "7pm – 10pm" -> { on: 1140, off: 1320 } in minutes after midnight. An off time after midnight goes past 1440
// ("7pm – 1am" -> off 1500). Older entries: "Dusk" counts as 7:30pm, "Late" as midnight. Unreadable -> null (any time).
export const DUSK = 19 * 60 + 30;
export function clockMinutes(text) {
  const s = String(text || '').trim().toLowerCase();
  if (s === 'dusk') return DUSK;
  if (s === 'late' || s === 'midnight') return 24 * 60;
  if (s === 'midday' || s === 'noon') return 12 * 60;
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (!m || +m[1] > 12 || +(m[2] || 0) > 59) return null;
  return ((+m[1] % 12) + (m[3] === 'pm' ? 12 : 0)) * 60 + +(m[2] || 0);
}
export function parseHours(hours) {
  const parts = String(hours || '').split(/\s*[–-]\s*/);
  if (parts.length !== 2) return null;
  const on = clockMinutes(parts[0]); let off = clockMinutes(parts[1]);
  if (on == null || off == null) return null;
  if (off <= on) off += 24 * 60; // switches off after midnight
  return { on, off };
}
// "1140" -> "7pm", 1290 -> "9:30pm", 1440 -> "midnight", 1500 -> "1am"
export function clockText(min) {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  if (m === 0) return 'midnight';
  const h = Math.floor(m / 60), mm = m % 60, h12 = h % 12 || 12;
  return `${h12}${mm ? ':' + String(mm).padStart(2, '0') : ''}${h < 12 ? 'am' : 'pm'}`;
}
// The time of night as minutes after midday-before, so 12:30am (30) comes after 11pm (1380): 30 -> 1470
export const nightMinutes = clockMin => (clockMin < 12 * 60 ? clockMin + 24 * 60 : clockMin);
// A display's opening hours as minutes from when the drive leaves (leaveClock = minutes after midnight)
export function windowFrom(d, leaveClock) {
  const h = parseHours(d.hours);
  if (!h) return null;
  const leave = nightMinutes(leaveClock);
  return { open: h.on - leave, close: h.off - leave, on: h.on, off: h.off };
}
// Arrive at least this many minutes before the lights go off, or it's not worth the trip
export const LAST_CALL = 5;

export function lightScore(d) {
  return (SIZES[d.size] || SIZES[2]).score;
}

export function haversineKm(a, b) {
  const R = 6371, toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR, dLng = (b.lng - a.lng) * toR;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Used when the road routing service can't be reached: straight-line distance stretched for real roads,
// at a suburban average speed. Good enough to plan with; the app labels it as an estimate.
export function estimateMatrix(points) {
  const n = points.length, durations = [], distances = [];
  for (let i = 0; i < n; i++) {
    durations.push(new Array(n)); distances.push(new Array(n));
    for (let j = 0; j < n; j++) {
      if (i === j) { durations[i][j] = 0; distances[i][j] = 0; continue; }
      const km = haversineKm(points[i], points[j]) * 1.4;
      distances[i][j] = km * 1000;
      durations[i][j] = (km / 32) * 3600 + 30;
    }
  }
  return { durations, distances, estimated: true };
}

// Small seeded random number generator, so the same request always gives the same routes
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Builds and scores routes for one set of display values (weights)
function makeSolver({ D, view, budget, returnToStart, W = null }) {
  const n = view.length; // displays; node of display i is i + 1
  const legEnd = (order, pos) => (pos < order.length ? order[pos] + 1 : (returnToStart ? 0 : -1));
  // Opening hours only matter if some display isn't on for the whole drive
  const hasWin = !!W && W.some(w => w && (w.open > 0 || w.close < budget + 30));
  // Minutes for the whole drive, waiting for lights to come on included; Infinity if a stop would be dark by then
  function sim(order) {
    let t = 0, prev = 0;
    for (const c of order) {
      t += D[prev][c + 1];
      const w = W && W[c];
      if (w) { if (t > w.close - LAST_CALL) return Infinity; if (t < w.open) t = w.open; }
      t += view[c]; prev = c + 1;
    }
    if (returnToStart && order.length) t += D[prev][0];
    return t;
  }
  // Can't get there before it switches off, even going straight there
  const unreachable = c => !!(W && W[c] && D[0][c + 1] > W[c].close - LAST_CALL);

  function driveMin(order) {
    let t = 0, prev = 0;
    for (const c of order) { t += D[prev][c + 1]; prev = c + 1; }
    if (returnToStart && order.length) t += D[prev][0];
    return t;
  }
  function totalMin(order) {
    if (hasWin) return sim(order);
    let v = 0; for (const c of order) v += view[c];
    return driveMin(order) + v;
  }
  // Untangling compares drives; with opening hours it compares whole drives that still work
  const routeCost = order => (hasWin ? sim(order) : driveMin(order));

  // Cheapest place to slot display c into the route, and the minutes it adds
  function bestInsert(order, c) {
    let best = Infinity, at = -1;
    for (let p = 0; p <= order.length; p++) {
      const a = p === 0 ? 0 : order[p - 1] + 1;
      const b = legEnd(order, p);
      const add = b === -1 ? D[a][c + 1] : D[a][c + 1] + D[c + 1][b] - D[a][b];
      if (add < best) { best = add; at = p; }
    }
    return { add: best + view[c], at };
  }

  // With opening hours: try the cheapest few places, keeping the first where every stop is still lit up
  function timedInsert(order, c, total) {
    const spots = [];
    for (let p = 0; p <= order.length; p++) {
      const a = p === 0 ? 0 : order[p - 1] + 1, b = legEnd(order, p);
      spots.push({ p, cost: b === -1 ? D[a][c + 1] : D[a][c + 1] + D[c + 1][b] - D[a][b] });
    }
    spots.sort((x, y) => x.cost - y.cost);
    for (const { p } of spots.slice(0, 5)) {
      const trial = order.slice(); trial.splice(p, 0, c);
      const t = sim(trial);
      if (t < Infinity) return { add: t - total, at: p };
    }
    return { add: Infinity, at: -1 };
  }

  // Untangle crossings: reverse stretches of the route while it makes the drive shorter
  function twoOpt(order) {
    if (order.length < 3) return order;
    let route = order.slice(), improved = true, guard = 0;
    while (improved && guard++ < 50) {
      improved = false;
      const base = routeCost(route);
      outer: for (let i = 0; i < route.length - 1; i++) {
        for (let k = i + 1; k < route.length; k++) {
          const cand = route.slice(0, i).concat(route.slice(i, k + 1).reverse(), route.slice(k + 1));
          if (routeCost(cand) < base - 1e-6) { route = cand; improved = true; break outer; }
        }
      }
    }
    return route;
  }

  // Greedy fill: keep adding the display with the best value for the extra minutes it costs
  function fill(order, used, w, rand, noise) {
    let total = totalMin(order);
    for (;;) {
      let pick = -1, pickAt = -1, pickAdd = 0, bestRatio = -Infinity;
      for (let c = 0; c < n; c++) {
        if (used[c] || w[c] <= 0 || unreachable(c)) continue;
        const { add, at } = hasWin ? timedInsert(order, c, total) : bestInsert(order, c);
        if (at < 0 || total + add > budget + 1e-9) continue;
        const ratio = (w[c] / (add + 0.5)) * (noise ? 1 + noise * (rand() - 0.5) : 1);
        if (ratio > bestRatio) { bestRatio = ratio; pick = c; pickAt = at; pickAdd = add; }
      }
      if (pick < 0) return order;
      order.splice(pickAt, 0, pick); used[pick] = true; total += pickAdd;
    }
  }

  function value(order, w) { let v = 0; for (const c of order) v += w[c]; return v; }

  function solve(w, { restarts = 60, seed = 1 } = {}) {
    if (hasWin) restarts = Math.min(restarts, 25); // each try costs more; still plenty
    const rand = rng(seed);
    let best = [], bestVal = -1, bestTime = Infinity;
    for (let r = 0; r < restarts; r++) {
      const used = new Array(n).fill(false);
      let order = fill([], used, w, rand, r === 0 ? 0 : 0.9);
      order = twoOpt(order);
      order = fill(order, used, w, rand, 0);
      const v = value(order, w), t = totalMin(order);
      if (v > bestVal + 1e-9 || (Math.abs(v - bestVal) < 1e-9 && t < bestTime)) { best = order; bestVal = v; bestTime = t; }
    }
    // Swap pass on the winner: drop a stop if better ones fit in its place
    const used = new Array(n).fill(false); for (const c of best) used[c] = true;
    return improveBySwaps(best, used, w);
  }

  function improveBySwaps(order, used, w) {
    let route = order.slice();
    for (let pass = 0; pass < 3; pass++) {
      let changed = false;
      for (let i = 0; i < route.length; i++) {
        const removed = route[i];
        const trial = route.slice(0, i).concat(route.slice(i + 1));
        const u = used.slice(); u[removed] = false;
        const blocked = w.slice(); blocked[removed] = 0; // don't just put the same one back
        let filled = fill(twoOpt(trial), u, blocked, null, 0);
        if (value(filled, w) > value(route, w) + 1e-9) {
          route = twoOpt(filled); used.splice(0, used.length, ...u); changed = true; break;
        }
      }
      if (!changed) break;
    }
    return route;
  }

  return { solve, driveMin, totalMin, hasWin };
}

/**
 * Plan up to three different drives.
 * @param {object} o
 * @param {Array} o.displays  displays to choose from: { id, lat, lng, size, viewing }
 * @param {object} o.matrix   { durations, distances } for [start, ...displays]
 * @param {number} o.budgetMin minutes available, viewing included
 * @param {boolean} o.returnToStart finish back where you started
 * @param {number} o.slow     stretch on driving times for crawling past lights (1.2 = 20% slower)
 */
export function planRoutes({ displays, matrix, budgetMin, returnToStart = true, slow = 1.2, seed = 7, leaveClock = null }) {
  const n = displays.length;
  if (!n) return [];
  const D = matrix.durations.map(row => row.map(s => (s == null ? Infinity : (s * slow) / 60)));
  const view = displays.map(viewMinutes);
  const score = displays.map(lightScore);
  // Opening hours, as minutes from when you leave (only when we know when that is)
  const W = leaveClock == null ? null : displays.map(d => windowFrom(d, leaveClock));
  const solver = makeSolver({ D, view, budget: budgetMin, returnToStart, W });

  const most = solver.solve(score.map(s => 1 + 0.3 * s), { seed });
  const best = solver.solve(score.map(s => s * s), { seed: seed + 1 });
  const inMost = new Set(most);
  const fresh = solver.solve(score.map((s, i) => (1 + 0.3 * s) * (inMost.has(i) ? 0.2 : 1)), { seed: seed + 2 });

  const options = [
    { key: 'most', title: 'See the most', blurb: 'The most displays in your time', order: most },
    { key: 'best', title: 'Biggest and best', blurb: 'Fewer stops, the big displays', order: best },
    { key: 'fresh', title: 'Different streets', blurb: 'Mostly other displays', order: fresh }
  ];

  const out = [];
  for (const o of options) {
    if (!o.order.length) continue;
    const set = new Set(o.order);
    const dupe = out.some(r => overlap(set, new Set(r.order)) >= 0.75);
    if (dupe) continue;
    out.push(describe(o, displays, matrix, D, view, returnToStart, slow, W));
  }
  // When the area is small enough that the drives come out alike, offer a shorter one instead,
  // so there's still a real choice (e.g. for tired kids)
  if (out.length < 3 && budgetMin >= 40) {
    const quickSolver = makeSolver({ D, view, budget: budgetMin * 0.6, returnToStart, W });
    const quick = quickSolver.solve(score.map(s => s * s), { seed: seed + 3 });
    const longest = out.length ? out[0].totalMin : Infinity;
    if (quick.length && quickSolver.totalMin(quick) < longest * 0.8) {
      out.push(describe({ key: 'quick', title: 'Shorter drive', blurb: 'The best ones in less time', order: quick }, displays, matrix, D, view, returnToStart, slow, W));
    }
  }
  return out;
}

function overlap(a, b) {
  let common = 0; for (const x of a) if (b.has(x)) common++;
  return common / Math.max(1, Math.min(a.size, b.size));
}

function describe(o, displays, matrix, D, view, returnToStart, slow, W = null) {
  let t = 0, drive = 0, metres = 0, prev = 0, wait = 0;
  const stops = [];
  for (const c of o.order) {
    const leg = D[prev][c + 1];
    drive += leg; t += leg; metres += matrix.distances[prev][c + 1] || 0;
    const win = W && W[c];
    const waitMin = win && t < win.open ? win.open - t : 0; // there before the lights come on
    stops.push({ display: displays[c], index: c, arriveMin: t, waitMin, viewMin: view[c], hours: win ? { on: win.on, off: win.off, close: win.close } : null });
    t += waitMin + view[c]; wait += waitMin; prev = c + 1;
  }
  let backMin = 0;
  if (returnToStart) {
    backMin = D[prev][0]; drive += backMin; t += backMin; metres += matrix.distances[prev][0] || 0;
  }
  return {
    key: o.key, title: o.title, blurb: o.blurb, order: o.order, stops,
    count: stops.length, totalMin: t, driveMin: drive, viewMin: t - drive - wait, waitMin: wait, km: metres / 1000, backMin,
    estimated: !!matrix.estimated, slow
  };
}

/**
 * Roughly how long it takes to see every display in a list: a sensible order (nearest next, then untangled),
 * straight-line road estimates, and viewing time at each. start is optional; without it the drive starts at
 * whichever display gives the shortest drive.
 */
export function tourMinutes({ start = null, displays, returnToStart = true, slow = 1.2 }) {
  const n = displays.length;
  if (!n) return { minutes: 0, driveMin: 0, viewMin: 0, count: 0 };
  const pts = start ? [start, ...displays] : displays.slice();
  const M = estimateMatrix(pts).durations.map(r => r.map(s => (s * slow) / 60));
  const closed = !!start && returnToStart;
  const length = t => {
    let x = 0; for (let i = 1; i < t.length; i++) x += M[t[i - 1]][t[i]];
    return x + (closed && t.length > 1 ? M[t[t.length - 1]][t[0]] : 0);
  };
  function nearestFrom(first) {
    const left = new Set(pts.map((_, i) => i)); left.delete(first);
    const t = [first];
    while (left.size) {
      const last = t[t.length - 1]; let best = -1;
      for (const j of left) if (best < 0 || M[last][j] < M[last][best]) best = j;
      t.push(best); left.delete(best);
    }
    return t;
  }
  function untangle(t) {
    let improved = true, guard = 0;
    while (improved && guard++ < 30) {
      improved = false;
      for (let i = 1; i < t.length - 1; i++) for (let k = i + 1; k < t.length; k++) {
        const cand = t.slice(0, i).concat(t.slice(i, k + 1).reverse(), t.slice(k + 1));
        if (length(cand) < length(t) - 1e-6) { t = cand; improved = true; }
      }
    }
    return t;
  }
  const firsts = start ? [0] : pts.map((_, i) => i);
  let best = null;
  for (const f of firsts) { const t = untangle(nearestFrom(f)); if (!best || length(t) < length(best)) best = t; }
  const driveMin = length(best);
  const viewMin = displays.reduce((a, d) => a + viewMinutes(d), 0);
  return { minutes: driveMin + viewMin, driveMin, viewMin, count: n };
}

// Displays you could reach and get back from at all within the time, best first; caps the list for the
// road-time lookup (the free routing service takes up to about 100 points per request).
export function shortlist(start, displays, budgetMin, max = 70) {
  const scored = displays
    .map(d => {
      const km = haversineKm(start, d);
      const roughRound = ((km * 1.4 * 2) / 32) * 60 + viewMinutes(d);
      return { d, km, ok: roughRound <= budgetMin * 1.15 };
    })
    .filter(x => x.ok)
    .sort((a, b) => a.km / lightScore(a.d) - b.km / lightScore(b.d));
  return scored.slice(0, max).map(x => x.d);
}

// The radio station from a display's notes: "Tune to 87.6 FM" -> "87.6 FM"; "88 fm" -> "88 FM"; none -> ''
export function radioStation(notes) {
  const t = String(notes || '');
  let m = t.match(/\b(\d{2,4}(?:\.\d{1,2})?)\s*(FM|AM|MHz)\b/i);
  if (m) return `${m[1]} ${m[2].toUpperCase() === 'MHZ' ? 'FM' : m[2].toUpperCase()}`;
  m = t.match(/\b(8[89]|9\d|10[0-7])\.\d\b/); // a bare FM frequency like 87.6–107.9
  return m ? `${m[0]} FM` : '';
}
