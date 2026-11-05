// Talks to the free map services. Every call has a fallback, so the app still works (with estimates)
// if a service is slow, down or blocked.
import { CONFIG } from './config.js';
import { estimateMatrix } from './planner.js';

function withTimeout(ms, outer) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  if (outer) outer.addEventListener('abort', () => ctl.abort(), { once: true });
  return { signal: ctl.signal, done: () => clearTimeout(t) };
}

async function getJSON(url, ms = 8000, outer) {
  const { signal, done } = withTimeout(ms, outer);
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally { done(); }
}

function placeFromPhoton(f) {
  const p = f.properties || {};
  const [lng, lat] = f.geometry.coordinates;
  const street = [p.housenumber, p.street].filter(Boolean).join(' ');
  const title = (p.name && !p.housenumber ? p.name : street) || p.name || p.locality || p.city || 'Unnamed place';
  const suburb = p.district || p.locality || (p.city !== title ? p.city : '') || '';
  const line2 = [title !== street ? street : '', suburb, p.state === 'Queensland' ? 'QLD' : p.state, p.postcode]
    .filter(Boolean).join(', ');
  const isStreet = p.type === 'street' || p.osm_key === 'highway';
  return { title, line2, suburb, lat, lng, hasNumber: !!p.housenumber, isStreet };
}

// Address search as you type, biased to the town
export async function searchAddress(q, signal) {
  const [w, s, e, n] = CONFIG.searchBox;
  const url = `${CONFIG.photon}/api/?q=${encodeURIComponent(q)}&limit=6&lang=en&lat=${CONFIG.center[0]}&lon=${CONFIG.center[1]}` +
    `&bbox=${w},${s},${e},${n}`;
  const data = await getJSON(url, 6000, signal);
  const seen = new Set();
  return (data.features || []).map(placeFromPhoton).filter(p => {
    const k = p.title + p.line2; if (seen.has(k)) return false; seen.add(k); return true;
  });
}

// Street name for a spot on the map (used for "Use where I am now")
export async function nameOfPlace(lat, lng) {
  try {
    const data = await getJSON(`${CONFIG.photon}/reverse?lat=${lat}&lon=${lng}&lang=en`, 5000);
    if (data.features && data.features.length) return placeFromPhoton(data.features[0]);
  } catch (e) { /* fall through */ }
  return null;
}

const coordList = pts => pts.map(p => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join(';');

// Driving times between every pair of points. Falls back to straight-line estimates.
export async function roadMatrix(points) {
  try {
    const data = await getJSON(`${CONFIG.osrm}/table/v1/driving/${coordList(points)}?annotations=duration,distance`, 12000);
    if (data.code !== 'Ok' || !data.durations) throw new Error(data.code || 'no table');
    const n = points.length;
    if (data.durations.length !== n || data.durations.some(r => r.length !== n)) throw new Error('table size mismatch');
    const est = estimateMatrix(points);
    // Any pair the road service couldn't join (e.g. a point off the road network) uses the estimate
    const fix = (m, e) => m.map((row, i) => row.map((v, j) => (v == null ? e[i][j] : v)));
    return { durations: fix(data.durations, est.durations), distances: fix(data.distances || est.distances, est.distances), estimated: false };
  } catch (e) {
    console.warn('Road times unavailable, using estimates', e);
    return estimateMatrix(points);
  }
}

// The line to draw along the roads, as [lat, lng] pairs. Falls back to straight lines between stops.
export async function roadLine(points) {
  try {
    const data = await getJSON(`${CONFIG.osrm}/route/v1/driving/${coordList(points)}?overview=full&geometries=geojson`, 12000);
    if (data.code !== 'Ok') throw new Error(data.code);
    return { line: data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]), estimated: false };
  } catch (e) {
    return { line: points.map(p => [p.lat, p.lng]), estimated: true };
  }
}

// Opening the phone's own maps app for turn-by-turn directions
// Turn-by-turn steps from where you are to one display. Returns null if the road service doesn't answer.
export async function roadSteps(from, to) {
  try {
    const data = await getJSON(`${CONFIG.osrm}/route/v1/driving/${coordList([from, to])}?overview=full&geometries=geojson&steps=true`, 10000);
    if (data.code !== 'Ok' || !data.routes.length) throw new Error(data.code);
    const r = data.routes[0];
    const steps = r.legs[0].steps.map(s => ({
      type: s.maneuver.type, modifier: s.maneuver.modifier, exit: s.maneuver.exit, name: s.name || '',
      location: [s.maneuver.location[1], s.maneuver.location[0]]
    }));
    return { steps, line: r.geometry.coordinates.map(([lng, lat]) => [lat, lng]), metres: r.distance, seconds: r.duration };
  } catch (e) {
    console.warn('No turn-by-turn steps', e);
    return null;
  }
}

// A real street address (with a house number) is what Google shows on arrival, so use it when there is one;
// otherwise the exact map position
const destText = to => (/^\d+[a-z]?\s/i.test(to.address || '') ? `${to.address}, ${to.suburb ? to.suburb + ' ' : ''}QLD` : `${to.lat},${to.lng}`);

// dir_action=navigate starts the spoken turn-by-turn straight away instead of showing a route preview first
export function navigateUrl(to) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destText(to))}&travelmode=driving&dir_action=navigate`;
}

// iPhones without the Google Maps app get Apple Maps, which also talks you there turn by turn
export function appleMapsUrl(to) {
  return `https://maps.apple.com/?daddr=${to.lat},${to.lng}&dirflg=d`;
}
export const isIPhone = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// Google Maps takes only a few stops per link on a phone, so long drives are split into legs of 4 stops
export function googleLegs(start, stops, returnToStart) {
  const pts = stops.map(s => s.display);
  const legs = [];
  let from = start, i = 0;
  while (i < pts.length) {
    const chunk = pts.slice(i, i + 4);
    const dest = chunk[chunk.length - 1];
    const via = chunk.slice(0, -1).map(p => `${p.lat},${p.lng}`).join('|');
    legs.push({
      label: chunk.length === 1 ? `Stop ${i + 1}` : `Stops ${i + 1}–${i + chunk.length}`,
      url: `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}&destination=${dest.lat},${dest.lng}` +
        (via ? `&waypoints=${encodeURIComponent(via)}` : '') + '&travelmode=driving'
    });
    from = dest; i += 4;
  }
  if (returnToStart && pts.length) {
    legs.push({ label: 'Back to start', url: `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}&destination=${start.lat},${start.lng}&travelmode=driving` });
  }
  return legs;
}
