# Working with the owner of this project

- Whenever you need the owner to do something (in GitHub, Firebase, a settings page, their phone, etc.),
  give step-by-step, detailed instructions: the exact web address to open, which button or menu to click,
  what to type into each box, and what they should see when it has worked. Don't assume they know where things are.
- Use plain English and Australian spelling.
- Before making ANY change, double-check the code it touches and everything that depends on it (the app,
  the database code in src/store.js, firestore.rules, the service worker, the address data). If a change could
  clash with something that already works, or needs the owner to change something in Firebase/Cloudflare/GitHub
  first, explain that to the owner in basic language and wait for their OK before going ahead.
- Test changes the way real people use the app before saying they work: against the Firebase emulators with the
  real firestore.rules and real sign-ins (not just demo mode), and against the live site when it can be reached.
  Remember phones autofill forms (including hidden fields) and that home-screen apps keep their own sign-in.
  Never tell the owner something is fixed until it has been checked that way.

# The app

Toowoomba Christmas Lights (formerly "LightsMate"): an installable web app (PWA) that plans a drive past
Christmas light displays in Toowoomba. See README.md. Settings are in src/config.js.
Preview: https://claude.ai/artifact/3nhAqFxoq17FTi9XSZz1HF
