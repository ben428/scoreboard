import copy
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
import tempfile
import json
spec = importlib.util.spec_from_file_location('competitive', Path(__file__).with_name('update-competitive-games.py'))
u = importlib.util.module_from_spec(spec); spec.loader.exec_module(u)

def game(sport='basketball/mens-college-basketball', home=80, away=70):
    return {'sport':sport,'event':{'id':'123','date':'2026-11-06T23:00Z','competitions':[{'status':{'type':{'state':'post','completed':True}},'competitors':[{'homeAway':'home','team':{'id':'1'},'score':str(home)},{'homeAway':'away','team':{'id':'2'},'score':str(away)}]}]}}

def play(home,away,period=2,clock='4:00'):
    return {'homeScore':home,'awayScore':away,'period':{'number':period},'clock':{'displayValue':clock}}

class Tests(unittest.TestCase):
    def test_margin_boundaries(self):
        for sport,limit in [('basketball/mens-college-basketball',5),('football/nfl',7),('baseball/mlb',1)]:
            self.assertTrue(u.close_final(game(sport,10,10-limit)))
            self.assertFalse(u.close_final(game(sport,10,9-limit)))
        g=game();g['event']['competitions'][0]['competitors'][0]['score']=None
        self.assertFalse(u.close_final(g))
    def test_late_close_then_wide_finish(self):
        payload={'header':{'id':'123'},'plays':[play(65,63),play(80,70,clock='0:00')]}
        self.assertTrue(u.late_espn(game(),payload))
        payload['plays'][0]['clock']['displayValue']='5:01'
        self.assertFalse(u.late_espn(game(),payload))
        payload['plays'][0]=play(65,63,period=3)
        self.assertTrue(u.late_espn(game(),payload))
    def test_wrong_or_incomplete_feed(self):
        p={'header':{'id':'wrong'},'plays':[play(80,70)]}
        self.assertFalse(u.late_espn(game(),p))
        p['header']['id']='123';p['plays'][-1]['homeScore']=79
        self.assertFalse(u.late_espn(game(),p))
    def test_women_and_football_periods(self):
        p={'header':{'id':'123'},'plays':[play(65,63,period=2),play(80,70,period=4,clock='0:00')]}
        self.assertFalse(u.late_espn(game('basketball/womens-college-basketball'),p))
        p['plays'][0]['period']['number']=4
        self.assertTrue(u.late_espn(game('basketball/womens-college-basketball'),p))
        p['plays'][0]=play(21,14,period=3)
        self.assertFalse(u.late_espn(game('football/nfl'),p))
        p['plays'][0]['period']['number']=4
        self.assertTrue(u.late_espn(game('football/nfl'),p))
    def test_baseball_tying_runner_and_half_reset(self):
        def runner(i,base):return {'details':{'runner':{'id':i}},'movement':{'end':base,'isOut':False}}
        def atbat(inning,home,away,runners,top=True):return {'about':{'inning':inning,'isTopInning':top},'result':{'homeScore':home,'awayScore':away},'count':{'outs':1},'runners':runners}
        plays=[atbat(8,5,3,[runner(1,'2B')]),atbat(8,5,3,[runner(2,'1B')]),atbat(9,8,3,[],False)]
        self.assertTrue(u.late_mlb(game('baseball/mlb',8,3),{'allPlays':plays}))
        plays[1]['about']['inning']=9
        self.assertFalse(u.late_mlb(game('baseball/mlb',8,3),{'allPlays':plays}))
    def test_failed_enrichment_retains_existing_tag_and_public_identity_only(self):
        g=game();key='basketball/mens-college-basketball:123'
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'tags.json'
            with patch.object(u.h,'collect_games',return_value={key:game(home=74,away=70)}):u.update(path,u.h.instant('2026-11-07T08:00Z'))
            before=path.read_text()
            for forbidden in ['homeScore','awayScore','reason','winner','margin']:self.assertNotIn(forbidden,before)
            with patch.object(u.h,'collect_games',return_value={key:g}),patch.object(u.h,'read_json',side_effect=RuntimeError('offline')):u.update(path,u.h.instant('2026-11-07T08:00Z'))
            self.assertEqual(path.read_text(),before)

if __name__=='__main__':unittest.main()
