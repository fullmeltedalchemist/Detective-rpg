"""Convert Rocketbox FBX avatars to raw GLB via three.js in headless Chrome.
Usage: python3 tools/fbx_convert/run.py <toolDir with node_modules/three> <rocketbox repo> <outDir> Name [Name...]
Names look like Professions/Business_Male_03 or Adults/Male_Adult_06.
"""
import sys, os, json, base64, shutil, threading, http.server, socketserver, functools
from playwright.sync_api import sync_playwright

tool, repo, out, names = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4:]
os.makedirs(out, exist_ok=True)
shutil.copy(os.path.join(os.path.dirname(__file__), 'convert.html'), os.path.join(tool, 'convert.html'))
# expose the avatar folders under the tool dir
link = os.path.join(tool, 'avatars')
if not os.path.exists(link):
    os.symlink(os.path.join(repo, 'Assets', 'Avatars'), link)

Handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=tool)
Handler.log_message = lambda *a: None
httpd = socketserver.TCPServer(('127.0.0.1', 0), Handler)
port = httpd.server_address[1]
threading.Thread(target=httpd.serve_forever, daemon=True).start()

summary = {}
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    page = b.new_page()
    page.set_default_timeout(300000)
    page.on('pageerror', lambda e: print('PAGEERROR', e))
    page.goto(f'http://127.0.0.1:{port}/convert.html')
    page.wait_for_function('window.ready === true')
    for n in names:
        base = n.split('/')[-1]
        url = f'avatars/{n}/Export/{base}.fbx'
        r = page.evaluate('(u) => window.convert(u)', url)
        open(os.path.join(out, f'{base}.raw.glb'), 'wb').write(base64.b64decode(r['b64']))
        summary[base] = r['info']
        i = r['info']
        print(f"{base}: {len(i['bones'])} bones, meshes {[(m['name'], m['verts'], m['mats']) for m in i['meshes']]}, bounds {[[round(v, 1) for v in x] for x in i['bounds']]}", flush=True)
    b.close()
json.dump(summary, open(os.path.join(out, 'summary.json'), 'w'), indent=1)
httpd.shutdown()
