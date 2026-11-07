import copy
import datetime as dt
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('highlights', Path(__file__).with_name('update-highlights.py'))
u = importlib.util.module_from_spec(spec)
spec.loader.exec_module(u)
SPORT = 'basketball/womens-college-basketball'


def fixture():
    channel = {'id': 'UCofficial', 'name': 'NBC Sports', 'role': 'broadcaster', 'sports': [SPORT], 'networks': ['NBC', 'Peacock']}
    event = {'id': '123', 'date': '2026-11-02T23:00:00Z', 'competitions': [{
        'status': {'type': {'state': 'post', 'completed': True, 'shortDetail': 'Final'}},
        'broadcasts': [{'names': ['NBC']}],
        'competitors': [{'team': {'id': '41', 'displayName': 'UConn Huskies', 'location': 'UConn'}},
                        {'team': {'id': '172', 'displayName': 'Cornell Big Red', 'location': 'Cornell'}}]}]}
    game = {'sport': SPORT, 'event': event}
    video = {'id': 'abcdefghijk', 'snippet': {'channelId': channel['id'],
        'title': 'Cornell vs. UConn | Women’s Basketball Highlights | 11/2/26',
        'description': 'College basketball game highlights', 'publishedAt': '2026-11-03T03:00:00Z'},
        'status': {'privacyStatus': 'public'}, 'contentDetails': {'duration': 'PT9M4S'}}
    return channel, game, video


