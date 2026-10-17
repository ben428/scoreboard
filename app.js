// Compatible with Safari on iOS 15; avoid newer timeout and array APIs.
function lastItem(items){return items[items.length-1]}
async function fetchJSON(url){const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),15000);try{const response=await fetch(url,{signal:controller.signal});if(!response.ok)throw Error(response.status);return await response.json()}finally{clearTimeout(timeout)}}
const teams=[{id:'130',path:'football/college-football',name:'Michigan Wolverines',short:'Michigan',mark:'M',color:'#00274c',league:'NCAA · FOOTBALL'},{id:'2',path:'baseball/mlb',name:'Boston Red Sox',short:'Red Sox',mark:'B',color:'#bd3039',league:'MLB · BASEBALL'},{id:'17',path:'football/nfl',name:'New England Patriots',short:'Patriots',mark:'NE',color:'#c53748',league:'NFL · FOOTBALL'},{id:'16',path:'football/nfl',name:'Minnesota Vikings',short:'Vikings',mark:'MIN',color:'#4f2683',league:'NFL · FOOTBALL'},{id:'41',path:'basketball/mens-college-basketball',name:'UConn Huskies',short:'Connecticut',mark:'U',color:'#365775',league:'NCAA · MEN’S BASKETBALL'},{id:'41',path:'basketball/womens-college-basketball',name:'UConn Huskies',short:'Connecticut',mark:'U',color:'#365775',league:'NCAA · WOMEN’S BASKETBALL'},{id:'127',path:'basketball/mens-college-basketball',name:'Michigan State Spartans',short:'Michigan State',mark:'S',color:'#31725c',league:'NCAA · MEN’S BASKETBALL'}];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let selected=-1,data=[],busy=false;
function date(d){
 if(d==null||d===''||!Number.isFinite(new Date(d).getTime()))return 'Date TBD';
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'short',month:'numeric',day:'numeric'}).formatToParts(new Date(d));
 const part=k=>parts.find(p=>p.type===k).value;
 return `${part('weekday')} ${part('month')}/${part('day')}`;
}
function time(d){return d==null||d===''||!Number.isFinite(new Date(d).getTime())?'Time TBD':new Date(d).toLocaleTimeString('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit'})}
function updateToday(){document.querySelector('#today').textContent=date(new Date())}
updateToday();
function filters(){document.querySelector('#filters').innerHTML=['All teams',...teams.map(t=>`${t.short.startsWith('UConn')?'Connecticut':t.short} · ${{'football/college-football':'NCAAF','baseball/mlb':'MLB','football/nfl':'NFL','basketball/mens-college-basketball':'NCAAM','basketball/womens-college-basketball':'NCAAW'}[t.path]}`)].map((t,i)=>`<button class="${selected===i-1?'active':''}" data-i="${i-1}" aria-pressed="${selected===i-1}">${t}</button>`).join('');document.querySelectorAll('[data-i]').forEach(b=>b.onclick=()=>{selected=Number(b.dataset.i);filters();render()})}filters();
const mlbTeamSlugs=['','orioles','redsox','angels','whitesox','guardians','tigers','royals','brewers','twins','yankees','athletics','mariners','rangers','bluejays','braves','cubs','reds','astros','dodgers','nationals','mets','phillies','pirates','cardinals','padres','giants','rockies','marlins','dbacks','rays'];
function espnTeamURL(path,id){if(path==='baseball/mlb')return 'https://www.mlb.com/'+(mlbTeamSlugs[id]||'team');return `https://www.espn.com/${path.split('/')[1]}/team/_/id/${encodeURIComponent(id)}`}
function teamLink(name,path,id){return id?`<a href="${espnTeamURL(path,id)}" target="_blank" rel="noopener">${esc(name)}</a>`:esc(name)}
function comp(e){return e?.competitions?.[0]}
function statusType(e){return {...e?.status?.type,...comp(e)?.status?.type}}
function state(e){return statusType(e).state}
function condition(e){
 const type=statusType(e);
 const text=[type.name,type.description,type.detail,type.shortDetail].filter(Boolean).join(' ').replace(/_/g,' ');
 if(/cancel/i.test(text))return 'Canceled';
 if(/postpon/i.test(text))return 'Postponed';
 if(/suspend/i.test(text))return 'Suspended';
 if(/delay/i.test(text))return 'Delayed';
 return '';
}
function status(e){return condition(e)||statusType(e).shortDetail||statusType(e).detail||(state(e)==='post'&&statusType(e).completed!==false?'Final':'Scheduled')}
function isCanceled(e){return condition(e)==='Canceled'}
function isUnresolved(e){return ['Postponed','Delayed','Suspended'].includes(condition(e))}
function isLive(e){return state(e)==='in'&&!condition(e)}
function isFinal(e){return state(e)==='post'&&!condition(e)&&statusType(e).completed!==false}
function isResult(e){return isFinal(e)||isCanceled(e)}
function upsetLabel(e,path){
 if(!['football/college-football','football/nfl'].includes(path)||(!isFinal(e)&&!isLive(e)))return '';
 if(isLive(e)){
  const type=statusType(e);
  const halftime=[type.name,type.description,type.detail,type.shortDetail].some(value=>/\bhalf[ _-]?time\b/i.test(String(value||'').replace(/_/g,' ')));
  const period=Number(comp(e)?.status?.period??e?.status?.period);
  if(!halftime&&(!Number.isFinite(period)||period<3))return '';
 }
 // Team schedules can omit rankings; use the matching college scoreboard event.
 const rankedEvent=leagueData.filter((d,i)=>leagues[i].path===path).flatMap(d=>d?.events||[]).find(other=>String(other.id)===String(e.id));
 const competitors=comp(e)?.competitors||[];
 if(competitors.length!==2)return '';
 const points=competitors.map(c=>{const value=score(c);return value==null||String(value).trim()===''?NaN:Number(value)});
 if(points.some(n=>!Number.isFinite(n)))return '';
 const ranks=competitors.map(c=>{
  const rank=path==='football/nfl'?nflEloRating(e,c):c.curatedRank?.current??comp(rankedEvent)?.competitors?.find(other=>String(other.team?.id)===String(c.team?.id))?.curatedRank?.current;
  const n=Number(rank);
  return (path==='football/nfl'?Number.isFinite(n):Number.isInteger(n))&&n>0?n:NaN;
 });
 if(ranks.some(n=>!Number.isFinite(n))||ranks[0]===ranks[1])return '';
 const underdog=(path==='football/nfl'?ranks[0]<ranks[1]:ranks[0]>ranks[1])?0:1,favorite=1-underdog;
 if(path==='football/college-football'&&ranks[favorite]>25)return '';
 const margin=points[underdog]-points[favorite];
 if(isLive(e))return margin>=-7?'<span class="upset upset-watch">Upset watch</span>':'';
 return margin>0?'<span class="upset">Upset</span>':'';
}

