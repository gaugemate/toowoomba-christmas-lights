// The printable list: every display on the map as an A4 PDF, sorted by suburb, with the logo at the top
// and a tick box beside each address. Made on the phone (no server), with jsPDF (vendor/jspdf, MIT licence),
// which is only downloaded the first time someone asks for the list.
import { parseHours, clockText } from './planner.js';

const GREEN = [6, 67, 33], GOLD = [163, 117, 0], GREY = [70, 70, 70];
const SIZE = { 1: 'Small', 2: 'Medium', 3: 'Large', 4: 'Huge' };

let lib = null;
function loadJsPdf() {
  if (window.jspdf) return Promise.resolve(window.jspdf);
  lib ??= new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = 'vendor/jspdf/jspdf.umd.min.js';
    s.onload = () => (window.jspdf ? ok(window.jspdf) : fail(new Error('PDF maker missing')));
    s.onerror = () => { lib = null; fail(new Error("Couldn't load the PDF maker")); };
    document.head.append(s);
  });
  return lib;
}
async function loadLogo() {
  const res = await fetch('icons/logo-print.jpg');
  if (!res.ok) throw new Error('logo');
  const blob = await res.blob();
  return new Promise((ok, fail) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = fail; r.readAsDataURL(blob); });
}

// The PDF's built-in font only has Western European letters: drop emoji and the like rather than print rubbish
const plain = s => String(s ?? '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/[^\x20-\x7E -ÿ–—•…]/g, '').replace(/\s+/g, ' ').trim();
const hoursText = h => { const p = parseHours(h); return p ? `${clockText(p.on)} to ${clockText(p.off)}` : plain(h); };

function star(doc, cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
    pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]);
  }
  const rel = pts.slice(1).map((p, i) => [p[0] - pts[i][0], p[1] - pts[i][1]]);
  doc.lines(rel, pts[0][0], pts[0][1], [1, 1], 'F', true);
}

/**
 * @param {Array} displays  the displays on the map
 * @param {object} features feature key -> words ("music" -> "Music")
 * @returns {Promise<Blob>} the PDF
 */
export async function makeListPdf(displays, features) {
  const [{ jsPDF }, logo] = await Promise.all([loadJsPdf(), loadLogo()]);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, H = 297, M = 18, BOTTOM = H - 17, X = M + 9, TX = M + 16, TW = W - TX - M;
  doc.setProperties({ title: 'Toowoomba Christmas Lights: the list', author: 'Toowoomba Christmas Lights' });

  // ---- top of the first page: the logo, the date, a few words
  const logoW = 112, logoH = logoW * 237 / 900;
  doc.addImage(logo, 'JPEG', (W - logoW) / 2, 12, logoW, logoH);
  let y = 12 + logoH + 7;
  const day = new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(...GREY);
  doc.text(`Christmas lights list · Toowoomba region · as at ${day}`, W / 2, y, { align: 'center' });
  y += 9;
  const by = new Map();
  for (const d of displays) { const s = d.suburb || 'Other'; if (!by.has(s)) by.set(s, []); by.get(s).push(d); }
  const subs = [...by.keys()].sort((a, b) => a.localeCompare(b));
  doc.setFontSize(10.5); doc.setTextColor(40, 40, 40);
  const intro = `${displays.length} ${displays.length === 1 ? 'display' : 'displays'} in ${subs.length} ${subs.length === 1 ? 'suburb' : 'suburbs'}. ` +
    'Tick the box as you see each one. Times are when the owners say their lights are on. ' +
    'For the live map, directions and a drive planned for you, visit toowoomba-christmas-lights.pages.dev';
  const introLines = doc.splitTextToSize(intro, W - 2 * M);
  doc.text(introLines, M, y); y += introLines.length * 5 + 4;

  // ---- each suburb in bold, its displays indented underneath
  const entry = d => {
    doc.setFontSize(9.5);
    const bits = [SIZE[d.size] || 'Medium', d.viewing === 'walk' ? 'Park and walk' : 'Drive past', hoursText(d.hours),
      (d.features || []).map(f => features[f] || f).join(', ')].filter(Boolean);
    const details = doc.splitTextToSize(plain(bits.join(' · ')), TW - 4 * (d.size || 2) - 2);
    const notes = d.notes ? doc.splitTextToSize(plain(d.notes), TW) : [];
    return { details, notes, h: 5 + details.length * 4.1 + notes.length * 4.1 + 2.6 };
  };
  const newPage = () => { doc.addPage(); y = M; };
  for (const s of subs) {
    const list = by.get(s).sort((a, b) => plain(a.address).localeCompare(plain(b.address), 'en', { numeric: true }));
    if (y + 14 + entry(list[0]).h > BOTTOM) newPage(); // keep a heading with at least its first display
    const heading = more => {
      y += 3;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...GREEN);
      doc.text(plain(s), M, y);
      const hw = doc.getTextWidth(plain(s));
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...GREY);
      doc.text(more ? '(continued)' : `${list.length} ${list.length === 1 ? 'display' : 'displays'}`, M + hw + 3, y);
      doc.setDrawColor(...GREEN); doc.setLineWidth(0.6); doc.line(M, y + 2.2, W - M, y + 2.2);
      y += 8.5;
    };
    heading(false);
    for (const d of list) {
      const e = entry(d);
      if (y + e.h > BOTTOM) { newPage(); heading(true); } // the suburb carries on over the page
      doc.setDrawColor(...GREEN); doc.setLineWidth(0.45); doc.roundedRect(X, y - 3.6, 4.2, 4.2, 0.6, 0.6); // tick box
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(20, 20, 20);
      doc.text(plain(d.address), TX, y);
      y += 4.6;
      doc.setFillColor(...GOLD);
      const n = d.size || 2;
      for (let i = 0; i < n; i++) star(doc, TX + 1.6 + i * 4, y - 1.2, 1.6);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...GREY);
      doc.text(e.details, TX + n * 4 + 1.5, y);
      y += e.details.length * 4.1;
      if (e.notes.length) { doc.setFont('helvetica', 'italic'); doc.text(e.notes, TX, y); y += e.notes.length * 4.1; }
      y += 2.6;
    }
  }

  // ---- footer on every page
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.3); doc.line(M, H - 13, W - M, H - 13);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(90, 90, 90);
    doc.text("Please drive slowly, park safely and respect residents' privacy. Merry Christmas!", M, H - 8.5);
    doc.text(`Page ${i} of ${pages}`, W - M, H - 8.5, { align: 'right' });
  }
  return doc.output('blob');
}
