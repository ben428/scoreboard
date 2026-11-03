# Scoreboard

A static personal sports scoreboard. Open `index.html` through a web server; `app.js` loads scores directly from ESPN. No build step or server-side secrets are required.

## GitHub Pages

Publish this repository using **Settings → Pages → GitHub Actions**. GitHub Pages will serve the root `index.html` and `app.js` over HTTPS.

The scoreboard refreshes every 60 seconds while the page is active. NFL Elo rankings include a verified dated fallback, and the page loads a same-origin ratings snapshot refreshed from NFL Analytics by GitHub Actions. Football and basketball game links use ESPN. Baseball links use MLB Gameday when matched, otherwise MLB's dated scoreboard.

After publishing, check scores, game links, and refresh in Safari on the iPod Touch running iOS 15.

## Maintaining the site

Editable source lives in `work/scoreboard/dist/`. Copy `index.html`, `app.js`, `favicon.ico`, `favicon.svg`, and `apple-touch-icon.png` from there to the repository root before publishing changes. `outputs/scoreboard.html` is a standalone review copy, not the Pages entry point.

Run scheduling checks with `node work/scoreboard/tests/scheduling.js` when Node.js is available.

## Scheduled NFL ratings

The Pages workflow runs at 10:17 and 22:17 UTC daily, on pushes to main, and through Actions → Update ratings and deploy scoreboard → Run workflow. It validates pregame ratings, saves only changed data, and deploys the static site. Failed downloads or invalid/older/incomplete data retain the last good snapshot. The page displays the provider update date and keeps its bundled fallback.

`nfl-elo.json` is managed in the remote repository; `publish.sh` preserves that remote copy. The updater and workflow are also published. No personal access token is required. Schedules may be delayed, and GitHub can disable scheduled workflows after 60 days without repository activity.

## No spoilers

Open `https://ben428.github.io/scoreboard/?spoilers=off` to hide scores, progress/final/overtime status, ranks, records, and upset labels. Upcoming games and next-game previews are omitted. Completed games retain larger Find highlights links. Dates and team names remain visible; YouTube search results and external team/standings pages can themselves contain spoilers. The regular URL is unchanged.
