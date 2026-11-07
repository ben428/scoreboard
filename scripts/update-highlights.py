"""Overnight official-channel highlights discovery. Standard library only.
No API key, video titles, thumbnails or game scores are written to the public map.
"""
import datetime as dt
import html
import json
import os
import re
import sys
import unicodedata
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import urlopen
from zoneinfo import ZoneInfo

UTC = dt.timezone.utc
EASTERN = ZoneInfo('America/New_York')
ROOT = Path(__file__).resolve().parent.parent
MAX_UPLOAD_PAGES = 40  # Safety limit; an incomplete scan must retain cached links.
SPORTS = ['baseball/mlb', 'football/nfl', 'football/college-football',
          'basketball/mens-college-basketball', 'basketball/womens-college-basketball']
FAVORITES = [('football/college-football', '130'), ('baseball/mlb', '2'), ('football/nfl', '17'),
             ('football/nfl', '16'), ('basketball/mens-college-basketball', '41'),
             ('basketball/womens-college-basketball', '41'), ('basketball/mens-college-basketball', '127')]


def instant(value):
    return dt.datetime.fromisoformat(value.replace('Z', '+00:00')).astimezone(UTC)


def normalize(value):
    value = unicodedata.normalize('NFKD', html.unescape(value)).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', ' ', value).strip()


def read_json(url):
    with urlopen(url, timeout=25) as response:
        return json.load(response)


def youtube(resource, key, **params):
    # Do not print exceptions containing the request URL: it contains the secret.
    try:
        return read_json('https://www.googleapis.com/youtube/v3/' + resource + '?' + urlencode({**params, 'key': key}))
    except HTTPError as error:
        reason = 'unknown'
        try:
            details = json.loads(error.read()).get('error', {})
            extended = [item.get('reason', '') for item in details.get('details', []) if isinstance(item, dict)]
            errors = details.get('errors', [])
            candidate = errors[0].get('reason', '') if errors else ''
            reasons = [candidate] + extended
            reason = ','.join(r for r in reasons if isinstance(r, str) and re.fullmatch(r'[A-Za-z0-9_.-]{1,80}', r)) or 'unknown'
        except Exception: pass
        raise RuntimeError('YouTube API HTTP ' + str(error.code) + ' (' + reason + ')') from None
    except Exception:
        raise RuntimeError('YouTube API request failed') from None


def completed(event):
    competition = (event.get('competitions') or [{}])[0]
    status = {**event.get('status', {}).get('type', {}), **competition.get('status', {}).get('type', {})}
    text = ' '.join(str(status.get(k, '')) for k in ('name', 'description', 'detail', 'shortDetail')).lower()
    return status.get('state') == 'post' and status.get('completed') is not False and not any(
        word in text for word in ('cancel', 'postpon', 'suspend', 'delay'))


def collect_games(now):
    games = {}
    failures = 0
    def add(feed, sport):
        for event in feed.get('events', []):
            try:
                started = instant(event['date'])
                competitors = event['competitions'][0]['competitors']
                if completed(event) and dt.timedelta(0) <= now - started <= dt.timedelta(days=7) and len(competitors) == 2:
                    if all(c.get('team', {}).get('id') and c['team'].get('displayName') for c in competitors):
                        games[sport + ':' + str(event['id'])] = {'sport': sport, 'event': event}
            except (KeyError, ValueError, TypeError):
                continue
    # Daily scoreboards cover the panels; schedules include unranked favorites.
    for sport in SPORTS:
        for offset in range(8 if sport.startswith('football/') else 3):
            day = (now.astimezone(EASTERN).date() - dt.timedelta(days=offset)).strftime('%Y%m%d')
            url = f'https://site.api.espn.com/apis/site/v2/sports/{sport}/scoreboard?limit=200&dates={day}'
            if sport == 'football/college-football': url += '&groups=80'
            if sport == 'basketball/mens-college-basketball': url += '&groups=50'
            try: add(read_json(url), sport)
            except Exception: failures += 1
    for sport, team in FAVORITES:
        for season_type in (2, 3):
            try:
                add(read_json(f'https://site.api.espn.com/apis/site/v2/sports/{sport}/teams/{team}/schedule?seasontype={season_type}'), sport)
            except Exception: failures += 1
    if failures: print(f'::warning::{failures} ESPN feeds unavailable; cached highlights retained.')
    return games