// Verified pregame ratings provide a dated fallback when cross-origin fetching fails.
// Source: https://nflanalytic.com/data/predictions.json (retrieved 2026-10-11).
const bundledNFLElo={"site":"nflanalytic.com","season":2026,"updated":"2026-10-10","weeks":{"1":[{"gameday":"2026-09-09","home":"SEA","away":"NE","elo_home":1674.6,"elo_away":1592.8,"locked":"2026-08-12"},{"gameday":"2026-09-10","home":"LA","away":"SF","elo_home":1614.7,"elo_away":1559.4,"locked":"2026-08-12"},{"gameday":"2026-09-13","home":"PIT","away":"ATL","elo_home":1516,"elo_away":1470.3,"locked":"2026-08-12"},{"gameday":"2026-09-13","home":"IND","away":"BAL","elo_home":1469.4,"elo_away":1553.4,"locked":"2026-08-12"},{"gameday":"2026-09-13","home":"HOU","away":"BUF","elo_home":1605.6,"elo_away":1615.9,"locked":"2026-08-12"},{"gameday":"2026-09-13","home":"CAR","away":"CHI","elo_home":1426.3,"elo_away":1528.7,"locked":"2026-08-12"},{"gameday":"2026-09-13","home":"JAX","away":"CLE","elo_home":1565.9,"elo_away":1419.9,"locked":"2026-08-12"},{"gameday":"2026-09-13","home":"DET","away":"NO","elo_home":1563.9,"elo_away":1435.3,"locked":"2026-08-12"},{"gameday":"2026-09-13","home":"TEN","away":"NYJ","elo_home":1349.8,"elo_away":1361.5,"locked":"2026-08-12"},{"gameday":"2026-09-13","home":"CIN","away":"TB","elo_home":1480.4,"elo_away":1488.4,"locked":"2026-08-12"},{"gameday":"2026-09-13","home":"LAC","away":"ARI","elo_home":1530.9,"elo_away":1394.4,"locked":"2026-08-12"},{"gameday":"2026-09-13","home":"MIN","away":"GB","elo_home":1556.1,"elo_away":1535.9,"locked":"2026-08-12"},{"gameday":"2026-09-13","home":"LV","away":"MIA","elo_home":1351,"elo_away":1459.1,"locked":"2026-08-12"},{"gameday":"2026-09-13","home":"PHI","away":"WAS","elo_home":1581.2,"elo_away":1458.2,"locked":"2026-08-12"},{"gameday":"2026-09-13","home":"NYG","away":"DAL","elo_home":1419.3,"elo_away":1460.7,"locked":"2026-08-12"},{"gameday":"2026-09-14","home":"KC","away":"DEN","elo_home":1508.2,"elo_away":1612.6,"locked":"2026-08-12"}],"2":[{"gameday":"2026-09-17","home":"BUF","away":"DET","elo_home":1635.5,"elo_away":1567.3,"locked":"2026-09-15"},{"gameday":"2026-09-20","home":"ATL","away":"CAR","elo_home":1455.6,"elo_away":1400.4,"locked":"2026-09-15"},{"gameday":"2026-09-20","home":"HOU","away":"CIN","elo_home":1586.1,"elo_away":1497.3,"locked":"2026-09-15"},{"gameday":"2026-09-20","home":"TB","away":"CLE","elo_home":1471.5,"elo_away":1405.4,"locked":"2026-09-15"},{"gameday":"2026-09-20","home":"NYJ","away":"GB","elo_home":1390.2,"elo_away":1513.3,"locked":"2026-09-15"},{"gameday":"2026-09-20","home":"CHI","away":"MIN","elo_home":1554.5,"elo_away":1578.7,"locked":"2026-09-15"},{"gameday":"2026-09-20","home":"BAL","away":"NO","elo_home":1579.4,"elo_away":1431.9,"locked":"2026-09-15"},{"gameday":"2026-09-20","home":"TEN","away":"PHI","elo_home":1321.1,"elo_away":1586.8,"locked":"2026-09-15"},{"gameday":"2026-09-20","home":"NE","away":"PIT","elo_home":1584.4,"elo_away":1530.7,"locked":"2026-09-15"},{"gameday":"2026-09-20","home":"DEN","away":"JAX","elo_home":1577.6,"elo_away":1580.5,"locked":"2026-09-15"},{"gameday":"2026-09-20","home":"LAC","away":"LV","elo_home":1495.8,"elo_away":1381.8,"locked":"2026-09-15"},{"gameday":"2026-09-20","home":"SF","away":"MIA","elo_home":1593.8,"elo_away":1428.3,"locked":"2026-09-15"},{"gameday":"2026-09-20","home":"ARI","away":"SEA","elo_home":1429.6,"elo_away":1683,"locked":"2026-09-15"},{"gameday":"2026-09-20","home":"DAL","away":"WAS","elo_home":1439.2,"elo_away":1452.7,"locked":"2026-09-15"},{"gameday":"2026-09-20","home":"KC","away":"IND","elo_home":1543.2,"elo_away":1443.4,"locked":"2026-09-15"},{"gameday":"2026-09-21","home":"LA","away":"NYG","elo_home":1580.3,"elo_away":1440.8,"locked":"2026-09-15"}],"3":[{"gameday":"2026-09-24","home":"GB","away":"ATL","elo_home":1523.8,"elo_away":1412.9,"locked":"2026-09-22"},{"gameday":"2026-09-27","home":"CLE","away":"CAR","elo_home":1425.5,"elo_away":1443.1,"locked":"2026-09-22"},{"gameday":"2026-09-27","home":"PIT","away":"CIN","elo_home":1510.9,"elo_away":1532.4,"locked":"2026-09-22"},{"gameday":"2026-09-27","home":"IND","away":"HOU","elo_home":1435.6,"elo_away":1551.1,"locked":"2026-09-22"},{"gameday":"2026-09-27","home":"MIA","away":"KC","elo_home":1415.3,"elo_away":1551,"locked":"2026-09-22"},{"gameday":"2026-09-27","home":"BUF","away":"LAC","elo_home":1650.9,"elo_away":1461.5,"locked":"2026-09-22"},{"gameday":"2026-09-27","home":"JAX","away":"NE","elo_home":1562.8,"elo_away":1604.1,"locked":"2026-09-22"},{"gameday":"2026-09-27","home":"DET","away":"NYJ","elo_home":1551.9,"elo_away":1379.6,"locked":"2026-09-22"},{"gameday":"2026-09-27","home":"WAS","away":"SEA","elo_home":1427,"elo_away":1696.8,"locked":"2026-09-22"},{"gameday":"2026-09-27","home":"NYG","away":"TEN","elo_home":1426.1,"elo_away":1314.6,"locked":"2026-09-22"},{"gameday":"2026-09-27","home":"SF","away":"ARI","elo_home":1606.7,"elo_away":1415.8,"locked":"2026-09-22"},{"gameday":"2026-09-27","home":"TB","away":"MIN","elo_home":1451.3,"elo_away":1599.3,"locked":"2026-09-22"},{"gameday":"2026-09-27","home":"DAL","away":"BAL","elo_home":1464.8,"elo_away":1550.6,"locked":"2026-09-22"},{"gameday":"2026-09-27","home":"NO","away":"LV","elo_home":1460.7,"elo_away":1416.1,"locked":"2026-09-22"},{"gameday":"2026-09-27","home":"DEN","away":"LA","elo_home":1595.4,"elo_away":1595,"locked":"2026-09-22"},{"gameday":"2026-09-28","home":"CHI","away":"PHI","elo_home":1534,"elo_away":1593.3,"locked":"2026-09-22"}],"4":[{"gameday":"2026-10-04","home":"NYG","away":"ARI","elo_home":1435.7,"elo_away":1408.7,"locked":"2026-10-04"},{"gameday":"2026-10-04","home":"HOU","away":"DAL","elo_home":1538.4,"elo_away":1454.7,"locked":"2026-10-04"},{"gameday":"2026-10-04","home":"TB","away":"GB","elo_home":1437,"elo_away":1482.7,"locked":"2026-10-04"},{"gameday":"2026-10-04","home":"CIN","away":"JAX","elo_home":1519.7,"elo_away":1596.1,"locked":"2026-10-04"},{"gameday":"2026-10-04","home":"PHI","away":"LA","elo_home":1562,"elo_away":1581.4,"locked":"2026-10-04"},{"gameday":"2026-10-04","home":"BUF","away":"NE","elo_home":1659,"elo_away":1570.9,"locked":"2026-10-04"},{"gameday":"2026-10-04","home":"CHI","away":"NYJ","elo_home":1565.2,"elo_away":1371.3,"locked":"2026-10-04"},{"gameday":"2026-10-04","home":"BAL","away":"TEN","elo_home":1560.7,"elo_away":1305.1,"locked":"2026-10-04"},{"gameday":"2026-10-04","home":"MIN","away":"MIA","elo_home":1613.6,"elo_away":1395.7,"locked":"2026-10-04"},{"gameday":"2026-10-04","home":"SF","away":"DEN","elo_home":1613.8,"elo_away":1609,"locked":"2026-10-04"},{"gameday":"2026-10-04","home":"LV","away":"KC","elo_home":1442.7,"elo_away":1570.6,"locked":"2026-10-04"},{"gameday":"2026-10-04","home":"SEA","away":"LAC","elo_home":1681.2,"elo_away":1453.4,"locked":"2026-10-04"},{"gameday":"2026-10-04","home":"CAR","away":"DET","elo_home":1430.6,"elo_away":1560.2,"locked":"2026-10-04"},{"gameday":"2026-10-05","home":"NO","away":"ATL","elo_home":1434.2,"elo_away":1454.1,"locked":"2026-10-04"}],"5":[{"gameday":"2026-10-08","home":"DAL","away":"TB","elo_home":1475.4,"elo_away":1423,"locked":"2026-10-06"},{"gameday":"2026-10-11","home":"JAX","away":"PHI","elo_home":1612.3,"elo_away":1544.8,"locked":"2026-10-06"},{"gameday":"2026-10-11","home":"GB","away":"CHI","elo_home":1496.6,"elo_away":1574.2,"locked":"2026-10-06"},{"gameday":"2026-10-11","home":"MIA","away":"CIN","elo_home":1390,"elo_away":1503.5,"locked":"2026-10-06"},{"gameday":"2026-10-11","home":"NYJ","away":"CLE","elo_home":1362.4,"elo_away":1453.1,"locked":"2026-10-06"},{"gameday":"2026-10-11","home":"TEN","away":"HOU","elo_home":1300,"elo_away":1517.7,"locked":"2026-10-06"},{"gameday":"2026-10-11","home":"PIT","away":"IND","elo_home":1508.5,"elo_away":1476.7,"locked":"2026-10-06"},{"gameday":"2026-10-11","home":"NE","away":"LV","elo_home":1588.8,"elo_away":1432.4,"locked":"2026-10-06"},{"gameday":"2026-10-11","home":"NO","away":"MIN","elo_home":1401.2,"elo_away":1619.3,"locked":"2026-10-06"},{"gameday":"2026-10-11","home":"WAS","away":"NYG","elo_home":1414.3,"elo_away":1455.2,"locked":"2026-10-06"},{"gameday":"2026-10-11","home":"LAC","away":"DEN","elo_home":1447.1,"elo_away":1589.1,"locked":"2026-10-06"},{"gameday":"2026-10-11","home":"ARI","away":"DET","elo_home":1389.2,"elo_away":1537.1,"locked":"2026-10-06"},{"gameday":"2026-10-11","home":"SEA","away":"SF","elo_home":1687.5,"elo_away":1633.7,"locked":"2026-10-06"},{"gameday":"2026-10-11","home":"ATL","away":"BAL","elo_home":1487.1,"elo_away":1565.7,"locked":"2026-10-06"},{"gameday":"2026-10-12","home":"LA","away":"BUF","elo_home":1598.6,"elo_away":1641,"locked":"2026-10-06"}]}};
const nflAbbreviations={'1':'ATL','2':'BUF','3':'CHI','4':'CIN','5':'CLE','6':'DAL','7':'DEN','8':'DET','9':'GB','10':'TEN','11':'IND','12':'KC','13':'LV','14':'LAR','15':'MIA','16':'MIN','17':'NE','18':'NO','19':'NYG','20':'NYJ','21':'PHI','22':'ARI','23':'PIT','24':'LAC','25':'SF','26':'SEA','27':'TB','28':'WAS','29':'CAR','30':'JAX','33':'BAL','34':'HOU'};
function eloTeam(team){const abbreviation=String(team?.abbreviation||nflAbbreviations[team?.id]||'').toUpperCase();return {LA:'LAR',STL:'LAR',OAK:'LV',SD:'LAC',WSH:'WAS'}[abbreviation]||abbreviation}
function parseNFLElo(payload){
 if(payload?.site!=='nflanalytic.com'||!Number.isInteger(payload.season)||!payload.weeks||typeof payload.weeks!=='object'||Array.isArray(payload.weeks))return null;
 const games=Object.entries(payload.weeks).filter(([week,rows])=>/^\d+$/.test(week)&&Array.isArray(rows)).flatMap(([week,rows])=>rows.map(g=>({...g,week:Number(week)}))).filter(g=>
  g&&/^\d{4}-\d{2}-\d{2}$/.test(g.gameday)&&/^\d{4}-\d{2}-\d{2}$/.test(g.locked)&&g.locked<=g.gameday&&g.gameday.startsWith(String(payload.season))&&
  [g.elo_home,g.elo_away].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>0)&&g.home&&g.away);
 return games.length?{season:payload.season,updated:payload.updated,games}:null;
}
let nflElo=parseNFLElo(bundledNFLElo),nflEloLoaded=0;
async function loadNFLElo(){
 if(nflEloLoaded&&Date.now()-nflEloLoaded<3600000)return;
 try{
  const parsed=parseNFLElo(await fetchJSON('nfl-elo.json?v='+Math.floor(Date.now()/3600000)));
  if(parsed&&(!nflElo||parsed.season>nflElo.season||(parsed.season===nflElo.season&&String(parsed.updated)>=String(nflElo.updated)))){nflElo=parsed;nflEloLoaded=Date.now()}
 }catch{/* Retain verified pregame data, never substitute current postgame ratings. */}
}
function nflEloGame(e){
 if(!nflElo||e?.season?.type===1||e?.season?.type===3)return null;
 if(e?.season?.year!=null&&Number(e.season.year)!==nflElo.season)return null;
 const competitors=comp(e)?.competitors||[];
 const home=eloTeam(competitors.find(c=>c.homeAway==='home')?.team),away=eloTeam(competitors.find(c=>c.homeAway==='away')?.team);
 const matches=nflElo.games.filter(g=>mlbDate(e)===g.gameday&&eloTeam({abbreviation:g.home})===home&&eloTeam({abbreviation:g.away})===away);
 return matches.length===1?matches[0]:null;
}
function nflEloRating(e,c){const game=nflEloGame(e);return game&&(c.homeAway==='home'?game.elo_home:c.homeAway==='away'?game.elo_away:null)}
function nflEloRank(e,c){
 const game=nflEloGame(e);
 if(!game)return null;
 const ratings=new Map();
 // Rank each week's published pregame ratings; carry bye teams forward.
 nflElo.games.filter(g=>g.week<=game.week).slice().sort((a,b)=>a.week-b.week).forEach(g=>{
  ratings.set(eloTeam({abbreviation:g.home}),g.elo_home);
  ratings.set(eloTeam({abbreviation:g.away}),g.elo_away);
 });
 const team=eloTeam(c.team),rating=ratings.get(team);
 if(ratings.size!==32||rating==null)return null;
 // Equal ratings share a position; the next position skips the tied places.
 return 1+[...ratings.values()].filter(value=>value>rating).length;
}
function updateEloDate(){const node=document.querySelector('#elo-updated');if(node)node.textContent=' · ratings updated '+(nflElo?.updated||'unavailable')}
function eloLabel(e,c,path){
 if(path!=='football/nfl')return '';
 const rank=nflEloRank(e,c);
 return rank==null?'':`<small class="rank" aria-label="Elo ranking ${rank}">${rank}</small>`;
}