class HighlightsTests(unittest.TestCase):
    def setUp(self): self.channel, self.game, self.video = fixture()
    def matches(self): return u.candidate_matches(self.video, self.game, self.channel)
    def test_correct_match(self): self.assertTrue(self.matches())
    def test_wrong_date(self):
        self.video['snippet']['title'] = self.video['snippet']['title'].replace('11/2/26', '11/1/26')
        self.assertFalse(self.matches())
    def test_textual_dates(self):
        for date in ['Nov. 1, 2026', 'November 1, 2026', '2026-11-01']:
            self.video['snippet']['title'] = 'Cornell vs UConn Women Basketball Highlights '+date
            self.assertFalse(self.matches())
        self.video['snippet']['title'] = 'Cornell vs UConn Women Basketball Highlights Nov. 2, 2026'
        self.assertTrue(self.matches())
    def test_prior_year(self):
        self.video['snippet']['title'] = self.video['snippet']['title'].replace('11/2/26', '11/2/25')
        self.assertFalse(self.matches())
    def test_wrong_opponent(self):
        self.video['snippet']['title'] = self.video['snippet']['title'].replace('Cornell', 'Columbia')
        self.assertFalse(self.matches())
    def test_postgame_only(self):
        self.assertTrue(u.completed(self.game['event']))
        for label in ['Postponed', 'Canceled', 'Suspended', 'Delayed']:
            self.game['event']['competitions'][0]['status']['type']['shortDetail'] = label
            self.assertFalse(u.completed(self.game['event']))
    def test_wrong_sport_and_gender(self):
        self.game['sport'] = 'basketball/mens-college-basketball'
        self.channel['sports'] += [self.game['sport']]
        self.assertFalse(self.matches())
        self.game['sport'] = SPORT
        self.video['snippet']['title'] = 'Cornell vs UConn Football Highlights | 11/2/26'
        self.video['snippet']['description'] = 'Football'
        self.assertFalse(self.matches())
    def test_bad_video_types(self):
        for term in ['Preview', 'Reaction', 'Interview', 'First Half', 'Top Plays']:
            with self.subTest(term=term):
                self.video['snippet']['title'] = 'Cornell vs UConn Women Basketball Highlights '+term
                self.assertFalse(self.matches())
    def test_short_or_full_replay(self):
        for duration in ['PT30S', 'PT2H']:
            self.video['contentDetails']['duration'] = duration
            self.assertFalse(self.matches())
    def test_private_and_wrong_channel(self):
        self.video['status']['privacyStatus'] = 'private'
        self.assertFalse(self.matches())
        self.video['status']['privacyStatus'] = 'public'
        self.video['snippet']['channelId'] = 'UCteam'
        self.assertFalse(self.matches())
    def test_broadcaster_priority(self):
        conf = {**self.channel, 'id': 'UCconference', 'role': 'conference'}
        fallback = copy.deepcopy(self.video); fallback['id'] = 'zyxwvutsrqp'; fallback['snippet']['channelId'] = conf['id']
        selected = u.select_video(self.game, [fallback, self.video], {c['id']: c for c in [conf, self.channel]}, {'one': self.game})
        self.assertEqual(selected['id'], self.video['id'])
    def test_house_of_highlights_broadcast_networks(self):
        config = json.loads((u.ROOT/'scripts/highlight-channels.json').read_text())
        channel = next(c for c in config['channels'] if c['name'] == 'House of Highlights')
        self.video['snippet']['channelId'] = channel['id']
        for network in ['TNT', 'TNT Sports', 'TBS', 'truTV', 'Max', 'HBO Max']:
            self.game['event']['competitions'][0]['broadcasts'] = [{'names': [network]}]
            self.assertEqual(u.priority(channel, self.game), 0)
            self.assertTrue(u.candidate_matches(self.video, self.game, channel))
        self.game['event']['competitions'][0]['broadcasts'] = [{'names': ['ESPN']}]
        self.assertIsNone(u.priority(channel, self.game))
        self.game['sport'] = 'football/nfl'
        self.assertIsNone(u.priority(channel, self.game))

    def test_march_madness_remains_college_fallback(self):
        config = json.loads((u.ROOT/'scripts/highlight-channels.json').read_text())
        channel = next(c for c in config['channels'] if c['name'] == 'March Madness')
        self.game['event']['competitions'][0]['broadcasts'] = [{'names': ['TNT']}]
        self.video['snippet']['channelId'] = channel['id']
        self.assertEqual(u.priority(channel, self.game), 1)
        self.assertTrue(u.candidate_matches(self.video, self.game, channel))

    def test_unmatched_broadcaster(self):
        self.game['event']['competitions'][0]['broadcasts'] = [{'names': ['FOX']}]
        self.assertIsNone(u.priority(self.channel, self.game))
    def test_no_team_channels(self):
        self.channel['role'] = 'team'
        self.assertIsNone(u.priority(self.channel, self.game))
        config = json.loads((u.ROOT/'scripts/highlight-channels.json').read_text())
        self.assertNotIn('team', {c['role'] for c in config['channels']})
    def test_pro_requires_league(self):
        self.channel['sports'] = ['football/nfl']; self.game['sport'] = 'football/nfl'
        self.assertIsNone(u.priority(self.channel, self.game))
        self.channel['role'] = 'league'
        self.assertEqual(u.priority(self.channel, self.game), 0)
    def test_ambiguity_falls_back(self):
        second = copy.deepcopy(self.video); second['id'] = 'zyxwvutsrqp'
        channels = {self.channel['id']: self.channel}
        self.assertIsNone(u.select_video(self.game, [self.video, second], channels, {'one': self.game}))
        self.assertIsNone(u.select_video(self.game, [self.video], channels, {'one': self.game, 'two': copy.deepcopy(self.game)}))
    def test_same_channel_prefers_longer_game_edit(self):
        shorter = copy.deepcopy(self.video);shorter['id']='zyxwvutsrqp';shorter['contentDetails']['duration']='PT3M'
        channels={self.channel['id']:self.channel}
        selected=u.select_video(self.game,[shorter,self.video],channels,{'one':self.game})
        self.assertEqual(selected['id'],self.video['id'])
        other={**self.channel,'id':'UCother'};channels[other['id']]=other
        shorter['snippet']['channelId']=other['id']
        self.assertIsNone(u.select_video(self.game,[shorter,self.video],channels,{'one':self.game}))
    def test_doubleheader_requires_game_number(self):
        self.game['event']['competitions'][0]['gameNumber'] = 2
        self.assertFalse(self.matches())
        self.video['snippet']['title'] += ' Game 2'
        self.assertTrue(self.matches())
    def test_key_not_leaked(self):
        with patch.object(u, 'read_json', side_effect=ValueError('https://api.invalid?key=secret')):
            with self.assertRaisesRegex(RuntimeError, '^YouTube API request failed$'): u.youtube('videos', 'secret', id='a')
    def test_public_map_has_no_spoilers_or_secrets(self):
        import tempfile
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/'highlights.json'
            config = {'channels': [self.channel]}
            original = Path.read_text
            def read(p, *args, **kwargs):
                return json.dumps(config) if p.name == 'highlight-channels.json' else original(p, *args, **kwargs)
            with patch.object(Path, 'read_text', read), patch.object(u, 'collect_games', return_value={'one': self.game}), patch.object(u, 'channel_videos', return_value=[self.video]):
                u.update(path, 'SECRET', dt.datetime(2026, 11, 3, 5, tzinfo=u.UTC))
            data = json.loads(path.read_text()); entry = data['games']['one']
            self.assertEqual(entry['videoId'], 'abcdefghijk')
            for term in ['title', 'thumbnail', 'description', 'SECRET', 'score']:
                self.assertNotIn(term, path.read_text())
    def test_all_api_failures_preserve_file(self):
        import tempfile
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/'highlights.json'; path.write_text('{"schema":1,"games":{}}')
            before = path.read_text()
            with patch.object(u, 'collect_games', return_value={'one': self.game}), patch.object(u, 'channel_videos', side_effect=RuntimeError('offline')):
                with self.assertRaises(RuntimeError): u.update(path, 'SECRET')
            self.assertEqual(path.read_text(), before)


    def test_gender_ignores_promotional_footer(self):
        self.game['sport'] = 'basketball/mens-college-basketball'
        self.channel['sports'] = [self.game['sport'], SPORT]
        self.video['snippet']['title'] = "Cornell at UConn | Highlights | Men's Basketball | 11/2/26"
        self.video['snippet']['description'] = "Game highlights.\n\nSubscribe to our Women's Basketball channel: youtube.com/example"
        self.assertTrue(self.matches())
        self.video['snippet']['title'] = 'Cornell vs UConn | Highlights | 11/2/26'
        self.assertFalse(self.matches())  # The footer must not decide gender either way.
    def test_gender_from_specific_channel(self):
        self.game['sport'] = 'basketball/mens-college-basketball'
        self.channel['sports'] = [self.game['sport']]
        self.video['snippet']['title'] = 'Cornell vs UConn Basketball Highlights | 11/2/26'
        self.video['snippet']['description'] = "Follow our women's basketball account"
        self.assertTrue(self.matches())
        self.video['snippet']['title'] = 'Cornell vs UConn Women Basketball Highlights | 11/2/26'
        self.assertFalse(self.matches())
    def test_provider_short_abbreviations(self):
        team = self.game['event']['competitions'][0]['competitors'][1]['team']
        team.update(displayName='Fairleigh Dickinson Knights', location='Fairleigh Dickinson', abbreviation='FDU')
        self.video['snippet']['title'] = 'FDU at UConn | Women Basketball Highlights | 11/2/26'
        self.assertTrue(self.matches())
        team.update(displayName='SMU Mustangs', location='SMU', abbreviation='SMU')
        self.video['snippet']['title'] = 'SMU vs UConn | Women Basketball Highlights | 11/2/26'
        self.assertTrue(self.matches())
    def test_player_clip_not_game_matchup(self):
        self.video['snippet']['title'] = 'Player Highlights vs Cornell | UConn Women Basketball | 11/2/26'
        self.assertFalse(self.matches())
    def test_short_game_highlights(self):
        self.video['contentDetails']['duration'] = 'PT1M30S'
        self.video['snippet']['title'] = 'Cornell at UConn | Highlights | Women Basketball | 11/2/26'
        self.assertTrue(self.matches())
        self.video['snippet']['title'] = 'Player Highlights vs Cornell | UConn Women Basketball | 11/2/26'
        self.assertFalse(self.matches())
        self.video['snippet']['title'] = 'Cornell at UConn | Highlights | Women Basketball | 11/2/26'
        self.video['contentDetails']['duration'] = 'PT59S'
        self.assertFalse(self.matches())
    def test_shared_location_different_teams(self):
        competitors = self.game['event']['competitions'][0]['competitors']
        competitors[0]['team'] = {'id':'130','location':'Michigan','displayName':'Michigan Wolverines'}
        competitors[1]['team'] = {'id':'127','location':'Michigan State','displayName':'Michigan State Spartans'}
        self.video['snippet']['title'] = 'Michigan vs Michigan State Women Basketball Game Highlights | 11/2/26'
        self.assertTrue(self.matches())
    def test_full_football_week_is_collected(self):
        now = dt.datetime(2026, 11, 4, 12, tzinfo=u.UTC)
        event = copy.deepcopy(self.game['event']);event['date'] = '2026-10-31T16:00:00Z'
        urls = []
        def response(url):
            urls.append(url)
            return {'events':[event]} if '/football/college-football/scoreboard?' in url and 'dates=20261031' in url else {'events':[]}
        with patch.object(u, 'read_json', side_effect=response): games=u.collect_games(now)
        self.assertIn('football/college-football:123', games)
        self.assertTrue(any('/football/nfl/scoreboard?' in url and 'dates=20261028' in url for url in urls))
        self.assertFalse(any('/basketball/' in url and 'dates=20261028' in url for url in urls))
    def test_upload_scan_reaches_beyond_150_and_stops_by_date(self):
        now=dt.datetime(2026,11,4,12,tzinfo=u.UTC);cutoff=now-dt.timedelta(days=7)
        pages=[]
        def api(resource,key,**params):
            if resource=='channels':return {'items':[{'contentDetails':{'relatedPlaylists':{'uploads':'UUofficial'}}}]}
            if resource=='playlistItems':
                page=int(params.get('pageToken','0'));pages.append(page)
                published = (now-dt.timedelta(days=1 if page<4 else 8)).isoformat()
                return {'items':[{'contentDetails':{'videoId':str(page)+'video'+str(n),'videoPublishedAt':published}} for n in range(50)],'nextPageToken':str(page+1)}
            return {'items':[{'id':id} for id in params['id'].split(',')]}
        with patch.object(u,'youtube',side_effect=api):videos=u.channel_videos(self.channel,'SECRET',now,cutoff)
        self.assertIn('3video49',{v['id'] for v in videos})
        self.assertEqual(pages,[0,1,2,3,4])
        self.assertNotIn('4video0',{v['id'] for v in videos})
    def test_incomplete_scan_cannot_clear_cached_links(self):
        now=dt.datetime(2026,11,4,12,tzinfo=u.UTC)
        def api(resource,key,**params):
            if resource=='channels':return {'items':[{'contentDetails':{'relatedPlaylists':{'uploads':'UUofficial'}}}]}
            return {'items':[{'contentDetails':{'videoId':'abcdefghijk','videoPublishedAt':now.isoformat()}}], 'nextPageToken':str(int(params.get('pageToken','0'))+1)}
        with patch.object(u,'youtube',side_effect=api),patch.object(u,'MAX_UPLOAD_PAGES',2):
            with self.assertRaisesRegex(RuntimeError,'safety limit'):u.channel_videos(self.channel,'SECRET',now)


if __name__ == '__main__': unittest.main()
