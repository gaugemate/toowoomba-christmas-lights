# Toowoomba Christmas Lights

A phone app (installable web app) that plans a drive past the best Christmas light displays in Toowoomba, in the time you have.

- **Plan a drive** – pick a start point and how long you have; get up to three drive options with spoken turn-by-turn guiding.
- **All lights** – a map of every display, with size, features and hours.
- **Add my lights** – anyone can add their display; it waits for an admin to approve it.
- **Approvals** – admin page at `#admin` (Google sign-in).

Settings live in `src/config.js`. Until Firebase settings are added there, the app runs on made-up sample displays.

To try it locally, serve the folder with any static web server, e.g. `python3 -m http.server`, then open http://localhost:8000.
