import glob, sys
from playwright.sync_api import sync_playwright
exe = (glob.glob('/opt/pw-browsers/chromium-*/chrome-linux/chrome')+glob.glob('/opt/pw-browsers/chromium/**/chrome',recursive=True))[0]
out = sys.argv[1] if len(sys.argv) > 1 else 'tools/walkers_live.png'

TOWN = """() => {
  const {game, map, view, sim} = window.ardri;
  game.silver = 99999;
  const P = (k,x,z,w,h) => game.place(k,{x,z,w,h});
  for (let x=8;x<=24;x++){ map.setRoad(x,16,true); }
  for (let z=10;z<=22;z++){ map.setRoad(16,z,true); }
  view.rebuildRoads();
  P('roundhouse',12,14,2,2); P('roundhouse',18,14,2,2);
  P('roundhouse',12,18,2,2); P('roundhouse',18,18,2,2);
  P('field',8,13,3,2); P('granary',13,11,2,2); P('market',18,11,2,2); P('well',15,13,1,1);
  game.folk = 40;
  for (const b of game.buildings){ if (b.def.role==='dwelling'){ b.pop=4; b.food=8; b.water=8; } b.stock=8; }
  for (let i=0;i<12;i++) game.tick();
  sim.speed = 3;
  return game.walkers.length;
}"""

with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path=exe, args=['--use-gl=swiftshader','--no-sandbox'])
    pg = b.new_page()
    errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append('C:'+m.text) if m.type=='error' else None)
    pg.goto('http://localhost:8199/index.html', wait_until='domcontentloaded', timeout=20000)
    pg.wait_for_timeout(2200)
    pg.click('.mission-btn:not(.locked)', timeout=3000); pg.wait_for_timeout(300)
    try: pg.click('#fest-continue', timeout=2000)
    except Exception: pass
    n = pg.evaluate(TOWN)
    for _ in range(7): pg.click('#zoom-in'); pg.wait_for_timeout(60)
    pg.wait_for_timeout(1500)
    w2 = pg.evaluate("() => window.ardri.game.walkers.length")
    pg.screenshot(path='/home/user/ard-ri/' + out)
    b.close()
print('walkers spawned', n, 'now', w2, '| errors:', [e for e in errs if 'googleapis' not in e][:6])
