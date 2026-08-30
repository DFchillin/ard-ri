import glob, json
from playwright.sync_api import sync_playwright
exe = (glob.glob('/opt/pw-browsers/chromium-*/chrome-linux/chrome')+glob.glob('/opt/pw-browsers/chromium/**/chrome',recursive=True))[0]
with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path=exe, args=['--use-gl=swiftshader','--no-sandbox'])
    pg=b.new_page(); pg.set_viewport_size({'width':900,'height':620})
    errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8199/index.html', wait_until='domcontentloaded', timeout=20000)
    pg.wait_for_timeout(2400)
    pg.click('.mission-btn[data-mission="2"]', timeout=3000); pg.wait_for_timeout(700)
    init = pg.evaluate("""() => { const B=window.ardri.battle; return {
      started:B.started, hud:!document.getElementById('battle-hud').classList.contains('hidden'),
      pUnits:B.units.filter(u=>u.team==='player').length, eUnits:B.units.filter(u=>u.team==='enemy').length,
      buildings:B.buildings.length }; }""")
    print('init', json.dumps(init))
    pg.screenshot(path='/home/user/ard-ri/tools/battle1.png')
    # advance whole player host to the ráth; they auto-engage foes and can raze buildings
    pg.evaluate("""() => { const B=window.ardri.battle; const P=B.units.filter(u=>u.team==='player'&&!u.dead);
      const rath = B.buildings[0];
      P.forEach((u,i)=>{ u.target = (i<2 && rath && !rath.dead) ? {foe:rath} : {point:{x:0,z:-6}}; }); }""")
    outcome=None; bhp=[]
    for i in range(45):
        pg.wait_for_timeout(1000)
        st = pg.evaluate("""() => { const B=window.ardri.battle; return {
          f:B.units.filter(u=>u.team==='player'&&!u.dead&&!u.routing).length,
          e:B.units.filter(u=>u.team==='enemy'&&!u.dead&&!u.routing).length,
          razed:B.buildings.filter(b=>b.dead).length, rathHp:Math.round(B.buildings[0].hp),
          fest:!document.getElementById('festival-overlay').classList.contains('hidden') }; }""")
        bhp.append(st['rathHp'])
        if st['fest'] or st['e']==0 or st['f']==0: outcome=st; break
    print('outcome after', i+1, 's:', json.dumps(outcome))
    print('rath[0] hp trend:', bhp[:12])
    pg.screenshot(path='/home/user/ard-ri/tools/battle2.png')
    print('errors:', [e for e in errs if 'font' not in e.lower()][:6])
    b.close()
