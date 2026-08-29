import glob, json
from playwright.sync_api import sync_playwright
exe = (glob.glob('/opt/pw-browsers/chromium-*/chrome-linux/chrome')+glob.glob('/opt/pw-browsers/chromium/**/chrome',recursive=True))[0]

with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path=exe, args=['--use-gl=swiftshader','--no-sandbox'])
    pg = b.new_page()
    pg.set_viewport_size({'width': 390, 'height': 844})  # mobile, so the FABs show
    errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8199/index.html', wait_until='domcontentloaded', timeout=20000)
    pg.wait_for_timeout(2200)
    pg.click('.mission-btn:not(.locked)', timeout=3000); pg.wait_for_timeout(300)
    try: pg.click('#fest-continue', timeout=2000)
    except Exception: pass

    # Brightness modal
    pg.click('#brightness-btn'); pg.wait_for_timeout(150)
    m1 = pg.evaluate("() => !document.getElementById('brightness-modal').classList.contains('hidden')")
    pg.evaluate("() => { const s=document.getElementById('brightness'); s.value=1.4; s.dispatchEvent(new Event('input',{bubbles:true})); }")
    filt = pg.evaluate("() => document.getElementById('world').style.filter")
    pg.click('#brightness-done'); pg.wait_for_timeout(100)
    m2 = pg.evaluate("() => document.getElementById('brightness-modal').classList.contains('hidden')")
    print('brightness: opened', m1, '| filter', filt, '| closed', m2)

    # Auto-select first item when switching category tab (open the build drawer first)
    pg.click('#build-toggle'); pg.wait_for_timeout(150)
    tabs = pg.eval_on_selector_all('#build-tabs .tab-btn', "els => els.length")
    picks = []
    for i in range(tabs):
        pg.eval_on_selector_all('#build-tabs .tab-btn', f"(els)=>els[{i}].click()")
        pg.wait_for_timeout(120)
        active = pg.evaluate("() => { const b=document.querySelector('#build-list .build-btn.active'); return b?b.dataset.key:null; }")
        picks.append(active)
    print('auto-select per tab:', picks)

    # Demolish confirm: place a dwelling, demolish-tap it, check the confirm bar, then raze.
    setup = pg.evaluate("""() => {
      const {game, map} = window.ardri;
      for (let z=14;z<=18;z++) for (let x=14;x<=18;x++){ const t=map.get(x,z); if(t){t.terrain=0;t.road=false;t.occupant=null;} }
      game.silver=9999; game.place('roundhouse',{x:15,z:15,w:2,h:2});
      return game.buildings.length;
    }""")
    pg.click('#demolish-tool'); pg.wait_for_timeout(120)
    pt = pg.evaluate("() => window.ardri.screenOf(16,16)")  # centre of the 2x2 at 15,15
    pg.mouse.click(pt['x'], pt['y']); pg.wait_for_timeout(150)
    bar = pg.evaluate("""() => {
      const pc=document.getElementById('place-confirm');
      return { open: !pc.classList.contains('hidden'), btn: document.getElementById('place-do').textContent,
               label: document.getElementById('place-label').textContent,
               previewRed: !!window.ardri.game };
    }""")
    print('demolish confirm bar:', json.dumps(bar))
    pg.click('#place-do'); pg.wait_for_timeout(150)
    after = pg.evaluate("() => window.ardri.game.buildings.length")
    print('buildings before/after raze:', setup, '->', after)

    print('errors:', errs[:6])
    b.close()
