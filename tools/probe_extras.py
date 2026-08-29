import glob, json
from playwright.sync_api import sync_playwright
exe = (glob.glob('/opt/pw-browsers/chromium-*/chrome-linux/chrome')+glob.glob('/opt/pw-browsers/chromium/**/chrome',recursive=True))[0]

TOWN = """() => {
  const {game, map, view, sim} = window.ardri;
  game.silver = 99999;
  const P = (k,x,z,w,h) => game.place(k,{x,z,w,h});
  for (let z=12;z<=20;z++) for (let x=4;x<=26;x++){ const t=map.get(x,z); if(t){ t.terrain=0; t.road=false; t.occupant=null; t.blocked=false; } }
  for (let x=4;x<=26;x++) map.setRoad(x,16,true);
  view.rebuildRoads();
  P('altar',8,15,1,1);
  P('roundhouse',10,14,2,2);   // near the shrine
  P('roundhouse',22,14,2,2);   // far side, beyond the Cros
  game.folk = 8;
  for (const b of game.buildings) if (b.def.role==='dwelling'){ b.pop=4; b.food=10; b.water=10; }
  game.toggleCros(15,16); view.rebuildCros();   // wall the road at x=15
  sim.speed = 3;
  return { cros: view.crosGroup.children.length };
}"""

SUMMARY = """() => {
  const g = window.ardri.game;
  const dwe = g.buildings.filter(b=>b.def.role==='dwelling');
  const near = dwe.find(b=>b.x===10), far = dwe.find(b=>b.x===22);
  return { druids: g.walkers.filter(w=>w.sprite?.userData?.type==='druid').length,
    nearCulture: near?near.culture:null, farCulture: far?far.culture:null };
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
    print('setup', json.dumps(pg.evaluate(TOWN)))
    samples=[]
    for _ in range(6):
        pg.wait_for_timeout(4000)
        try: pg.click('#fest-continue', timeout=400)
        except Exception: pass
        samples.append(pg.evaluate(SUMMARY))
    for i,s in enumerate(samples): print(i, json.dumps(s))

    # Brightness: move the slider and confirm the canvas filter follows.
    bright = pg.evaluate("""() => {
      const s = document.getElementById('brightness');
      s.value = 1.5; s.dispatchEvent(new Event('input', {bubbles:true}));
      return { filter: document.getElementById('world').style.filter,
               stored: localStorage.getItem('ardri_brightness') };
    }""")
    print('brightness', json.dumps(bright))

    # Advisors panel
    try: pg.click('#fest-continue', timeout=400)
    except Exception: pass
    pg.click('#advisors-fab', timeout=2000); pg.wait_for_timeout(300)
    adv = pg.evaluate("() => { const p=document.getElementById('inspect-popup'); return { open: !p.classList.contains('hidden'), text: document.getElementById('inspect-body').innerText.slice(0,400) }; }")
    print('advisors_open', adv['open'])
    print('advisors_text:\\n' + adv['text'])
    pg.screenshot(path='/home/user/ard-ri/tools/extras.png')
    b.close()
print('errors:', errs[:6])
