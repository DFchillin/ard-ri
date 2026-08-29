import glob, json
from playwright.sync_api import sync_playwright
exe = (glob.glob('/opt/pw-browsers/chromium-*/chrome-linux/chrome')+glob.glob('/opt/pw-browsers/chromium/**/chrome',recursive=True))[0]
with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path=exe, args=['--use-gl=swiftshader','--no-sandbox'])
    pg=b.new_page(); pg.set_viewport_size({'width':820,'height':560})
    errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append('console:'+m.text) if m.type=='error' else None)
    pg.goto('http://localhost:8199/index.html', wait_until='domcontentloaded', timeout=20000)
    pg.wait_for_timeout(2200)
    pg.click('.mission-btn[data-mission="2"]', timeout=3000); pg.wait_for_timeout(400)
    muster = pg.evaluate("() => ({ open: !document.getElementById('muster-overlay').classList.contains('hidden'), rows: document.querySelectorAll('.muster-row').length })")
    print('muster', json.dumps(muster))
    pg.screenshot(path='/home/user/ard-ri/tools/muster.png')
    # set a talisman on first row and start
    pg.evaluate("""() => { const s=document.querySelector('.muster-row .m-tal'); if(s){ s.value='dord'; s.dispatchEvent(new Event('change',{bubbles:true})); } }""")
    pg.click('#muster-go'); pg.wait_for_timeout(300)
    started = pg.evaluate("() => ({ hud: !document.getElementById('battle-hud').classList.contains('hidden'), started: window.ardri.battle.started })")
    print('started', json.dumps(started))
    pg.screenshot(path='/home/user/ard-ri/tools/battle1.png')
    # sound tactic: hold a shield-wall on the deploy line and let the enemy come
    pg.evaluate("""() => { const B=window.ardri.battle;
      for (const p of B.bands.filter(x=>x.team==='player')) { p.form='wall'; p.target=null; } }""")
    outcome=None
    for i in range(40):
        pg.wait_for_timeout(1000)
        st = pg.evaluate("""() => { const B=window.ardri.battle;
          return { active:B.active, started:B.started, f:B.bands.filter(x=>x.team==='player'&&!x.dead).length,
                   e:B.bands.filter(x=>x.team==='enemy'&&!x.dead).length,
                   fest: !document.getElementById('festival-overlay').classList.contains('hidden') }; }""")
        if st['fest'] or st['e']==0 or st['f']==0:
            outcome=st; break
    print('outcome after', i+1, 's:', json.dumps(outcome))
    pg.screenshot(path='/home/user/ard-ri/tools/battle2.png')
    print('errors:', errs[:8])
    b.close()
