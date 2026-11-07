// Toowoomba Christmas Lights app: Plan a drive, All lights, Add my lights, and Approvals (#admin, not on the menu).
import { CONFIG } from './config.js';
import { SIZES, planRoutes, shortlist, tourMinutes, hasMusic, MUSIC_VIEW_MIN, radioStation, parseHours, clockText, clockMinutes, nightMinutes, LAST_CALL } from './planner.js';
import * as svc from './services.js';
import { searchGnaf, nearestAddress } from './gnaf.js';
import { openStore, cleanEntry, newSeasonYear, THUMB_MAX, PHOTO_MAX, offTonight } from './store.js';
import { Guide, fmtDist, metres, bearingWords } from './guide.js';

const L = window.L;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ICON = {
  pin: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z"/></svg>',
  locate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3"/></svg>',
  nav: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 3 3 10.5l7.2 2.3L12.5 20z"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 2.5 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"/></svg>',
  // Line icons for the card headings and buttons (same style as the bottom menu)
  pinLine: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
  map: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5V4l-6 2.5z"/><path d="M9 4v13M15 6.5v13"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
  route: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="5" r="2.5"/><path d="M8.5 19H15a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h6.5"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  printer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>',
  tick: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.6"/></svg>',
  picture: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/></svg>'
};
// A white card with a round icon and a heading (the spec's content card)
const cardHead = (icon, title, extra = '') => `<div class="card-heading"><span class="card-icon">${icon}</span><h2>${title}</h2>${extra}</div>`;

const FEATURES = {
  music: 'Music', synced: 'Lights to music', animated: 'Moving lights', inflatables: 'Inflatables',
  walkthrough: 'Walk-through', santa: 'Santa visits', charity: 'Charity collection', radio: 'Tune car radio'
};
const WHATS_IN_IT = Object.keys(FEATURES).filter(k => k !== 'radio');
const RADIO_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="9" width="18" height="11" rx="2"/><path d="M7 9 17 4"/><circle cx="8" cy="14.5" r="2"/><path d="M14 13h4M14 16h4"/></svg>';
// Lights on / off: real times only, so drives can tell when a display is on ("Dusk" and "Late" were too vague)
const HOURS_FROM = ['5pm', '5:30pm', '6pm', '6:30pm', '7pm', '7:30pm', '8pm', '8:30pm', '9pm', '9:30pm', '10pm'];
const HOURS_TO = ['8pm', '8:30pm', '9pm', '9:30pm', '10pm', '10:30pm', '11pm', '11:30pm', 'Midnight', '12:30am', '1am', '1:30am', '2am'];
// Older entries: "Dusk" counts as 7:30pm and "Late" as midnight
const tidyHour = h => { const t = String(h || '').trim(); return /^dusk$/i.test(t) ? '7:30pm' : /^(late|midnight)$/i.test(t) ? 'Midnight' : t; };
// It's dark enough for the lights from about here (Toowoomba, December)
const DARK = 19 * 60 + 15;
const MAX_MIN = 300; // longest drive you can ask for (5 hours)
const ROUTE_COLOURS = ['#c62828', '#0b5a9c', '#7b3fa0'];

const state = {
  store: null,
  displays: [],
  tab: 'plan',
  plan: { start: null, suburbs: new Set(), minutes: 120, back: true, step: 'form', routes: null, chosen: 0, lines: [], driveAt: 0 },
  add: { done: false, editing: null },
  adminOpen: new Set(), // displays opened on the Admin page's list (kept open when the list refreshes)
  maps: {}
};

/* ---------- small helpers ---------- */
const pad = n => String(n).padStart(2, '0');
const isoDay = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const litTonight = d => { const t = isoDay(new Date()); return (!d.from || d.from <= t) && (!d.until || d.until >= t); };
// On tonight: within its dates, and not switched off for tonight by the person who added it
const onTonight = d => litTonight(d) && !offTonight(d);
const preSeason = () => state.displays.length > 0 && !state.displays.some(litTonight);
const stars = n => '★'.repeat(n);
const fmtDate = iso => { if (!iso) return ''; const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }); };
const sizeName = n => (SIZES[n] || SIZES[2]).label;

// Displays this phone has ticked "Seen it" (kept on this phone only, no sign-up)
const SEEN_KEY = 'tcl.seen';
const seen = new Set((() => { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); } catch (e) { return []; } })());
function setSeen(id, yes) {
  yes ? seen.add(id) : seen.delete(id);
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...seen])); } catch (e) { /* private mode */ }
}
const seenCount = () => state.displays.filter(d => seen.has(d.id)).length;

function fmtDur(min) {
  min = Math.round(min);
  if (min < 60) return `<span class="big-n">${min}</span><small>min</small>`;
  const h = Math.floor(min / 60), m = min % 60;
  return `<span class="big-n">${h}</span><small>h</small>${m ? ` <span class="big-n">${pad(m)}</span>` : ''}`;
}
const fmtDurText = min => { min = Math.round(min); if (min < 60) return `${min} min`; const h = Math.floor(min / 60), m = min % 60; return m ? `${h} h ${pad(m)}` : `${h} h`; };
// When the drive leaves: now, or the time picked under "Leaving"
function leaveDate() {
  const L = state.plan.leave, now = new Date();
  if (L == null) return now;
  const d = new Date(now); d.setHours(Math.floor(L / 60), L % 60, 0, 0);
  if (d < now) { if (now - d < 6 * 3600000) return now; d.setDate(d.getDate() + 1); } // that time has passed: go now
  return d;
}
const leaveClock = () => { const d = leaveDate(); return d.getHours() * 60 + d.getMinutes(); };
const leaveWords = () => (state.plan.leave == null || leaveDate() - new Date() < 60000 ? 'now' : `at ${clockText(leaveClock())}`);
// Planning in the daytime (6am to 4pm): lights aren't on yet, so drives ignore the hours (and we say so)
const daytime = c => c >= 6 * 60 && c < 16 * 60;
const clock = addMin => new Date(leaveDate().getTime() + addMin * 60000).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }).replace(/\s?([ap])\.?m\.?/i, ' $1m');

function clearToasts() { $$('.toast').forEach(t => t.remove()); }
function toast(msg) {
  clearToasts();
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg; document.body.append(t);
  setTimeout(() => { t.style.opacity = '0'; }, 3200);
  setTimeout(() => t.remove(), 3700);
}

