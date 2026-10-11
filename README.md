# Scoreboard

A static personal sports scoreboard. Open `index.html` through a web server; `app.js` loads scores directly from ESPN. No build step or server-side secrets are required.

## GitHub Pages

Publish this repository using **Settings → Pages → Deploy from a branch**, selecting **main** and **/(root)**. GitHub Pages will serve the root `index.html` and `app.js` over HTTPS.

The scoreboard refreshes every 60 seconds while the page is active. NFL Elo rankings include a verified dated fallback, and the page attempts to fetch newer pregame ratings from NFL Analytics. FOX game links use verified destinations with ESPN as a fallback. Browser cross-origin restrictions may prevent new FOX links or Elo data from being fetched; bundled data only covers its recorded games. Baseball links use MLB Gameday when matched, otherwise MLB's dated scoreboard.

After publishing, check scores, game links, and refresh in Safari on the iPod Touch running iOS 15.

## Maintaining the site

Editable source lives in `work/scoreboard/dist/`. Copy `index.html`, `app.js`, `favicon.ico`, `favicon.svg`, and `apple-touch-icon.png` from there to the repository root before publishing changes. `outputs/scoreboard.html` is a standalone review copy, not the Pages entry point.

Run scheduling checks with `node work/scoreboard/tests/scheduling.js` when Node.js is available.
