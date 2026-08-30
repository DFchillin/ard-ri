import glob, json
from playwright.sync_api import sync_playwright
exe = (glob.glob('/opt/pw-browsers/chromium-*/chrome-linux/chrome')+glob.glob('/opt/pw-browsers/chromium/**/chrome',recursive=True))[0]
with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path=exe, args=['--use-gl=swiftshader','--no-sandbox'])
    pg=b.new_page(); pg.set_viewport_size({'width':940,'height':620})
    errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8199/index.html', wait_until='domcontentloaded', timeout=20000); pg.wait_for_timeout(2400)
    pg.click('.mission-btn[data-mission="3"]'); pg.wait_for_timeout(800)
    ros0 = pg.evaluate("() => JSON.parse(JSON.stringify(window.ardri.battle.roster))")
    print('roster @ muster:', json.dumps(ros0))
    def place(idxs, sx, sz):
        for i in idxs:
            pg.eval_on_selector_all('#bs-roster .bs-unit', f"(els)=>els[{i}].click()"); pg.wait_for_timeout(30)
        pg.click('#bs-place'); pg.wait_for_timeout(50)
        pt=pg.evaluate("(p)=>window.ardri.battle._screen({x:p[0],z:p[1]})",[sx,sz]); pg.mouse.click(pt['x'],pt['y']); pg.wait_for_timeout(100)
    place([6,6,7,0,0], -4.0, 0.0)     # 2 seasoned, curadh, 2 villagers (should survive a quick win)
    place([8,9], 4.0, 0.0)            # Cú Chulainn + Fionn — overwhelming
    pg.click('#bs-give-battle'); pg.wait_for_timeout(400)   # ride to parley
    pg.click('#parley-actions .parley-fight'); pg.wait_for_timeout(300)  # give battle
    rosC = pg.evaluate("() => JSON.parse(JSON.stringify(window.ardri.battle.roster))")
    print('roster @ commence (folk marched out):', json.dumps(rosC))
    out=None
    for i in range(60):
        pg.wait_for_timeout(1000)
        s = pg.evaluate("""() => { const B=window.ardri.battle;
          const E=B.units.filter(u=>u.team==='enemy'&&!u.dead&&!u.company.routing);
          if(E.length){ for(const c of B.companies.filter(c=>c.team==='player'&&!c.routing)) c.target={foe:E[0]}; }
          return { started:B.started, fest:!document.getElementById('festival-overlay').classList.contains('hidden'),
            sub:(document.getElementById('fest-sub')||{}).textContent }; }""")
        if s['fest'] or not s['started']: out=s; break
    rosF = pg.evaluate("() => ({ roster:window.ardri.battle.roster, debt:window.ardri.battle.employeeDebt })")
    print('outcome @', i+1, 's:', json.dumps(out))
    print('roster @ return:', json.dumps(rosF))
    print('errors:', [e for e in errs if 'font' not in e.lower()][:5])
    b.close()
