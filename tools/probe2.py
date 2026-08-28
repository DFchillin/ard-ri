import glob
from playwright.sync_api import sync_playwright
exe = (glob.glob('/opt/pw-browsers/chromium-*/chrome-linux/chrome')+glob.glob('/opt/pw-browsers/chromium/**/chrome',recursive=True))[0]
rows=[]
with sync_playwright() as pw:
    b=pw.chromium.launch(executable_path=exe,args=['--use-gl=swiftshader','--no-sandbox'])
    pg=b.new_page()
    pg.on('response', lambda r: rows.append((r.status,r.url)))
    pg.goto('http://localhost:8199/index.html',wait_until='domcontentloaded',timeout=20000)
    pg.wait_for_timeout(3500)
    b.close()
for s,u in rows:
    if s>=400 and 'googleapis' not in u and 'gstatic' not in u:
        print(s,u)
