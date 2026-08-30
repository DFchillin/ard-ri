import glob, json, sys
from playwright.sync_api import sync_playwright
exe = (glob.glob('/opt/pw-browsers/chromium-*/chrome-linux/chrome')+glob.glob('/opt/pw-browsers/chromium/**/chrome',recursive=True))[0]
mission = sys.argv[1] if len(sys.argv) > 1 else '3'
shot = 'battle_%s.png' % mission

def run(pw):
    b = pw.chromium.launch(executable_path=exe, args=['--use-gl=swiftshader','--no-sandbox'])
    pg=b.new_page(); pg.set_viewport_size({'width':900,'height':620})
    errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8199/index.html', wait_until='domcontentloaded', timeout=20000)
    pg.wait_for_timeout(2400)
    pg.click('.mission-btn[data-mission="%s"]' % mission, timeout=3000); pg.wait_for_timeout(900)
    init = pg.evaluate("""() => { const B=window.ardri.battle; return { scenario:B.scenario,
      pUnits:B.units.filter(u=>u.team==='player').length, eUnits:B.units.filter(u=>u.team==='enemy').length,
      pRath:B.buildings.filter(x=>x.team==='player').length, eRath:B.buildings.filter(x=>x.team==='enemy').length }; }""")
    print('init', json.dumps(init))
    pg.screenshot(path='/home/user/ard-ri/tools/'+shot)
    # For attack, push the host north; for defend, let the guard hold (no orders).
    if mission == '2':
        pg.evaluate("""() => { const B=window.ardri.battle; B.units.filter(u=>u.team==='player').forEach(u=>u.target={point:{x:0,z:-4}}); }""")
    outcome=None
    for i in range(50):
        pg.wait_for_timeout(1000)
        st = pg.evaluate("""() => { const B=window.ardri.battle; return {
          f:B.units.filter(u=>u.team==='player'&&!u.dead&&!u.routing).length,
          e:B.units.filter(u=>u.team==='enemy'&&!u.dead&&!u.routing).length,
          pRath:B.buildings.filter(x=>x.team==='player'&&!x.dead).length,
          rathHp:B.buildings.filter(x=>x.team==='player').map(x=>Math.round(x.hp)),
          fest:!document.getElementById('festival-overlay').classList.contains('hidden'),
          defeat:(document.getElementById('battle-sel-info').innerText||'').includes('Try again') }; }""")
        if st['fest'] or st['defeat'] or st['e']==0 or st['f']==0: outcome=st; break
    print('outcome after', i+1, 's:', json.dumps(outcome))
    pg.screenshot(path='/home/user/ard-ri/tools/'+shot.replace('.png','_end.png'))
    print('errors:', [e for e in errs if 'font' not in e.lower()][:6])
    b.close()

with sync_playwright() as pw:
    run(pw)
