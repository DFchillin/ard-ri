import glob, json, sys
from playwright.sync_api import sync_playwright
exe = (glob.glob('/opt/pw-browsers/chromium-*/chrome-linux/chrome')+glob.glob('/opt/pw-browsers/chromium/**/chrome',recursive=True))[0]

# strong muster crushes the modest enemy (they should offer surrender);
# weak muster is outmatched (they demand / it's even).
STRONG = [([5,5,5,6], -4.0, 0.0), ([5,6,7], 4.0, 0.0), ([8], 0.0, 1.0)]
WEAK = [([0,0], -3.0, 0.0), ([0,0], 3.0, 0.0)]

def run(pw, muster, action):
    b = pw.chromium.launch(executable_path=exe, args=['--use-gl=swiftshader','--no-sandbox'])
    pg=b.new_page(); pg.set_viewport_size({'width':940,'height':620})
    errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8199/index.html', wait_until='domcontentloaded', timeout=20000); pg.wait_for_timeout(2400)
    pg.click('.mission-btn[data-mission="3"]'); pg.wait_for_timeout(800)
    cattle0 = pg.evaluate("() => window.ardri.game.cattle")
    for idxs, sx, sz in muster:
        for i in idxs:
            pg.eval_on_selector_all('#bs-roster .bs-unit', f"(els)=>els[{i}].click()"); pg.wait_for_timeout(30)
        pg.click('#bs-place'); pg.wait_for_timeout(50)
        pt = pg.evaluate("(p) => window.ardri.battle._screen({x:p[0],z:p[1]})", [sx, sz])
        pg.mouse.click(pt['x'], pt['y']); pg.wait_for_timeout(100)
    pg.click('#bs-give-battle'); pg.wait_for_timeout(400)  # ride to parley
    par = pg.evaluate("""() => ({ phase:window.ardri.battle.phase,
      open:!document.getElementById('parley-overlay').classList.contains('hidden'),
      body:document.getElementById('parley-body').innerText.replace(/\\n+/g,' | '),
      btns:[...document.querySelectorAll('#parley-actions button')].map(b=>b.className) })""")
    print(f'[{action}] parley:', json.dumps(par))
    pg.screenshot(path=f'/home/user/ard-ri/tools/parley_{action}.png')
    sel = { 'accept':'.parley-yes', 'pay':'.parley-pay', 'fight':'.parley-fight' }[action]
    pg.click('#parley-actions ' + sel); pg.wait_for_timeout(400)
    res = pg.evaluate("""() => ({ phase:window.ardri.battle.phase, active:window.ardri.battle.active, started:window.ardri.battle.started,
      cattle:window.ardri.game.cattle, fest:!document.getElementById('festival-overlay').classList.contains('hidden'),
      festName:(document.getElementById('fest-name')||{}).textContent })""")
    print(f'[{action}] result:', json.dumps(res), 'cattle0=', cattle0)
    print(f'[{action}] errors:', [e for e in errs if 'font' not in e.lower()][:4])
    b.close()

with sync_playwright() as pw:
    run(pw, STRONG, 'accept')
    run(pw, WEAK, 'pay')
    run(pw, STRONG, 'fight')
