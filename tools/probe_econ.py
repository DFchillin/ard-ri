import glob
from playwright.sync_api import sync_playwright
exe = (glob.glob('/opt/pw-browsers/chromium-*/chrome-linux/chrome')+glob.glob('/opt/pw-browsers/chromium/**/chrome',recursive=True))[0]

TOWN = """() => {
  const {game, map, view, sim} = window.ardri;
  game.silver = 99999;
  const P = (k,x,z,w,h) => game.place(k,{x,z,w,h});
  for (let z=12;z<=20;z++) for (let x=6;x<=24;x++){ const t=map.get(x,z); if(t){ t.terrain=0; t.road=false; t.occupant=null; } }
  for (let x=6;x<=24;x++) map.setRoad(x,16,true);
  view.rebuildRoads();
  P('field',9,14,3,2); P('granary',13,14,2,2); P('market',16,14,2,2); P('well',19,14,1,1);
  P('roundhouse',9,17,2,2); P('roundhouse',12,17,2,2);
  game.folk = 8;
  for (const b of game.buildings) if (b.def.role==='dwelling'){ b.pop=4; b.food=6; b.water=6; }
  sim.speed = 3;
  return game.buildings.length;
}"""

SUMMARY = """() => {
  const g = window.ardri.game;
  const per = {}; let maxPer = 0;
  for (const w of g.walkers) { if (!w.source) continue; const i = g.buildings.indexOf(w.source);
    per[i]=(per[i]||0)+1; maxPer=Math.max(maxPer, per[i]); }
  const bs = g.buildings.map(b => ({role:b.def.role, stock:b.stock, food:b.food, ripe:!!b.ripe, grown:b.grown}));
  const gran = g.buildings.find(b=>b.def.role==='granary');
  const mkt = g.buildings.find(b=>b.def.role==='market');
  const dwe = g.buildings.filter(b=>b.def.role==='dwelling');
  return { walkers:g.walkers.length, maxPerBld:maxPer,
    granaryStock: gran?gran.stock:null, marketStock: mkt?mkt.stock:null,
    fedHouses: dwe.filter(d=>d.food>0).length, field: bs.find(x=>x.role==='farm') };
}"""

with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path=exe, args=['--use-gl=swiftshader','--no-sandbox'])
    pg = b.new_page()
    errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8199/index.html', wait_until='domcontentloaded', timeout=20000)
    pg.wait_for_timeout(2200)
    pg.click('.mission-btn:not(.locked)', timeout=3000); pg.wait_for_timeout(300)
    try: pg.click('#fest-continue', timeout=2000)
    except Exception: pass
    pg.evaluate(TOWN)
    samples=[]
    for _ in range(6):
        pg.wait_for_timeout(4000)
        samples.append(pg.evaluate(SUMMARY))
    b.close()
import json
for i,s in enumerate(samples): print(i, json.dumps(s))
print('errors:', [e for e in errs][:5])
