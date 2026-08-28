import glob, sys
from playwright.sync_api import sync_playwright
exe = (glob.glob('/opt/pw-browsers/chromium-*/chrome-linux/chrome')+glob.glob('/opt/pw-browsers/chromium/**/chrome',recursive=True))[0]
out = sys.argv[1] if len(sys.argv) > 1 else 'tools/field.png'
ripe = (sys.argv[2] == 'ripe') if len(sys.argv) > 2 else False

SETUP = """(ripe) => {
  const {game, map, view, sim} = window.ardri;
  game.silver = 99999;
  for (let z=10;z<=22;z++) for (let x=10;x<=22;x++){ const t=map.get(x,z); if(t){ t.terrain=0; t.road=false; t.occupant=null; } }
  // roads boxing a 3x2 field at 14,14..16,15
  for (let x=13;x<=17;x++){ map.setRoad(x,13,true); map.setRoad(x,16,true); }
  for (let z=13;z<=16;z++){ map.setRoad(13,z,true); map.setRoad(17,z,true); }
  view.rebuildRoads();
  game.place('field',{x:14,z:14,w:3,h:2});
  const f = game.buildings.find(b=>b.def.role==='farm');
  if (ripe){ f.ripe=true; f.grown=24; }
  game.tick();
  sim.speed = 0;
  return !!f;
}"""

with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path=exe, args=['--use-gl=swiftshader','--no-sandbox'])
    pg = b.new_page()
    pg.goto('http://localhost:8199/index.html', wait_until='domcontentloaded', timeout=20000)
    pg.wait_for_timeout(2200)
    pg.click('.mission-btn:not(.locked)', timeout=3000); pg.wait_for_timeout(300)
    try: pg.click('#fest-continue', timeout=2000)
    except Exception: pass
    ok = pg.evaluate(SETUP, ripe)
    for _ in range(7): pg.click('#zoom-in'); pg.wait_for_timeout(60)
    pg.wait_for_timeout(600)
    pg.screenshot(path='/home/user/ard-ri/' + out)
    b.close()
print('field placed:', ok)
