// Everything that's likely to change lives here.
export const CONFIG = {
  appName: 'Toowoomba Christmas Lights',
  area: 'Toowoomba',
  center: [-27.5606, 151.9539],
  zoom: 13,
  // Address search sticks to this box (west, south, east, north) so "Ruthven St" finds Toowoomba's, not Sydney's
  searchBox: [150.9, -28.2, 152.6, -26.9],

  // Free map services (no account or key needed). Swap for paid or self-hosted ones later if traffic grows.
  photon: 'https://photon.komoot.io', // address search as you type
  osrm: 'https://router.project-osrm.org', // driving times and the route line
  // Street map pictures: OpenStreetMap's own map, free with no key. Their fair-use policy suits a local app;
  // if traffic ever gets big, swap this for a paid map service (MapTiler, Stadia Maps, ...).
  cartoKey: '', // only used if the tiles below are switched back to CARTO
  tiles: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · Addresses: G-NAF &copy; Geoscape Australia (CC BY 4.0)',
    subdomains: 'abc',
    maxZoom: 19
  },

  // Driving past lights is slower than normal driving: 1.2 = allow 20% longer than the normal drive time
  slowDriving: 1.2,

  // The season new displays default to
  season: { from: '2026-12-01', until: '2027-01-01' },

  // Paste the Firebase web app settings here to go live (Firebase console → Project settings → Your apps).
  // While this is null the app runs on the sample displays, and new entries are kept on this phone only.
  firebase: {
    apiKey: 'AIzaSyAx4Plsu9WnWY9SXzuVP9hEnwa7PwL28Mw',
    authDomain: 'toowoomba-christmas-lights.firebaseapp.com',
    projectId: 'toowoomba-christmas-lights',
    storageBucket: 'toowoomba-christmas-lights.firebasestorage.app',
    messagingSenderId: '862198661826',
    appId: '1:862198661826:web:7db9c9254049da4cdeb15b'
  }
};