function suburbsWithCounts() {
  const m = new Map();
  for (const d of state.displays) if (d.suburb) m.set(d.suburb, (m.get(d.suburb) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
function suburbCentres() {
  const m = new Map();
  for (const d of state.displays) {
    const s = m.get(d.suburb) || { lat: 0, lng: 0, n: 0 };
    s.lat += d.lat; s.lng += d.lng; s.n++; m.set(d.suburb, s);
  }
  return [...m.entries()].map(([name, s]) => ({ title: name, line2: `Middle of ${name}`, suburb: name, lat: s.lat / s.n, lng: s.lng / s.n }));
}

// "Rangeville", "Rangeville and Highfields", "those 3 suburbs"
function suburbsLabel(set) {
  const s = [...set];
  return s.length === 1 ? s[0] : s.length === 2 ? s.join(' and ') : `those ${s.length} suburbs`;
}

// A pop-up box over the page. buttons: [{ id, text, cls }]; each closes the pop-up, then runs onButton(id)
function popup(html, buttons, onButton = () => {}) {
  closePopup();
  const o = document.createElement('div');
  o.id = 'popup'; o.className = 'overlay'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true');
  o.innerHTML = `<div class="card arrive popup">${html}<div class="popbtns">${buttons.map(b => `<button class="btn wide ${b.cls || ''}" type="button" data-pop="${b.id}">${b.text}</button>`).join('')}</div></div>`;
  document.body.append(o);
  o.addEventListener('click', e => { const b = e.target.closest('[data-pop]'); if (b) { closePopup(); onButton(b.dataset.pop); } });
  $('[data-pop]', o)?.focus();
}
function closePopup() { const o = $('#popup'); if (o) o.remove(); }

/* ---------- maps ---------- */
function makeMap(el, { zoom = CONFIG.zoom, center = CONFIG.center } = {}) {
  const map = L.map(el, { zoomControl: false, attributionControl: true }).setView(center, zoom);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  const tiles = L.tileLayer(CONFIG.tiles.url + (CONFIG.cartoKey ? `?key=${encodeURIComponent(CONFIG.cartoKey)}` : ''), { attribution: CONFIG.tiles.attribution, subdomains: CONFIG.tiles.subdomains, maxZoom: CONFIG.tiles.maxZoom }).addTo(map);
  // If the street pictures can't load (no signal, or a page that blocks them), say so rather than show a blank map
  let failed = 0, loaded = 0;
  tiles.on('tileload', () => { loaded++; el.querySelector('.tilenote')?.remove(); });
  tiles.on('tileerror', () => {
    if (++failed < 3 || loaded || el.querySelector('.tilenote')) return;
    el.insertAdjacentHTML('beforeend', '<div class="tilenote">The street map can\'t load right now (check your signal). The lights and directions still work.</div>');
  });
  setTimeout(() => map.invalidateSize(), 50);
  return map;
}
function pinIcon(cls, size, text = '') {
  return L.divIcon({ className: '', html: `<div class="pin ${cls}" style="width:${size}px;height:${size}px">${text}</div>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
}
const lightIcon = d => (seen.has(d.id) ? pinIcon('light seen', Math.max(22, 12 + d.size * 3), ICON.tick)
  : pinIcon(!offTonight(d) && (litTonight(d) || preSeason()) ? 'light' : 'off', 12 + d.size * 3));

/* ---------- address search box ---------- */
// "12 Ruthven St" → "12"; "3/45 Bob St" → "3/45"; "12a Bob St" → "12a"
const leadingNumber = q => (String(q || '').match(/^\s*(\d+[a-z]?(?:\s*\/\s*\d+[a-z]?)?)\s+\S/i) || [])[1]?.replace(/\s+/g, '') || '';
const withoutNumber = q => String(q || '').replace(/^\s*\d+[a-z]?(?:\s*\/\s*\d+[a-z]?)?\s+/i, '');

function addressBox(host, { placeholder, onPick, onClear }) {
  host.innerHTML = `<div class="search">${ICON.search}<input type="search" enterkeyhint="search" autocomplete="off" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}">
    <button class="clear" type="button" aria-label="Clear" hidden>×</button></div><ul class="results" role="listbox"></ul>`;
  const input = $('input', host), list = $('.results', host), clear = $('.clear', host);
  let timer = 0, ctl = null, results = [];
  const show = (items, offline) => {
    // The map knows few house numbers: keep the one that was typed, e.g. "12 Ruthven" → "12 Ruthven Street"
    const num = leadingNumber(input.value);
    results = items.map(p => (num && !p.hasNumber && (p.isStreet || /street|st\b|road|rd\b|avenue|ave\b|drive|dr\b|court|ct\b|crescent|cres|place|pl\b|close|parade|terrace|way|lane|circuit|boulevard|grove|highway|esplanade/i.test(p.title)))
      ? { ...p, title: `${num} ${p.title}`, hasNumber: true, typedNumber: true } : p);
    list.innerHTML = results.length
      ? results.map((p, i) => `<li><button type="button" data-i="${i}"><b>${esc(p.title)}</b><small>${esc(p.line2)}</small></button></li>`).join('')
      : `<li class="none">${offline ? "Address search isn't working right now. Try a suburb name." : 'No matches yet. Keep typing the street name.'}</li>`;
  };
  const search = async q => {
    if (ctl) ctl.abort();
    ctl = new AbortController();
    const local = suburbCentres().filter(s => s.title.toLowerCase().includes(q.toLowerCase()));
    const signal = ctl.signal;
    // 1. Australia's official address list (G-NAF): exact house positions across the Toowoomba region
    let official = [];
    try { official = await searchGnaf(q); } catch (e) { official = []; }
    if (signal.aborted || input.value.trim() !== q) return;
    if (official.some(p => p.exact)) return show(official);
    if (official.length) show(official); // show these straight away; the map search may add more below
    // 2. The map search, for parks, landmarks and anything the address list doesn't have
    try {
      let found = await svc.searchAddress(q, signal);
      if (!found.length && leadingNumber(q)) found = await svc.searchAddress(withoutNumber(q), signal);
      if (input.value.trim() !== q) return;
      const seen = new Set(official.map(p => (p.title + '|' + p.suburb).toLowerCase()));
      const extra = found.filter(p => !seen.has((p.title + '|' + p.suburb).toLowerCase()));
      const all = [...official, ...extra].slice(0, 6);
      show(all.length ? all : local);
    } catch (e) {
      if (e.name !== 'AbortError' && input.value.trim() === q) show(official.length ? official : local, !official.length);
    }
  };
  input.addEventListener('input', () => {
    const q = input.value.trim();
    clear.hidden = !q;
    clearTimeout(timer);
    if (ctl) ctl.abort();
    if (q.length < 3) { list.innerHTML = ''; return; }
    // Show straight away that it's looking, so nobody thinks they need to press Enter
    if (!list.querySelector('button')) list.innerHTML = '<li class="none searching">Searching…</li>';
    timer = setTimeout(() => search(q), 200);
  });
  // Enter / Search on the keyboard: search now instead of waiting
  input.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const q = input.value.trim();
    if (q.length >= 2) { clearTimeout(timer); search(q); }
  });
  // Bring the box near the top when typing starts, so the suggestions aren't hidden behind the phone's keyboard
  input.addEventListener('focus', () => {
    setTimeout(() => {
      const sc = $('#scroller'), top = input.getBoundingClientRect().top;
      if (top > 110) sc.scrollTo({ top: sc.scrollTop + top - 90, behavior: 'smooth' });
    }, 300);
  });
  list.addEventListener('click', e => {
    const b = e.target.closest('button[data-i]'); if (!b) return;
    const p = results[+b.dataset.i];
    list.innerHTML = ''; input.value = '';
    onPick(p);
  });
  clear.addEventListener('click', () => { input.value = ''; list.innerHTML = ''; clear.hidden = true; input.focus(); onClear && onClear(); });
  return { focus: () => input.focus() };
}

function pickedHTML(p, change = 'Change') {
  return `<div class="picked">${ICON.pin}<div><b>${esc(p.title)}</b><small>${esc(p.line2 || '')}</small></div><button type="button" data-act="change">${change}</button></div>`;
}

/* =================================================================== PLAN A DRIVE */
function renderPlan() {
  const v = $('#view-plan'), P = state.plan;
  v.className = 'view';
  if (P.step === 'results') return renderResults(v);
  if (P.step === 'route') return renderRoute(v);
  if (P.step === 'drive') return renderDrive(v);
  if (P.step === 'drive-done') return endDriveDone();

  const subs = suburbsWithCounts();
  v.innerHTML = `
    <div class="page-heading"><h1>Plan a lights drive</h1><p>Find the best Christmas light displays around Toowoomba.</p></div>
    <div class="card">
      ${cardHead(ICON.pinLine, 'Where are you starting?')}
      <div id="startBox"></div>
      <button class="btn primary wide" id="useHere" type="button">${ICON.locate}Use where I am now</button>
    </div>
    <div class="card">
      ${cardHead(ICON.map, 'Which suburbs?')}
      <div class="chips more" id="subChips">
        <button class="chip" type="button" data-sub="" aria-pressed="${P.suburbs.size === 0}">Anywhere near me</button>
        ${subs.map(([s, n], i) => `<button class="chip${i >= 8 ? ' extra' : ''}" type="button" data-sub="${esc(s)}" aria-pressed="${P.suburbs.has(s)}">${esc(s)} <small>${n}</small></button>`).join('')}
      </div>
      ${subs.length > 8 ? '<button class="linkbtn" type="button" id="moreSubs">Show all suburbs</button>' : ''}
    </div>
    <div class="card">
      ${cardHead(ICON.clock, 'How long have you got?')}
      <div class="timepick">
        <button class="step" type="button" id="less" aria-label="Less time">−</button>
        <div class="bigtime" id="bigTime" aria-live="polite"></div>
        <button class="step" type="button" id="more" aria-label="More time">+</button>
      </div>
      <div class="field leaving"><label for="leaveAt">Leaving</label><select id="leaveAt">${leaveOptions()}</select></div>
      <p class="endtime" id="endTime"></p>
      <div class="allhint" id="allHint" role="status" hidden></div>
      <div class="seg" role="group" aria-label="Where to finish">
        <button type="button" data-back="1" aria-pressed="${P.back}">Finish back here</button>
        <button type="button" data-back="0" aria-pressed="${!P.back}">Finish anywhere</button>
      </div>
    </div>
    <button class="btn go wide" id="findBtn" type="button">${ICON.route}Plan my drive${ICON.arrow}</button>
    <p class="status" id="planStatus" role="status"></p>
    ${preSeason() ? '<p class="note">The lights season hasn\'t started yet, so drives use every display on the list.</p>' : ''}`;

  let drawHint = () => {}; // filled in below, once the time box exists
  const startBox = $('#startBox', v);
  const drawStart = () => {
    drawHint();
    if (P.start) {
      startBox.innerHTML = pickedHTML(P.start);
      $('[data-act=change]', startBox).onclick = () => { P.start = null; drawStart(); };
    } else {
      const box = addressBox(startBox, { placeholder: 'Type a street, park or suburb', onPick: p => { P.start = p; drawStart(); } });
      return box;
    }
  };
  drawStart();

  $('#useHere', v).onclick = () => useMyLocation($('#useHere', v), $('#planStatus', v), p => { P.start = p; drawStart(); });

  $('#subChips', v).onclick = e => {
    const b = e.target.closest('[data-sub]'); if (!b) return;
    const s = b.dataset.sub;
    if (!s) P.suburbs.clear(); else if (P.suburbs.has(s)) P.suburbs.delete(s); else P.suburbs.add(s);
    $$('[data-sub]', v).forEach(c => c.setAttribute('aria-pressed', c.dataset.sub ? P.suburbs.has(c.dataset.sub) : P.suburbs.size === 0));
    drawHint();
  };
  const more = $('#moreSubs', v);
  if (more) more.onclick = () => { const c = $('#subChips', v); c.classList.toggle('open'); more.textContent = c.classList.contains('open') ? 'Show fewer' : 'Show all suburbs'; };

  const drawTime = () => {
    const h = Math.floor(P.minutes / 60), m = P.minutes % 60;
    $('#bigTime', v).innerHTML = (h ? `<span class="big">${h}</span><span class="u">h</span>` : '') + (m || !h ? `<span class="big">${h ? pad(m) : m}</span><span class="u">min</span>` : '');
    $('#endTime', v).innerHTML = `${P.back ? 'Back where you started' : 'Finished'} by about <b>${clock(P.minutes)}</b> if you leave ${leaveWords()}`;
    $('#less', v).disabled = P.minutes <= 30; $('#more', v).disabled = P.minutes >= MAX_MIN;
    drawHint();
  };
  // With suburbs picked: how long it would take to see every display in them
  drawHint = () => {
    const box = $('#allHint', v);
    if (!P.suburbs.size) { box.hidden = true; return; }
    const pool = (preSeason() ? state.displays.filter(d => !offTonight(d)) : state.displays.filter(onTonight)).filter(d => P.suburbs.has(d.suburb));
    if (!pool.length) { box.hidden = false; box.innerHTML = 'No displays are on tonight in the suburbs you picked.'; return; }
    const t = tourMinutes({ start: P.start, displays: pool, returnToStart: P.back, slow: CONFIG.slowDriving });
    const need = Math.ceil(t.minutes / 15) * 15;
    const music = pool.filter(hasMusic).length;
    const where = suburbsLabel(P.suburbs);
    const what = pool.length === 1 ? 'the 1 display' : `all ${pool.length} displays`;
    box.hidden = false;
    box.innerHTML = `To see ${what} in ${esc(where)} takes about <b>${fmtDurText(need)}</b>` +
      `${P.start ? (P.back ? ', there and back' : ' from your start') : ''}.` +
      (music ? ` That allows ${MUSIC_VIEW_MIN} minutes at ${music === 1 ? 'the display' : `each of the ${music} displays`} with music or lights to music.` : '') +
      (need === P.minutes ? '' : need <= MAX_MIN ? ` <button class="linkbtn" type="button" id="useAll">Set ${fmtDurText(need)}</button>`
        : ` That's more than ${MAX_MIN / 60} hours, so your drive will pick the best ones.`);
    const use = $('#useAll', box);
    if (use) use.onclick = () => { P.minutes = need; drawTime(); };
  };
  $('#less', v).onclick = () => { P.minutes = Math.max(30, P.minutes - 15); drawTime(); };
  $('#more', v).onclick = () => { P.minutes = Math.min(MAX_MIN, P.minutes + 15); drawTime(); };
  $$('[data-back]', v).forEach(b => b.onclick = () => { P.back = b.dataset.back === '1'; $$('[data-back]', v).forEach(x => x.setAttribute('aria-pressed', x === b)); drawTime(); });
  drawTime();

  $('#leaveAt', v).onchange = e => { P.leave = e.target.value === '' ? null : +e.target.value; drawTime(); };
  $('#findBtn', v).onclick = findDrives;
}

// "Now", then every half hour from the next one until 11:30pm (from 4pm when it's still daytime)
function leaveOptions() {
  const P = state.plan, now = new Date(), c = now.getHours() * 60 + now.getMinutes();
  if (P.leave != null && leaveDate() - now < 60000) P.leave = null; // a time that has come and gone
  const opts = [];
  for (let m = Math.max(Math.ceil((c + 1) / 30) * 30, 16 * 60); m <= 23 * 60 + 30; m += 30) opts.push(m);
  if (P.leave != null && !opts.includes(P.leave)) opts.push(P.leave);
  return `<option value="" ${P.leave == null ? 'selected' : ''}>Now</option>` + opts.sort((a, b) => a - b)
    .map(m => `<option value="${m}" ${P.leave === m ? 'selected' : ''}>${clockText(m)}</option>`).join('');
}

// ---------- Before you go: anything about tonight's lights worth knowing before you set off ----------
function beforeYouGo(r, { stops = true } = {}) {
  const P = state.plan, lc = leaveClock(), out = [];
  const n = (k, one, many) => (k === 1 ? one : many.replace('#', k));
  if (daytime(lc)) out.push(`It's only ${clockText(lc)}, so the lights won't be on yet and these times don't allow for when each display is on. <button class="linkbtn" type="button" data-later>Plan for 7:30pm tonight</button>`);
  else if (nightMinutes(lc) < DARK) out.push(`It's still light at ${clockText(lc)}. Christmas lights look best once it's dark, from about ${clockText(DARK)}. <button class="linkbtn" type="button" data-later>Plan for 7:30pm instead</button>`);
  if (P.hoursUsed && stops) {
    for (const s of r.stops) {
      if (!s.hours) continue;
      const reach = s.arriveMin + s.waitMin, a = esc(s.display.address);
      if (s.waitMin >= 1) out.push(`You'll get to <b>${a}</b> a little early. Its lights come on at ${clockText(s.hours.on)}, so we've allowed ${Math.round(s.waitMin)} min to wait.`);
      else if (s.hours.close - reach < 30) out.push(`<b>${a}</b> switches off at ${clockText(s.hours.off)} and you'll get there at about ${clock(reach).replace(' ', '')}, ${s === r.stops[0] ? "so it's your first stop" : "so don't stay too long at the stops before it"}.`);
    }
  }
  const off = P.leftOut?.off.length || 0, closed = P.leftOut?.closed.length || 0;
  if (off) out.push(`${n(off, '1 display has', '# displays have')} been switched off tonight by ${n(off, 'its owner', 'their owners')} (bad weather, or a problem with the lights), so we've left ${n(off, 'it', 'them')} out.`);
  if (closed) out.push(`${n(closed, '1 display has', '# displays have')} already switched off for the night, so we've left ${n(closed, 'it', 'them')} out.`);
  if (!out.length) return '';
  return `<div class="card byg"><h2>Before you go</h2><ul>${out.map(x => `<li>${x}</li>`).join('')}</ul></div>`;
}
function wireBeforeYouGo(v) {
  $$('[data-later]', v).forEach(b => b.onclick = () => { const P = state.plan; P.leave = 19 * 60 + 30; P.step = 'form'; renderPlan(); scrollTop(); findDrives(); });
}

function useMyLocation(btn, status, done) {
  if (!navigator.geolocation) { status.className = 'status err'; status.textContent = "This phone can't share its location here. Type an address instead."; return; }
  btn.disabled = true; status.className = 'status'; status.textContent = 'Finding where you are…';
  navigator.geolocation.getCurrentPosition(async pos => {
    const { latitude: lat, longitude: lng } = pos.coords;
    // Name the spot by the nearest street address from the official list ("84 Hume Street"); the map
    // service's name (often a nearby business) is only the fallback outside the region or away from houses
    let near = null;
    try { near = await nearestAddress(lat, lng); } catch (e) { near = null; }
    let place;
    if (near && near.metres <= 60) place = { title: near.title, line2: near.line2, suburb: near.suburb };
    else if (near && near.metres <= 250) place = { title: `Near ${near.title}`, line2: near.line2, suburb: near.suburb };
    else {
      const named = await svc.nameOfPlace(lat, lng);
      place = { title: named ? named.title : 'Where you are now', line2: named ? named.line2 : 'Your current location', suburb: named?.suburb || '' };
    }
    btn.disabled = false; status.textContent = '';
    done({ ...place, lat, lng }); // the drive still starts from the phone's actual position
  }, () => {
    btn.disabled = false; status.className = 'status err';
    status.textContent = "Couldn't get your location. Check location is allowed for this app, or type an address.";
  }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
}

async function findDrives() {
  const P = state.plan, v = $('#view-plan'), status = $('#planStatus', v), btn = $('#findBtn', v);
  if (!P.start) { status.className = 'status err'; status.textContent = 'Choose where you are starting first.'; $('#startBox input', v)?.focus(); return; }
  if (!state.displays.length) { status.className = 'status err'; status.innerHTML = 'No displays are on the map yet. Got lights? <a href="#add">Be the first to add yours</a>.'; return; }
  // Fresh details first if ours are a few minutes old (someone may have switched their lights off since)
  if (Date.now() - (state.loadedAt || 0) > 3 * 60000) { status.className = 'status'; status.textContent = 'Checking which lights are on…'; await loadDisplays(); }
  const area = P.suburbs.size ? state.displays.filter(d => P.suburbs.has(d.suburb)) : state.displays;
  const lc = leaveClock(), useHours = !daytime(lc);
  // Left out, so we can say why: switched off tonight, or already off for the night by the time you leave
  const closed = d => { const h = parseHours(d.hours); return useHours && h && h.off - nightMinutes(lc) < LAST_CALL; };
  P.leftOut = { off: area.filter(d => litTonight(d) && offTonight(d)), closed: area.filter(d => onTonight(d) && closed(d)) };
  let pool = (preSeason() ? area.filter(d => !offTonight(d)) : area.filter(onTonight)).filter(d => !closed(d));
  const list = shortlist(P.start, pool, P.minutes);
  if (!list.length) {
    status.className = 'status err';
    if (!pool.length && (P.leftOut.off.length || P.leftOut.closed.length)) { status.textContent = 'All the displays there are switched off for tonight. Try other suburbs.'; return; }
    status.textContent = P.suburbs.size ? 'No displays in those suburbs fit that time. Add more time or pick other suburbs.' : 'No displays are close enough for that time. Try adding more time.';
    return;
  }
  btn.disabled = true; status.className = 'status'; status.textContent = 'Working out the best drives…';
  const matrix = await svc.roadMatrix([P.start, ...list]);
  const routes = planRoutes({ displays: list, matrix, budgetMin: P.minutes, returnToStart: P.back, slow: CONFIG.slowDriving, leaveClock: useHours ? lc : null });
  P.hoursUsed = useHours;
  btn.disabled = false; status.textContent = '';
  if (!routes.length) {
    status.className = 'status err';
    const firstOn = Math.min(...list.map(d => parseHours(d.hours)?.on ?? Infinity));
    if (useHours && firstOn < Infinity && nightMinutes(lc) + P.minutes < firstOn + 10) {
      status.innerHTML = `The lights there don't come on until ${clockText(firstOn)}. <button class="linkbtn" type="button" data-later>Plan for 7:30pm tonight</button>`;
      wireBeforeYouGo(v);
    } else status.textContent = 'Nothing fits in that time. Try a little longer.';
    return;
  }
  P.routes = routes; P.chosen = 0; P.lines = []; P.step = 'results'; P.pool = pool; P.allMin = null;
  renderPlan(); scrollTop();
  // Road lines arrive a moment later and are drawn when ready
  routes.forEach((r, i) => {
    const pts = [P.start, ...r.stops.map(s => s.display), ...(P.back ? [P.start] : [])];
    svc.roadLine(pts).then(res => { P.lines[i] = res.line; drawLines(); });
  });
}

function routePoints(r) { return [state.plan.start, ...r.stops.map(s => s.display)]; }

function drawLines() {
  const P = state.plan, map = state.maps.plan;
  if (!map || !P.routes) return;
  if (state.maps.planLayer) state.maps.planLayer.remove();
  const g = L.layerGroup().addTo(map);
  state.maps.planLayer = g;
  const show = P.step === 'route' ? [P.chosen] : P.routes.map((_, i) => i).sort((a, b) => (a === P.chosen) - (b === P.chosen));
  for (const i of show) {
    const r = P.routes[i];
    const line = P.lines[i] || [...routePoints(r), ...(P.back ? [P.start] : [])].map(p => [p.lat, p.lng]);
    const on = i === P.chosen;
    L.polyline(line, { color: '#111', weight: on ? 9 : 6, opacity: on ? 0.55 : 0.25 }).addTo(g);
    L.polyline(line, { color: ROUTE_COLOURS[i], weight: on ? 6 : 4, opacity: on ? 1 : 0.6, dashArray: P.lines[i] ? null : '8 8' }).addTo(g);
    if (P.step === 'route' || on) r.stops.forEach((s, k) => L.marker([s.display.lat, s.display.lng], { icon: pinIcon('stop', 26, k + 1), zIndexOffset: 500 }).addTo(g));
  }
  L.marker([P.start.lat, P.start.lng], { icon: pinIcon('start', 34, 'Start'), zIndexOffset: 1000 }).addTo(g);
}

// Displays within ~10 m of each other (e.g. two houses both left at the middle of their street)
// would hide each other; give each its own spot in a small ring around the shared point
function spreadPositions(list) {
  const groups = new Map(), out = new Map();
  for (const d of list) {
    const k = `${d.lat.toFixed(4)},${d.lng.toFixed(4)}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(d);
  }
  for (const g of groups.values()) {
    if (g.length === 1) { out.set(g[0].id, [g[0].lat, g[0].lng]); continue; }
    const r = 0.00009 + 0.00002 * g.length; // about 10–20 m
    g.forEach((d, i) => {
      const a = (2 * Math.PI * i) / g.length - Math.PI / 2;
      out.set(d.id, [d.lat + r * Math.sin(a), d.lng + (r * Math.cos(a)) / Math.cos((d.lat * Math.PI) / 180)]);
    });
  }
  return out;
}
const nearSameSpot = (a, b) => metres([a.lat, a.lng], [b.lat, b.lng]) < 12;

// Fit the map to these points, never zooming in closer than maxZoom (so one dot doesn't fill the screen)
function fitTo(map, pts, maxZoom = 18) {
  if (!pts.length) return;
  map.fitBounds(L.latLngBounds(pts.map(p => [p.lat, p.lng])).pad(0.12), { animate: false, maxZoom });
}
const TOWN_ZOOM = 12;   // all of Toowoomba on a phone screen
const SUBURB_ZOOM = 14; // one suburb

// "6 of the 11 displays in Rangeville and Highfields. The other 5 need about another 1 h 30."
function coverageLine(r) {
  const P = state.plan, pool = P.pool || [];
  if (!pool.length) return '';
  const where = P.suburbs.size ? `in ${esc(suburbsLabel(P.suburbs))}` : 'around Toowoomba';
  if (r.count >= pool.length) return `<p class="cover all">${pool.length === 1 ? 'The 1 display' : `All ${pool.length} displays`} ${where}.</p>`;
  const missing = pool.length - r.count;
  let extra = '';
  if (P.suburbs.size) {
    P.allMin ??= tourMinutes({ start: P.start, displays: pool, returnToStart: P.back, slow: CONFIG.slowDriving }).minutes;
    const more = Math.max(15, Math.ceil((P.allMin - r.totalMin) / 15) * 15);
    extra = ` The other ${missing} need about another <b>${fmtDurText(more)}</b>.`;
  }
  return `<p class="cover"><b>${r.count} of the ${pool.length}</b> displays ${where}.${extra}</p>`;
}

function renderResults(v) {
  const P = state.plan;
  const est = P.routes.some(r => r.estimated);
  v.innerHTML = `
    <button class="back" type="button" id="backForm">‹ Change start or time</button>
    <h1>${P.routes.length > 1 ? `${P.routes.length} drives to pick from` : 'Your drive'}</h1>
    <p class="note">From ${esc(P.start.title)} · ${fmtDurText(P.minutes)} · ${P.back ? 'back to the start' : 'finish anywhere'}</p>
    <div class="map" id="planMap"></div>
    ${est ? '<p class="estimate">Driving times are estimates right now (the road map service didn\'t answer). The route still works.</p>' : ''}
    ${beforeYouGo(P.routes[P.chosen], { stops: false })}
    ${P.routes.map((r, i) => `
      <div class="card option c${i + 1}" data-i="${i}" aria-current="${i === P.chosen}">
        <div><div class="label">Drive ${i + 1}</div><h2>${esc(r.title)}</h2><p class="sub">${esc(r.blurb)} · ${[...new Set(r.stops.map(s => s.display.suburb))].slice(0, 3).map(esc).join(', ')}</p></div>
        <div class="figs">
          <div class="fig"><div class="v">${r.count}</div><div class="s">Displays</div></div>
          <div class="fig"><div class="v">${fmtDur(r.totalMin)}</div><div class="s">All up</div></div>
          <div class="fig"><div class="v">${r.km < 10 ? r.km.toFixed(1) : Math.round(r.km)}<small>km</small></div><div class="s">Driving</div></div>
        </div>
        <p class="sub">${fmtDurText(r.driveMin)} driving, ${fmtDurText(r.viewMin)} looking at lights</p>
        ${coverageLine(r)}
        <button class="btn primary wide" type="button" data-choose="${i}">Choose this drive</button>
      </div>`).join('')}`;
  $('#backForm', v).onclick = () => { P.step = 'form'; renderPlan(); };
  wireBeforeYouGo(v);
  const map = state.maps.plan = makeMap($('#planMap', v));
  fitTo(map, [P.start, ...P.routes.flatMap(r => r.stops.map(s => s.display))]);
  drawLines();
  $$('.option', v).forEach(c => c.addEventListener('click', e => {
    const i = +c.dataset.i;
    if (e.target.closest('[data-choose]')) { P.chosen = i; P.step = 'route'; renderPlan(); scrollTop(); return; }
    P.chosen = i; $$('.option', v).forEach(o => o.setAttribute('aria-current', o === c)); drawLines();
    $('#planMap', v).scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }));
}

function renderRoute(v) {
  const P = state.plan, r = P.routes[P.chosen];
  const legs = svc.googleLegs(P.start, r.stops, P.back);
  v.innerHTML = `
    <button class="back" type="button" id="backRes">‹ Other drives</button>
    <h1>${esc(r.title)}</h1>
    <div class="figs">
      <div class="fig"><div class="v">${r.count}</div><div class="s">Displays</div></div>
      <div class="fig"><div class="v">${fmtDur(r.totalMin)}</div><div class="s">All up</div></div>
      <div class="fig"><div class="v">${clock(r.totalMin).replace(/ ([ap]m)$/, '<small>$1</small>')}</div><div class="s">${P.back ? 'Back by' : 'Done by'}</div></div>
    </div>
    <div class="map" id="planMap"></div>
    ${beforeYouGo(r)}
    <button class="btn go wide" type="button" id="startDrive">${ICON.nav}Start the drive</button>
    <p class="note">The app talks you through each turn and tells you when you've arrived. Your phone will ask to share your location: tap Allow.</p>
    <ol class="stops">
      <li class="stopr"><span class="num" style="background:var(--pine)">S</span><div><b>${esc(P.start.title)}</b><small>Leave ${leaveWords()}</small></div><span class="t">${clock(0)}</span></li>
      ${r.stops.map((s, k) => `<li class="stopr"><span class="num">${k + 1}</span>
        <div><b>${esc(s.display.address)}</b><small>${esc(s.display.suburb)} · ${sizeName(s.display.size)}${s.display.viewing === 'walk' ? ' · park and walk' : ''}${s.hours ? ` · on ${clockText(s.hours.on)} to ${clockText(s.hours.off)}` : ''}</small></div>
        <span class="t">${clock(s.arriveMin)}</span></li>`).join('')}
      ${P.back ? `<li class="stopr"><span class="num" style="background:var(--pine)">S</span><div><b>Back to the start</b><small>${fmtDurText(r.backMin)} drive</small></div><span class="t">${clock(r.totalMin)}</span></li>` : ''}
    </ol>
    <p class="note">Times assume you leave ${leaveWords()} and allow for driving slowly past the lights.</p>
    <div class="card">
      <h2>Prefer Google Maps for the whole way?</h2>
      <p class="note">Google only takes a few stops at a time on a phone, so the drive is split into parts. Open each part in turn.</p>
      <div class="legs">${legs.map(l => `<a class="btn" href="${l.url}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join('')}</div>
    </div>`;
  $('#backRes', v).onclick = () => { P.step = 'results'; renderPlan(); };
  wireBeforeYouGo(v);
  $('#startDrive', v).onclick = startDrive;
  const map = state.maps.plan = makeMap($('#planMap', v));
  fitTo(map, routePoints(r));
  drawLines();
}

/* ---------- the drive: the app guides you turn by turn ---------- */
const ARROWS = {
  straight: '<path d="M12 21V4M5 10.5 12 3.5l7 7"/>',
  right: '<path d="M7 21v-8a4 4 0 0 1 4-4h9M15 4l5 5-5 5"/>',
  'slight-right': '<path d="M8 21v-6.5a4 4 0 0 1 1.2-2.8L17 4M11 4h6v6"/>',
  'sharp-right': '<path d="M7 3v9a5 5 0 0 0 8.5 3.5L19 12M13 12h6v6"/>',
  uturn: '<path d="M8 21V9a5 5 0 0 1 10 0v4M14.5 10l3.5 4 3.5-4"/>',
  roundabout: '<circle cx="12" cy="9" r="4.5"/><path d="M12 21v-7.5M16.5 9H21M18.5 6.5 21 9l-2.5 2.5"/>',
  arrive: '<path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7z"/><circle cx="12" cy="9" r="2.5" fill="currentColor"/>'
};
function arrowSVG(kind) {
  const mirror = kind.endsWith('left') && kind !== 'left' ? kind.replace('left', 'right') : kind === 'left' ? 'right' : null;
  const body = ARROWS[mirror || kind] || ARROWS.straight;
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"${mirror ? ' style="transform:scaleX(-1)"' : ''}>${body}</svg>`;
}

function speak(text) {
  const D = state.plan.drive;
  if (!D || !D.voice || !('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const voices = speechSynthesis.getVoices();
    u.voice = voices.find(v => v.lang === 'en-AU') || voices.find(v => /^en-(GB|NZ)/.test(v.lang)) || null;
    u.lang = 'en-AU'; u.rate = 1;
    speechSynthesis.speak(u);
  } catch (e) { /* no voice on this phone */ }
}

const driveTarget = () => {
  const P = state.plan, r = P.routes[P.chosen], k = P.driveAt;
  if (k < r.stops.length) return { kind: 'stop', d: r.stops[k].display };
  if (k === r.stops.length && P.back) return { kind: 'home', d: { ...P.start, address: P.start.title, suburb: P.start.line2 } };
  return null;
};

function startDrive() {
  const P = state.plan;
  P.driveAt = 0; P.step = 'drive';
  P.drive = { voice: true, pos: null, acc: 99, guide: null, loading: false, arrived: false, manual: false, lastReroute: 0, watch: null, fixes: 0, skipped: 0 };
  headToNext("Let's go! I'll talk you through each turn. ", false);
  keepAwake(true);
  if (!navigator.geolocation) P.drive.manual = true;
  else {
    P.drive.watch = navigator.geolocation.watchPosition(onFix, err => {
      if (err.code === 1) { P.drive.manual = true; P.drive.denied = true; if (P.step === 'drive') renderPlan(); }
    }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 30000 });
  }
  renderPlan(); scrollTop();
}

function endDrive() {
  const P = state.plan, D = P.drive;
  if (D && D.watch != null) navigator.geolocation.clearWatch(D.watch);
  try { speechSynthesis.cancel(); } catch (e) { /* none */ }
  closeArrival(); keepAwake(false);
  P.drive = null; P.step = 'route'; renderPlan();
}

function onFix(p) {
  const D = state.plan.drive; if (!D) return;
  D.pos = [p.coords.latitude, p.coords.longitude]; D.acc = p.coords.accuracy || 20; D.fixes++;
  if (!D.guide && !D.loading && !D.noRoute) loadLeg();
  else updateGuide();
}

async function loadLeg(reroute = false) {
  const D = state.plan.drive, t = driveTarget();
  if (!D || !t || !D.pos) return;
  D.loading = true;
  if (!reroute) setInstr('straight', '', '', 'Getting directions…');
  const res = await svc.roadSteps({ lat: D.pos[0], lng: D.pos[1] }, t.d);
  if (state.plan.drive !== D || driveTarget()?.d !== t.d) return; // the drive moved on meanwhile
  D.loading = false;
  if (res) { D.guide = new Guide({ steps: res.steps, line: res.line, dest: [t.d.lat, t.d.lng] }); D.line = res.line; D.noRoute = false; }
  else { D.guide = null; D.line = null; D.noRoute = true; }
  drawGuideMap(true);
  updateGuide();
}

function setInstr(arrow, n, u, text, soon = false) {
  const box = $('#instr'); if (!box) return;
  box.classList.toggle('soon', soon);
  $('#arrow', box).innerHTML = arrowSVG(arrow);
  $('#dist', box).innerHTML = n ? `${n}<small>${u}</small>` : '';
  $('#what', box).textContent = text;
}

function updateGuide() {
  const P = state.plan, D = P.drive, t = driveTarget();
  if (!D || !t || !D.pos) return;
  if (D.loading && !D.guide) return; // still checking the next stop, or getting directions
  let toDest;
  if (D.guide) {
    const g = D.guide.update(D.pos, D.acc);
    toDest = g.toDest;
    if (g.offRoute && Date.now() - D.lastReroute > 15000) {
      D.lastReroute = Date.now(); speak('Finding a new way'); loadLeg(true); return;
    }
    if (!D.arrived) {
      const d = fmtDist(g.toTurn);
      setInstr(g.arrow, g.step.type === 'arrive' ? fmtDist(g.toDest).n : d.n, g.step.type === 'arrive' ? fmtDist(g.toDest).u : d.u,
        g.step.type === 'arrive' ? (t.kind === 'home' ? 'The start is ahead' : `Stop ${P.driveAt + 1} is ahead${g.step.name ? ' on ' + g.step.name : ''}`) : g.text, g.toTurn < 120);
      if (g.speak) speak(g.speak);
    }
    if (g.arrivedNow) return onArrive();
  } else {
    // No turn list from the road service: point the way, and still notice arrival
    toDest = metres(D.pos, [t.d.lat, t.d.lng]);
    if (!D.arrived) {
      const d = fmtDist(toDest);
      setInstr('straight', d.n, d.u, `Head ${bearingWords(D.pos, [t.d.lat, t.d.lng])}. Tap Google Maps below for turn-by-turn.`);
      if (toDest <= 50) return onArrive();
    }
  }
  const away = $('#destAway'); if (away) { const d = fmtDist(toDest); away.textContent = `${d.n} ${d.u} away`; }
  drawGuideMap(false);
  // Drove off without tapping Next stop: move on by itself
  if (D.arrived && toDest > 150 && t.kind === 'stop') advance();
}

function drawGuideMap(newLeg) {
  const D = state.plan.drive, map = state.maps.guide, t = driveTarget();
  if (!D || !map || !t) return;
  if (newLeg || !D.layer) {
    if (D.layer) D.layer.remove();
    D.layer = L.layerGroup().addTo(map);
    if (D.line) {
      L.polyline(D.line, { color: '#111', weight: 10, opacity: 0.5 }).addTo(D.layer);
      L.polyline(D.line, { color: ROUTE_COLOURS[0], weight: 7 }).addTo(D.layer);
    }
    L.marker([t.d.lat, t.d.lng], { icon: pinIcon(t.kind === 'home' ? 'start' : 'stop', 34, t.kind === 'home' ? 'S' : state.plan.driveAt + 1) }).addTo(D.layer);
    D.me = null;
  }
  if (D.pos) {
    if (!D.me) D.me = L.circleMarker(D.pos, { radius: 10, color: '#fff', weight: 4, fillColor: '#1a73e8', fillOpacity: 1 }).addTo(D.layer);
    else D.me.setLatLng(D.pos);
    map.setView(D.pos, Math.max(map.getZoom(), 16), { animate: !newLeg });
  }
}

function onArrive() {
  const P = state.plan, D = P.drive, t = driveTarget(), r = P.routes[P.chosen];
  D.arrived = true;
  try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch (e) { /* none */ }
  if (t.kind === 'home') {
    speak("You're back at the start. That's the lot. Merry Christmas!");
    return showArrival(`<div class="label">All done</div><h1>You're back!</h1><p style="margin:0">You saw ${sawText()}. Merry Christmas!</p>
      <button class="btn go wide" type="button" id="arrNext">Finish</button>`, () => { P.driveAt++; endDrive(); });
  }
  const d = t.d, k = P.driveAt, last = k === r.stops.length - 1;
  setSeen(d.id, true); // you've been there, so it's ticked off on the All lights map
  const radio = (d.features || []).includes('radio'), station = radio ? radioStation(d.notes) : '';
  speak(`You've arrived at stop ${k + 1}, ${d.address}.${station ? ` Tune your radio to ${station.replace(/\bFM\b/, 'F M').replace(/\bAM\b/, 'A M')}.` : radio ? ' Tune your car radio.' : ''} Enjoy the lights!`);
  const nextLabel = last ? (P.back ? 'Head back to the start ›' : 'Finish') : `Next stop ›`;
  showArrival(`
    <div class="label">You're here · Stop ${k + 1} of ${r.stops.length}</div>
    <h1 class="where">${esc(d.address)}</h1>
    <div class="muted" style="font-weight:700;font-size:1.1rem">${esc(d.suburb)}</div>
    ${radio ? `<div class="radiobanner" role="note">${RADIO_ICON}<div>${station ? `<span>Tune to</span><b>${esc(station)}</b>` : `<b>Tune your car radio</b><span>The station's in the notes below</span>`}</div></div>` : ''}
    <div class="sz">${dispTags(d)}</div>
    ${d.notes ? `<p style="margin:0;font-size:1.1rem">${esc(d.notes)}</p>` : ''}
    <button class="btn go wide" type="button" id="arrNext">${nextLabel}</button>
    <button class="btn wide" type="button" id="arrStay">Stay a bit longer</button>
    <p class="note" style="text-align:center">${last ? '' : "When you drive off, we'll move on to the next stop by ourselves."}</p>`,
    () => (last && !P.back ? (P.driveAt++, endDriveDone()) : advance()));
}

function dispTags(d) {
  return [`<span class="tag gold">${stars(d.size)} ${sizeName(d.size)}</span>`,
    d.viewing === 'walk' ? '<span class="tag">Park and walk</span>' : '<span class="tag">Drive past</span>',
    ...(d.features || []).map(f => `<span class="tag">${esc(FEATURES[f] || f)}</span>`)].join('');
}

function showArrival(html, onNext) {
  closeArrival();
  const o = document.createElement('div');
  o.id = 'arrival'; o.className = 'overlay'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true');
  o.innerHTML = `<div class="card arrive">${html}</div>`;
  document.body.append(o);
  $('#arrNext', o).onclick = () => { closeArrival(); onNext(); };
  const stay = $('#arrStay', o); if (stay) stay.onclick = closeArrival;
}
function closeArrival() { const o = $('#arrival'); if (o) o.remove(); }

function advance() {
  const P = state.plan, D = P.drive; if (!D) return;
  closeArrival();
  P.driveAt++;
  Object.assign(D, { guide: null, line: null, arrived: false, noRoute: false, loading: false });
  headToNext('');
}

// Before heading to a stop, check it's still worth going: switched off tonight by its owner, or off by the
// time we'd get there? Then skip it, say why, and go to the next one.
async function headToNext(say, render = true) {
  const P = state.plan, D = P.drive; if (!D) return;
  D.loading = true; // hold the directions until we've checked
  if (render) { renderPlan(); scrollTop(); }
  for (;;) {
    const t = driveTarget();
    if (!t || t.kind === 'home') break;
    const prev = P.driveAt > 0 ? P.routes[P.chosen].stops[P.driveAt - 1].display : P.start;
    const why = await whySkip(t.d, D.pos || [prev.lat, prev.lng]);
    if (state.plan.drive !== D) return; // the drive ended meanwhile
    if (!why) break;
    say += why + ' '; D.skipped++; P.driveAt++; toast(why);
  }
  D.loading = false;
  const t = driveTarget();
  if (!t) { speak(say); return endDriveDone(); }
  let extra = '';
  if (t.kind === 'stop') {
    const h = parseHours(t.d.hours), now = new Date(), c = nightMinutes(now.getHours() * 60 + now.getMinutes());
    if (h && !daytime(now.getHours() * 60) && c < h.on - 2) extra = ` Its lights come on at ${clockText(h.on)}.`;
  }
  speak(say + (t.kind === 'home' ? 'Heading back to the start.' : `Heading to stop ${P.driveAt + 1}, ${t.d.address}.${extra}`));
  if (P.step === 'drive') renderPlan();
  if (D.pos) loadLeg();
}

async function whySkip(d, from) {
  const S = state.store;
  let fresh;
  try { fresh = S && S.getDisplay ? await Promise.race([S.getDisplay(d.id), new Promise(r => setTimeout(() => r(undefined), 4000))]) : undefined; }
  catch (e) { fresh = undefined; } // no signal: go on what we know
  if (fresh === null) return `${d.address} isn't on the map any more, so we'll skip it.`;
  const x = fresh || d;
  if (offTonight(x)) return `${d.address} has switched its lights off tonight, so we'll skip it.`;
  const h = parseHours(x.hours), now = new Date(), c = now.getHours() * 60 + now.getMinutes();
  if (h && !daytime(c)) {
    const eta = (metres(from, [d.lat, d.lng]) * 1.4 / 1000 / 32) * 60 * CONFIG.slowDriving + 1; // minutes, roughly
    if (nightMinutes(c) + eta > h.off - LAST_CALL) return `${d.address} switches its lights off at ${clockText(h.off)}, so we'll skip it.`;
  }
  return '';
}

const sawText = () => { const P = state.plan, k = P.routes[P.chosen].count - (P.drive?.skipped || 0); return k === 1 ? '1 display' : `${k} displays`; };
function endDriveDone() {
  const P = state.plan, r = P.routes[P.chosen], saw = sawText();
  if (P.drive && P.drive.watch != null) navigator.geolocation.clearWatch(P.drive.watch);
  keepAwake(false); closeArrival();
  P.drive = null; P.step = 'drive-done';
  const v = $('#view-plan');
  v.className = 'view';
  v.innerHTML = `<div class="card"><h1>That's the lot!</h1><p style="margin:0">You saw ${saw}. Merry Christmas!</p>
    <button class="btn go wide" type="button" id="again">Plan another drive</button></div>`;
  $('#again', v).onclick = () => { P.step = 'form'; renderPlan(); };
}

function renderDrive(v) {
  const P = state.plan, D = P.drive, r = P.routes[P.chosen], k = P.driveAt, t = driveTarget();
  if (!D || !t) return endDriveDone();
  if (D.manual) return renderDriveManual(v);
  v.className = 'view drive';
  const title = t.kind === 'home' ? 'Back to the start' : `Stop ${k + 1} of ${r.stops.length}`;
  v.innerHTML = `
    <div class="card-head"><span class="of">${title}</span><button class="linkbtn" style="color:#fff" type="button" id="endDrive">End drive</button></div>
    <div class="dots">${r.stops.map((_, i) => `<i class="${i < k ? 'done' : i === k ? 'now' : ''}"></i>`).join('')}</div>
    <div class="instr" id="instr" aria-live="polite"><div class="arrowbox" id="arrow">${arrowSVG('straight')}</div>
      <div class="instr-txt"><div class="dist" id="dist"></div><div class="what" id="what">${D.pos ? 'Getting directions…' : 'Finding where you are…'}</div></div></div>
    <div class="map guide" id="guideMap"></div>
    <div class="card destcard">
      <div class="label">${t.kind === 'home' ? 'Heading back to' : 'Heading to'}</div>
      <b class="dest-name">${esc(t.d.address)}</b>
      <small>${esc(t.kind === 'home' ? '' : t.d.suburb + ' · ')}<span id="destAway"></span></small>
    </div>
    <div class="row2">
      <button class="btn" type="button" id="skipStop">${t.kind === 'home' ? 'Finish here' : 'Skip this stop'}</button>
      <a class="btn" href="${svc.navigateUrl(t.d)}" target="_blank" rel="noopener">Google Maps</a>
    </div>
    <button class="btn wide" type="button" id="voiceBtn" aria-pressed="${D.voice}">${D.voice ? '🔊 Voice is on' : '🔇 Voice is off'}</button>`;
  $('#endDrive', v).onclick = endDrive;
  $('#skipStop', v).onclick = () => (t.kind === 'home' ? endDriveDone() : advance());
  $('#voiceBtn', v).onclick = e => { D.voice = !D.voice; if (!D.voice) try { speechSynthesis.cancel(); } catch (x) { /* none */ } renderDrive(v); };
  state.maps.guide = makeMap($('#guideMap', v), { center: D.pos || [t.d.lat, t.d.lng], zoom: 16 });
  D.layer = null;
  drawGuideMap(true);
  if (D.pos && !D.guide && !D.loading) loadLeg(); else updateGuide();
}

// When the phone won't share its location: one stop at a time, with the phone's maps app doing the directions
function renderDriveManual(v) {
  const P = state.plan, r = P.routes[P.chosen], k = P.driveAt, t = driveTarget(), d = t.d;
  v.className = 'view drive';
  v.innerHTML = `
    <div class="card-head"><span class="of">${t.kind === 'home' ? 'Back to the start' : `Stop ${k + 1} of ${r.stops.length}`}</span><button class="linkbtn" style="color:#fff" type="button" id="endDrive">End drive</button></div>
    <div class="dots">${r.stops.map((_, i) => `<i class="${i < k ? 'done' : i === k ? 'now' : ''}"></i>`).join('')}</div>
    ${P.drive.denied ? '<p class="estimate">Location is turned off for this app, so it can\'t guide you or tell when you\'ve arrived. Your maps app will do the directions; come back and tap Next stop at each one.</p>' : ''}
    <div class="card"><p class="where">${esc(d.address)}</p>
      ${t.kind === 'stop' ? `<div class="muted" style="font-weight:700;font-size:1.15rem">${esc(d.suburb)}</div><div class="sz">${dispTags(d)}</div>${d.notes ? `<p style="margin:0;font-size:1.1rem">${esc(d.notes)}</p>` : ''}` : ''}</div>
    <a class="btn go wide" href="${svc.navigateUrl(d)}" target="_blank" rel="noopener">${ICON.nav}Directions</a>
    ${svc.isIPhone() ? `<a class="btn wide" href="${svc.appleMapsUrl(d)}" target="_blank" rel="noopener">Use Apple Maps instead</a>` : ''}
    <div class="row2"><button class="btn" type="button" id="prevStop" ${k === 0 ? 'disabled' : ''}>‹ Back</button>
      <button class="btn" type="button" id="nextStop" style="font-weight:800">${t.kind === 'home' ? 'Finish' : 'Next stop ›'}</button></div>`;
  $('#endDrive', v).onclick = endDrive;
  $('#prevStop', v).onclick = () => { P.driveAt = Math.max(0, k - 1); renderDriveManual(v); };
  $('#nextStop', v).onclick = () => { P.driveAt++; driveTarget() ? renderDriveManual(v) : endDriveDone(); };
}

let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
    else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch (e) { /* not supported or refused: fine */ }
}
// The phone drops the keep-awake when you switch apps; take it back when you return mid-drive
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && state.plan.drive) keepAwake(true); });

/* =================================================================== ALL LIGHTS */
function renderMapTab() {
  const v = $('#view-map');
  if (state.near) return renderNearMe(v);
  const subs = suburbsWithCounts();
  const filter = state.mapFilter || '';
  const shown = state.displays.filter(d => !filter || d.suburb === filter);
  v.innerHTML = `
    <h1>All the lights</h1>
    <p class="note">${state.displays.length} ${state.displays.length === 1 ? 'Display' : 'Displays'}. Bigger dots are bigger displays.${seenCount() ? ` Green ticks are ones you've seen.` : ''}</p>
    ${state.displays.length ? `<button class="btn wide" type="button" id="nearBtn">${ICON.locate}Near me now</button>` : ''}
    <div class="map tall" id="allMap"></div>
    ${state.displays.length > 1 ? '<p class="note scrollhint">Scroll down for the list of every display ↓</p>' : ''}
    <div id="sheet"></div>
    ${state.displays.length ? '' : `<div class="card"><h2>The ${new Date().getFullYear()} lights are coming!</h2>
      <p class="note" style="margin:0">No displays on the map yet. Got lights up? Add them so everyone can find you.</p>
      <a class="btn go wide" href="#add">Add my lights</a></div>`}
    <select id="subFilter" aria-label="Show suburb">
      <option value="">Every suburb (${state.displays.length})</option>
      ${subs.map(([s, n]) => `<option value="${esc(s)}" ${s === filter ? 'selected' : ''}>${esc(s)} (${n})</option>`).join('')}
    </select>
    <ul class="list" id="dispList">${listHTML(shown)}</ul>
    ${state.displays.length ? `<div class="card printcard"><h2>Prefer paper?</h2>
      <p class="note" style="margin:0">Get every display as a neat list, sorted by suburb, to print or email to yourself.</p>
      <button class="btn go wide" type="button" id="printList">${ICON.printer}Print or save the list</button></div>` : ''}`;
  const pl = $('#printList', v);
  if (pl) pl.onclick = () => printList(pl);
  const map = state.maps.all = makeMap($('#allMap', v));
  const markers = new Map();
  const spots = spreadPositions(shown);
  for (const d of shown) {
    const m = L.marker(spots.get(d.id) || [d.lat, d.lng], { icon: lightIcon(d), keyboard: false }).addTo(map);
    m.on('click', () => showSheet(d));
    markers.set(d.id, m);
  }
  // Every suburb: at least a whole-of-Toowoomba view, so new visitors see there's more than one street.
  // One suburb picked: suburb level. (Tapping a display in the list still zooms right in on it.)
  if (shown.length) fitTo(map, shown, filter ? SUBURB_ZOOM : TOWN_ZOOM);
  else map.setView(CONFIG.center, TOWN_ZOOM);
  $('#subFilter', v).onchange = e => { state.mapFilter = e.target.value; renderMapTab(); };
  const nb = $('#nearBtn', v);
  if (nb) nb.onclick = () => { state.near = { hideSeen: false }; renderMapTab(); scrollTop(); };
  $('#dispList', v).onclick = e => {
    const b = e.target.closest('[data-id]'); if (!b) return;
    const d = state.displays.find(x => x.id === b.dataset.id);
    map.setView([d.lat, d.lng], 16); showSheet(d); scrollTop();
  };
  // Came from "Near me now": open that display
  if (state.mapFocus) {
    const d = state.displays.find(x => x.id === state.mapFocus); state.mapFocus = null;
    if (d) { map.setView([d.lat, d.lng], 16); showSheet(d); }
  }
  function showSheet(d) {
    const s = $('#sheet', v);
    const seenBtn = () => (seen.has(d.id) ? `${ICON.tick}Seen it` : `${ICON.tick}Tick it off: I've seen it`);
    s.innerHTML = `<div class="card sheet${d.thumb ? ' haspic' : ''}">
      ${d.thumb ? `<img class="dphoto" id="sheetPic" src="${esc(d.thumb)}" alt="Photo of the lights at ${esc(d.address)}">` : ''}
      <button class="x" type="button" aria-label="Close">×</button>
      <div><b style="font-size:1.25rem;display:block;padding-right:50px">${esc(d.address)}</b><span class="muted" style="font-weight:600">${esc(d.suburb)}</span></div>
      <div class="sz" style="display:flex;gap:8px;flex-wrap:wrap"><span class="tag gold">${stars(d.size)} ${sizeName(d.size)}</span>
        ${d.viewing === 'walk' ? '<span class="tag">Park and walk</span>' : ''}${(d.features || []).map(f => `<span class="tag">${esc(FEATURES[f] || f)}</span>`).join('')}</div>
      ${d.notes ? `<p style="margin:0">${esc(d.notes)}</p>` : ''}
      ${offTonight(d) ? '<p class="pinwarn" style="margin:0"><b>Switched off tonight</b> by the owner (bad weather, or a problem with the lights). Back on tomorrow.</p>' : ''}
      <p class="note">${d.hours ? `Lights on ${esc(d.hours)}` : ''}${!litTonight(d) && !preSeason() ? ' · not on tonight' : ''}</p>
      <a class="btn go wide" href="${svc.navigateUrl(d)}" target="_blank" rel="noopener">${ICON.nav}Directions</a>
      <button class="btn wide seenbtn" type="button" id="seenBtn" aria-pressed="${seen.has(d.id)}">${seenBtn()}</button></div>`;
    $('.x', s).onclick = () => { s.innerHTML = ''; };
    $('#seenBtn', s).onclick = e => {
      const yes = !seen.has(d.id); setSeen(d.id, yes);
      e.currentTarget.setAttribute('aria-pressed', yes); e.currentTarget.innerHTML = seenBtn();
      const m = markers.get(d.id); if (m) m.setIcon(lightIcon(d));
      $('#dispList', v).innerHTML = listHTML(shown);
      if (yes) toast(`Ticked: ${seenCount()} of ${state.displays.length} seen`);
    };
    // The small preview shows at once; the full photo replaces it when it arrives
    if (d.thumb && state.store) state.store.getPhoto(d.id).then(img => { const el = $('#sheetPic', s); if (img && el) el.src = img; });
  }
}

// ---------- The printable list (PDF): print it, email it to yourself, or save it ----------
async function printList(btn) {
  const before = btn.innerHTML;
  btn.disabled = true; btn.textContent = 'Making your list…';
  let blob;
  try { blob = await (await import('./printlist.js')).makeListPdf(state.displays, FEATURES); }
  catch (e) { console.error(e); toast("Couldn't make the list just now. Check you have signal and try again."); }
  btn.disabled = false; btn.innerHTML = before;
  if (!blob) return;
  const name = 'Toowoomba-Christmas-Lights-list.pdf';
  const file = new File([blob], name, { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  let canShare = false;
  try { canShare = !!(navigator.canShare && navigator.canShare({ files: [file] })); } catch (e) { canShare = false; }
  const save = () => { const a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); };
  const share = async () => { try { await navigator.share({ files: [file], title: 'Toowoomba Christmas Lights: the list' }); } catch (e) { if (e.name !== 'AbortError') save(); } };
  const n = state.displays.length;
  popup(`<h2>Your list is ready</h2>
    <p style="margin:0">${n === 1 ? 'The <b>1 display</b>' : `All <b>${n} displays</b>`}, sorted by suburb.</p>
    ${canShare ? `<p class="note" style="margin:0"><b>Print it</b> and <b>Email it</b> open your phone's share menu. Tap <b>Print</b> there, or <b>Mail</b> to send it to yourself.</p>` : ''}`,
    [{ id: 'print', text: `${ICON.printer}Print it`, cls: 'go' }, { id: 'email', text: 'Email it to myself', cls: 'primary' },
      { id: 'save', text: 'Save it to my phone' }, { id: 'close', text: 'Close' }],
    id => {
      if (id === 'close') return;
      if (canShare && id !== 'save') return share();
      if (id === 'print') { if (!window.open(url, '_blank')) save(); return; }
      save();
      if (id === 'email') toast('Saved. Attach it to an email to yourself.');
    });
  setTimeout(() => URL.revokeObjectURL(url), 10 * 60000);
}

// ---------- Near me now: the displays closest to where you are, nearest first ----------
function renderNearMe(v) {
  const N = state.near;
  v.innerHTML = `<button class="back" type="button" id="nearBack">‹ Back to the map</button>
    <h1>Near me now</h1><p class="note" id="nearNote">Finding where you are…</p><div id="nearOut"></div>`;
  $('#nearBack', v).onclick = () => { state.near = null; renderMapTab(); scrollTop(); };
  const draw = () => {
    if (state.near !== N || state.tab !== 'map') return;
    let list = state.displays.map(d => ({ d, m: metres(N.me, [d.lat, d.lng]) * 1.3 })).sort((a, b) => a.m - b.m); // roughly, along the roads
    const far = list.length && list[0].m > 60000;
    if (N.hideSeen) list = list.filter(x => !seen.has(x.d.id));
    list = list.slice(0, 20);
    $('#nearNote', v).textContent = far ? "You're a long way from Toowoomba, but here are the closest." : 'Closest first, from where you are now. Tap one to see it on the map.';
    const pics = list.some(x => x.d.thumb);
    $('#nearOut', v).innerHTML = `
      <div class="seg" role="group" aria-label="Which displays" style="margin-bottom:12px">
        <button type="button" data-near="all" aria-pressed="${!N.hideSeen}">Closest</button>
        <button type="button" data-near="hide" aria-pressed="${!!N.hideSeen}">Hide ones I've seen</button></div>
      <ul class="list" id="nearList">${list.map(({ d, m }) => { const f = fmtDist(m);
        return `<li><button class="lrow${pics ? ' withpic' : ''}" type="button" data-id="${esc(d.id)}">${pics ? thumbHTML(d) : ''}
          <span><b>${esc(d.address)}</b><small><span class="dist">${f.n} ${f.u}</span> · about ${driveMins(m)} min drive · ${esc(d.suburb)}${offTonight(d) ? ' · <b>off tonight</b>' : ''}</small></span>
          ${seen.has(d.id) ? `<span class="seentick" aria-label="Seen">${ICON.tick}</span>` : `<span class="stars">${stars(d.size)}</span>`}</button></li>`; }).join('')
        || `<li class="group">${N.hideSeen ? "You've seen them all. Nice work!" : 'No displays yet'}</li>`}</ul>
      <button class="btn wide" type="button" id="nearAgain" style="margin-top:12px">${ICON.locate}Update for where I am now</button>`;
    $$('[data-near]', v).forEach(b => b.onclick = () => { N.hideSeen = b.dataset.near === 'hide'; draw(); });
    $('#nearList', v).onclick = e => {
      const b = e.target.closest('[data-id]'); if (!b) return;
      state.near = null; state.mapFocus = b.dataset.id; renderMapTab(); scrollTop();
    };
    $('#nearAgain', v).onclick = () => { renderNearMe(v); };
  };
  if (!navigator.geolocation) { $('#nearNote', v).textContent = "This phone can't share where you are."; return; }
  navigator.geolocation.getCurrentPosition(p => { N.me = [p.coords.latitude, p.coords.longitude]; draw(); }, () => {
    if (state.near !== N) return;
    $('#nearNote', v).textContent = "We couldn't find where you are. Check Location is turned on for your browser (on iPhone: Settings, Privacy & Security, Location Services, Safari Websites), then try again.";
    $('#nearOut', v).innerHTML = `<button class="btn primary wide" type="button" id="nearRetry">${ICON.locate}Try again</button>`;
    $('#nearRetry', v).onclick = () => renderNearMe(v);
  }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
}

// Rough minutes by car: slow in town streets, quicker on the open road
const driveMins = m => Math.max(1, Math.round(m <= 3000 ? m / 400 : 7.5 + (m - 3000) / 1000));

const thumbHTML = d => (d.thumb ? `<img class="lthumb" src="${esc(d.thumb)}" alt="">` : `<span class="lthumb none">${ICON.picture}</span>`);

function listHTML(list) {
  if (!list.length) return '<li class="group">No displays yet</li>';
  const pics = list.some(d => d.thumb); // photo column only once some displays have photos
  const by = new Map();
  for (const d of list) { if (!by.has(d.suburb)) by.set(d.suburb, []); by.get(d.suburb).push(d); }
  return [...by.keys()].sort().map(s => `<li class="group">${esc(s)}</li>` + by.get(s).sort((a, b) => b.size - a.size).map(d =>
    `<li><button class="lrow${pics ? ' withpic' : ''}" type="button" data-id="${esc(d.id)}">${pics ? thumbHTML(d) : ''}<span><b>${esc(d.address)}</b><small>${sizeName(d.size)}${d.notes ? ' · ' + esc(d.notes) : ''}</small></span>${seen.has(d.id) ? `<span class="seentick" aria-label="Seen">${ICON.tick}</span>` : `<span class="stars">${stars(d.size)}</span>`}</button></li>`).join('')).join('');
}

/* =================================================================== ADD MY LIGHTS */
// ---------- The display form: adding a display, editing your own, or an admin editing any ----------
// mode: 'new' | 'edit' (the person who added it) | 'admin'
// Changing the address or notes of an approved display sends it back for a check (only when not an admin).
const MAJOR = ['address', 'suburb', 'lat', 'lng', 'notes'];

// A photo from the camera or library, made small enough to send: the full photo (up to about 1000 pixels
// across, under 350 KB) and a small preview for lists (128 × 96). Done on the phone, so nothing big is uploaded.
async function photoFromFile(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const W = img.naturalWidth, H = img.naturalHeight;
    if (!W || !H) throw new Error('empty picture');
    const draw = (w, h, sx, sy, sw, sh, q) => {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
      return c.toDataURL('image/jpeg', q);
    };
    let side = 1024, q = 0.72, image = '';
    for (let k = 0; k < 10; k++) {
      const s = Math.min(1, side / Math.max(W, H));
      image = draw(Math.round(W * s), Math.round(H * s), 0, 0, W, H, q);
      if (image.length <= PHOTO_MAX) break;
      q -= 0.08; if (q < 0.45) { side = Math.round(side * 0.8); q = 0.65; }
    }
    const r = Math.min(W / 4, H / 3); // the middle of the photo, 4:3
    let thumb = '', tq = 0.62;
    do { thumb = draw(128, 96, (W - r * 4) / 2, (H - r * 3) / 2, r * 4, r * 3, tq); tq -= 0.1; } while (thumb.length > THUMB_MAX && tq > 0.2);
    if (!image.startsWith('data:image/jpeg') || image.length > PHOTO_MAX || thumb.length > THUMB_MAX) throw new Error('could not shrink');
    return { image, thumb };
  } finally { URL.revokeObjectURL(url); }
}

function displayForm(v, { mode = 'new', initial = null, onSaved, onCancel }) {
  const d = initial || {};
  const F = {
    place: initial ? { title: d.address, line2: d.suburb || '', suburb: d.suburb || '', lat: d.lat, lng: d.lng, hasNumber: true } : null,
    size: d.size || 0, features: new Set(d.features || []), viewing: d.viewing || 'drive',
    photo: undefined // undefined = unchanged, null = taken off, { image, thumb } = a new one
  };
  const [hOn, hOff] = String(d.hours || '7pm – 10pm').split(/\s*–\s*/).map(tidyHour);
  const heading = mode === 'new' ? 'Add your Christmas lights' : mode === 'admin' ? 'Edit this display' : 'Edit your display';
  v.innerHTML = `
    ${mode !== 'new' ? '<button class="back" type="button" id="formBack">‹ Back</button>' : ''}
    <h1>${heading}</h1>
    <p class="note">${mode === 'new' ? "It's free and we don't need your name. Your display shows on the map once it's been checked."
      : mode === 'edit' && d.status === 'approved' ? 'Changes to the size, what’s in it, how to see it and the times show straight away. Changing the address or notes means a quick re-check first.'
      : 'Make your changes, then tap Save changes.'}</p>
    <form id="addForm" novalidate>
      <div class="view">
        <div class="card">
          <h2>${mode === 'admin' ? 'Address' : 'Your address'}</h2>
          <div id="addrBox"></div>
          <div id="pinWrap" hidden>
            <div class="map small" id="pinMap"></div>
            <p class="note" id="pinNote" style="margin-top:8px">Is the dot on the house? If not, drag it there.</p>
          </div>
          <div class="field" id="subField" hidden><label for="suburb">Suburb</label><input type="text" id="suburb" maxlength="60" autocomplete="address-level2"></div>
        </div>
        <div class="card">
          <h2>How big is the display?</h2>
          <div class="picker" role="radiogroup" aria-label="Display size">
            ${[1, 2, 3, 4].map(n => `<button type="button" class="pick" role="radio" data-size="${n}" aria-checked="${F.size === n}"><span><b>${SIZES[n].label}</b><small>${SIZES[n].hint}</small></span><span class="stars">${stars(n)}</span></button>`).join('')}
          </div>
        </div>
        <div class="card">
          <h2>What's in it? <span class="muted" style="font-weight:600;font-size:1rem">(tick any)</span></h2>
          <div class="chips" id="featChips">${WHATS_IN_IT.map(k => `<button type="button" class="chip" data-f="${k}" aria-pressed="${F.features.has(k)}">${FEATURES[k]}</button>`).join('')}</div>
          <h2>How do people see it?</h2>
          <div class="seg" role="group" aria-label="How to see it">
            <button type="button" data-view="drive" aria-pressed="${F.viewing === 'drive'}">Drive past</button>
            <button type="button" data-view="walk" aria-pressed="${F.viewing === 'walk'}">Park and walk</button>
          </div>
          <button type="button" class="chip radiochip" id="radioChip" aria-pressed="${F.features.has('radio')}">${RADIO_ICON}Tune your car radio</button>
        </div>
        <div class="card">
          <h2>When is it on?</h2>
          <div class="row2 dates">
            <div class="field"><label for="from">From</label><input type="date" id="from" value="${esc(d.from ?? CONFIG.season.from)}"></div>
            <div class="field"><label for="until">Until</label><input type="date" id="until" value="${esc(d.until ?? CONFIG.season.until)}"></div>
          </div>
          <div class="row2">
            <div class="field"><label for="hFrom">Lights on</label><select id="hFrom">${[...new Set([...HOURS_FROM, hOn].filter(h => clockMinutes(h) != null))].sort((a, b) => clockMinutes(a) - clockMinutes(b)).map(h => `<option ${h === hOn ? 'selected' : ''}>${esc(h)}</option>`).join('')}</select></div>
            <div class="field"><label for="hTo">Lights off</label><select id="hTo">${[...new Set([...HOURS_TO, hOff || '10pm'].filter(h => clockMinutes(h) != null))].sort((a, b) => nightMinutes(clockMinutes(a)) - nightMinutes(clockMinutes(b))).map(h => `<option ${h === (hOff || '10pm') ? 'selected' : ''}>${esc(h)}</option>`).join('')}</select></div>
          </div>
        </div>
        <div class="card" id="photoCard">
          ${cardHead(ICON.camera, 'Add a photo <span class="muted" style="font-weight:600;font-size:1rem">(optional)</span>')}
          <div id="photoBox"></div>
          <input type="file" accept="image/*" capture="environment" id="photoCam" hidden>
          <input type="file" accept="image/*" id="photoPick" hidden>
        </div>
        <div class="card">
          <div class="field"><label for="notes">Anything people should know? <span class="muted" style="font-weight:600">(optional)</span></label>
            <textarea id="notes" maxlength="200" placeholder="e.g. tune to 87.6 FM for the music, Santa visits Saturdays">${esc(d.notes || '')}</textarea></div>
          ${mode === 'new' ? `<label class="check"><input type="checkbox" id="consent"><span>This is my home (or I have the owner's OK), and I'm happy for the address to show on the public map.</span></label>` : ''}
        </div>
        <button class="btn go wide" type="submit" id="addBtn">${mode === 'new' ? 'Add my lights' : 'Save changes'}</button>
        ${mode !== 'new' ? '<button class="btn wide" type="button" id="formCancel">Cancel</button>' : ''}
        <p class="status" id="addStatus" role="status"></p>
      </div>
    </form>`;
  for (const id of ['#formBack', '#formCancel']) { const b = $(id, v); if (b) b.onclick = () => onCancel && onCancel(); }

  let pinMap = null, pin = null;
  const box = $('#addrBox', v);
  const drawAddr = () => {
    if (F.place) {
      box.innerHTML = pickedHTML(F.place);
      $('[data-act=change]', box).onclick = () => { F.place = null; $('#pinWrap', v).hidden = true; $('#subField', v).hidden = true; drawAddr(); };
      $('#pinWrap', v).hidden = false; $('#subField', v).hidden = false;
      $('#suburb', v).value = F.place.suburb || '';
      const note = $('#pinNote', v);
      if (F.place.typedNumber) {
        note.className = 'pinwarn';
        note.innerHTML = '<b>The map only knows where the street is, not your house.</b> Drag the red dot onto your house, so people stop in the right spot.';
      } else { note.className = 'note'; note.textContent = 'Is the dot on the house? If not, drag it there.'; }
      if (!pinMap) {
        pinMap = makeMap($('#pinMap', v), { center: [F.place.lat, F.place.lng], zoom: 18 });
        pin = L.marker([F.place.lat, F.place.lng], { draggable: true, icon: pinIcon('home', 30) }).addTo(pinMap);
        pin.on('dragend', () => {
          const ll = pin.getLatLng(); F.place.lat = ll.lat; F.place.lng = ll.lng;
          if (F.place.typedNumber) { F.place.typedNumber = false; note.className = 'note'; note.textContent = 'Thanks! Drag it again if it needs a nudge.'; }
        });
      } else { pinMap.setView([F.place.lat, F.place.lng], 18); pin.setLatLng([F.place.lat, F.place.lng]); setTimeout(() => pinMap.invalidateSize(), 50); }
    } else {
      addressBox(box, { placeholder: 'House number and street, e.g. 12 Ruthven St', onPick: p => {
        if (!p.hasNumber) {
          // A street with no number: ask again, with the number in front
          drawAddr();
          const s = $('#addStatus', v); s.className = 'status err';
          s.textContent = `Please type the house number first, e.g. "12 ${p.title}".`;
          toast(`Type the house number first, e.g. 12 ${p.title}`);
          const inp = $('#addrBox input', v); inp.value = ` ${p.title}`; inp.focus(); inp.setSelectionRange(0, 0);
          return;
        }
        $('#addStatus', v).textContent = '';
        F.place = { ...p };
        drawAddr();
        if (p.typedNumber) toast('Now drag the dot onto the house');
        // The keyboard closes and the small map appears, which can leave the page halfway down:
        // bring the address card back to the top once things settle
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        setTimeout(() => {
          const sc = $('#scroller'), card = box.closest('.card');
          if (card) sc.scrollTo({ top: Math.max(0, sc.scrollTop + card.getBoundingClientRect().top - sc.getBoundingClientRect().top - 8), behavior: 'smooth' });
        }, 350);
      } });
    }
  };
  drawAddr();

  // ---- The photo
  const photoBox = $('#photoBox', v);
  let fullPhoto = null; // the existing full photo, once loaded (editing)
  const drawPhoto = () => {
    const src = F.photo ? F.photo.image : F.photo === null ? null : (fullPhoto || d.thumb || null);
    photoBox.innerHTML = src
      ? `<img class="dphoto" id="photoPrev" src="${esc(src)}" alt="Your photo">
         <p class="note" style="margin:0">${F.photo ? (mode === 'admin' ? 'This photo will show once you save.' : "Looks great! We'll check it before it shows on the map.") : 'This is the photo people see.'}</p>
         <div class="row2"><button class="btn" type="button" data-ph="cam">${ICON.camera}Retake</button><button class="btn danger" type="button" data-ph="remove">Remove</button></div>
         <button class="linkbtn" type="button" data-ph="pick">Choose a different photo</button>`
      : `<p class="note" style="margin:0">A night-time photo with the lights on helps people choose where to go.</p>
         <button class="btn go wide" type="button" data-ph="cam">${ICON.camera}Take a photo</button>
         <button class="btn wide" type="button" data-ph="pick">${ICON.picture}Choose from my photos</button>
         <p class="note" style="margin:0">Please keep people's faces and car number plates out of the photo. We check every photo before it shows.</p>`;
  };
  drawPhoto();
  if (d.thumb && d.id && state.store) state.store.getPhoto(d.id).then(img => { if (img && F.photo === undefined) { fullPhoto = img; drawPhoto(); } });
  photoBox.onclick = e => {
    const b = e.target.closest('[data-ph]'); if (!b) return;
    if (b.dataset.ph === 'remove') { F.photo = null; drawPhoto(); return; }
    const inp = $(b.dataset.ph === 'cam' ? '#photoCam' : '#photoPick', v); inp.value = ''; inp.click();
  };
  for (const id of ['#photoCam', '#photoPick']) $(id, v).onchange = async e => {
    const file = e.target.files && e.target.files[0]; if (!file) return;
    photoBox.innerHTML = '<p class="note" style="margin:0">Getting your photo ready…</p>';
    try { F.photo = await photoFromFile(file); }
    catch (ex) { console.warn(ex); toast("That photo couldn't be used. Try another, or take a new one."); }
    drawPhoto();
    $('#photoCard', v).scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  $$('[data-size]', v).forEach(b => b.onclick = () => { F.size = +b.dataset.size; $$('[data-size]', v).forEach(x => x.setAttribute('aria-checked', x === b)); });
  $('#featChips', v).onclick = e => { const b = e.target.closest('[data-f]'); if (!b) return; const f = b.dataset.f; F.features.has(f) ? F.features.delete(f) : F.features.add(f); b.setAttribute('aria-pressed', F.features.has(f)); };
  $$('[data-view]', v).forEach(b => b.onclick = () => { F.viewing = b.dataset.view; $$('[data-view]', v).forEach(x => x.setAttribute('aria-pressed', x === b)); });
  const notes = $('#notes', v), notesLabel = $('label[for="notes"]', v), plainLabel = notesLabel.innerHTML, plainHint = notes.placeholder;
  const showRadio = () => {
    const on = F.features.has('radio');
    $('#radioChip', v).setAttribute('aria-pressed', on);
    notesLabel.innerHTML = on ? 'Which radio station? <span class="muted" style="font-weight:600">(and anything else people should know)</span>' : plainLabel;
    notes.placeholder = on ? 'e.g. Tune to 87.6 FM. Santa visits Saturdays.' : plainHint;
  };
  $('#radioChip', v).onclick = () => {
    F.features.has('radio') ? F.features.delete('radio') : F.features.add('radio');
    showRadio();
    if (F.features.has('radio') && !notes.value) notes.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  showRadio();

  $('#addForm', v).onsubmit = async e => {
    e.preventDefault();
    const status = $('#addStatus', v);
    const err = (msg, el) => { status.className = 'status err'; status.textContent = msg; if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); };
    if (!F.place) return err('Type the address and pick it from the list.', box);
    if (!F.size) return err('Choose how big the display is.', $('.picker', v));
    if (mode === 'new' && !$('#consent', v).checked) {
      status.textContent = '';
      return popup(`<h2>Is this your home?</h2>
        <p style="margin:0">We can only show an address on the public map if it's your home, or you have the owner's OK.</p>
        <p style="margin:0;font-weight:700">${esc(F.place.title)}${F.place.suburb ? ', ' + esc(F.place.suburb) : ''}</p>`,
        [{ id: 'yes', text: "Yes, it's my home. Add my lights", cls: 'go' }, { id: 'no', text: 'Go back' }],
        id => { if (id === 'yes') { $('#consent', v).checked = true; $('#addForm', v).requestSubmit(); } });
    }
    const from = $('#from', v).value, until = $('#until', v).value;
    if (from && until && until < from) return err('The "Until" date is before the "From" date.', $('#until', v));
    if (nightMinutes(clockMinutes($('#hTo', v).value)) <= nightMinutes(clockMinutes($('#hFrom', v).value))) return err('"Lights off" needs to be after "Lights on".', $('#hTo', v));
    const btn = $('#addBtn', v); btn.disabled = true; status.className = 'status'; status.textContent = mode === 'new' ? 'Sending…' : 'Saving…';
    const entry = {
      address: F.place.title, suburb: $('#suburb', v).value.trim() || F.place.suburb, lat: F.place.lat, lng: F.place.lng,
      size: F.size, features: [...F.features], viewing: F.viewing, from, until,
      hours: `${$('#hFrom', v).value} – ${$('#hTo', v).value}`, notes: $('#notes', v).value
    };
    const photoChanged = F.photo !== undefined;
    if (photoChanged) entry.thumb = F.photo ? F.photo.thumb : '';
    try {
      const S = await state.storeReady;
      if (mode === 'new') {
        if (F.photo) status.textContent = 'Sending your display and photo…';
        await S.submit(entry, F.photo ? F.photo.image : null); clearToasts(); onSaved && onSaved({}); return;
      }
      const before = cleanEntry(d), after = cleanEntry(entry);
      // A new photo is checked first, like a new address; taking a photo off isn't
      const major = MAJOR.some(k => JSON.stringify(before[k]) !== JSON.stringify(after[k])) || !!(photoChanged && F.photo);
      const newStatus = mode === 'admin' ? d.status : (d.status === 'approved' && !major ? 'approved' : 'pending');
      await S.update(d.id, entry, newStatus);
      let photoErr = false;
      if (photoChanged) {
        try { await S.setPhoto(d.id, F.photo ? F.photo.image : null, d.ownerUid); }
        catch (ex) { console.warn(ex); photoErr = true; }
      }
      clearToasts();
      onSaved && onSaved({ backToCheck: d.status === 'approved' && newStatus === 'pending' });
      if (photoErr) toast("Saved, but the photo didn't go through. Edit it and try the photo again.");
    } catch (ex) {
      console.error(ex); btn.disabled = false;
      err(mode === 'new' ? "Couldn't send just now. Check you have signal and try again." : "Couldn't save just now. Check you have signal and try again.");
    }
  };
}

// ---------- Add my lights: the form, or "your display" once this phone has added one ----------
function displaySummary(d) {
  const bits = [`${stars(d.size)} ${sizeName(d.size)}`, d.viewing === 'walk' ? 'Park and walk' : 'Drive past', d.hours].filter(Boolean);
  const feats = (d.features || []).map(f => FEATURES[f] || f);
  return `<p class="meta" style="margin:0">${bits.map(b => `<span style="white-space:nowrap">${esc(b)}</span>`).join(' · ')}${feats.length ? '<br>' + feats.map(esc).join(', ') : ''}${d.notes ? '<br>“' + esc(d.notes) + '”' : ''}</p>`;
}

async function renderAdd() {
  const v = $('#view-add'), A = state.add;
  if (A.editing) {
    return displayForm(v, {
      mode: 'edit', initial: A.editing,
      onCancel: () => { A.editing = null; renderAdd(); scrollTop(); },
      onSaved: async r => {
        A.editing = null; await loadDisplays(); renderAdd(); scrollTop();
        popup(r.backToCheck
          ? `<h2>Changes saved</h2><p style="margin:0">You changed the address, notes or photo, so your display will be back on the map once it's been checked.</p>`
          : `<h2>Changes saved</h2><p style="margin:0">Your display has been updated. Thanks for lighting up Toowoomba!</p>`,
          [{ id: 'ok', text: 'OK', cls: 'go' }]);
      }
    });
  }
  if (!v.querySelector('form, .mine')) v.innerHTML = '<h1>Add your Christmas lights</h1><p class="note on-page">Loading…</p>';
  let mine = [];
  try { const S = await state.storeReady; mine = S.myDisplays ? await S.myDisplays() : []; } catch (e) { mine = []; }
  if (state.tab !== 'add' || A.editing) return;

  if (mine.length) {
    v.innerHTML = mine.map(d => `
      <div class="card mine" data-id="${esc(d.id)}">
        ${d.status === 'approved'
          ? `<h1>Your address has been added to the map</h1>`
          : `<h1>You've been added to the list!</h1><p style="margin:0">Please wait while an admin approves your display. It will show on the map once it's been checked.</p>`}
        <div class="myaddr">${ICON.pin}<div><b>${esc(d.address)}</b><small>${esc(d.suburb || '')}</small></div>
          <span class="tag ${d.status === 'approved' ? 'gold' : ''}">${d.status === 'approved' ? 'On the map' : 'Waiting for a check'}</span></div>
        ${d.thumb ? `<img class="minipic" src="${esc(d.thumb)}" alt="Your photo">` : ''}
        ${displaySummary(d)}
        ${d.status === 'approved' ? (offTonight(d)
          ? `<div class="offbox on"><p style="margin:0"><b>Your lights are switched off tonight.</b> Drives skip your house until tomorrow, when it turns itself back on.</p>
             <button class="btn primary wide" type="button" data-mine="lightson">My lights are back on</button></div>`
          : `<div class="offbox"><button class="btn wide" type="button" data-mine="lightsoff">${ICON.moon}Lights off tonight</button>
             <p class="note" style="margin:0">Bad weather, or a problem with the lights? Tap this and drives will skip your house tonight. It turns itself back on tomorrow.</p></div>`) : ''}
        <div class="row2"><button class="btn" type="button" data-mine="edit">Edit</button><button class="btn danger" type="button" data-mine="remove">Remove</button></div>
        ${d.status === 'approved' ? '<a class="linkbtn" href="#map">See it on the map</a>' : ''}
      </div>`).join('') + '<p class="note on-page" style="text-align:center">Merry Christmas from Toowoomba Christmas Lights!</p>';
    $$('.mine', v).forEach(c => c.onclick = e => {
      const b = e.target.closest('[data-mine]'); if (!b) return;
      const d = mine.find(x => x.id === c.dataset.id);
      if (b.dataset.mine === 'edit') { A.editing = d; renderAdd(); scrollTop(); return; }
      if (b.dataset.mine === 'lightsoff' || b.dataset.mine === 'lightson') {
        const off = b.dataset.mine === 'lightsoff'; b.disabled = true;
        state.store.setOffTonight(d.id, off).then(async () => {
          await loadDisplays(); renderAdd();
          toast(off ? 'Done. Drives will skip your house tonight.' : "Great, you're back on for tonight.");
        }, () => { b.disabled = false; toast("That didn't work. Check you have signal and try again."); });
        return;
      }
      popup(`<h2>Remove your display?</h2><p style="margin:0">${esc(d.address)} will come off the map. You can add it again later.</p>`,
        [{ id: 'yes', text: 'Yes, remove it', cls: 'danger' }, { id: 'no', text: 'Keep it' }],
        async id => {
          if (id !== 'yes') return;
          try { await state.store.remove(d.id); await loadDisplays(); A.done = false; renderAdd(); toast('Your display has been removed'); }
          catch (ex) { toast("That didn't work. Check you have signal and try again."); }
        });
    });
    return;
  }

  if (A.done) {
    // Sent, but this phone can't look it up (e.g. no signal): the plain thank-you
    v.innerHTML = `
      <div class="card"><h1>You've been added to the list!</h1>
        <p style="margin:0">Please wait while an admin approves your display. It will show on the map once it's been checked. Merry Christmas!</p>
        ${state.store && state.store.mode === 'demo' ? '<p class="demo-note">Demo: your entry is waiting in Approvals on this phone only.</p>' : ''}
      </div>`;
    return;
  }
  displayForm(v, {
    mode: 'new',
    onSaved: () => {
      A.done = true; renderAdd(); scrollTop();
      popup(`<h2>Your address has been added to the map</h2>
        <p style="margin:0">It will show for everyone once it's been checked. Thanks for lighting up Toowoomba!</p>`,
        [{ id: 'ok', text: 'OK', cls: 'go' }]);
    }
  });
}

/* =================================================================== APPROVALS (#admin) */
async function renderAdmin() {
  const v = $('#view-admin');
  if (!v.querySelector('.card')) v.innerHTML = '<h1>Approvals</h1><p class="note on-page">Loading…</p>';
  const S = await state.storeReady;
  if (S.mode === 'offline') {
    v.innerHTML = `<h1>Approvals</h1><div class="card"><p style="margin:0">Can't reach the database right now. Check your phone has signal, then close and reopen the app.</p></div>`;
    return;
  }
  // Ask "am I an admin?" and "what's waiting?" at the same time (the live list, once it's running, is used instead)
  const pendingP = state.pendingLive ? Promise.resolve({ list: state.pendingLive })
    : S.listPending().then(list => ({ list }), err => ({ err }));
  const admin = await S.isAdmin();
  if (state.tab !== 'admin') return;
  if (!admin) {
    const me = S.whoAmI ? await S.whoAmI() : null;
    v.innerHTML = `<h1>Approvals</h1>
      <div class="card"><p style="margin:0">Only the group's admins can approve displays.</p>
        ${me ? `<p class="note">You're signed in as ${esc(me.email)}, but you're not an admin yet. Your user ID is <b>${esc(me.uid)}</b>.</p>` : ''}
        <button class="btn primary wide" type="button" id="signIn">Sign in with Google</button></div>`;
    $('#signIn', v).onclick = async () => {
      const btn = $('#signIn', v); btn.disabled = true; btn.textContent = 'Signing in…';
      try { await S.signIn(); await refreshAdminTab(); renderAdmin(); }
      catch (e) {
        console.error(e); btn.disabled = false; btn.textContent = 'Sign in with Google';
        const m = document.createElement('p'); m.className = 'status err';
        m.textContent = `Sign-in didn't work (${e.code || e.message || 'unknown error'}). Try again, or tell Claude this message.`;
        btn.after(m);
      }
    };
    return;
  }
  setAdminTab(true);
  const got = await pendingP;
  if (state.tab !== 'admin' || state.adminEditing) return;
  const loadErr = got.err || state.pendingError;
  const pending = got.list || state.pendingLive || [];
  const link = location.origin + location.pathname + '#add';
  const joined = d => { const c = d.createdAt, t = c?.toDate ? c.toDate() : typeof c === 'number' ? new Date(c) : c?.seconds ? new Date(c.seconds * 1000) : null;
    return t ? 'Added ' + t.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : ''; };
  const live = state.displays.slice().sort((a, b) => (b.createdAt?.seconds ?? b.createdAt ?? 0) - (a.createdAt?.seconds ?? a.createdAt ?? 0));
  v.innerHTML = `
    <div class="adminhead"><h1>Approvals</h1><button class="btn" type="button" id="refreshAdmin">↻ Refresh</button></div>
    <p class="note on-page">New displays appear here by themselves as people add them.</p>
    ${loadErr ? `<div class="card"><p class="status err" style="margin:0">Couldn't load the waiting list (${esc(loadErr.code || loadErr.message || 'unknown error')}). Tap Refresh. If it keeps happening, sign out at the bottom of this page and sign in again.</p></div>` : ''}
    ${S.mode === 'demo' ? '<p class="demo-note">Demo mode: entries and approvals are kept on this phone only. Once the database is connected, everyone\'s entries land here.</p>' : ''}
    <div class="card"><h2>Link for the Facebook post</h2><p class="note">People tap this to add their display.</p>
      <input type="text" readonly value="${esc(link)}" id="addLink"><button class="btn wide" type="button" id="copyLink">Copy link</button></div>
    <h2 class="on-page" style="color:#fff">Waiting for a check (${pending.length})</h2>
    ${pending.length ? pending.map(d => `
      <div class="card pending" data-id="${esc(d.id)}">
        <div><b style="font-size:1.2rem">${esc(d.address)}</b><div class="muted" style="font-weight:600">${esc(d.suburb)}${joined(d) ? ' · ' + joined(d) : ''}</div></div>
        <p class="meta">${stars(d.size)} ${sizeName(d.size)} · ${d.viewing === 'walk' ? 'Park and walk' : 'Drive past'} · ${esc(d.hours)}<br>${esc(fmtDate(d.from))} to ${esc(fmtDate(d.until))}${(d.features || []).length ? '<br>' + d.features.map(f => esc(FEATURES[f] || f)).join(', ') : ''}${d.notes ? '<br>“' + esc(d.notes) + '”' : ''}</p>
        ${(() => { const twin = [...state.displays, ...pending].find(o => o.id !== d.id && nearSameSpot(o, d));
          return twin ? `<p class="pinwarn"><b>Same map spot as ${esc(twin.address)}.</b> The dot was probably left at the middle of the street. Tap Edit and drag it onto the right house before approving.</p>` : ''; })()}
        ${d.thumb ? `<div class="adminpic"><span class="tag gold">Photo to check</span><img class="dphoto" data-photo="${esc(d.id)}" src="${esc(d.thumb)}" alt="Photo of ${esc(d.address)}"></div>
          <button class="btn wide" type="button" data-act="nophoto">Remove the photo (keep the display)</button>` : ''}
        <a class="linkbtn" href="https://www.google.com/maps/search/?api=1&query=${d.lat},${d.lng}" target="_blank" rel="noopener">Check the spot on Google Maps</a>
        <button class="btn" type="button" data-act="edit">Edit</button>
        <div class="row2"><button class="btn danger" type="button" data-act="reject">Reject</button><button class="btn go" type="button" data-act="approve" style="min-height:52px;font-size:1.05rem">Approve</button></div>
      </div>`).join('') : '<p class="note">Nothing waiting. New entries from the Add my lights page show up here.</p>'}
    <h2 class="on-page" style="color:#fff">On the map (${live.length})</h2>
    <p class="note on-page">Newest first. <b>Edit</b> changes the details; <b>Undo</b> moves a display back to “Waiting for a check”; <b>Remove</b> deletes it.</p>
    <ul class="list" id="liveList">${live.map(d => { const open = state.adminOpen.has(d.id); return `<li class="adminrow${open ? ' open' : ''}" data-row="${esc(d.id)}">
      <button class="rowhead" type="button" data-toggle="${esc(d.id)}" aria-expanded="${open}" aria-controls="opts-${esc(d.id)}">
        <span><b>${esc(d.address)}</b><small>${esc(d.suburb)}${joined(d) ? ' · ' + joined(d) : ''}</small></span>
        <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
      </button>
      <div class="rowopts" id="opts-${esc(d.id)}"${open ? '' : ' hidden'}>
      <small class="rowmeta">${sizeName(d.size)} · ${d.viewing === 'walk' ? 'Park and walk' : 'Drive past'}${d.hours ? ' · ' + esc(d.hours) : ''}${offTonight(d) ? ' · <b>switched off tonight</b>' : ''}</small>
      ${d.thumb ? `<img class="minipic" src="${esc(d.thumb)}" alt=""><button class="linkbtn" type="button" data-nophoto="${esc(d.id)}">Remove the photo</button>` : ''}
      <span class="adminbtns">${S.update && !String(d.id).startsWith('s') ? `<button class="btn" type="button" data-edit="${esc(d.id)}">Edit</button>` : ''}${S.unapprove && !String(d.id).startsWith('s') ? `<button class="btn" type="button" data-undo="${esc(d.id)}">Undo</button>` : ''}<button class="btn danger" type="button" data-remove="${esc(d.id)}">Remove</button></span></div></li>`; }).join('') || '<li class="group">No displays on the map yet</li>'}</ul>
    ${S.signOut ? '<button class="linkbtn on-page" type="button" id="signOut" style="color:#fff">Sign out of admin on this phone</button>' : ''}
    ${S.diagnose ? '<button class="btn wide" type="button" id="diagnose">Check the database</button><div id="diagOut"></div>' : ''}
    ${S.startNewYear ? `<div class="card newseason"><h2>New season</h2>
      <p class="note" style="margin:0">When Christmas is over, clear the map so addresses don't stay online all year. A copy of every display is kept in the database's archive first. People add their lights again next season.</p>
      <button class="btn wide redbtn" type="button" id="newYear">Start a new year (${newSeasonYear()})</button></div>` : ''}`;
  // Full-size photos on the waiting cards, as they arrive
  // (a brand-new display can arrive a moment before its photo has finished sending, so try again for a few seconds)
  $$('[data-photo]', v).forEach(img => {
    const get = tries => S.getPhoto(img.dataset.photo).then(src => {
      if (src) img.src = src; else if (tries > 0 && img.isConnected) setTimeout(() => get(tries - 1), 2000);
    });
    get(5);
  });
  const ny = $('#newYear', v);
  if (ny) ny.onclick = () => newYearSteps(S, pending.length);
  $('#copyLink', v).onclick = async () => { try { await navigator.clipboard.writeText(link); toast('Link copied'); } catch (e) { $('#addLink', v).select(); toast('Select the link and copy it'); } };
  $('#refreshAdmin', v).onclick = async () => {
    const b = $('#refreshAdmin', v); b.disabled = true; b.textContent = 'Refreshing…';
    stopPendingWatch(); state.pendingError = null;
    await loadDisplays();
    startPendingWatch();
    renderAdmin();
  };
  const adminEdit = d => {
    state.adminEditing = true;
    displayForm(v, {
      mode: 'admin', initial: d,
      onCancel: () => { state.adminEditing = false; renderAdmin(); scrollTop(); },
      onSaved: async () => { state.adminEditing = false; await loadDisplays(); renderAdmin(); scrollTop(); toast('Changes saved'); }
    });
    scrollTop();
  };
  $$('.pending', v).forEach(c => c.onclick = async e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    if (b.dataset.act === 'edit') return adminEdit(pending.find(x => x.id === c.dataset.id));
    b.disabled = true;
    try {
      if (b.dataset.act === 'nophoto') { await S.removePhoto(c.dataset.id); toast('Photo removed'); state.pendingLive = null; }
      else if (b.dataset.act === 'approve') { await S.approve(c.dataset.id); toast('Approved: it\'s on the map'); }
      else { await S.reject(c.dataset.id); toast('Rejected and removed'); }
      await loadDisplays(); renderAdmin();
    } catch (ex) { b.disabled = false; toast("That didn't work. Try again."); }
  });
  let armed = null;
  $('#liveList', v).onclick = async e => {
    const tg = e.target.closest('[data-toggle]');
    if (tg) {
      const id = tg.dataset.toggle, row = tg.closest('.adminrow'), open = !state.adminOpen.has(id);
      open ? state.adminOpen.add(id) : state.adminOpen.delete(id);
      row.classList.toggle('open', open); tg.setAttribute('aria-expanded', open); $('.rowopts', row).hidden = !open;
      return;
    }
    const ed = e.target.closest('[data-edit]');
    if (ed) return adminEdit(live.find(x => x.id === ed.dataset.edit));
    const np = e.target.closest('[data-nophoto]');
    if (np) {
      np.disabled = true;
      try { await S.removePhoto(np.dataset.nophoto); await loadDisplays(); renderAdmin(); toast('Photo removed'); }
      catch (ex) { np.disabled = false; toast("That didn't work. Try again."); }
      return;
    }
    const u = e.target.closest('[data-undo]');
    if (u) {
      u.disabled = true;
      try { await S.unapprove(u.dataset.undo); await loadDisplays(); renderAdmin(); toast('Moved back to waiting'); }
      catch (ex) { u.disabled = false; toast("That didn't work. Try again."); }
      return;
    }
    const b = e.target.closest('[data-remove]'); if (!b) return;
    if (armed !== b) { armed = b; b.textContent = 'Tap again'; return; } // two taps, like GaugeMate's Leave
    await S.remove(b.dataset.remove); await loadDisplays(); renderAdmin(); toast('Removed from the map');
  };
  const dg = $('#diagnose', v);
  if (dg) dg.onclick = async () => {
    dg.disabled = true; dg.textContent = 'Checking…';
    const lines = await S.diagnose();
    let ver = '?'; try { ver = (await caches.keys()).filter(k => k.startsWith('tcl-app-')).join(', ') || 'none'; } catch (e) { /* no caches */ }
    lines.unshift(['App version', ver]);
    const nav = $('nav.tabs').getBoundingClientRect(), safe = getComputedStyle($('nav.tabs')).paddingBottom;
    lines.splice(1, 0, ['Screen', `screen ${screen.width}×${screen.height} · window ${innerWidth}×${innerHeight} · page ${document.documentElement.clientHeight} · app ${appHeight()} · menu ends ${Math.round(nav.bottom)} (padding ${safe}) · home screen ${navigator.standalone === true ? 'yes' : 'no'}`]);
    $('#diagOut', v).innerHTML = `<div class="card"><h2>What the database says</h2>
      <ul class="diag">${lines.map(([k, val]) => `<li><b>${esc(k)}</b><span>${esc(String(val))}</span></li>`).join('')}</ul>
      <p class="note">Take a screenshot of this and send it to Claude.</p></div>`;
    dg.disabled = false; dg.textContent = 'Check the database again';
    $('#diagOut', v).scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const so = $('#signOut', v);
  if (so) so.onclick = async () => { await S.signOut(); setAdminTab(false); location.hash = 'plan'; toast('Signed out'); };
}

// ---------- Start a new year: several checks, then copy everything to the archive and clear the map ----------
function newYearSteps(S, waiting) {
  const year = newSeasonYear(), onMap = state.displays.length;
  const link = location.origin + location.pathname + '#add';
  const failed = ex => {
    console.error(ex);
    popup(`<h2>That didn't finish</h2><p style="margin:0">Nothing has been lost: every display is either still on the map or already saved in the archive.</p>
      <p style="margin:0">Check your signal, then press <b>Start a new year</b> again.</p>`, [{ id: 'ok', text: 'OK', cls: 'go' }]);
    loadDisplays().then(() => { if (state.tab === 'admin') renderAdmin(); });
  };
  const run = async () => {
    popup(`<h2>Clearing the map…</h2><div class="progress"><i id="nyBar" style="width:3%"></i></div>
      <p class="note" id="nyText" style="margin:0">Saving a copy first. Keep the app open.</p>`, []);
    try {
      const r = await S.startNewYear(year, (done, total) => {
        const bar = $('#nyBar'), t = $('#nyText');
        if (bar) bar.style.width = Math.max(3, Math.round(done / Math.max(total, 1) * 100)) + '%';
        if (t) t.textContent = `${done} of ${total} removed. Keep the app open.`;
      });
      state.displays = []; state.pendingLive = null; setAdminBadge(0);
      await loadDisplays();
      if (state.tab === 'admin') renderAdmin();
      popup(`<h2>Done! The map is clear for ${year}.</h2>
        <p style="margin:0">A copy of ${r.archived === 1 ? 'the 1 display' : `all ${r.archived} displays`} is saved in the archive (${year - 1}).</p>
        <p style="margin:0"><b>Next:</b> post the "Add your lights" link on Facebook when you're ready for people to add their displays again.</p>`,
        [{ id: 'copy', text: 'Copy the Add my lights link', cls: 'go' }, { id: 'ok', text: 'OK' }],
        async id => { if (id === 'copy') { try { await navigator.clipboard.writeText(link); toast('Link copied'); } catch (e) { toast(link); } } });
    } catch (ex) { failed(ex); }
  };
  const confirmYear = (wrong = false) => {
    popup(`<h2>Are you sure?</h2><p style="margin:0">This <b>can't be undone</b>. ${onMap + waiting === 1 ? 'The 1 address comes' : `All ${onMap + waiting} addresses come`} off the map and out of the waiting list.</p>
      ${wrong ? `<p class="status err" style="margin:0">That wasn't ${year}, so nothing was cleared.</p>` : ''}
      <div class="field"><label for="nyYear">Type <b>${year}</b> to confirm</label><input id="nyYear" type="text" inputmode="numeric" autocomplete="off" maxlength="4"></div>`,
      [{ id: 'go', text: `Clear the map for ${year}`, cls: 'redbtn' }, { id: 'no', text: 'Cancel' }],
      id => { if (id !== 'go') return; if (inp.value.trim() === String(year)) run(); else confirmYear(true); });
    const inp = $('#nyYear'); setTimeout(() => inp && inp.focus(), 50);
  };
  popup(`<h2>Start a new year (${year})?</h2>
    <p style="margin:0">This takes <b>every display</b> off the map: <b>${onMap}</b> on the map and <b>${waiting}</b> waiting for a check.</p>
    <p style="margin:0">Anyone who opens the app will see an <b>empty map</b> until people add their lights again.</p>
    <p class="note" style="margin:0">A copy of every display is saved in the database's archive first, just in case.</p>`,
    [{ id: 'keep', text: 'Keep everything', cls: 'primary' }, { id: 'go', text: 'Yes, go on', cls: 'danger' }],
    id => { if (id === 'go') confirmYear(); });
}

/* =================================================================== shell */
function scrollTop() { $('#scroller').scrollTo({ top: 0 }); }

// Big numbers shrink to fit their box, never wrap or spill (same rule as GaugeMate)
function fitNumbers(root = document) {
  for (const el of $$('.fig .v, .bigtime', root)) {
    el.style.fontSize = '';
    let size = parseFloat(getComputedStyle(el).fontSize), guard = 0;
    while (el.scrollWidth > el.clientWidth + 1 && size > 12 && guard++ < 40) { size -= 1; el.style.fontSize = size + 'px'; }
  }
}
new MutationObserver(() => requestAnimationFrame(() => fitNumbers())).observe(document.querySelector('main'), { childList: true, subtree: true });

function show(tab, { keepScroll = false } = {}) {
  closePopup();
  if (tab !== 'admin') state.adminEditing = false;
  if (tab !== 'map') state.near = null;
  if (!['plan', 'map', 'add', 'admin'].includes(tab)) tab = 'plan';
  state.tab = tab;
  for (const t of ['plan', 'map', 'add', 'admin']) $(`#view-${t}`).hidden = t !== tab;
  $$('nav.tabs [data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === tab));
  if (tab === 'plan') renderPlan();
  if (tab === 'map') renderMapTab();
  if (tab === 'add') renderAdd();
  if (tab === 'admin') renderAdmin();
  if (!keepScroll) scrollTop();
}

// Show the Admin menu button on phones signed in as an admin
async function refreshAdminTab() {
  if (!state.store || state.store.mode === 'offline') return; // keep what we had until we can check
  let yes = false;
  try { yes = await state.store.isAdmin(); } catch (e) { yes = false; }
  setAdminTab(yes);
}

async function loadDisplays() {
  try { state.displays = await state.store.listApproved(); state.loadedAt = Date.now(); }
  catch (e) { console.error(e); state.displays = []; toast("Couldn't load the displays. Check your signal."); }
}

// Size the app to the visible window (in a browser its toolbars come and go). As an iPhone home-screen app,
// use the page's own height: iOS can report the window shorter than that. (Sizing to the full screen was
// tried and cut the menu off: the iPhone doesn't show the page in the bottom strip.)
function appHeight() {
  let h = window.innerHeight;
  if (navigator.standalone === true) h = Math.max(h, document.documentElement.clientHeight);
  return h;
}
function sizeApp() { document.documentElement.style.setProperty('--app-h', appHeight() + 'px'); }

// The last list of displays this phone saw (saved by the database code), so the app can open at once
function cachedDisplays() {
  if (!CONFIG.firebase) return null;
  try { return JSON.parse(localStorage.getItem('lm.cache.approved') || 'null'); } catch (e) { return null; }
}
const ADMIN_FLAG = 'lm.wasAdmin';
function setAdminBadge(n) {
  const tab = $('#adminTab');
  let b = tab.querySelector('.badge');
  if (!n) { if (b) b.remove(); return; }
  if (!b) { b = document.createElement('span'); b.className = 'badge'; tab.append(b); }
  b.textContent = n > 99 ? '99+' : String(n);
  b.setAttribute('aria-label', `${n} waiting for a check`);
}
function startPendingWatch() {
  if (state.pendingStop || !state.store || !state.store.watchPending) return;
  state.pendingStop = state.store.watchPending(list => {
    const before = state.pendingLive ? state.pendingLive.map(d => d.id + d.status).join() : null;
    state.pendingLive = list; state.pendingError = null;
    setAdminBadge(list.length);
    // Show new ones straight away, unless an edit form is open on the Admin page
    if (state.tab === 'admin' && !state.adminEditing && before !== list.map(d => d.id + d.status).join()) renderAdmin();
  }, err => {
    console.error(err); state.pendingError = err; state.pendingLive = null;
    if (state.tab === 'admin' && !state.adminEditing) renderAdmin();
  });
}
function stopPendingWatch() {
  if (state.pendingStop) { state.pendingStop(); state.pendingStop = null; }
  state.pendingLive = null; setAdminBadge(0);
}

function setAdminTab(yes) {
  $('#adminTab').hidden = !yes;
  $('nav.tabs').classList.toggle('four', yes);
  if (yes && state.store && state.store.mode !== 'offline') startPendingWatch();
  if (!yes) stopPendingWatch();
  try { yes ? localStorage.setItem(ADMIN_FLAG, '1') : localStorage.removeItem(ADMIN_FLAG); } catch (e) { /* private mode */ }
}

async function start() {
  sizeApp(); window.addEventListener('resize', sizeApp); window.addEventListener('orientationchange', () => setTimeout(sizeApp, 300));
  setTimeout(sizeApp, 500); setTimeout(sizeApp, 2000); // iOS can settle its sizes a moment after opening
  $('#areaChip').innerHTML = `${ICON.pin}${esc(CONFIG.area)}`;
  const cached = cachedDisplays();
  if (cached) state.displays = cached;
  try { if (localStorage.getItem(ADMIN_FLAG)) setAdminTab(true); } catch (e) { /* private mode */ }
  // The database code is big; load it in the background instead of making everyone wait for it
  state.storeReady = openStore().then(async s => {
    state.store = s;
    // If the sign-in changes (or finishes loading late), recheck the Admin button and page
    let lastUser = null;
    if (s.onUserChange) s.onUserChange(async () => {
      const me = s.whoAmI ? await s.whoAmI() : null, key = me ? me.uid : '';
      if (key === lastUser) return;
      lastUser = key;
      await refreshAdminTab();
      if (state.tab === 'admin' && !state.adminEditing) renderAdmin();
    });
    await loadDisplays();
    // Bring the screen up to date, unless someone is in the middle of filling something in
    const P = state.plan;
    if (state.tab === 'map' || (state.tab === 'plan' && P.step === 'form')) show(state.tab, { keepScroll: true });
    refreshAdminTab();
    return s;
  });
  if (!cached) await state.storeReady; // first ever visit: nothing saved yet, so wait for the real list
  $$('nav.tabs [data-tab]').forEach(b => b.onclick = () => {
    if (b.dataset.tab === 'plan' && state.tab === 'plan' && state.plan.step !== 'drive') { state.plan.step = 'form'; }
    if (location.hash === '#' + b.dataset.tab) show(b.dataset.tab); else location.hash = b.dataset.tab;
  });
  window.addEventListener('hashchange', () => show(location.hash.slice(1)));
  show(location.hash.slice(1) || 'plan');
  let taps = 0, tapTimer = 0;
  $('.brand .mark').addEventListener('click', () => {
    taps++; clearTimeout(tapTimer); tapTimer = setTimeout(() => { taps = 0; }, 1500);
    if (taps >= 5) { taps = 0; if (location.hash === '#admin') show('admin'); else location.hash = 'admin'; }
  });
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    try { await navigator.serviceWorker.register('sw.js'); } catch (e) { /* preview pages can't use one */ }
  }
}
start();
