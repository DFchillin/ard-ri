import glob, sys, json
from playwright.sync_api import sync_playwright
exe = (glob.glob('/opt/pw-browsers/chromium-*/chrome-linux/chrome')+glob.glob('/opt/pw-browsers/chromium/**/chrome',recursive=True))[0]

TOWN = """() => {
  const {game, map, view, sim} = window.ardri;
  game.silver = 99999;
  const P = (k,x,z,w,h) => game.place(k,{x,z,w,h});
  for (let z=12;z<=20;z++) for (let x=6;x<=24;x++){ const t=map.get(x,z); if(t){ t.terrain=0; t.road=false; t.occupant=null; } }
  for (let x=6;x<=24;x++) map.setRoad(x,16,true);
  view.rebuildRoads();
  P('altar',8,15,1,1); P('well',11,15,1,1);
  P('roundhouse',14,14,2,2); P('roundhouse',17,14,2,2); P('roundhouse',20,14,2,2);
  game.folk = 12;
  for (const b of game.buildings) if (b.def.role==='dwelling'){ b.pop=4; b.food=10; b.water=10; }
  sim.speed = 3;
  return game.buildings.length;
}"""

SUMMARY = """() => {
  const g = window.ardri.game;
  const druids = g.walkers.filter(w=>w.sprite?.userData?.type==='druid').length;
  const fem = g.walkers.filter(w=>w.sprite && w.sprite._femaleDbg).length;
  const dwe = g.buildings.filter(b=>b.def.role==='dwelling');
  const st = g.standing();
  return { walkers:g.walkers.length, druids,
    cultures: dwe.map(d=>d.culture), standing: st };
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
        try: pg.click('#fest-continue', timeout=500)
        except Exception: pass
        samples.append(pg.evaluate(SUMMARY))
    try: pg.click('#fest-continue', timeout=500)
    except Exception: pass
    for _ in range(6):
        try: pg.click('#zoom-in', timeout=500)
        except Exception: pass
        pg.wait_for_timeout(50)
    pg.wait_for_timeout(500)
    pg.screenshot(path='/home/user/ard-ri/tools/culture.png')
    b.close()
for i,s in enumerate(samples): print(i, json.dumps(s))
print('errors:', errs[:5])
