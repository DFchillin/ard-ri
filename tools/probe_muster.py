import glob, json
from playwright.sync_api import sync_playwright
exe = (glob.glob('/opt/pw-browsers/chromium-*/chrome-linux/chrome')+glob.glob('/opt/pw-browsers/chromium/**/chrome',recursive=True))[0]
with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path=exe, args=['--use-gl=swiftshader','--no-sandbox'])
    pg=b.new_page(); pg.set_viewport_size({'width':940,'height':620})
    errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8199/index.html', wait_until='domcontentloaded', timeout=20000)
    pg.wait_for_timeout(2400)
    pg.click('.mission-btn[data-mission="3"]', timeout=3000); pg.wait_for_timeout(900)
    print('muster shown:', pg.evaluate("() => ({ phase:window.ardri.battle.phase, sidebar:!document.getElementById('battle-sidebar').classList.contains('hidden'), roster:document.querySelectorAll('#bs-roster .bs-unit').length })"))

    def place(indices, sx, sz):
        for i in indices:
            pg.eval_on_selector_all('#bs-roster .bs-unit', f"(els)=>els[{i}].click()")
            pg.wait_for_timeout(40)
        pg.click('#bs-place'); pg.wait_for_timeout(60)
        pt = pg.evaluate("(p) => window.ardri.battle._screen({x:p[0],z:p[1]})", [sx, sz])
        pg.mouse.click(pt['x'], pt['y']); pg.wait_for_timeout(120)

    place([0,0,0,5,5,6], -4.0, 0.0)   # villagers + seasoned + curadh, west (in front of ráth)
    place([1,2,3,4], 4.0, 0.0)        # water/grain/deaglan/druid, east
    place([7], 0.0, 1.0)              # a lone hero (Cú Chulainn)
    st = pg.evaluate("""() => { const B=window.ardri.battle; return {
      companies:B.companies.filter(c=>c.team==='player').length,
      units:B.units.filter(u=>u.team==='player').length,
      flags:B.companies.filter(c=>c.team==='player'&&c.flag).length,
      poolVillager:B.pool.villager, poolCuchulainn:B.pool.cuchulainn,
      names:B.companies.filter(c=>c.team==='player').map(c=>c.name?c.name[0]:'lone') }; }""")
    print('mustered:', json.dumps(st))
    pg.screenshot(path='/home/user/ard-ri/tools/muster1.png')
    # camera: zoom in twice via button
    pg.click('#zoom-in'); pg.click('#zoom-in'); pg.wait_for_timeout(80)
    pg.click('#bs-give-battle'); pg.wait_for_timeout(300)
    print('battle started:', pg.evaluate("() => ({ phase:window.ardri.battle.phase, started:window.ardri.battle.started })"))
    pg.wait_for_timeout(3000)
    sel = pg.evaluate("""() => { const B=window.ardri.battle; const c=B.companies.find(x=>x.team==='player'); const p=B._companyPos(c); return B._screen(p); }""")
    pg.mouse.click(sel['x'], sel['y']); pg.wait_for_timeout(150)
    cmd = pg.evaluate("() => ({ muster:!document.getElementById('bs-muster').classList.contains('hidden'), command:!document.getElementById('bs-command').classList.contains('hidden'), info:document.getElementById('bs-sel-info').innerText })")
    print('command panel:', json.dumps(cmd))
    pg.screenshot(path='/home/user/ard-ri/tools/muster_mid.png')
    outcome=None
    for i in range(80):
        pg.wait_for_timeout(1000)
        s = pg.evaluate("""() => { const B=window.ardri.battle; return {
          f:B._liveCompanies('player').length, e:B._liveCompanies('enemy').length,
          fest:!document.getElementById('festival-overlay').classList.contains('hidden'),
          defeat:(document.getElementById('bs-sel-info').innerText||'').includes('Try again') }; }""")
        if s['fest'] or s['defeat'] or s['e']==0 or s['f']==0: outcome=s; break
    print('outcome after',i+1,'s:', json.dumps(outcome))
    pg.screenshot(path='/home/user/ard-ri/tools/muster2.png')
    print('errors:', [e for e in errs if 'font' not in e.lower()][:8])
    b.close()
