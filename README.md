# Toowoomba Christmas Lights

A phone app (installable web app) that plans a drive past the best Christmas light displays in Toowoomba, in the time you have.

- **Plan a drive** – pick a start point and how long you have; get up to three drive options with spoken turn-by-turn guiding.
- **All lights** – a map of every display, with size, features and hours.
- **Add my lights** – anyone can add their display; it waits for an admin to approve it.
- **Approvals** – admin page at `#admin` (Google sign-in).

Settings live in `src/config.js`. Until Firebase settings are added there, the app runs on made-up sample displays.

To try it locally, serve the folder with any static web server, e.g. `python3 -m http.server`, then open http://localhost:8000.

## What's where

| | |
|---|---|
| `index.html`, `src/` | The app itself. `src/config.js` holds the settings. |
| `sw.js` | Service worker: lets the app install on a phone and open with no signal. Bump `VERSION` in it when you add or rename app files. |
| `manifest.webmanifest`, `icons/` | Install name and icons. `icons/source/icon.svg` is the master the PNGs are drawn from. |
| `firestore.rules` | Database rules for Firebase: anyone can add a display as "pending"; only admins approve, change or delete. |
| `data/addresses/`, `src/gnaf.js` | Address search: every address in the Toowoomba region (about 102,000, from Oakey to Crows Nest and Pittsworth) from G-NAF, Australia's official address list, so a house number puts the dot on the property. Rebuild each year with `python3 tools/build-addresses.py <folder with the QLD G-NAF files>`. G-NAF © Geoscape Australia, CC BY 4.0. |
| `tests/` | Checks for the drive planner and turn-by-turn guide. Run `npm test` (Node 20 or newer, nothing to install). |