def broadcast_names(event):
    competition = event['competitions'][0]
    names = [competition.get('broadcast', '')]
    for entry in competition.get('broadcasts', []) + competition.get('geoBroadcasts', []):
        if str(entry.get('type', {}).get('id')) == '5': continue
        names.extend(entry.get('names', []))
        names.append(entry.get('media', {}).get('shortName', ''))
    return normalize(' '.join(n for n in names if isinstance(n, str)))


def priority(channel, game):
    sport = game['sport']
    if sport not in channel['sports']: return None
    if sport in ('baseball/mlb', 'football/nfl'):
        return 0 if channel['role'] == 'league' else None
    if channel['role'] == 'broadcaster':
        broadcasts = ' ' + broadcast_names(game['event']) + ' '
        return 0 if any(' ' + normalize(n) + ' ' in broadcasts for n in channel.get('networks', [])) else None
    return 1 if channel['role'] in ('conference', 'league') else None


def team_aliases(team):
    aliases = {team.get('displayName', ''), team.get('shortDisplayName', ''), team.get('location', '')}
    if str(team.get('id')) == '41': aliases.update(('UConn', 'Connecticut'))
    # Provider abbreviations are usable only inside an explicit two-team matchup.
    abbreviation = team.get('abbreviation', '')
    if re.fullmatch(r'[A-Z0-9]{3,6}', abbreviation): aliases.add(abbreviation)
    return {normalize(a) for a in aliases if len(normalize(a)) >= 3}


def matchup_in_title(text, aliases):
    # Requiring A vs/at B avoids mistaking player highlights vs B for a game
    # when A appears only in the channel's trailing branding.
    return any(a != b and re.search(r'(?<![a-z0-9])' + re.escape(a) +
               r'\s+(?:at|vs?|versus)\s+(?:no\s+)?(?:\d+\s+)?' + re.escape(b) + r'(?![a-z0-9])', text)
               for first, second in (aliases, aliases[::-1]) for a in first for b in second)


def basketball_gender(snippet, channel):
    def markers(text):
        text = normalize(text)
        genders = set()
        if re.search(r'\b(women|womens|wbb|ncaaw)\b', text): genders.add('women')
        if re.search(r'\b(men|mens|mbb|ncaam)\b', text): genders.add('men')
        return genders
    title = markers(snippet.get('title', ''))
    if title: return next(iter(title)) if len(title) == 1 else None
    sports = set(channel['sports'])
    specific = {'women' for sport in sports if sport == 'basketball/womens-college-basketball'}
    if 'basketball/mens-college-basketball' in sports: specific.add('men')
    if len(specific) == 1: return next(iter(specific))
    # Only the game introduction, never channel footers or promotional links.
    intro = re.split(r'\n\s*\n', snippet.get('description', ''), maxsplit=1)[0]
    intro = '\n'.join(line for line in intro.splitlines()
                      if not re.search(r'https?://|youtube|subscribe|follow|official channel', line, re.I))
    focused = markers(intro)
    return next(iter(focused)) if len(focused) == 1 else None


