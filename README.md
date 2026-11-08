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

The Pages workflow runs daily at 3:17 a.m. Eastern (automatically adjusting for daylight saving time) and 22:17 UTC (5:17 p.m. Eastern standard time / 6:17 p.m. daylight time), on pushes to main, and through Actions → Update ratings and deploy scoreboard → Run workflow. It validates pregame ratings, saves only changed data, and deploys the static site. Failed downloads or invalid/older/incomplete data retain the last good snapshot. The page displays the provider update date and keeps its bundled fallback.

`nfl-elo.json` is managed in the remote repository; `publish.sh` preserves that remote copy. The updater and workflow are also published. No personal access token is required. Schedules may be delayed, and GitHub can disable scheduled workflows after 60 days without repository activity.

## No spoilers

Open `https://ben428.github.io/scoreboard/?spoilers=off` to hide scores, progress/final/overtime status, records, and upset labels. Upcoming games and next-game previews are omitted. Completed games retain larger Find highlights links. Dates and team names remain visible; YouTube search results and external team/standings pages can themselves contain spoilers. The regular URL is unchanged.

## Overnight highlights

The overnight and afternoon workflow runs also check recent completed games for
highlights (the previous seven days for football, four calendar days for basketball, and three for baseball). The overnight run is scheduled for 3:17 a.m. Eastern year-round. It reads the repository Actions secret
`YOUTUBE_API_KEY`; no key is published or sent to the browser.

`scripts/highlight-channels.json` lists approved channel IDs. Pro games use only
the official NFL/MLB channel. College games prefer the recorded broadcaster,
then approved conference/NCAA channels. Team channels are excluded. Matching
checks both teams, sport/gender, game/publication date, duration and doubleheader
number. Ambiguity retains Find highlights. Channel coverage is intentionally
conservative; not every broadcaster or conference publishes suitable videos.

A confident match changes the button to Watch highlights, opening the video
directly in both regular and no-spoilers modes. No YouTube titles, descriptions
or thumbnails appear on the scoreboard. YouTube itself can still show spoilers.
Links are held for at most 14 days, and failures preserve existing verified data.
The browser reloads `highlights.json` every 15 minutes. Like ratings,
`publish.sh` preserves the remote automation-managed map on later publishes.

Run matcher tests with `python3 scripts/test-update-highlights.py`. API calls
read recent channel upload playlists instead of doing an expensive search per
game; scans paginate back to the earliest relevant game date, with a 40-page safety limit per active channel. Incomplete scans preserve cached links.

Matching uses explicit two-team matchup titles and provider abbreviations such as FDU and SMU. Basketball gender comes from the title, a sport-specific channel, or the game introduction—not promotional channel footers. Official game summaries of at least one minute can qualify; shorter individual-play clips remain excluded.

When the same approved channel posts multiple qualifying edits of one game, prefer the unique longer edit. Equally preferred videos from different channels, tied edit lengths, or videos matching multiple games still fall back to search.

College basketball highlights also check House of Highlights for games broadcast on TNT, TBS, truTV, Max, or HBO Max. March Madness remains an NCAA fallback for college basketball throughout the season. Coverage is optional: exact-match and sport/gender checks still apply, and unmatched games retain Find highlights.

For college basketball videos with no gender evidence, an explicit matching title game date and two-team matchup may establish identity. Conflicting gender remains rejected; same-day men’s/women’s games between the same teams remain ambiguous. Without an explicit game date, the uniqueness checks described below must pass.

When multiple videos confidently identify one game, selection uses broadcaster priority, then conference over NCAA, then the explicit channel preference in `scripts/highlight-channels.json`. Specialized feeds precede general feeds. Within the preferred channel, the longest edit wins; equal-length edits use a stable video-ID tie-break. Cross-game and gender ambiguity still fall back to Find highlights.

Missing basketball gender and title date may also be resolved when exactly one collected game matches the teams and 72-hour publication window. Identity checks include both genders and repeat matchups, independently of broadcast eligibility. Basketball discovery covers four Eastern calendar days to cover this window.

## Competitive-game tags

No Spoilers Mode has an optional, initially unchecked **Show competitive-game tags** control. Qualifying finals show only **Competitive game**, with no reason, margin, winner, overtime, or lead-change information. Final margin qualifies at five points for basketball, seven for football, or one run for baseball. Late closeness also qualifies: within five in basketball’s last five regulation minutes or overtime; within seven during football’s fourth quarter or overtime; tied or within one run in baseball’s seventh inning or later with fewer than three outs, or the trailing team’s tying run on base then.

`scripts/update-competitive-games.py` evaluates recent finals using ESPN play-by-play and uniquely matched MLB play-by-play. Enrichment failures retain prior tags; the browser can always evaluate usable final scores. The workflow publishes only event identities in `competitive-games.json`, never scores or qualification reasons. The browser verifies event ID, sport, date, and teams, and accepts enrichment for 14 days. `publish.sh` seeds this automation-managed map only when absent remotely. Run `python3 scripts/test-update-competitive-games.py` for evaluator tests.

No Spoilers Mode displays available NCAA Top 25 ranks and matched NFL pregame Elo ranks beside team names, including favorite cards. Unknown and unranked teams have no rank number.
