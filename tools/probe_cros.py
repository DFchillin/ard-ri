import glob
from playwright.sync_api import sync_playwright
exe = (glob.glob('/opt/pw-browsers/chromium-*/chrome-linux/chrome')+glob.glob('/opt/pw-browsers/chromium/**/chrome',recursive=True))[0]
SETUP = """() => {
  const {game, map, view, sim} = window.ardri;
  for (let z=12;z<=20;z++) for (let x=10;x<=22;x++){ const t=map.get(x,z); if(t){ t.terrain=0; t.road=false; t.occupant=null; t.blocked=false; } }
  for (let x=12;x<=20;x++) map.setRoad(x,16,true);
  for (let z=13;z<=19;z++) map.setRoad(16,z,true);
  view.rebuildRoads();
  game.toggleCros(16,16); game.toggleCros(18,16); view.rebuildCros();
  sim.speed = 0;
}"""
with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path=exe, args=['--use-gl=swiftshader','--no-sandbox'])
    pg = b.new_page()
    pg.goto('http://localhost:8199/index.html', wait_until='domcontentloaded', timeout=20000)
    pg.wait_for_timeout(2200)
    pg.click('.mission-btn:not(.locked)', timeout=3000); pg.wait_for_timeout(300)
    try: pg.click('#fest-continue', timeout=2000)
    except Exception: pass
    pg.evaluate(SETUP)
    for _ in range(7): pg.click('#zoom-in'); pg.wait_for_timeout(50)
    pg.wait_for_timeout(500)
    pg.screenshot(path='/home/user/ard-ri/tools/cros.png')
    b.close()
print('ok')