def date_evidence(text, game_date):
    """Explicit dates must match; a close publication time is a fallback."""
    dates = []
    for month, day, year in re.findall(r'\b(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?\b', text):
        year = int(year) if year else game_date.year
        if year < 100: year += 2000
        try: dates.append(dt.date(year, int(month), int(day)))
        except ValueError: continue
    for year, month, day in re.findall(r'\b(20\d{2})-(\d{2})-(\d{2})\b', text):
        try: dates.append(dt.date(int(year), int(month), int(day)))
        except ValueError: continue
    month_numbers = {}
    for number in range(1, 13):
        month = dt.date(2000, number, 1)
        month_numbers[month.strftime('%B').lower()] = number
        month_numbers[month.strftime('%b').lower()] = number
    month_numbers['sept'] = 9
    pattern = r'\b(' + '|'.join(sorted(month_numbers, key=len, reverse=True)) + r')\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(20\d{2}))?\b'
    for month, day, year in re.findall(pattern, text, re.I):
        try: dates.append(dt.date(int(year) if year else game_date.year, month_numbers[month.lower()], int(day)))
        except ValueError: continue
    return None if not dates else game_date in dates and all(d == game_date for d in dates)


def video_seconds(video):
    parts = re.fullmatch(r'PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?', video.get('contentDetails', {}).get('duration', ''))
    return sum(int(n or 0)*unit for n, unit in zip(parts.groups(), (3600, 60, 1))) if parts else 0


def candidate_matches(video, game, channel):
    if priority(channel, game) is None: return False
    snippet = video.get('snippet', {})
    if snippet.get('channelId') != channel['id'] or video.get('status', {}).get('privacyStatus') != 'public': return False
    video_id = video.get('id', '')
    if not re.fullmatch(r'[A-Za-z0-9_-]{11}', video_id): return False
    title = html.unescape(snippet.get('title', ''))
    text = normalize(title)
    if not re.search(r'\bhighlights\b', text): return False
    if re.search(r'\b(preview|prediction|reaction|interview|press conference|analysis|shorts|first half|second half|quarter highlights|top plays)\b', text): return False
    try:
        seconds = video_seconds(video)
        if not 60 <= seconds <= 2400: return False
        if seconds < 120 and not re.search(r'\b(?:full |full game |extended |game )highlights\b|(?:^|\|)\s*highlights\s*(?:\||$)', title, re.I): return False
        started = instant(game['event']['date'])
        published = instant(snippet['publishedAt'])
        if not dt.timedelta(0) <= published - started <= dt.timedelta(hours=72): return False
    except (KeyError, ValueError, TypeError): return False
    # Both teams must occur independently in the title, not just the description.
    competitors = game['event']['competitions'][0]['competitors']
    aliases = [team_aliases(c['team']) for c in competitors]
    if not matchup_in_title(text, aliases): return False
    sport = game['sport']
    description = normalize(snippet.get('description', '')[:1500])
    combined = text + ' ' + description
    if sport.startswith('basketball/'):
        expected = 'women' if sport.endswith('womens-college-basketball') else 'men'
        if basketball_gender(snippet, channel) != expected: return False
    if 'basketball' in sport and ('football' in text or 'baseball' in text): return False
    if sport.startswith('football/') and ('basketball' in text or 'baseball' in text): return False
    if sport == 'baseball/mlb' and ('basketball' in text or 'football' in text): return False
    if '/basketball/' in '/' + sport and not any(n in combined for n in ('basketball', 'ncaam', 'ncaaw', 'wbb', 'mbb')): return False
    if sport.startswith('football/') and 'football' not in combined and 'nfl' not in combined: return False
    if sport == 'baseball/mlb' and 'baseball' not in combined and 'mlb' not in combined: return False
    game_date = started.astimezone(EASTERN).date()
    if date_evidence(title, game_date) is False: return False
    years = re.findall(r'\b20\d{2}\b', title)
    if years and str(game_date.year) not in years: return False
    game_number = game['event']['competitions'][0].get('gameNumber', game['event'].get('gameNumber'))
    if game_number in (1, 2, '1', '2') and not re.search(r'\bgame\s*' + str(game_number) + r'\b', text): return False
    return True


