# Tasks

## Done (this session)

- Fixed `firestore.rules` public read/write hole (`if true` → `if false`).
- Bootstrapped `docs/` per `AGENTS.md` (this file and its siblings).
- Added `applicationType` to `projects` (create + list + validation).
- Added `logEvents` batch endpoint (`trialService.js` + `index.js`) writing
  to `clients/{clientDocId}/events`.
- Added 6 tests; full suite 33/33 passing.
- Fixed flag rendering on Windows by replacing emoji flags with `flagcdn.com` images in the admin panel.

## Next up

- Deploy `firestore.rules` and `functions` changes to Firebase — **ask the
  user first**, this touches a live production project shared with the
  existing license-verification flow.
- Add `AnalyticsDashboard.jsx` admin panel page.
- Extend `postman/` collection with `logEvents` sample requests.
- Add Firestore index if `events` subcollection queries need one beyond the
  default (subcollection queries scoped to a single client doc don't need a
  composite index; a future cross-client analytics query might).

## Backlog

See roadmap.md "Not started / blocked".
