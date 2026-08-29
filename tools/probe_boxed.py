import glob, json
from playwright.sync_api import sync_playwright
exe = (glob.glob('/opt/pw-browsers/chromium-*/chrome-linux/chrome')+glob.glob('/opt/pw-browsers/chromium/**/chrome',recursive=True))[0]
TOWN = """() => {
  const {game, map, view, sim} = window.ardri;
  game.silver=99999;
  for (let z=12;z<=20;z++) for (let x=4;x<=16;x++){ const t=map.get(x,z); if(t){t.terrain=0;t.road=false;t.occupant=null;t.blocked=false;} }
  for (let x=8;x<=12;x++) map.setRoad(x,16,true);   // short corridor
  view.rebuildRoads();
  game.place('altar',{x:8,z:15,w:1,h:1});           // entry road tile = (8,16)
  game.place('roundhouse',{x:11,z:14,w:2,h:2});     // only reachable across the Cros
  game.folk=6; for (const b of game.buildings) if (b.def.role==='dwelling'){ b.pop=4; b.food=10; b.water=10; }
  game.toggleCros(9,16); view.rebuildCros();         // Cros is the ONLY way out of (8,16)
  sim.speed=3;
  return view.crosGroup.children.length;
}"""
SUMMARY = "() => { const g=window.ardri.game; const d=g.buildings.find(b=>b.def.role==='dwelling'); return d?d.culture:null; }"
with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path=exe, args=['--use-gl=swiftshader','--no-sandbox'])
    pg=b.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8199/index.html', wait_until='domcontentloaded', timeout=20000)
    pg.wait_for_timeout(2200)
    pg.click('.mission-btn:not(.locked)', timeout=3000); pg.wait_for_timeout(300)
    try: pg.click('#fest-continue', timeout=2000)
    except Exception: pass
    print('cros', pg.evaluate(TOWN))
    seen=[]
    for _ in range(6):
        pg.wait_for_timeout(3500)
        try: pg.click('#fest-continue', timeout=400)
        except Exception: pass
        seen.append(pg.evaluate(SUMMARY))
    print('boxed dwelling culture over time:', seen, '(should rise — walker crosses when walled in)')
    print('errors:', errs[:4])
    b.close()
