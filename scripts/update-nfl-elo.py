"""Download validated pregame Elo only; never publish provider result scores."""
import datetime as dt
import json
import math
import os
from pathlib import Path
from urllib.request import urlopen

TEAMS = set('ARI ATL BAL BUF CAR CHI CIN CLE DAL DEN DET GB HOU IND JAX KC LAR LAC LV MIA MIN NE NO NYG NYJ PHI PIT SEA SF TB TEN WAS'.split())
ALIASES = {'LA': 'LAR', 'STL': 'LAR', 'OAK': 'LV', 'SD': 'LAC', 'WSH': 'WAS'}

def validate(payload):
    season = payload.get('season')
    assert payload.get('site') == 'nflanalytic.com', 'Unexpected provider'
    assert type(season) is int and 2020 <= season <= dt.date.today().year + 1, 'Invalid season'
    updated = dt.date.fromisoformat(payload['updated'])
    assert updated <= dt.date.today(), 'Future update date'
    weeks, seen = {}, set()
    for week, rows in payload['weeks'].items():
        assert week.isdigit() and 1 <= int(week) <= 18 and isinstance(rows, list), 'Invalid week'
        clean = []
        for game in rows:
            day = dt.date.fromisoformat(game['gameday'])
            locked = dt.date.fromisoformat(game['locked'])
            assert day.year == season and locked <= day and locked <= updated, 'Invalid game/lock date'
            home, away = [ALIASES.get(game[t], game[t]) for t in ('home', 'away')]
            assert home in TEAMS and away in TEAMS and home != away, 'Invalid teams'
            key = (game['gameday'], home, away)
            assert key not in seen, 'Duplicate game'
            seen.add(key)
            for name in ('elo_home', 'elo_away'):
                value = game[name]
                assert type(value) in (int, float) and math.isfinite(value) and value > 0, 'Invalid Elo'
            clean.append({k: game[k] for k in ('gameday', 'home', 'away', 'elo_home', 'elo_away', 'locked')})
        if clean:
            weeks[week] = clean
    assert weeks, 'No games'
    first = weeks.get('1', [])
    assert {ALIASES.get(g[t], g[t]) for g in first for t in ('home', 'away')} == TEAMS, 'Incomplete opening-week ratings'
    return {'site': 'nflanalytic.com', 'season': season, 'updated': updated.isoformat(), 'weeks': weeks}

def update(path):
    with urlopen('https://nflanalytic.com/data/predictions.json', timeout=30) as response:
        payload = json.load(response)
    clean = validate(payload)
    if path.exists():
        old = validate(json.loads(path.read_text()))
        assert (clean['season'], clean['updated']) >= (old['season'], old['updated']), 'Ratings went backwards'
        if clean['season'] == old['season']:
            old_games = {(g['gameday'], g['home'], g['away']) for rows in old['weeks'].values() for g in rows}
            new_games = {(g['gameday'], g['home'], g['away']) for rows in clean['weeks'].values() for g in rows}
            assert old_games <= new_games, 'Feed lost previously available games'
    text = json.dumps(clean, indent=2) + '\n'
    if path.exists() and path.read_text() == text:
        print('Ratings unchanged')
        return
    temporary = path.with_suffix('.tmp')
    temporary.write_text(text)
    os.replace(temporary, path)
    print('Updated ratings:', clean['updated'])

if __name__ == '__main__':
    import sys
    update(Path(sys.argv[1] if len(sys.argv) > 1 else 'nfl-elo.json'))
