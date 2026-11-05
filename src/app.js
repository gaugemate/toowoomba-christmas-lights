// Toowoomba Christmas Lights app: Plan a drive, All lights, Add my lights, and Approvals (#admin, not on the menu).
import { CONFIG } from './config.js';
import { SIZES, planRoutes, shortlist, tourMinutes, hasMusic, MUSIC_VIEW_MIN } from './planner.js';
import * as svc from './services.js';
import { openStore } from './store.js';
import { Guide, fmtDist, metres, bearingWords } from './guide.js';

const L = window.L;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ICON = {
  pin: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z"/></svg>',
  locate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3"/></svg>',
  nav: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 3 3 10.5l7.2 2.3L12.5 20z"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 2.5 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"/></svg>'
};

const FEATURES = {
  music: 'Music', animated: 'Moving lights', inflatables: 'Inflatables',
  walkthrough: 'Walk-through', santa: 'Santa visits', charity: 'Charity collection'
};
const HOURS_FROM = ['Dusk', '6pm', '6:30pm', '7pm', '7:30pm', '8pm', '8:30pm', '9pm'];
const HOURS_TO = ['9pm', '9:30pm', '10pm', '10:30pm', '11pm', 'Midnight', 'Late'];
const MAX_MIN = 300; // longest drive you can ask for (5 hours)
const ROUTE_COLOURS = ['#c62828', '#0b5a9c', '#7b3fa0'];

const state = {
  store: null,
  displays: [],
  tab: 'plan',
  plan: { start: null, suburbs: new Set(), minutes: 120, back: true, step: 'form', routes: null, chosen: 0, lines: [], driveAt: 0 },
  add: { place: null, size: 0, features: new Set(), viewing: 'drive', done: false },
  maps: {}
};

/* ---------- small helpers ---------- */
const pad = n => String(n).padStart(2, '0');
const isoDay = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const litTonight = d => { const t = isoDay(new Date()); return (!d.from || d.from <= t) && (!d.until || d.until >= t); };
const preSeason = () => state.displays.length > 0 && !state.displays.some(litTonight);
const stars = n => '★'.repeat(n);
const fmtDate = iso => { if (!iso) return ''; const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }); };
const sizeName = n => (SIZES[n] || SIZES[2]).label;

function fmtDur(min) {
  min = Math.round(min);
  if (min < 60) return `<span class="big-n">${min}</span><small>min</small>`;
  const h = Math.floor(min / 60), m = min % 60;
  return `<span class="big-n">${h}</span><small>h</small>${m ? ` <span class="big-n">${pad(m)}</span>` : ''}`;
}
const fmtDurText = min => { min = Math.round(min); if (min < 60) return `${min} min`; const h = Math.floor(min / 60), m = min % 60; return m ? `${h} h ${pad(m)}` : `${h} h`; };
const clock = addMin => new Date(Date.now() + addMin * 60000).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }).replace(/\s?([ap])\.?m\.?/i, ' $1m');

