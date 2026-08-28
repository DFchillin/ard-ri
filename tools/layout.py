import glob, sys
from playwright.sync_api import sync_playwright
exe = (glob.glob('/opt/pw-browsers/chromium-*/chrome-linux/chrome')+glob.glob('/opt/pw-browsers/chromium/**/chrome',recursive=True))[0]
out = sys.argv[1] if len(sys.argv) > 1 else 'tools/layout.png'
zooms = int(sys.argv[2]) if len(sys.argv) > 2 else 6

SETUP = """() => {
  const {game, map, view, sim} = window.ardri;
  game.silver = 99999;
  const P = (k,x,z,w,h) => game.place(k,{x,z,w,h});
  for (let x=10;x<=22;x++) map.setRoad(x,16,true);
  for (let z=10;z<=22;z++) map.setRoad(16,z,true);
  view.rebuildRoads();
  P('roundhouse',12,14,2,2);
  P('roundhouse',18,14,2,2);
  P('market',17,17,2,2);
  P('field',10,17,3,2);
  P('well',15,17,1,1);
  game.folk = 30;
  for (const b of game.buildings){ if (b.def.role==='dwelling') b.pop=4; b.active=false; }
  game.tick();
  sim.speed = 0;
  return game.buildings.length;
}"""

with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path=exe, args=['--use-gl=swiftshader','--no-sandbox'])
    pg = b.new_page()
    errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8199/index.html', wait_until='domcontentloaded', timeout=20000)
    pg.wait_for_timeout(2200)
    pg.click('.mission-btn:not(.locked)', timeout=3000)
    pg.wait_for_timeout(400)
    try: pg.click('#fest-continue', timeout=2000)
    except Exception: pass
    n = pg.evaluate(SETUP)
    for _ in range(zooms):
        pg.click('#zoom-in'); pg.wait_for_timeout(80)
    pg.wait_for_timeout(1000)
    pg.screenshot(path='/home/user/ard-ri/' + out)
    b.close()
print('placed', n, 'buildings; errors:', errs)
