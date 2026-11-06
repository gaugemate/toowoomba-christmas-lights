// Address search from G-NAF, Australia's official list of addresses (G-NAF © Geoscape Australia, CC BY 4.0).
// The Toowoomba region's addresses live in data/addresses/<first letter of street>.json (built by
// tools/build-addresses.py), so typing "12 Ruthven St" puts the dot on that exact property.
// No map or network service needed beyond fetching those small files, which the app then keeps.

const loaded = new Map(); // letter -> Promise of { base, streets }

function chunk(letter) {
  if (!loaded.has(letter)) {
    loaded.set(letter, fetch(`data/addresses/${letter}.json`).then(r => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).catch(e => { loaded.delete(letter); throw e; }));
  }
  return loaded.get(letter);
}

// What people type → what G-NAF calls it
const SHORT = {
  rd: 'road', tce: 'terrace', hwy: 'highway', pde: 'parade', cct: 'circuit', ct: 'court', crt: 'court',
  blvd: 'boulevard', bvd: 'boulevard', gve: 'grove', gr: 'grove', ln: 'lane', esp: 'esplanade', pkwy: 'parkway',
  wy: 'way', sq: 'square', cr: 'crescent', av: 'avenue', mt: 'mount', nth: 'north', sth: 'south', st: 'street'
};
const words = s => String(s).toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').replace(/'/g, '').split(/\s+/).filter(Boolean);
const queryWords = s => words(s).map(w => SHORT[w] || w);

// "3/45a Bob St" → { unit: '3', num: '45A', rest: 'Bob St' }; "Bob St" → { rest: 'Bob St' }
export function parseAddress(q) {
  const m = String(q).trim().match(/^(?:(?:unit|u)\s*)?(?:([0-9]+[a-z]?)\s*\/\s*)?([0-9]+[a-z]?(?:\s*-\s*[0-9]+[a-z]?)?)\s+(.+)$/i);
  if (!m) return { rest: String(q).trim() };
  return { unit: m[1] ? m[1].toUpperCase() : '', num: m[2].replace(/\s+/g, '').toUpperCase(), rest: m[3] };
}

// Does every typed word start one of the street's (then suburb's) words, in order, starting with the street name?
function matches(qw, nameWords, locWords) {
  const all = [...nameWords, ...locWords];
  if (!qw.length || !all[0].startsWith(qw[0])) return false;
  let i = 1;
  for (const w of qw.slice(1)) {
    while (i < all.length && !all[i].startsWith(w)) i++;
    if (i >= all.length) return false;
    i++;
  }
  return true;
}

const toLatLng = (base, la, ln) => [base[0] - la / 1e5, base[1] + ln / 1e5];

/** Places for what was typed, best first, in the same shape as the map search's results. */
export async function searchGnaf(q, limit = 6) {
  const { unit, num, rest } = parseAddress(q);
  const qw = queryWords(rest);
  if (!qw.length) return [];
  const first = qw[0][0];
  const data = await chunk(first >= 'a' && first <= 'z' ? first : '0');
  const base = data.base;
  const streets = data.streets.filter(([name, loc]) => matches(qw, words(name).map(w => SHORT[w] || w), words(loc)));
  // Exact street names first, then the bigger streets
  const typed = qw.join(' ');
  streets.sort((a, b) => (words(b[0]).join(' ').startsWith(typed) - words(a[0]).join(' ').startsWith(typed)) || b[3].length - a[3].length);

  const place = (name, loc, pc, la, ln, extra) => {
    const [lat, lng] = toLatLng(base, la, ln);
    return { title: name, line2: [loc, 'QLD', pc].filter(Boolean).join(' '), suburb: loc, lat, lng, ...extra };
  };
  const streetOnly = ([name, loc, pc, nums]) => { const mid = nums[Math.floor(nums.length / 2)]; return place(name, loc, pc, mid[1], mid[2], { hasNumber: false, isStreet: true }); };
  if (!num) return streets.slice(0, limit).map(streetOnly);

  // A house number: look for it on every matching street (long streets run through several suburbs)
  const want = unit ? `${unit}/${num}` : num;
  const n0 = parseInt(num, 10);
  const inRange = n => { const m = n.match(/^(\d+)[A-Z]?-(\d+)[A-Z]?$/); return m && +m[1] <= n0 && n0 <= +m[2]; };
  const exact = [], near = [];
  for (const [name, loc, pc, nums] of streets) {
    let hits = nums.filter(([n]) => n === want);
    if (!hits.length && !unit) {
      hits = nums.filter(([n]) => n.endsWith('/' + num)).slice(0, 3);      // only units listed: 1/45, 2/45 …
      if (!hits.length) hits = nums.filter(([n]) => inRange(n)).slice(0, 1); // inside a block like 8-12
    }
    for (const [n, la, ln] of hits) exact.push(place(`${n} ${name}`, loc, pc, la, ln, { hasNumber: true, exact: true, rank: n === want ? 0 : n.includes('/') ? 1 : 2 }));
    if (!hits.length) near.push(streetOnly([name, loc, pc, nums]));
  }
  // The exact address if we have it; otherwise the street, so the dot can be dragged onto a new house
  exact.sort((a, b) => a.rank - b.rank);
  const out = exact.length ? exact : near;
  return out.slice(0, limit);
}

// ---------- "What's the nearest address to here?" (for "Use where I am now") ----------
// data/addresses/near/<row>_<col>.json hold the region's street addresses in about 1 km squares.
const areas = new Map();
function area(r, c) {
  const k = `${r}_${c}`;
  if (!areas.has(k)) {
    areas.set(k, fetch(`data/addresses/near/${k}.json`).then(res => (res.ok ? res.json() : null)).catch(() => { areas.delete(k); return null; }));
  }
  return areas.get(k);
}
const metresBetween = (a, b) => {
  const toR = Math.PI / 180, dLat = (b[0] - a[0]) * toR, dLng = (b[1] - a[1]) * toR;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * toR) * Math.cos(b[0] * toR) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(s));
};

/** The nearest street address to a spot, or null outside the region: { title, line2, suburb, metres } */
export async function nearestAddress(lat, lng) {
  const BASE = [-27.0, 151.0];
  const la = (BASE[0] - lat) * 1e5, ln = (lng - BASE[1]) * 1e5;
  const r = Math.floor(la / 1000), c = Math.floor(ln / 1000);
  let best = null;
  const look = d => {
    if (!d) return;
    for (const [si, n, a, b] of d.a) {
      const m = metresBetween([lat, lng], [d.base[0] - a / 1e5, d.base[1] + b / 1e5]);
      if (!best || m < best.metres) { const [name, loc, pc] = d.s[si]; best = { metres: m, title: `${n} ${name}`, suburb: loc, line2: [loc, 'QLD', pc].filter(Boolean).join(' ') }; }
    }
  };
  look(await area(r, c));
  // Close to the edge of the square? The nearest address may be in the next one, so look there too
  const edge = Math.min(la - r * 1000, (r + 1) * 1000 - la, ln - c * 1000, (c + 1) * 1000 - ln) * 1.1; // metres, roughly
  if (!best || best.metres > edge) {
    const around = [];
    for (const dr of [-1, 0, 1]) for (const dc of [-1, 0, 1]) if (dr || dc) around.push(area(r + dr, c + dc));
    (await Promise.all(around)).forEach(look);
  }
  return best;
}