function eventTime(e){return e?.date?new Date(e.date).getTime():NaN}
function chronological(a,b){const x=eventTime(a),y=eventTime(b);return (Number.isFinite(x)?x:Infinity)-(Number.isFinite(y)?y:Infinity)}
function isUpcoming(e,now=Date.now()){return state(e)==='pre'&&!condition(e)&&eventTime(e)>=now}
function gameTime(e){return comp(e)?.dateValid===false||/TBD|TBA/i.test(status(e))?'Time TBD':time(e.date)}
function score(c){return c.score?.displayValue??c.score?.value??c.score??'–'}
function gameScore(e,c){return state(e)==='pre'||isCanceled(e)?'–':esc(score(c))}
function matchupPrefix(e,t){return comp(e)?.competitors?.find(c=>String(c.team?.id)===t.id)?.homeAway==='away'?'at':'vs'}
function opponentLink(e,t){const opponent=comp(e)?.competitors?.find(c=>String(c.team?.id)!==t.id)?.team;return teamLink(opponent?.displayName||'Opponent TBD',t.path,opponent?.id)}
function opponents(e,t){return comp(e)?.competitors?.find(c=>String(c.team?.id)!==t.id)?.team?.displayName||'Opponent TBD'}
const mlbSchedules=new Map();
const mlbGames=new Map();
function mlbDate(e){
 if(!Number.isFinite(eventTime(e)))return '';
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(e.date));
 return ['year','month','day'].map(k=>parts.find(p=>p.type===k).value).join('-');
}
function mlbName(name){return String(name||'').toLowerCase().replace(/^(oakland|sacramento) /,'').replace(/[^a-z0-9]/g,'')}
function matchMLBGame(e,games){
 const competitors=comp(e)?.competitors||[];
 const home=competitors.find(c=>c.homeAway==='home')?.team?.displayName;
 const away=competitors.find(c=>c.homeAway==='away')?.team?.displayName;
 if(!home||!away||!Number.isFinite(eventTime(e)))return null;
 const number=comp(e)?.gameNumber??e.gameNumber;
 const matches=games.filter(g=>/^\d+$/.test(String(g.gamePk))&&mlbName(g.teams?.home?.team?.name)===mlbName(home)&&mlbName(g.teams?.away?.team?.name)===mlbName(away)&&Math.abs(new Date(g.gameDate).getTime()-eventTime(e))<=5*60000&&(number==null||String(number)===String(g.gameNumber)));
 return matches.length===1?matches[0].gamePk:null;
}
async function loadMLBLinks(){
 const events=[...teams.flatMap((t,i)=>t.path==='baseball/mlb'?(data[i]?.events||[]):[]),...(leagueData[0]?.events||[])];
 const years=[...new Set(events.filter(e=>Number.isFinite(eventTime(e))).map(e=>new Date(e.date).getUTCFullYear()))];
 await Promise.allSettled(years.map(async year=>{
  const cached=mlbSchedules.get(year);
  if(cached&&Date.now()-cached.loaded<300000)return;
  try{
   const schedule=await fetchJSON(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&season=${year}&fields=dates,games,gamePk,gameDate,gameNumber,teams,home,away,team,name`);
   if(!Array.isArray(schedule.dates))return;
   mlbSchedules.set(year,{loaded:Date.now(),games:schedule.dates.flatMap(d=>d.games||[])});
  }catch{/* Scores still work when the optional link lookup is unavailable. */}
 }));
 mlbGames.clear();
 events.forEach(e=>{const pk=matchMLBGame(e,mlbSchedules.get(new Date(e.date).getUTCFullYear())?.games||[]);if(pk)mlbGames.set(String(e.id),pk)});
}
// Verified FOX destinations; the optional scoreboard lookup discovers new links.
const foxGameLinks=new Set(["https://www.foxsports.com/nfl/week-5-tampa-bay-buccaneers-vs-dallas-cowboys-oct-08-2026-game-boxscore-11061","https://www.foxsports.com/nfl/week-5-philadelphia-eagles-vs-jacksonville-jaguars-oct-11-2026-game-boxscore-11133","https://www.foxsports.com/nfl/week-5-cincinnati-bengals-vs-miami-dolphins-oct-11-2026-game-boxscore-11063","https://www.foxsports.com/nfl/week-5-minnesota-vikings-vs-new-orleans-saints-oct-11-2026-game-boxscore-11065","https://www.foxsports.com/nfl/week-5-new-york-giants-vs-washington-commanders-oct-11-2026-game-boxscore-11067","https://www.foxsports.com/nfl/week-5-chicago-bears-vs-green-bay-packers-oct-11-2026-game-boxscore-11070","https://www.foxsports.com/nfl/week-5-cleveland-browns-vs-new-york-jets-oct-11-2026-game-boxscore-11062","https://www.foxsports.com/nfl/week-5-las-vegas-raiders-vs-new-england-patriots-oct-11-2026-game-boxscore-11064","https://www.foxsports.com/nfl/week-5-houston-texans-vs-tennessee-titans-oct-11-2026-game-boxscore-11066","https://www.foxsports.com/nfl/week-5-indianapolis-colts-vs-pittsburgh-steelers-oct-11-2026-game-boxscore-11068","https://www.foxsports.com/nfl/week-5-denver-broncos-vs-los-angeles-chargers-oct-11-2026-game-boxscore-11069","https://www.foxsports.com/nfl/week-5-detroit-lions-vs-arizona-cardinals-oct-11-2026-game-boxscore-11071","https://www.foxsports.com/nfl/week-5-san-francisco-49ers-vs-seattle-seahawks-oct-11-2026-game-boxscore-11072","https://www.foxsports.com/nfl/week-5-baltimore-ravens-vs-atlanta-falcons-oct-11-2026-game-boxscore-11073","https://www.foxsports.com/nfl/week-5-buffalo-bills-vs-los-angeles-rams-oct-12-2026-game-boxscore-11074","https://www.foxsports.com/nfl/week-1-new-england-patriots-vs-seattle-seahawks-sep-09-2026-game-boxscore-11038","https://www.foxsports.com/nfl/week-2-pittsburgh-steelers-vs-new-england-patriots-sep-20-2026-game-boxscore-11054","https://www.foxsports.com/nfl/week-3-new-england-patriots-vs-jacksonville-jaguars-sep-27-2026-game-boxscore-11199","https://www.foxsports.com/nfl/week-4-new-england-patriots-vs-buffalo-bills-oct-04-2026-game-boxscore-11212","https://www.foxsports.com/nfl/week-16-new-england-patriots-vs-new-york-jets-dec-27-2026-game-boxscore-11122"]);
const foxLoaded=new Map();
["https://www.foxsports.com/college-football/iowa-hawkeyes-vs-washington-huskies-oct-09-2026-game-boxscore-43545","https://www.foxsports.com/college-football/iowa-state-cyclones-vs-byu-cougars-oct-09-2026-game-boxscore-43547","https://www.foxsports.com/college-football/houston-cougars-vs-kansas-state-wildcats-oct-10-2026-game-boxscore-43571","https://www.foxsports.com/college-football/texas-longhorns-vs-oklahoma-sooners-oct-10-2026-game-boxscore-44485","https://www.foxsports.com/college-football/georgia-bulldogs-vs-alabama-crimson-tide-oct-10-2026-game-boxscore-43597","https://www.foxsports.com/college-football/lsu-tigers-vs-kentucky-wildcats-oct-10-2026-game-boxscore-43574","https://www.foxsports.com/college-football/ucla-bruins-vs-oregon-ducks-oct-10-2026-game-boxscore-43587","https://www.foxsports.com/college-football/texas-am-aggies-vs-missouri-tigers-oct-10-2026-game-boxscore-43558","https://www.foxsports.com/college-football/tennessee-volunteers-vs-arkansas-razorbacks-oct-10-2026-game-boxscore-43602","https://www.foxsports.com/college-football/south-carolina-gamecocks-vs-florida-gators-oct-10-2026-game-boxscore-43566","https://www.foxsports.com/college-football/ucf-knights-vs-oklahoma-state-cowboys-oct-10-2026-game-boxscore-43564","https://www.foxsports.com/college-football/usc-trojans-vs-penn-state-nittany-lions-oct-10-2026-game-boxscore-43585","https://www.foxsports.com/college-football/boise-state-broncos-vs-fresno-state-bulldogs-oct-10-2026-game-boxscore-43642","https://www.foxsports.com/college-football/illinois-fighting-illini-vs-michigan-state-spartans-oct-10-2026-game-boxscore-43572","https://www.foxsports.com/college-football/western-michigan-broncos-vs-michigan-wolverines-sep-05-2026-game-boxscore-43016","https://www.foxsports.com/college-football/oklahoma-sooners-vs-michigan-wolverines-sep-12-2026-game-boxscore-43065","https://www.foxsports.com/college-football/utep-miners-vs-michigan-wolverines-sep-19-2026-game-boxscore-43222","https://www.foxsports.com/college-football/iowa-hawkeyes-vs-michigan-wolverines-sep-26-2026-game-boxscore-43345","https://www.foxsports.com/college-football/michigan-wolverines-vs-minnesota-golden-gophers-oct-03-2026-game-boxscore-43477","https://www.foxsports.com/college-football/penn-state-nittany-lions-vs-michigan-wolverines-oct-17-2026-game-boxscore-43682","https://www.foxsports.com/college-football/indiana-hoosiers-vs-michigan-wolverines-oct-24-2026-game-boxscore-43797","https://www.foxsports.com/college-football/michigan-wolverines-vs-rutgers-scarlet-knights-oct-31-2026-game-boxscore-43924","https://www.foxsports.com/college-football/michigan-state-spartans-vs-michigan-wolverines-nov-07-2026-game-boxscore-44021","https://www.foxsports.com/college-football/michigan-wolverines-vs-oregon-ducks-nov-14-2026-game-boxscore-44136","https://www.foxsports.com/college-football/ucla-bruins-vs-michigan-wolverines-nov-21-2026-game-boxscore-44271","https://www.foxsports.com/college-football/michigan-wolverines-vs-ohio-state-buckeyes-nov-28-2026-game-boxscore-44384"].forEach(url=>foxGameLinks.add(url));
function foxGameURL(e,path='football/nfl'){
 const league=path==='football/nfl'?'nfl':path==='football/college-football'?'college-football':null;
 if(!league)return null;
 const competitors=comp(e)?.competitors||[];
 const slug=name=>String(name||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
 const away=slug(competitors.find(c=>c.homeAway==='away')?.team?.displayName);
 const home=slug(competitors.find(c=>c.homeAway==='home')?.team?.displayName);
 if(!away||!home)return null;
 const day=mlbDate(e),months=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
 const matches=[...foxGameLinks].filter(url=>{
  if(!url.startsWith('https://www.foxsports.com/'+league+'/'))return false;
  const m=/^https:\/\/www\.foxsports\.com\/nfl\/(.+)-vs-(.+)-([a-z]{3})-(\d{1,2})-(\d{4})-game-boxscore-\d+$/.exec(url.replace('/college-football/','/nfl/'));
  if(!m||!(m[1]===away||m[1].endsWith('-'+away))||m[2]!==home)return false;
  const month=months.indexOf(m[3])+1;
  return month>0&&`${m[5]}-${String(month).padStart(2,'0')}-${m[4].padStart(2,'0')}`===day;
 });
 return matches.length===1?matches[0]:null;
}
function addFOXLinks(html){
 const links=String(html).match(/(?:https:\/\/www\.foxsports\.com)?\/(?:nfl|college-football)\/[a-z0-9-]+game-boxscore-\d+/g)||[];
 links.forEach(url=>foxGameLinks.add(url.startsWith('/')?'https://www.foxsports.com'+url:url));
}
async function loadFOXLinks(){
 await Promise.allSettled(['nfl','college-football'].map(async league=>{
  const loaded=foxLoaded.get(league);
  if(loaded&&Date.now()-loaded<3600000)return;
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
  try{
   const response=await fetch(`https://www.foxsports.com/${league}/scores`,{signal:controller.signal});
   if(!response.ok)throw Error(response.status);
   addFOXLinks(await response.text());foxLoaded.set(league,Date.now());
  }catch{/* Missing or blocked FOX data keeps the ESPN game link. */}
  finally{clearTimeout(timeout)}
 }));
}
function gameLink(e,label,path){
 if(['football/nfl','football/college-football'].includes(path)){
  const url=foxGameURL(e,path);
  if(url)return `<a data-game="${esc(e.id)}" href="${url}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;
 }

 if(path==='baseball/mlb'){
  const pk=mlbGames.get(String(e.id));
  const day=mlbDate(e);
  const url=pk?'https://www.mlb.com/gameday/'+pk:'https://www.mlb.com/scores'+(day?'/'+day:'');
  return `<a data-game="${esc(e.id)}" href="${url}" target="_blank" rel="noopener noreferrer" title="${pk?'View MLB Gameday':'View MLB scores'+(day?' for '+day:'')}">${esc(label)}</a>`;
 }
 const links=[...(e?.links||[]),...(comp(e)?.links||[])];
 const valid=link=>{try{const url=new URL(link.href);return url.protocol==='https:'&&(url.hostname==='espn.com'||url.hostname.endsWith('.espn.com'))}catch{return false}};
 const link=links.find(l=>valid(l)&&(l.rel||[]).includes('summary'))||links.find(valid);
 return link?`<a href="${esc(link.href)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`:esc(label);
}
function highlightsLink(e,path,events=[]){
 if(!isFinal(e)||!Number.isFinite(eventTime(e)))return '';
 const competitors=comp(e)?.competitors||[];
 const names=competitors.slice().sort((a,b)=>(a.homeAway==='home')-(b.homeAway==='home')).map(c=>c.team?.displayName||c.team?.shortDisplayName);
 if(names.length!==2||names.some(name=>!name))return '';
 const sports={'baseball/mlb':'MLB baseball','football/nfl':'NFL football','football/college-football':'college football','basketball/mens-college-basketball':"men's college basketball",'basketball/womens-college-basketball':"women's college basketball"};
 const calendarDate=d=>new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'long',day:'numeric'}).format(new Date(d));
 const fullDate=calendarDate(e.date);
 let gameNumber='';
 if(path==='baseball/mlb'){
  const explicit=comp(e)?.gameNumber??e.gameNumber;
  if((typeof explicit==='number'||typeof explicit==='string')&&/^[12]$/.test(String(explicit)))gameNumber=' Game '+explicit;
  else{
   const teamIDs=competitors.map(c=>String(c.team?.id||'')).sort().join('|');
   const sameDay=events.filter(other=>!condition(other)&&Number.isFinite(eventTime(other))&&calendarDate(other.date)===fullDate&&(comp(other)?.competitors||[]).map(c=>String(c.team?.id||'')).sort().join('|')===teamIDs).slice().sort(chronological);
   if(competitors.every(c=>c.team?.id)&&sameDay.length===2&&sameDay[0].id!==sameDay[1].id&&eventTime(sameDay[0])!==eventTime(sameDay[1])){
    const index=sameDay.findIndex(other=>other.id===e.id);
    if(index>=0)gameNumber=' Game '+(index+1);
   }
  }
 }
 const query=names.join(' vs ')+ ' '+(sports[path]||path)+' '+fullDate+gameNumber+' highlights';
 return `<a href="https://www.youtube.com/results?search_query=${esc(encodeURIComponent(query))}" target="_blank" rel="noopener noreferrer"><svg aria-hidden="true" focusable="false" width="14" height="14" viewBox="0 0 16 16" style="vertical-align:-2px;margin-right:4px" fill="none"><rect x="1" y="2.5" width="14" height="11" rx="2" stroke="currentColor"/><path d="M6 5v6l5-3z" fill="currentColor"/></svg>Find highlights</a>`;
}
function gameFooter(e,path,events=[]){
 const highlights=highlightsLink(e,path,events),badge=upsetLabel(e,path);
 return highlights||badge?`<div class="gamefooter">${highlights}${badge}</div>`:'';
}
function broadcastNetworks(e){
 const competition=comp(e)||{},names=[],seen=new Set();
 const add=name=>{
  if(typeof name!=='string')return;
  const text=name.trim(),key=text.toLowerCase();
  if(!text||/^(tbd|tba)$/i.test(text)||seen.has(key))return;
  seen.add(key);names.push(text);
 };
 const entries=[...(Array.isArray(competition.geoBroadcasts)?competition.geoBroadcasts:[]),...(Array.isArray(competition.broadcasts)?competition.broadcasts:[])];
 entries.forEach(b=>{
  if(!b||String(b.type?.id)==='5'||/radio/i.test(b.type?.shortName||''))return;
  if(Array.isArray(b.names))b.names.forEach(add);
  add(b.media?.shortName);
 });
 if(!names.length)add(competition.broadcast);
 return names.join(' / ');
}
function broadcastSuffix(e){const networks=broadcastNetworks(e);return networks?' · '+networks:''}
function gameDateTime(e,path){return gameLink(e,date(e.date)+(state(e)==='pre'&&!condition(e)?' · '+gameTime(e):'')+broadcastSuffix(e),path)}
function gameHeading(e,path,livePrefix=''){
 const detail=state(e)==='pre'&&!condition(e)?'':status(e).replace(/\s*\b(?:ET|EST|EDT|CT|CST|CDT|MT|MST|MDT|PT|PST|PDT|UTC|GMT)\b/g,'').trim();
 if(isLive(e))return gameLink(e,livePrefix+date(e.date)+(detail?' · '+detail:'')+broadcastSuffix(e),path);
 if(isResult(e)||condition(e))return gameLink(e,date(e.date)+(detail?' · '+detail:'')+broadcastSuffix(e),path);
 return gameDateTime(e,path)+(detail?' · '+esc(detail):'');
}
function relevant(e,now=Date.now()){
 const delta=eventTime(e)-now;
 if(isLive(e))return true;
 // Keep recent disruptions visible without promoting old season-long postponements.
 if(isUnresolved(e))return Number.isFinite(delta)&&delta>=-3*86400000&&delta<=7*86400000;
 if(isResult(e))return delta>=-3*86400000&&delta<=0;
 return isUpcoming(e,now)&&delta<=7*86400000;
}
function scheduleRow({e,t}){
 const detail=condition(e)|| (isFinal(e)?(comp(e)?.competitors||[]).map(c=>score(c)).join(' – ')+' · '+status(e):gameTime(e));
 return `<div class="scheduleitem"><div>${gameLink(e,date(e.date),t.path)}</div><div><strong>${teamLink(t.short,t.path,t.id)}</strong><br><small>${matchupPrefix(e,t)} ${opponentLink(e,t)}</small></div><small class="sport">${t.league}</small><div>${gameLink(e,detail+broadcastSuffix(e),t.path)}</div></div>`;
}
function pastResultRow({e,t,events}){
 const competitors=(comp(e)?.competitors||[]).slice().sort((a,b)=>(a.homeAway==='home')-(b.homeAway==='home'));
 const highlights=highlightsLink(e,t.path,events);
 return `<div class="past-result"><div class="past-meta"><strong>${teamLink(t.short,t.path,t.id)}</strong><span>${gameHeading(e,t.path)}</span>${highlights?`<span>${highlights}</span>`:''}</div><div class="past-matchup">${competitors.map(c=>`<div class="past-score-row"><span>${eloLabel(e,c,t.path)}${teamLink(c.team?.shortDisplayName||c.team?.displayName,t.path,c.team?.id)}</span><strong>${gameScore(e,c)}</strong></div>`).join('')}</div></div>`;
}
function feedNotice(d){return d?.partial||d?.stale?'<p class="details" role="status">Some scores may be out of date. Retrying automatically.</p>':''}
function render(){
 const now=Date.now();
 let upcoming=[],older=[],later=[];
 document.querySelector('#cards').innerHTML=teams.map((t,i)=>{
  if(selected!==-1&&selected!==i)return '';
  const d=data[i];
  const events=(d?.events||[]).slice().sort(chronological);
  const live=events.find(isLive);
  const pending=lastItem(events.filter(e=>isUnresolved(e)&&relevant(e,now)));
  const results=events.filter(isResult);
  const latest=lastItem(results.filter(e=>eventTime(e)<=now));
  const latestFinal=lastItem(events.filter(e=>isFinal(e)&&eventTime(e)<=now));
  const next=events.find(e=>isUpcoming(e,now));
  events.filter(e=>isUpcoming(e,now)||(isUnresolved(e)&&relevant(e,now))).forEach(e=>upcoming.push({e,t}));
  const olderResult=lastItem(events.filter(e=>(isResult(e)||isUnresolved(e))&&eventTime(e)<=now&&!relevant(e,now)));
  if(olderResult)older.push({e:olderResult,t,events});
  const sameSeason=(a,b)=>{
   if(!a||!b)return false;
   const ay=a.season?.year,by=b.season?.year;
   if(ay!=null&&by!=null)return String(ay)===String(by);
   const seasonYear=e=>{const d=new Date(e.date),y=d.getUTCFullYear(),m=d.getUTCMonth();return t.path.includes('college-football')||t.path==='football/nfl'||t.path.includes('basketball')?(m>=6?y:y-1):y};
   return seasonYear(a)===seasonYear(b);
  };
  const daysUntilNext=next?(eventTime(next)-now)/86400000:Infinity;
  const nextWithinSeasonWindow=next&&(daysUntilNext<=7||(daysUntilNext<=35&&sameSeason(latestFinal,next)));
  const game=live||pending||(latest&&relevant(latest,now)?latest:null)||(nextWithinSeasonWindow?next:null);
  if(d&&!d.error&&!game)return '';
  const inside=d?.error?'<p>Scores are temporarily unavailable. Try refreshing.</p>':!d?'<p>Loading scores…</p>':!game?'<p>No games available in the current schedule.</p>':`<div class="label ${live?'live':''}">${gameHeading(game,t.path,'● LIVE · ')}</div>${(comp(game)?.competitors||[]).slice().sort((a,b)=>(a.homeAway==='home')-(b.homeAway==='home')).map(c=>`<div class="row"><span>${c.team?.logo?`<img src="${esc(c.team.logo)}" alt="" onerror="this.style.display='none'">`:''}${eloLabel(game,c,t.path)}${teamLink(c.team?.shortDisplayName||c.team?.displayName,t.path,c.team?.id)}${cardRecord(game,c,t.path)?` <small class="teamrecord">(${esc(cardRecord(game,c,t.path))})</small>`:''}</span><span class="score">${gameScore(game,c)}</span></div>`).join('')}<div class="details">${esc(comp(game)?.venue?.fullName||'')}</div>${gameFooter(game,t.path,events)}`;
  return `<article class="card" style="--accent:${t.color}"><div class="cardhead"><span class="team-icon"><img src="https://a.espncdn.com/i/teamlogos/${t.path.includes('college')?'ncaa':t.path.split('/')[1]}/500/${t.id}.png" alt="${esc(t.name)} logo" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="monogram" hidden>${t.mark}</span></span><div><div class="teamname">${teamLink(t.short,t.path,t.id)}</div><div class="league">${t.league}</div></div></div><div class="game">${inside}${feedNotice(d)}</div>${nextWithinSeasonWindow&&next.id!==game?.id?`<div class="next"><b>NEXT GAME</b>${gameDateTime(next,t.path)}<br>${matchupPrefix(next,t)} ${opponentLink(next,t)}</div>`:''}</article>`;
 }).join('');
 upcoming.sort((a,b)=>chronological(a.e,b.e));
 const seenLater=new Set();
 for(const item of upcoming.filter(({e})=>!relevant(e,now))){if(!seenLater.has(item.t)){seenLater.add(item.t);later.push(item)}}
 if(!document.querySelector('#cards').innerHTML)document.querySelector('#cards').innerHTML='<div class="empty">No live games, recent results, or games in the next seven days. Your other games are below.</div>';
 older.sort((a,b)=>chronological(b.e,a.e));
 later.sort((a,b)=>chronological(a.e,b.e));
 document.querySelector('#past-games').innerHTML=older.map(pastResultRow).join('')||'<div class="empty">No older results available.</div>';
 document.querySelector('#future-games').innerHTML=later.map(scheduleRow).join('')||'<div class="empty">No later games available.</div>';
}


