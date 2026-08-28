import glob, sys
from playwright.sync_api import sync_playwright

exe = None
for p in glob.glob('/opt/pw-browsers/chromium-*/chrome-linux/chrome') + glob.glob('/opt/pw-browsers/chromium/**/chrome', recursive=True):
    exe = p; break

msgs = []
with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path=exe, args=['--use-gl=swiftshader', '--no-sandbox'])
    pg = b.new_page()
    pg.on('console', lambda m: msgs.append('CONSOLE %s: %s' % (m.type, m.text)))
    pg.on('pageerror', lambda e: msgs.append('PAGEERROR: %s' % e))
    pg.on('response', lambda r: msgs.append('HTTP %d %s' % (r.status, r.url)) if r.status >= 400 else None)
    pg.goto('http://localhost:8199/index.html', wait_until='domcontentloaded', timeout=20000)
    pg.wait_for_timeout(2500)
    # click Mission One to start, then wait
    try:
        pg.click('.mission-btn:not(.locked)', timeout=2000)
        pg.wait_for_timeout(500)
        pg.click('#fest-continue', timeout=2000)
    except Exception as e:
        msgs.append('CLICK: %s' % e)
    pg.wait_for_timeout(1500)
    pg.screenshot(path='/home/user/ard-ri/tools/probe.png')
    b.close()

print('\n'.join(msgs) if msgs else 'no console/page errors')
