// Turn-by-turn guiding inside Toowoomba Christmas Lights: wording for each turn, the arrow to show, and keeping track of where
// you are along the route as the phone's location updates. No map or network code, so it can be tested on its own.

const R = 6371000;
const toRad = d => (d * Math.PI) / 180;

export function metres(a, b) {
  const dLat = toRad(b[0] - a[0]), dLng = toRad(b[1] - a[1]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Shortest distance from point p to the line a–b (flat-earth maths is fine over a few km)
function toSegment(p, a, b) {
  const k = Math.cos(toRad(p[0]));
  const ax = a[1] * k, ay = a[0], bx = b[1] * k, by = b[0], px = p[1] * k, py = p[0];
  const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
  let t = len ? ((px - ax) * dx + (py - ay) * dy) / len : 0;
  t = Math.max(0, Math.min(1, t));
  return metres(p, [ay + t * dy, (ax + t * dx) / k]);
}
export function distanceToLine(p, line) {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) best = Math.min(best, toSegment(p, line[i - 1], line[i]));
  return line.length === 1 ? metres(p, line[0]) : best;
}

export function fmtDist(m) {
  if (m >= 1000) return { n: (m / 1000).toFixed(m >= 10000 ? 0 : 1), u: 'km' };
  if (m >= 100) return { n: String(Math.round(m / 50) * 50), u: 'm' };
  return { n: String(Math.max(0, Math.round(m / 10) * 10)), u: 'm' };
}
export const distWords = m => { const d = fmtDist(m); return `${d.n} ${d.u === 'km' ? 'kilometres' : 'metres'}`; };

const ORD = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'];
const TURN = {
  uturn: 'Make a U-turn', 'sharp right': 'Turn sharp right', right: 'Turn right', 'slight right': 'Bear right',
  straight: 'Go straight on', 'slight left': 'Bear left', left: 'Turn left', 'sharp left': 'Turn sharp left'
};
const side = m => (m && m.includes('left') ? 'left' : m && m.includes('right') ? 'right' : '');

// What to say and show for one step (the road service's step format)
export function instruction(step) {
  const onto = step.name ? ` onto ${step.name}` : '';
  const m = step.modifier || 'straight';
  switch (step.type) {
    case 'depart': return step.name ? `Head off along ${step.name}` : 'Head off';
    case 'arrive': return 'You have arrived';
    case 'roundabout': case 'rotary': case 'roundabout turn':
      return step.exit ? `At the roundabout, take the ${ORD[step.exit] || step.exit + 'th'} exit${onto}` : `At the roundabout, go${onto || ' through'}`;
    case 'exit roundabout': case 'exit rotary': return `Leave the roundabout${onto}`;
    case 'end of road': return `At the end of the road, ${(TURN[m] || 'turn').toLowerCase()}${onto}`;
    case 'fork': return `Keep ${side(m) || 'straight'} at the fork${onto}`;
    case 'merge': return `Merge ${side(m) || 'ahead'}${onto}`;
    case 'on ramp': return `Take the ramp${side(m) ? ' on the ' + side(m) : ''}${onto}`;
    case 'off ramp': return `Take the exit${side(m) ? ' on the ' + side(m) : ''}${onto}`;
    case 'new name': case 'continue': case 'notification':
      return m === 'straight' || !TURN[m] ? `Keep going${onto}` : `${TURN[m]}${onto}`;
    default: return `${TURN[m] || 'Keep going'}${onto}`;
  }
}

// Which arrow to draw: 'straight', 'left', 'right', 'slight-left', ..., 'uturn', 'roundabout', 'arrive'
export function arrowFor(step) {
  if (step.type === 'arrive') return 'arrive';
  if (/roundabout|rotary/.test(step.type)) return 'roundabout';
  const m = step.modifier || 'straight';
  return m === 'uturn' ? 'uturn' : m.replace(' ', '-');
}

/**
 * Follows the driver along one leg (to one display).
 * steps: [{ type, modifier, exit, name, location:[lat,lng] }] in order, first is 'depart', last is 'arrive'.
 * update(position) returns what to show, and a sentence to speak when one is due.
 */
export class Guide {
  constructor({ steps, line, dest, arriveWithin = 40, offRouteAfter = 60 }) {
    this.steps = steps; this.line = line; this.dest = dest;
    this.arriveWithin = arriveWithin; this.offRouteAfter = offRouteAfter;
    this.next = Math.min(1, steps.length - 1); // the turn we're heading for
    this.said = new Set();
    this.offCount = 0; this.arrived = false;
  }

  update(pos, accuracy = 10) {
    const out = { speak: null, arrivedNow: false, offRoute: false };
    const toDest = metres(pos, this.dest);
    // Arrival: close to the display itself, whatever the turns say
    if (!this.arrived && toDest <= this.arriveWithin + Math.min(accuracy, 30)) {
      this.arrived = true; out.arrivedNow = true;
    }
    // Move on past turns we've reached (or already passed and are now closer to the one after)
    while (this.next < this.steps.length - 1) {
      const here = metres(pos, this.steps[this.next].location);
      const after = metres(pos, this.steps[this.next + 1].location);
      const reached = here <= 25 + Math.min(accuracy, 20);
      const passed = after < here && distanceToLine(pos, [this.steps[this.next].location, this.steps[this.next + 1].location]) < 30 && here > 40;
      if (reached || passed) this.next++; else break;
    }
    const step = this.steps[this.next];
    const toTurn = metres(pos, step.location);
    // Off the route? Needs two readings in a row, and a location that's accurate enough to trust
    if (this.line && this.line.length > 1 && accuracy < 50 && distanceToLine(pos, this.line) > this.offRouteAfter) this.offCount++;
    else this.offCount = 0;
    out.offRoute = this.offCount >= 2 && !this.arrived;

    // Spoken prompts: once early ("In 400 metres, turn left onto Bob Street"), once close ("Turn left onto Bob Street")
    const text = instruction(step);
    if (step.type !== 'arrive') {
      if (toTurn > 160 && !this.said.has(this.next + 'far')) { this.said.add(this.next + 'far'); out.speak = `In ${distWords(toTurn)}, ${text.charAt(0).toLowerCase()}${text.slice(1)}`; }
      else if (toTurn <= 90 && !this.said.has(this.next + 'near')) { this.said.add(this.next + 'near'); this.said.add(this.next + 'far'); out.speak = text; }
    }
    return { ...out, step, stepIndex: this.next, text, arrow: arrowFor(step), toTurn, toDest };
  }
}

// Used when the road service doesn't answer: just point the way
export function bearingWords(from, to) {
  const y = Math.sin(toRad(to[1] - from[1])) * Math.cos(toRad(to[0]));
  const x = Math.cos(toRad(from[0])) * Math.sin(toRad(to[0])) - Math.sin(toRad(from[0])) * Math.cos(toRad(to[0])) * Math.cos(toRad(to[1] - from[1]));
  const deg = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  return ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(deg / 45) % 8];
}
