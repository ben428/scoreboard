"""Publish only event identities for competitive finals; never scores or reasons."""
import datetime as dt
import importlib.util
import json
import math
import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('highlights', ROOT/'scripts/update-highlights.py')
h = importlib.util.module_from_spec(spec)
spec.loader.exec_module(h)


def number(value):
    if isinstance(value, dict): value = value.get('value', value.get('displayValue'))
    try:
        n = float(value)
        return n if math.isfinite(n) and n >= 0 else None
    except (TypeError, ValueError): return None


def final_scores(event):
    competitors = event.get('competitions', [{}])[0].get('competitors', [])
    sides = {c.get('homeAway'): number(c.get('score')) for c in competitors}
    return (sides['home'], sides['away']) if len(competitors) == 2 and all(sides.get(s) is not None for s in ('home', 'away')) else None


def close_final(game):
    scores = final_scores(game['event'])
    limit = 1 if game['sport'] == 'baseball/mlb' else 5 if game['sport'].startswith('basketball/') else 7
    return h.completed(game['event']) and scores is not None and abs(scores[0]-scores[1]) <= limit


def late_espn(game, payload):
    scores = final_scores(game['event'])
    plays = payload.get('plays', [])
    if not scores or not plays: return False
    # Reject incomplete/wrong-game feeds before making any late-game inference.
    if str(payload.get('header', {}).get('id')) != str(game['event']['id']): return False
    last = plays[-1]
    if (number(last.get('homeScore')), number(last.get('awayScore'))) != scores: return False
    basketball = game['sport'].startswith('basketball/')
    for play in plays:
        period = number(play.get('period', {}).get('number'))
        values = (number(play.get('homeScore')), number(play.get('awayScore')))
        if period is None or any(v is None for v in values): continue
        if basketball:
            regulation = 4 if game['sport'].endswith('womens-college-basketball') else 2
            clock = re.fullmatch(r'(\d+):(\d{2})', str(play.get('clock', {}).get('displayValue', '')))
            late = period > regulation or (period == regulation and clock is not None and int(clock[2]) < 60 and int(clock[1])*60+int(clock[2]) <= 300)
            limit = 5
        else:
            late, limit = period >= 4, 7
        if late and abs(values[0]-values[1]) <= limit: return True
    return False


def late_mlb(game, payload):
    scores = final_scores(game['event'])
    plays = payload.get('allPlays', [])
    if not scores or not plays: return False
    last = plays[-1].get('result', {})
    if (number(last.get('homeScore')), number(last.get('awayScore'))) != scores: return False
    bases, half = {}, None
    for play in plays:
        current_half = (play.get('about', {}).get('inning'), play.get('about', {}).get('isTopInning'))
        if current_half != half: bases, half = {}, current_half
        for runner in sorted(play.get('runners', []), key=lambda r: r.get('details', {}).get('playIndex', 0)):
            identity = runner.get('details', {}).get('runner', {}).get('id')
            movement = runner.get('movement', {})
            if identity is None: continue
            if not movement.get('isOut') and movement.get('end') in ('1B', '2B', '3B'): bases[identity] = movement['end']
            else: bases.pop(identity, None)
        inning = number(play.get('about', {}).get('inning'))
        result = play.get('result', {})
        home, away = number(result.get('homeScore')), number(result.get('awayScore'))
        outs = number(play.get('count', {}).get('outs'))
        if inning is None or inning < 7 or home is None or away is None or outs is None or outs >= 3: continue
        margin = abs(home-away)
        if margin <= 1: return True
        batting_behind = away < home if play.get('about', {}).get('isTopInning') else home < away
        on_base = len(set(bases.values()))
        if batting_behind and margin <= on_base: return True
    return False


def mlb_game(game, cache):
    event = game['event']
    day = h.instant(event['date']).astimezone(h.EASTERN).date().isoformat()
    if day not in cache:
        feed = h.read_json('https://statsapi.mlb.com/api/v1/schedule?sportId=1&date='+day)
        cache[day] = [g for d in feed.get('dates', []) for g in d.get('games', [])]
    def name(value): return re.sub(r'[^a-z0-9]', '', re.sub(r'^(oakland|sacramento) ', '', value.lower()))
    sides = {c['homeAway']: c['team']['displayName'] for c in event['competitions'][0]['competitors']}
    number_ = event['competitions'][0].get('gameNumber', event.get('gameNumber'))
    matches = [g for g in cache[day] if all(name(g['teams'][side]['team']['name']) == name(sides[side]) for side in ['home', 'away'])
               and abs((h.instant(g['gameDate'])-h.instant(event['date'])).total_seconds()) <= 300
               and (number_ is None or str(number_) == str(g.get('gameNumber')))]
    return matches[0]['gamePk'] if len(matches) == 1 else None


def update(path, now=None):
    now = now or dt.datetime.now(h.UTC)
    games = h.collect_games(now)
    if not games: return
    old = json.loads(path.read_text()) if path.exists() else {'games': {}}
    entries = {}
    for key, entry in old.get('games', {}).items():
        try:
            if dt.timedelta(0) <= now-h.instant(entry['date']) <= dt.timedelta(days=14): entries[key] = entry
        except (KeyError, ValueError, TypeError): pass
    cache = {}
    failures = 0
    for key, game in games.items():
        event = game['event']
        if not final_scores(event): continue
        qualifies = close_final(game)
        if not qualifies:
            try:
                if game['sport'] == 'baseball/mlb':
                    pk = mlb_game(game, cache)
                    if not pk: continue
                    qualifies = late_mlb(game, h.read_json('https://statsapi.mlb.com/api/v1/game/'+str(pk)+'/playByPlay'))
                else:
                    qualifies = late_espn(game, h.read_json('https://site.api.espn.com/apis/site/v2/sports/'+game['sport']+'/summary?event='+str(event['id'])))
            except Exception:
                failures += 1
                continue  # Preserve a prior verified tag on upstream failure.
        if qualifies:
            entries[key] = {'sport': game['sport'], 'eventId': str(event['id']), 'date': event['date'],
                            'teamIds': sorted(str(c['team']['id']) for c in event['competitions'][0]['competitors'])}
        else: entries.pop(key, None)
    if failures: print(f'::warning::{failures} competitive-game feeds unavailable; prior tags retained.')
    if entries == old.get('games', {}): return
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps({'schema': 1, 'updated': now.isoformat(), 'games': entries}, indent=2, sort_keys=True)+'\n')
    os.replace(temporary, path)
    print(f'Published {len(entries)} competitive-game identities; no scores or reasons.')


if __name__ == '__main__':
    try: update(ROOT/'competitive-games.json')
    except Exception:
        print('::error::Competitive-game update failed; existing map retained.')
        raise SystemExit(1)