def select_video(game, videos, channels, all_games):
    candidates = []
    for video in videos:
        channel = channels.get(video.get('snippet', {}).get('channelId'))
        if not channel or not candidate_matches(video, game, channel): continue
        # A video matching multiple dates, doubleheaders or competitions is not safe.
        matches = [g for g in all_games.values() if candidate_matches(video, g, channel)]
        if len(matches) != 1: continue
        candidates.append((priority(channel, game), video))
    if not candidates: return None
    best = min(rank for rank, _ in candidates)
    finalists = {v['id']: v for rank, v in candidates if rank == best}
    if len(finalists) != 1:
        # A channel may publish a short and a longer edit of the same game.
        # Prefer the unique longer edit; cross-channel/tied ambiguity stays search.
        if len({v['snippet']['channelId'] for v in finalists.values()}) != 1: return None
        longest = max(video_seconds(v) for v in finalists.values())
        finalists = {id: v for id, v in finalists.items() if video_seconds(v) == longest}
        if len(finalists) != 1: return None
    return next(iter(finalists.values()))


def channel_videos(channel, key, now, since=None):
    cutoff = since or now - dt.timedelta(days=7)
    details = youtube('channels', key, part='contentDetails', id=channel['id']).get('items', [])
    if len(details) != 1: raise RuntimeError('Approved channel unavailable')
    playlist = details[0]['contentDetails']['relatedPlaylists']['uploads']
    ids, token, seen_tokens = set(), None, set()
    for _ in range(MAX_UPLOAD_PAGES):
        params = {'part': 'contentDetails', 'playlistId': playlist, 'maxResults': 50}
        if token: params['pageToken'] = token
        page = youtube('playlistItems', key, **params)
        items = page.get('items', [])
        published_dates = []
        for item in items:
            content = item.get('contentDetails', {})
            try:
                published = instant(content['videoPublishedAt'])
                published_dates.append(published)
                if cutoff <= published <= now: ids.add(content['videoId'])
            except (KeyError, ValueError): continue
        token = page.get('nextPageToken')
        # A complete page older than every relevant game establishes coverage.
        if not token or (items and len(published_dates) == len(items) and max(published_dates) < cutoff): break
        if token in seen_tokens: raise RuntimeError('Upload pagination repeated; retaining cached links')
        seen_tokens.add(token)
    else:
        raise RuntimeError('Upload scan reached safety limit; retaining cached links')
    videos = []
    ids = sorted(ids)
    for offset in range(0, len(ids), 50):
        videos.extend(youtube('videos', key, part='snippet,contentDetails,status', id=','.join(ids[offset:offset+50])).get('items', []))
    return videos


def diagnose_lookup(games, videos, channels, key):
    """Opt-in ID-only diagnostics; probes never enter selection or the public map."""
    target = os.environ.get('HIGHLIGHTS_DEBUG_EVENT', '')
    ids = os.environ.get('HIGHLIGHTS_DEBUG_VIDEOS', '').split(',')
    ids = [v for v in ids if re.fullmatch(r'[A-Za-z0-9_-]{11}', v)]
    if not target or not ids: return
    game = games.get(target)
    print('Highlights diagnostic: ' + json.dumps({'event': target, 'collected': game is not None}))
    try:
        probes = {v['id']: v for v in youtube('videos', key, part='snippet,contentDetails,status', id=','.join(ids)).get('items', [])}
    except Exception:
        print('Highlights diagnostic: direct metadata probe failed')
        return
    for video_id in ids:
        video = probes.get(video_id)
        report = {'videoId': video_id, 'retrievedByUploadScan': video_id in videos, 'directMetadataAvailable': video is not None}
        if video and game:
            channel = channels.get(video.get('snippet', {}).get('channelId'))
            report['approvedChannel'] = channel is not None
            if channel:
                report['priority'] = priority(channel, game)
                report['gender'] = basketball_gender(video.get('snippet', {}), channel)
                report['matchesTarget'] = candidate_matches(video, game, channel)
                report['matchingEvents'] = sorted(k for k, g in games.items() if candidate_matches(video, g, channel))
        print('Highlights diagnostic: ' + json.dumps(report, sort_keys=True))
    if game:
        candidates = []
        for video in videos.values():
            channel = channels.get(video.get('snippet', {}).get('channelId'))
            if channel and candidate_matches(video, game, channel):
                candidates.append({'videoId': video['id'], 'channelId': channel['id'], 'priority': priority(channel, game),
                    'seconds': video_seconds(video), 'matchingEventCount': sum(candidate_matches(video, g, channel) for g in games.values())})
        selected = select_video(game, list(videos.values()), channels, games)
        print('Highlights diagnostic: ' + json.dumps({'candidates': candidates, 'selectedVideoId': selected['id'] if selected else None}, sort_keys=True))