const leagues=[
 {name:'MLB',path:'baseball/mlb',standings:'https://www.mlb.com/standings'},
 {name:'NFL',path:'football/nfl',standings:'https://www.espn.com/nfl/standings'},
 {name:'NCAAF Top 25',path:'football/college-football',ranked:true,standings:'https://www.espn.com/college-football/standings'},
 {name:'NCAAF Big Ten',path:'football/college-football',group:'5',standings:'https://www.espn.com/college-football/standings/_/group/5'}
];
let leagueData=[],selectedLeague=-1;
function leagueFilters(){
 const labels=['All leagues',...leagues.map(l=>l.name)];
 document.querySelector('#league-filters').innerHTML=labels.map((label,i)=>`<button type="button" class="${selectedLeague===i-1?'active':''}" data-league="${i-1}" aria-pressed="${selectedLeague===i-1}">${esc(label)}</button>`).join('');
 document.querySelectorAll('#league-filters [data-league]').forEach(button=>button.onclick=()=>{
  selectedLeague=Number(button.dataset.league);
  leagueFilters();renderLeagues();
 });
}
// ESPN scoreboard competitors provide overall records and a national curated rank.
function competitorRecord(c){
 const records=Array.isArray(c.records)?c.records:Array.isArray(c.record)?c.record:[];
 const overall=records.find(r=>/^(overall|total)$/i.test(r.type||r.name||''))||records.find(r=>r.summary||r.displayValue)||null;
 const summary=overall?.summary||overall?.displayValue||(typeof c.record==='string'?c.record:'');
 return typeof summary==='string'&&/^\d+-\d+(?:-\d+)?$/.test(summary.trim())?summary.trim():'';
}
const upcomingRecords=new Map();
function cardRecord(e,c,path){
 const supplied=competitorRecord(c);
 if(supplied||!isUpcoming(e))return supplied;
 return upcomingRecords.get(`${path}:${c.team?.id}:${e.season?.year}`)?.record||'';
}
async function loadUpcomingRecords(){
 const requests=new Map();
 teams.forEach((t,i)=>{
  const next=(data[i]?.events||[]).filter(e=>isUpcoming(e)&&eventTime(e)-Date.now()<=35*86400000).sort(chronological)[0];
  if(!next||!next.season?.year)return;
  (comp(next)?.competitors||[]).forEach(c=>{
   if(competitorRecord(c)||!c.team?.id)return;
   const key=`${t.path}:${c.team.id}:${next.season.year}`;
   if(Date.now()-(upcomingRecords.get(key)?.loaded||0)<3600000)return;
   requests.set(key,{path:t.path,id:c.team.id,season:next.season.year});
  });
 });
 await Promise.allSettled([...requests].map(async([key,t])=>{
  const feed=await fetchJSON(`https://site.api.espn.com/apis/site/v2/sports/${t.path}/teams/${t.id}/schedule?seasontype=2&season=${encodeURIComponent(t.season)}`);
  if(String(feed.team?.seasonSummary)!==String(t.season))return;
  const record=competitorRecord({record:feed.team?.recordSummary});
  if(record)upcomingRecords.set(key,{record,loaded:Date.now()});
 }));
}
function competitorRank(c,l){
 if(!l.path.includes('college-football'))return '';
 const n=Number(c.curatedRank?.current);
 return Number.isInteger(n)&&n>=1&&n<=25?`<small class="rank">${n}</small>`:'';
}
function renderLeagues(){
 document.querySelector('#league-scores').innerHTML=leagues.map((l,i)=>{
  if(selectedLeague!==-1&&selectedLeague!==i)return '';
  const d=leagueData[i];
  const events=(d?.events||[]).filter(e=>!l.ranked||(comp(e)?.competitors||[]).some(c=>c.curatedRank?.current>=1&&c.curatedRank.current<=25)).sort((a,b)=>{
   if(l.name==='MLB')return chronological(a,b);
   const order={in:0,pre:1,post:2};
   return (order[state(a)]??3)-(order[state(b)]??3)||chronological(a,b);
  });
  return `<section class="leagueboard"><div class="leagueheading"><h2><a href="${esc(l.standings)}" target="_blank" rel="noopener noreferrer" title="View ${esc(l.name)} standings on ${l.path==='baseball/mlb'?'MLB.com':'ESPN'}">${esc(l.name)}</a></h2></div><div class="leaguegames">${d?.error?'<p class="empty">Scores temporarily unavailable. Try Refresh.</p>':!d?'<p class="empty">Loading scores…</p>':!events.length?'<p class="empty">No games in this scoreboard window.</p>':events.map(e=>`<article class="minigame"><div class="minimeta"><div class="ministatus ${isLive(e)?'live':''}">${gameHeading(e,l.path,'● ')}</div></div>${(comp(e)?.competitors||[]).slice().sort((a,b)=>(a.homeAway==='home')-(b.homeAway==='home')).map(c=>`<div class="minirow"><span>${competitorRank(c,l)}${eloLabel(e,c,l.path)}${teamLink(c.team?.shortDisplayName||c.team?.displayName,l.path,c.team?.id)}${competitorRecord(c)?` <small class="minirecord">(${esc(competitorRecord(c))})</small>`:''}</span><strong>${gameScore(e,c)}</strong></div>`).join('')}${gameFooter(e,l.path,d.events)}</article>`).join('')}${feedNotice(d)}</div></section>`;
 }).join('');
}
function mergeEvents(feeds){return [...new Map(feeds.flatMap(d=>d.events||[]).map(e=>[e.id,e])).values()]}
function retainOnFailure(previous){return previous?.events?{...previous,error:false,partial:true,stale:true}:{error:true}}
async function loadLeagues(){
 await Promise.allSettled(leagues.map(async(l,i)=>{
  const previous=leagueData[i];
  try{
   let url=`https://site.api.espn.com/apis/site/v2/sports/${l.path}/scoreboard?limit=200`;
   if(l.ranked)url+='&groups=80';
   if(l.group)url+='&groups='+encodeURIComponent(l.group);
   if(l.name==='MLB'){
    const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const part=k=>parts.find(p=>p.type===k).value;
    // Subtract a calendar day, rather than 24 hours, to handle daylight saving changes.
    const today=new Date(Date.UTC(Number(part('year')),Number(part('month'))-1,Number(part('day'))));
    const yesterday=new Date(today);
    yesterday.setUTCDate(yesterday.getUTCDate()-1);
    const feedDate=d=>d.toISOString().slice(0,10).replace(/-/g,'');
    const dates=[feedDate(yesterday),feedDate(today)];
    const results=await Promise.allSettled(dates.map(d=>fetchJSON(url+'&dates='+d)));
    const dailyFeeds={};
    results.forEach((r,j)=>{
     if(r.status==='fulfilled')dailyFeeds[dates[j]]=r.value;
     else if(previous?.dailyFeeds?.[dates[j]])dailyFeeds[dates[j]]=previous.dailyFeeds[dates[j]];
    });
    if(!Object.keys(dailyFeeds).length)throw Error('Feed unavailable');
    leagueData[i]={events:mergeEvents(Object.values(dailyFeeds)),dailyFeeds,partial:results.some(r=>r.status==='rejected')};
   }else{
    leagueData[i]=await fetchJSON(url);
   }
  }catch{leagueData[i]=retainOnFailure(previous)}
 }));
 renderLeagues();
}
async function loadTeam(t,i){
 const previous=data[i];
 try{
  const seasonTypes=[2,3];
  const results=await Promise.allSettled(seasonTypes.map(seasonType=>fetchJSON(`https://site.api.espn.com/apis/site/v2/sports/${t.path}/teams/${t.id}/schedule?seasontype=${seasonType}`)));
  const seasonFeeds={};
  results.forEach((r,j)=>{
   if(r.status==='fulfilled')seasonFeeds[seasonTypes[j]]=r.value;
   else if(previous?.seasonFeeds?.[seasonTypes[j]])seasonFeeds[seasonTypes[j]]=previous.seasonFeeds[seasonTypes[j]];
  });
  if(!Object.keys(seasonFeeds).length)throw Error('Feed unavailable');
  data[i]={events:mergeEvents(Object.values(seasonFeeds)),seasonFeeds,partial:results.some(r=>r.status==='rejected')};
 }catch{data[i]=retainOnFailure(previous)}
}
function syncTeamScores(){
 teams.forEach((t,i)=>{
  const feeds=leagueData.filter((feed,j)=>leagues[j].path===t.path&&feed&&!feed.error&&!feed.partial&&!feed.stale);
  const current=mergeEvents(feeds).filter(e=>(comp(e)?.competitors||[]).some(c=>String(c.team?.id)===t.id));
  if(!current.length)return;
  const previous=data[i];
  const events=new Map((previous?.events||[]).map(e=>[String(e.id),e]));
  current.forEach(e=>{
   const scheduled=events.get(String(e.id));
   events.set(String(e.id),{...scheduled,...e});
  });
  data[i]={...previous,events:[...events.values()],error:false,partial:!!(previous?.partial||previous?.error)};
 });
}
async function load(){
 if(busy)return;
 busy=true;
 const refresh=document.querySelector('#refresh'),message=document.querySelector('#status');
 refresh.disabled=true;
 message.textContent='Updating scores…';
 try{
  updateToday();
  const results=await Promise.allSettled([loadLeagues(),...teams.map(loadTeam)]);
  if(results.some(r=>r.status==='rejected'))throw Error('Unable to render scores');
  syncTeamScores();
  await Promise.allSettled([loadMLBLinks(),loadNFLElo(),loadFOXLinks(),loadUpcomingRecords()]);
  renderLeagues();
  render();
  updateEloDate();
  updateToday();
  const failed=[...data,...leagueData].filter(d=>d?.error||d?.partial||d?.stale).length;
  message.textContent=failed?`${failed} scoreboard${failed>1?'s':''} unavailable or out of date · retrying automatically`:`Updated ${time(new Date())}`;
 }catch{
  message.textContent='Unable to update scores. Retrying automatically.';
 }finally{
  refresh.disabled=false;
  busy=false;
 }
}
document.querySelector('#refresh').onclick=load;
render();leagueFilters();renderLeagues();load();setInterval(load,60000);
