import glob
from playwright.sync_api import sync_playwright
exe = (glob.glob('/opt/pw-browsers/chromium-*/chrome-linux/chrome')+glob.glob('/opt/pw-browsers/chromium/**/chrome',recursive=True))[0]
with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path=exe, args=['--use-gl=swiftshader','--no-sandbox'])
    pg = b.new_page(); pg.set_viewport_size({'width':390,'height':844})
    pg.goto('http://localhost:8199/index.html', wait_until='domcontentloaded', timeout=20000)
    pg.wait_for_timeout(2200)
    pg.click('.mission-btn:not(.locked)', timeout=3000); pg.wait_for_timeout(300)
    try: pg.click('#fest-continue', timeout=2000)
    except Exception: pass
    pg.evaluate("""() => {
      const {game, map} = window.ardri;
      for (let z=14;z<=18;z++) for (let x=14;x<=18;x++){ const t=map.get(x,z); if(t){t.terrain=0;t.road=false;t.occupant=null;} }
      game.silver=9999; game.place('roundhouse',{x:15,z:15,w:2,h:2}); game.buildings[0].pop=3;
    }""")
    for _ in range(3): pg.click('#zoom-in'); pg.wait_for_timeout(50)
    pg.click('#build-toggle'); pg.wait_for_timeout(120)
    pg.click('#demolish-tool'); pg.wait_for_timeout(120)
    pt = pg.evaluate("() => window.ardri.screenOf(16,16)")
    pg.mouse.click(pt['x'], pt['y']); pg.wait_for_timeout(200)
    pg.screenshot(path='/home/user/ard-ri/tools/demolish.png')
    pg.click('#brightness-btn'); pg.wait_for_timeout(150)
    pg.screenshot(path='/home/user/ard-ri/tools/bright.png')
    b.close()
print('ok')