def update(path, key, now=None):
    now = now or dt.datetime.now(UTC)
    config = json.loads((ROOT/'scripts/highlight-channels.json').read_text())
    channels = {c['id']: c for c in config['channels']}
    games = collect_games(now)
    if not games:
        print('No recent completed games to check; existing map retained.')
        return
    videos = {}
    failed = set()
    for channel in channels.values():
        eligible = [g for g in games.values() if priority(channel, g) is not None]
        if not eligible: continue
        since = min(instant(g['event']['date']) for g in eligible)
        try:
            for video in channel_videos(channel, key, now, since): videos[video['id']] = video
        except Exception as error:
            failed.add(channel['id'])
            detail = str(error) if isinstance(error, RuntimeError) and re.fullmatch(r'YouTube API HTTP [0-9]{3} \([A-Za-z0-9_.,-]+\)', str(error)) else 'request failed'
            print('::warning::Highlights unavailable for approved channel ' + channel['name'] + ': ' + detail + '. Cached links retained.')
    diagnose_lookup(games, videos, channels, key)
    if not videos: raise RuntimeError('No channel data available; retaining existing map')
    old = json.loads(path.read_text()) if path.exists() else {'schema': 1, 'games': {}}
    entries = {}
    for name, entry in old.get('games', {}).items():
        try:
            if dt.timedelta(0) <= now - instant(entry['date']) <= dt.timedelta(days=14) and entry.get('channelId') in channels:
                entries[name] = entry
        except (KeyError, ValueError, TypeError): continue
    for name, game in games.items():
        # Re-evaluate cached matches, allowing broadcaster videos to replace conference videos.
        selected = select_video(game, list(videos.values()), channels, games)
        if not selected:
            old_entry = entries.get(name)
            if old_entry and old_entry['channelId'] not in failed: entries.pop(name, None)
            continue
        prior = entries.get(name)
        if prior and prior['channelId'] in failed:
            prior_rank = priority(channels[prior['channelId']], game)
            selected_rank = priority(channels[selected['snippet']['channelId']], game)
            if prior_rank is not None and prior_rank <= selected_rank: continue
        event = game['event']
        entries[name] = {'sport': game['sport'], 'eventId': str(event['id']), 'date': event['date'],
                         'teamIds': sorted(str(c['team']['id']) for c in event['competitions'][0]['competitors']),
                         'videoId': selected['id'], 'channelId': selected['snippet']['channelId']}
    # Never send API titles, descriptions, thumbnails, or scores to the frontend.
    if entries == old.get('games', {}):
        print('Highlights unchanged')
        return
    output = {'schema': 1, 'updated': now.isoformat(), 'games': entries}
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(output, indent=2, sort_keys=True) + '\n')
    os.replace(temporary, path)
    print(f'Published {len(entries)} verified highlight links (no titles or scores).')


if __name__ == '__main__':
    api_key = os.environ.get('YOUTUBE_API_KEY', '').strip()
    if not api_key:
        print('::warning::YOUTUBE_API_KEY is not configured; existing highlights retained.')
        sys.exit(0)
    try: update(ROOT/'highlights.json', api_key)
    except Exception:
        print('::error::Highlights update failed; existing map retained. Check API access and quota.')
        sys.exit(1)