function toast(msg) {
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
  $('[data-pop]', o).focus();
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
const lightIcon = d => pinIcon(litTonight(d) || preSeason() ? 'light' : 'off', 12 + d.size * 3);

/* ---------- address search box ---------- */
function addressBox(host, { placeholder, onPick, onClear }) {
  host.innerHTML = `<div class="search"><input type="search" enterkeyhint="search" autocomplete="off" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}">
    <button class="clear" type="button" aria-label="Clear" hidden>×</button></div><ul class="results" role="listbox"></ul>`;
  const input = $('input', host), list = $('.results', host), clear = $('.clear', host);
  let timer = 0, ctl = null, results = [];
  const show = (items, offline) => {
    results = items;
    list.innerHTML = items.length
      ? items.map((p, i) => `<li><button type="button" data-i="${i}"><b>${esc(p.title)}</b><small>${esc(p.line2)}</small></button></li>`).join('')
      : `<li class="none">${offline ? "Address search isn't working right now. Try a suburb name." : 'No matches yet. Keep typing the street name.'}</li>`;
  };
  input.addEventListener('input', () => {
    const q = input.value.trim();
    clear.hidden = !q;
    clearTimeout(timer);
    if (ctl) ctl.abort();
    if (q.length < 3) { list.innerHTML = ''; return; }
    timer = setTimeout(async () => {
      ctl = new AbortController();
      const local = suburbCentres().filter(s => s.title.toLowerCase().includes(q.toLowerCase()));
      try {
        const found = await svc.searchAddress(q, ctl.signal);
        if (input.value.trim() === q) show(found.length ? found : local);
      } catch (e) {
        if (e.name !== 'AbortError' && input.value.trim() === q) show(local, true);
      }
    }, 280);
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
    <h1>Plan a lights drive</h1>
    <div class="card">
      <h2>Where are you starting?</h2>
      <div id="startBox"></div>
      <button class="btn wide" id="useHere" type="button">${ICON.locate}Use where I am now</button>
    </div>
    <div class="card">
      <div class="card-head"><h2>Which suburbs?</h2></div>
      <div class="chips more" id="subChips">
        <button class="chip" type="button" data-sub="" aria-pressed="${P.suburbs.size === 0}">Anywhere near me</button>
        ${subs.map(([s, n], i) => `<button class="chip${i >= 8 ? ' extra' : ''}" type="button" data-sub="${esc(s)}" aria-pressed="${P.suburbs.has(s)}">${esc(s)} <small>${n}</small></button>`).join('')}
      </div>
      ${subs.length > 8 ? '<button class="linkbtn" type="button" id="moreSubs">Show all suburbs</button>' : ''}
    </div>
    <div class="card">
      <h2>How long have you got?</h2>
      <div class="timepick">
        <button class="step" type="button" id="less" aria-label="Less time">−</button>
        <div class="bigtime" id="bigTime" aria-live="polite"></div>
        <button class="step" type="button" id="more" aria-label="More time">+</button>
      </div>
      <p class="endtime" id="endTime"></p>
      <div class="allhint" id="allHint" role="status" hidden></div>
      <div class="seg" role="group" aria-label="Where to finish">
        <button type="button" data-back="1" aria-pressed="${P.back}">Finish back here</button>
        <button type="button" data-back="0" aria-pressed="${!P.back}">Finish anywhere</button>
      </div>
    </div>
    <button class="btn go wide" id="findBtn" type="button">Find my drive</button>
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
    $('#endTime', v).innerHTML = P.back ? `Back where you started by about <b>${clock(P.minutes)}</b> if you leave now` : `Finished by about <b>${clock(P.minutes)}</b> if you leave now`;
    $('#less', v).disabled = P.minutes <= 30; $('#more', v).disabled = P.minutes >= MAX_MIN;
    drawHint();
  };
  // With suburbs picked: how long it would take to see every display in them
  drawHint = () => {
    const box = $('#allHint', v);
    if (!P.suburbs.size) { box.hidden = true; return; }
    const pool = (preSeason() ? state.displays : state.displays.filter(litTonight)).filter(d => P.suburbs.has(d.suburb));
    if (!pool.length) { box.hidden = false; box.innerHTML = 'No displays are on tonight in the suburbs you picked.'; return; }
    const t = tourMinutes({ start: P.start, displays: pool, returnToStart: P.back, slow: CONFIG.slowDriving });
    const need = Math.ceil(t.minutes / 15) * 15;
    const music = pool.filter(hasMusic).length;
    const where = suburbsLabel(P.suburbs);
    const what = pool.length === 1 ? 'the 1 display' : `all ${pool.length} displays`;
    box.hidden = false;
    box.innerHTML = `To see ${what} in ${esc(where)} takes about <b>${fmtDurText(need)}</b>` +
      `${P.start ? (P.back ? ', there and back' : ' from your start') : ''}.` +
      (music ? ` That allows ${MUSIC_VIEW_MIN} minutes at ${music === 1 ? 'the display' : `each of the ${music} displays`} with lights to music.` : '') +
      (need === P.minutes ? '' : need <= MAX_MIN ? ` <button class="linkbtn" type="button" id="useAll">Set ${fmtDurText(need)}</button>`
        : ` That's more than ${MAX_MIN / 60} hours, so your drive will pick the best ones.`);
    const use = $('#useAll', box);
    if (use) use.onclick = () => { P.minutes = need; drawTime(); };
  };
  $('#less', v).onclick = () => { P.minutes = Math.max(30, P.minutes - 15); drawTime(); };
  $('#more', v).onclick = () => { P.minutes = Math.min(MAX_MIN, P.minutes + 15); drawTime(); };
  $$('[data-back]', v).forEach(b => b.onclick = () => { P.back = b.dataset.back === '1'; $$('[data-back]', v).forEach(x => x.setAttribute('aria-pressed', x === b)); drawTime(); });
  drawTime();

  $('#findBtn', v).onclick = findDrives;
}

function useMyLocation(btn, status, done) {
  if (!navigator.geolocation) { status.className = 'status err'; status.textContent = "This phone can't share its location here. Type an address instead."; return; }
  btn.disabled = true; status.className = 'status'; status.textContent = 'Finding where you are…';
  navigator.geolocation.getCurrentPosition(async pos => {
    const { latitude: lat, longitude: lng } = pos.coords;
    const named = await svc.nameOfPlace(lat, lng);
    btn.disabled = false; status.textContent = '';
    done({ title: named ? named.title : 'Where you are now', line2: named ? named.line2 : 'Your current location', suburb: named?.suburb || '', lat, lng });
  }, () => {
    btn.disabled = false; status.className = 'status err';
    status.textContent = "Couldn't get your location. Check location is allowed for this app, or type an address.";
  }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
}

async function findDrives() {
  const P = state.plan, v = $('#view-plan'), status = $('#planStatus', v), btn = $('#findBtn', v);
  if (!P.start) { status.className = 'status err'; status.textContent = 'Choose where you are starting first.'; $('#startBox input', v)?.focus(); return; }
  let pool = preSeason() ? state.displays : state.displays.filter(litTonight);
  if (P.suburbs.size) pool = pool.filter(d => P.suburbs.has(d.suburb));
  const list = shortlist(P.start, pool, P.minutes);
  if (!list.length) {
    status.className = 'status err';
    status.textContent = P.suburbs.size ? 'No displays in those suburbs fit that time. Add more time or pick other suburbs.' : 'No displays are close enough for that time. Try adding more time.';
    return;
  }
  btn.disabled = true; status.className = 'status'; status.textContent = 'Working out the best drives…';
  const matrix = await svc.roadMatrix([P.start, ...list]);
  const routes = planRoutes({ displays: list, matrix, budgetMin: P.minutes, returnToStart: P.back, slow: CONFIG.slowDriving });
  btn.disabled = false; status.textContent = '';
  if (!routes.length) { status.className = 'status err'; status.textContent = 'Nothing fits in that time. Try a little longer.'; return; }
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

function fitTo(map, pts) {
  if (!pts.length) return;
  map.fitBounds(L.latLngBounds(pts.map(p => [p.lat, p.lng])).pad(0.12), { animate: false });
}

// "6 of the 11 displays in Rangeville and Highfields. The other 5 need about another 1 h 30."
function coverageLine(r) {
  const P = state.plan, pool = P.pool || [];
  if (!pool.length) return '';
  const where = P.suburbs.size ? `in ${esc(suburbsLabel(P.suburbs))}` : 'around Toowoomba';
  if (r.count >= pool.length) return `<p class="cover all">All ${pool.length} displays ${where}.</p>`;
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
    <button class="btn go wide" type="button" id="startDrive">${ICON.nav}Start the drive</button>
    <p class="note">The app talks you through each turn and tells you when you've arrived. Your phone will ask to share your location: tap Allow.</p>
    <ol class="stops">
      <li class="stopr"><span class="num" style="background:var(--pine)">S</span><div><b>${esc(P.start.title)}</b><small>Leave now</small></div><span class="t">${clock(0)}</span></li>
      ${r.stops.map((s, k) => `<li class="stopr"><span class="num">${k + 1}</span>
        <div><b>${esc(s.display.address)}</b><small>${esc(s.display.suburb)} · ${sizeName(s.display.size)}${s.display.viewing === 'walk' ? ' · park and walk' : ''}</small></div>
        <span class="t">${clock(s.arriveMin)}</span></li>`).join('')}
      ${P.back ? `<li class="stopr"><span class="num" style="background:var(--pine)">S</span><div><b>Back to the start</b><small>${fmtDurText(r.backMin)} drive</small></div><span class="t">${clock(r.totalMin)}</span></li>` : ''}
    </ol>
    <p class="note">Times assume you leave now and allow for driving slowly past the lights.</p>
    <div class="card">
      <h2>Prefer Google Maps for the whole way?</h2>
      <p class="note">Google only takes a few stops at a time on a phone, so the drive is split into parts. Open each part in turn.</p>
      <div class="legs">${legs.map(l => `<a class="btn" href="${l.url}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join('')}</div>
    </div>`;
  $('#backRes', v).onclick = () => { P.step = 'results'; renderPlan(); };
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
  P.drive = { voice: true, pos: null, acc: 99, guide: null, loading: false, arrived: false, manual: false, lastReroute: 0, watch: null, fixes: 0 };
  speak("Let's go! I'll talk you through each turn.");
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
    return showArrival(`<div class="label">All done</div><h1>You're back!</h1><p style="margin:0">You saw ${r.count} displays. Merry Christmas!</p>
      <button class="btn go wide" type="button" id="arrNext">Finish</button>`, () => { P.driveAt++; endDrive(); });
  }
  const d = t.d, k = P.driveAt, last = k === r.stops.length - 1;
  speak(`You've arrived at stop ${k + 1}, ${d.address}. Enjoy the lights!`);
  const nextLabel = last ? (P.back ? 'Head back to the start ›' : 'Finish') : `Next stop ›`;
  showArrival(`
    <div class="label">You're here · Stop ${k + 1} of ${r.stops.length}</div>
    <h1 class="where">${esc(d.address)}</h1>
    <div class="muted" style="font-weight:700;font-size:1.1rem">${esc(d.suburb)}</div>
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
  const t = driveTarget();
  if (!t) return endDriveDone();
  speak(t.kind === 'home' ? 'Heading back to the start' : `Heading to stop ${P.driveAt + 1}, ${t.d.address}`);
  renderPlan(); scrollTop();
  if (D.pos) loadLeg();
}

function endDriveDone() {
  const P = state.plan, r = P.routes[P.chosen];
  if (P.drive && P.drive.watch != null) navigator.geolocation.clearWatch(P.drive.watch);
  keepAwake(false); closeArrival();
  P.drive = null; P.step = 'drive-done';
  const v = $('#view-plan');
  v.className = 'view';
  v.innerHTML = `<div class="card"><h1>That's the lot!</h1><p style="margin:0">You saw ${r.count} displays. Merry Christmas!</p>
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
  const subs = suburbsWithCounts();
  const filter = state.mapFilter || '';
  const shown = state.displays.filter(d => !filter || d.suburb === filter);
  const tonight = state.displays.filter(litTonight).length;
  v.innerHTML = `
    <h1>All the lights</h1>
    <p class="note">${state.displays.length} displays${preSeason() ? ' · the season starts soon' : ` · ${tonight} on tonight`}. Bigger dots are bigger displays.</p>
    <div class="map tall" id="allMap"></div>
    <div id="sheet"></div>
    <select id="subFilter" aria-label="Show suburb">
      <option value="">Every suburb (${state.displays.length})</option>
      ${subs.map(([s, n]) => `<option value="${esc(s)}" ${s === filter ? 'selected' : ''}>${esc(s)} (${n})</option>`).join('')}
    </select>
    <ul class="list" id="dispList">${listHTML(shown)}</ul>`;
  const map = state.maps.all = makeMap($('#allMap', v));
  const markers = new Map();
  for (const d of shown) {
    const m = L.marker([d.lat, d.lng], { icon: lightIcon(d), keyboard: false }).addTo(map);
    m.on('click', () => showSheet(d));
    markers.set(d.id, m);
  }
  if (shown.length) fitTo(map, shown);
  $('#subFilter', v).onchange = e => { state.mapFilter = e.target.value; renderMapTab(); };
  $('#dispList', v).onclick = e => {
    const b = e.target.closest('[data-id]'); if (!b) return;
    const d = state.displays.find(x => x.id === b.dataset.id);
    map.setView([d.lat, d.lng], 16); showSheet(d); scrollTop();
  };
  function showSheet(d) {
    const s = $('#sheet', v);
    s.innerHTML = `<div class="card sheet">
      <button class="x" type="button" aria-label="Close">×</button>
      <div><b style="font-size:1.25rem;display:block;padding-right:50px">${esc(d.address)}</b><span class="muted" style="font-weight:600">${esc(d.suburb)}</span></div>
      <div class="sz" style="display:flex;gap:8px;flex-wrap:wrap"><span class="tag gold">${stars(d.size)} ${sizeName(d.size)}</span>
        ${d.viewing === 'walk' ? '<span class="tag">Park and walk</span>' : ''}${(d.features || []).map(f => `<span class="tag">${esc(FEATURES[f] || f)}</span>`).join('')}</div>
      ${d.notes ? `<p style="margin:0">${esc(d.notes)}</p>` : ''}
      <p class="note">${d.hours ? `Lights on ${esc(d.hours)}` : ''}${!litTonight(d) && !preSeason() ? ' · not on tonight' : ''}</p>
      <a class="btn go wide" href="${svc.navigateUrl(d)}" target="_blank" rel="noopener">${ICON.nav}Directions</a></div>`;
    $('.x', s).onclick = () => { s.innerHTML = ''; };
  }
}

function listHTML(list) {
  if (!list.length) return '<li class="group">No displays yet</li>';
  const by = new Map();
  for (const d of list) { if (!by.has(d.suburb)) by.set(d.suburb, []); by.get(d.suburb).push(d); }
  return [...by.keys()].sort().map(s => `<li class="group">${esc(s)}</li>` + by.get(s).sort((a, b) => b.size - a.size).map(d =>
    `<li><button class="lrow" type="button" data-id="${esc(d.id)}"><span><b>${esc(d.address)}</b><small>${sizeName(d.size)}${d.notes ? ' · ' + esc(d.notes) : ''}</small></span><span class="stars">${stars(d.size)}</span></button></li>`).join('')).join('');
}

/* =================================================================== ADD MY LIGHTS */
function renderAdd() {
  const v = $('#view-add'), A = state.add;
  if (A.done) {
    v.innerHTML = `
      <div class="card"><h1>Thanks, you're on the list!</h1>
        <p style="margin:0">We'll check your display and it'll show on the map soon. Merry Christmas!</p>
        ${state.store.mode === 'demo' ? '<p class="demo-note">Demo: your entry is waiting in Approvals on this phone only.</p>' : ''}
        <button class="btn wide" type="button" id="another">Add another display</button>
      </div>`;
    $('#another', v).onclick = () => { state.add = { place: null, size: 0, features: new Set(), viewing: 'drive', done: false }; renderAdd(); };
    return;
  }
  v.innerHTML = `
    <h1>Add your Christmas lights</h1>
    <p class="note">It's free and we don't need your name. Your display shows on the map once it's been checked.</p>
    <form id="addForm" novalidate>
      <div class="view">
        <div class="card">
          <h2>Your address</h2>
          <div id="addrBox"></div>
          <div id="pinWrap" hidden>
            <div class="map small" id="pinMap"></div>
            <p class="note" style="margin-top:8px">Is the dot on your house? If not, drag it there.</p>
          </div>
          <div class="field" id="subField" hidden><label for="suburb">Suburb</label><input type="text" id="suburb" maxlength="60" autocomplete="address-level2"></div>
        </div>
        <div class="card">
          <h2>How big is your display?</h2>
          <div class="picker" role="radiogroup" aria-label="Display size">
            ${[1, 2, 3, 4].map(n => `<button type="button" class="pick" role="radio" data-size="${n}" aria-checked="${A.size === n}"><span><b>${SIZES[n].label}</b><small>${SIZES[n].hint}</small></span><span class="stars">${stars(n)}</span></button>`).join('')}
          </div>
        </div>
        <div class="card">
          <h2>What's in it? <span class="muted" style="font-weight:600;font-size:1rem">(tick any)</span></h2>
          <div class="chips" id="featChips">${Object.entries(FEATURES).map(([k, t]) => `<button type="button" class="chip" data-f="${k}" aria-pressed="${A.features.has(k)}">${t}</button>`).join('')}</div>
          <h2>How do people see it?</h2>
          <div class="seg" role="group" aria-label="How to see it">
            <button type="button" data-view="drive" aria-pressed="${A.viewing === 'drive'}">Drive past</button>
            <button type="button" data-view="walk" aria-pressed="${A.viewing === 'walk'}">Park and walk</button>
          </div>
        </div>
        <div class="card">
          <h2>When is it on?</h2>
          <div class="row2 dates">
            <div class="field"><label for="from">From</label><input type="date" id="from" value="${CONFIG.season.from}"></div>
            <div class="field"><label for="until">Until</label><input type="date" id="until" value="${CONFIG.season.until}"></div>
          </div>
          <div class="row2">
            <div class="field"><label for="hFrom">Lights on</label><select id="hFrom">${HOURS_FROM.map(h => `<option ${h === '7pm' ? 'selected' : ''}>${h}</option>`).join('')}</select></div>
            <div class="field"><label for="hTo">Lights off</label><select id="hTo">${HOURS_TO.map(h => `<option ${h === '10pm' ? 'selected' : ''}>${h}</option>`).join('')}</select></div>
          </div>
        </div>
        <div class="card">
          <div class="field"><label for="notes">Anything people should know? <span class="muted" style="font-weight:600">(optional)</span></label>
            <textarea id="notes" maxlength="200" placeholder="e.g. tune to 87.6 FM for the music, Santa visits Saturdays"></textarea></div>
          <label class="check"><input type="checkbox" id="consent"><span>This is my home (or I have the owner's OK), and I'm happy for the address to show on the public map.</span></label>
          <input class="hp" type="text" id="website" tabindex="-1" autocomplete="off" aria-hidden="true">
        </div>
        <button class="btn go wide" type="submit" id="addBtn">Add my lights</button>
        <p class="status" id="addStatus" role="status"></p>
      </div>
    </form>`;

  let pinMap = null, pin = null;
  const box = $('#addrBox', v);
  const drawAddr = () => {
    if (A.place) {
      box.innerHTML = pickedHTML(A.place);
      $('[data-act=change]', box).onclick = () => { A.place = null; $('#pinWrap', v).hidden = true; $('#subField', v).hidden = true; drawAddr(); };
      $('#pinWrap', v).hidden = false; $('#subField', v).hidden = false;
      $('#suburb', v).value = A.place.suburb || '';
      if (!pinMap) {
        pinMap = makeMap($('#pinMap', v), { center: [A.place.lat, A.place.lng], zoom: 18 });
        pin = L.marker([A.place.lat, A.place.lng], { draggable: true, icon: pinIcon('home', 30) }).addTo(pinMap);
        pin.on('dragend', () => { const ll = pin.getLatLng(); A.place.lat = ll.lat; A.place.lng = ll.lng; });
      } else { pinMap.setView([A.place.lat, A.place.lng], 18); pin.setLatLng([A.place.lat, A.place.lng]); setTimeout(() => pinMap.invalidateSize(), 50); }
    } else {
      addressBox(box, { placeholder: 'Start typing your address', onPick: p => {
        A.place = { ...p };
        drawAddr();
        if (!p.hasNumber) toast('Check the house number, then drag the dot onto your house');
      } });
    }
  };
  drawAddr();

  $$('[data-size]', v).forEach(b => b.onclick = () => { A.size = +b.dataset.size; $$('[data-size]', v).forEach(x => x.setAttribute('aria-checked', x === b)); });
  $('#featChips', v).onclick = e => { const b = e.target.closest('[data-f]'); if (!b) return; const f = b.dataset.f; A.features.has(f) ? A.features.delete(f) : A.features.add(f); b.setAttribute('aria-pressed', A.features.has(f)); };
  $$('[data-view]', v).forEach(b => b.onclick = () => { A.viewing = b.dataset.view; $$('[data-view]', v).forEach(x => x.setAttribute('aria-pressed', x === b)); });

  $('#addForm', v).onsubmit = async e => {
    e.preventDefault();
    const status = $('#addStatus', v);
    const err = (msg, el) => { status.className = 'status err'; status.textContent = msg; if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); };
    if ($('#website', v).value) { A.done = true; renderAdd(); return; } // spam bot filled the hidden box
    if (!A.place) return err('Type your address and pick it from the list.', box);
    if (!A.size) return err('Choose how big your display is.', $('.picker', v));
    if (!$('#consent', v).checked) {
      status.textContent = '';
      return popup(`<h2>Is this your home?</h2>
        <p style="margin:0">We can only show an address on the public map if it's your home, or you have the owner's OK.</p>
        <p style="margin:0;font-weight:700">${esc(A.place.title)}${A.place.suburb ? ', ' + esc(A.place.suburb) : ''}</p>`,
        [{ id: 'yes', text: "Yes, it's my home. Add my lights", cls: 'go' }, { id: 'no', text: 'Go back' }],
        id => { if (id === 'yes') { $('#consent', v).checked = true; $('#addForm', v).requestSubmit(); } });
    }
    const from = $('#from', v).value, until = $('#until', v).value;
    if (from && until && until < from) return err('The "Until" date is before the "From" date.', $('#until', v));
    const btn = $('#addBtn', v); btn.disabled = true; status.className = 'status'; status.textContent = 'Sending…';
    const address = A.place.title;
    try {
      await state.store.submit({
        address, suburb: $('#suburb', v).value.trim() || A.place.suburb, lat: A.place.lat, lng: A.place.lng,
        size: A.size, features: [...A.features], viewing: A.viewing, from, until,
        hours: `${$('#hFrom', v).value} – ${$('#hTo', v).value}`, notes: $('#notes', v).value
      });
      A.done = true; renderAdd(); scrollTop();
      popup(`<h2>Your address has been added to the map</h2>
        <p style="margin:0">It will show for everyone once it's been checked. Thanks for lighting up Toowoomba!</p>`,
        [{ id: 'ok', text: 'OK', cls: 'go' }]);
    } catch (ex) {
      console.error(ex); btn.disabled = false;
      err("Couldn't send just now. Check you have signal and try again.");
    }
  };
}

/* =================================================================== APPROVALS (#admin) */
async function renderAdmin() {
  const v = $('#view-admin'), S = state.store;
  v.innerHTML = '<h1>Approvals</h1><p class="note">Loading…</p>';
  if (!(await S.isAdmin())) {
    const me = S.whoAmI ? await S.whoAmI() : null;
    v.innerHTML = `<h1>Approvals</h1>
      <div class="card"><p style="margin:0">Only the group's admins can approve displays.</p>
        ${me ? `<p class="note">You're signed in as ${esc(me.email)}, but you're not an admin yet. Your user ID is <b>${esc(me.uid)}</b>.</p>` : ''}
        <button class="btn primary wide" type="button" id="signIn">Sign in with Google</button></div>`;
    $('#signIn', v).onclick = async () => { await S.signIn(); renderAdmin(); };
    return;
  }
  const pending = await S.listPending();
  const link = location.origin + location.pathname + '#add';
  v.innerHTML = `
    <h1>Approvals</h1>
    ${S.mode === 'demo' ? '<p class="demo-note">Demo mode: entries and approvals are kept on this phone only. Once the database is connected, everyone\'s entries land here.</p>' : ''}
    <div class="card"><h2>Link for the Facebook post</h2><p class="note">People tap this to add their display.</p>
      <input type="text" readonly value="${esc(link)}" id="addLink"><button class="btn wide" type="button" id="copyLink">Copy link</button></div>
    <h2 class="on-page" style="color:#fff">Waiting for a check (${pending.length})</h2>
    ${pending.length ? pending.map(d => `
      <div class="card pending" data-id="${esc(d.id)}">
        <div><b style="font-size:1.2rem">${esc(d.address)}</b><div class="muted" style="font-weight:600">${esc(d.suburb)}</div></div>
        <p class="meta">${stars(d.size)} ${sizeName(d.size)} · ${d.viewing === 'walk' ? 'Park and walk' : 'Drive past'} · ${esc(d.hours)}<br>${esc(fmtDate(d.from))} to ${esc(fmtDate(d.until))}${(d.features || []).length ? '<br>' + d.features.map(f => esc(FEATURES[f] || f)).join(', ') : ''}${d.notes ? '<br>“' + esc(d.notes) + '”' : ''}</p>
        <a class="linkbtn" href="https://www.google.com/maps/search/?api=1&query=${d.lat},${d.lng}" target="_blank" rel="noopener">Check the spot on Google Maps</a>
        <div class="row2"><button class="btn danger" type="button" data-act="reject">Reject</button><button class="btn go" type="button" data-act="approve" style="min-height:52px;font-size:1.05rem">Approve</button></div>
      </div>`).join('') : '<p class="note">Nothing waiting. New entries from the Add my lights page show up here.</p>'}
    <h2 class="on-page" style="color:#fff">On the map (${state.displays.length})</h2>
    <ul class="list" id="liveList">${state.displays.map(d => `<li><div class="lrow"><span><b>${esc(d.address)}</b><small>${esc(d.suburb)} · ${sizeName(d.size)}</small></span><button class="btn danger" style="min-height:44px" type="button" data-remove="${esc(d.id)}">Remove</button></div></li>`).join('')}</ul>`;
  $('#copyLink', v).onclick = async () => { try { await navigator.clipboard.writeText(link); toast('Link copied'); } catch (e) { $('#addLink', v).select(); toast('Select the link and copy it'); } };
  $$('.pending', v).forEach(c => c.onclick = async e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    b.disabled = true;
    try {
      if (b.dataset.act === 'approve') { await S.approve(c.dataset.id); toast('Approved: it\'s on the map'); }
      else { await S.reject(c.dataset.id); toast('Rejected and removed'); }
      await loadDisplays(); renderAdmin();
    } catch (ex) { b.disabled = false; toast("That didn't work. Try again."); }
  });
  let armed = null;
  $('#liveList', v).onclick = async e => {
    const b = e.target.closest('[data-remove]'); if (!b) return;
    if (armed !== b) { armed = b; b.textContent = 'Tap again'; return; } // two taps, like GaugeMate's Leave
    await S.remove(b.dataset.remove); await loadDisplays(); renderAdmin(); toast('Removed from the map');
  };
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

function show(tab) {
  if (!['plan', 'map', 'add', 'admin'].includes(tab)) tab = 'plan';
  state.tab = tab;
  for (const t of ['plan', 'map', 'add', 'admin']) $(`#view-${t}`).hidden = t !== tab;
  $$('nav.tabs [data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === tab));
  if (tab === 'plan') renderPlan();
  if (tab === 'map') renderMapTab();
  if (tab === 'add') renderAdd();
  if (tab === 'admin') renderAdmin();
  scrollTop();
}

async function loadDisplays() {
  try { state.displays = await state.store.listApproved(); }
  catch (e) { console.error(e); state.displays = []; toast("Couldn't load the displays. Check your signal."); }
}

// Some hosts float their own button over the bottom of the page (e.g. "Powered by Netlify"), which would sit on
// top of the menu. Find anything like that and leave room for it under the menu, so both can be seen and tapped.
function makeRoomForOverlays() {
  const shell = $('#appShell'), h = window.innerHeight, w = window.innerWidth;
  const ours = el => !el || el === document.documentElement || el === document.body || shell.contains(el) ||
    !!el.closest?.('.overlay, .toast') || /^(SCRIPT|STYLE|LINK|NOSCRIPT)$/.test(el.tagName);
  const topOf = el => { while (el.parentElement && el.parentElement !== document.body && el.parentElement !== document.documentElement) el = el.parentElement; return el; };
  let gap = 0;
  const consider = el => {
    if (ours(el)) return;
    const r = topOf(el).getBoundingClientRect();
    if (r.height > 0 && r.height < 200 && r.bottom > h - 160) gap = Math.max(gap, h - r.top);
  };
  for (const [x, y] of [[w - 12, h - 12], [w - 60, h - 24], [w / 2, h - 12], [12, h - 12], [w - 12, h - 50]]) consider(document.elementFromPoint(x, y));
  for (const el of [...document.body.children, ...document.documentElement.children]) {
    if (ours(el)) continue;
    const cs = getComputedStyle(el);
    if ((cs.position === 'fixed' || cs.position === 'sticky') && cs.display !== 'none' && cs.visibility !== 'hidden') consider(el);
  }
  const now = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--overlay-gap')) || 0;
  if (gap > now) document.documentElement.style.setProperty('--overlay-gap', Math.min(Math.ceil(gap) + 6, 120) + 'px');
}

function sizeApp() { document.documentElement.style.setProperty('--app-h', window.innerHeight + 'px'); }

async function start() {
  sizeApp(); window.addEventListener('resize', () => { sizeApp(); makeRoomForOverlays(); });
  for (const ms of [300, 1500, 4000, 8000]) setTimeout(makeRoomForOverlays, ms); // host buttons can appear a moment after the page
  $('#areaChip').innerHTML = `${ICON.pin}${esc(CONFIG.area)}`;
  state.store = await openStore();
  await loadDisplays();
  $$('nav.tabs [data-tab]').forEach(b => b.onclick = () => {
    if (b.dataset.tab === 'plan' && state.tab === 'plan' && state.plan.step !== 'drive') { state.plan.step = 'form'; }
    if (location.hash === '#' + b.dataset.tab) show(b.dataset.tab); else location.hash = b.dataset.tab;
  });
  window.addEventListener('hashchange', () => show(location.hash.slice(1)));
  show(location.hash.slice(1) || 'plan');
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    try { await navigator.serviceWorker.register('sw.js'); } catch (e) { /* preview pages can't use one */ }
  }
}
start();
