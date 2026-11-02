#!/usr/bin/env python3
"""Build the public review kit.

  python3 tools/make_preview.py --after tests/out/preview_after --before tests/out/preview_before \
      --hits tests/out --logs tests/out

Writes:
  public/preview/index.html, report.json, report.md, shots/*.webp   (served at /preview/ on Netlify)
  docs/preview/README.md, report.json, shots/*.webp                 (GitHub fallback)
"""
import argparse, json, os, re, shutil, glob, datetime, subprocess
from PIL import Image, ImageChops, ImageStat, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ap = argparse.ArgumentParser()
ap.add_argument('--after', required=True)
ap.add_argument('--before')
ap.add_argument('--hits', default='tests/out')
ap.add_argument('--logs', default='tests/out')
args = ap.parse_args()

PUB = os.path.join(ROOT, 'public', 'preview')
DOC = os.path.join(ROOT, 'docs', 'preview')
for d in (PUB, DOC):
    shutil.rmtree(d, ignore_errors=True)
    os.makedirs(os.path.join(d, 'shots'), exist_ok=True)

def sh(c):
    try: return subprocess.check_output(c, shell=True, cwd=ROOT, stderr=subprocess.DEVNULL).decode().strip()
    except Exception: return ''

commit, branch = sh('git rev-parse HEAD'), sh('git rev-parse --abbrev-ref HEAD')
version = json.load(open(os.path.join(ROOT, 'package.json')))['version']

def save(img, name):
    img = img.convert('RGB')
    if img.width > 1280: img = img.resize((1280, int(img.height * 1280 / img.width)), Image.LANCZOS)
    for d in (PUB, DOC):
        img.save(os.path.join(d, 'shots', name), 'WEBP', quality=82, method=5)
    return f'shots/{name}'

def label(img, text):
    d = ImageDraw.Draw(img)
    try: f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 22)
    except Exception: f = ImageFont.load_default()
    d.rectangle([0, 0, img.width, 34], fill=(0, 0, 0))
    d.text((10, 5), text, fill=(255, 210, 120), font=f)
    return img

after = json.load(open(os.path.join(args.after, 'capture.json')))
before = json.load(open(os.path.join(args.before, 'capture.json'))) if args.before and os.path.exists(os.path.join(args.before, 'capture.json')) else None
before_views = {v['name']: v for v in (before or {}).get('views', []) if 'file' in v}

HIT_NAMES = {'hit_flinch', 'hit_repeated', 'death_fall_1', 'death_fall_2', 'death_fall_3', 'knockout', 'knockout_recover'}
sections = []
compare = []
for v in after['views']:
    if 'file' not in v or v['name'] in HIT_NAMES: continue
    img = Image.open(os.path.join(args.after, v['file']))
    item = {'name': v['name'], 'title': v['title'], 'src': save(img, f"{v['name']}.webp"), 'overlay': v.get('overlay', '')}
    if v['name'] in before_views:
        b = Image.open(os.path.join(args.before, before_views[v['name']]['file'])).convert('RGB').resize(img.size)
        a = img.convert('RGB')
        diff = ImageStat.Stat(ImageChops.difference(a, b)).mean
        change = round(sum(diff) / 3 / 255 * 100, 1)
        side = Image.new('RGB', (a.width * 2, a.height))
        side.paste(label(b.copy(), 'BEFORE  v0.1 (main)'), (0, 0)); side.paste(label(a.copy(), f'AFTER  v{version} ({branch})'), (a.width, 0))
        item['compare'] = save(side, f"{v['name']}_compare.webp")
        item['change_pct'] = change
        compare.append({'view': v['name'], 'mean_pixel_change_pct': change})
    sections.append(item)

# hit-reaction frames (captured in-sequence by capture_preview.py, else from tests/hits.py)
hit_frames = []
for v in after['views']:
    if v.get('name') in HIT_NAMES and 'file' in v:
        hit_frames.append({'name': v['name'], 'title': v['title'], 'src': save(Image.open(os.path.join(args.after, v['file'])), f"{v['name']}.webp")})
for name, title in [('hit_seq_1', 'Repeated hits: flinch (no restart)'), ('hit_seq_2', 'Repeated hits: stagger + reaction'), ('hit_wounded', 'Wounded: clutching / limp'),
                    ('death_seq_1', 'Fatal hits: fall begins (one cross-faded fall)'), ('death_seq_2', 'Falling away from the shooter'), ('death_seq_3', 'Body at rest (held still)'),
                    ('knockdown_1', 'Knocked out: stays down'), ('knockdown_2', 'Recovered after the knock-out ends')]:
    f = os.path.join(args.hits, f'{name}.png')
    if os.path.exists(f) and not any(h['name'].startswith(('hit_', 'death_', 'knock')) for h in hit_frames): hit_frames.append({'name': name, 'title': title, 'src': save(Image.open(f), f'{name}.webp')})

# test results from logs
tests = []
for log, title in [('smoke_log.txt', 'Case 9-114 regression (smoke.py)'), ('touch_log.txt', 'Touch controls, emulated iPhone (touch.py)'),
                   ('combat_log.txt', 'Combat (combat.py)'), ('hits_log.txt', 'Hit reactions (hits.py)'),
                   ('street_log.txt', 'Case 9-201 street crime (street.py)'),
                   ('live_street.txt', 'LIVE dev site: Case 9-201 (street.py)'), ('live_smoke.txt', 'LIVE dev site: Case 9-114 (smoke.py)'),
                   ('live_touch.txt', 'LIVE dev site: touch (touch.py)')]:
    p = os.path.join(args.logs, log)
    if not os.path.exists(p): continue
    txt = open(p, errors='replace').read()
    passed = len(re.findall(r'^PASS ', txt, re.M)); failed = re.findall(r'^FAIL (.*)$', txt, re.M)
    m = re.search(r'EXIT (\d+)', txt)
    tests.append({'suite': title, 'passed': passed, 'failed': len(failed), 'failures': failed[:5], 'exit': int(m.group(1)) if m else None,
                  'details': [l[5:] for l in re.findall(r'^(?:PASS|FAIL) .*$', txt, re.M)]})

perf = [{'view': v['name'], 'overlay': v.get('overlay', '').replace('\n', ' | ')} for v in after['views'] if v.get('overlay')]
report = {
    'version': version, 'commit': commit, 'branch': branch, 'generated': datetime.datetime.utcnow().isoformat() + 'Z',
    'preview_url': 'https://detective-rpg-dev.netlify.app', 'stable_url': 'https://detective-rpg-case-files.netlify.app',
    'testing_environment': 'Headless Chrome on a 2-core Linux container with SwiftShader (CPU) WebGL 2. Touch tests use iPhone emulation. NOT real iPhone hardware.',
    'performance_note': 'FPS below is software-rendered on a CPU and is NOT representative of a phone GPU. Real-device numbers must come from the in-game overlay on an iPhone.',
    'tests': tests, 'screenshot_change_vs_v0_1': compare, 'perf_software_render': perf, 'load_seconds_software': after.get('load_seconds'),
    'health': after.get('health'), 'capture_errors': after.get('errors', []),
}
for d in (PUB, DOC):
    json.dump(report, open(os.path.join(d, 'report.json'), 'w'), indent=1)

# ---- markdown (GitHub fallback) ----
md = [f'# Case Files — build review kit', '',
      f'- **Version:** {version}  ·  **Branch:** `{branch}`  ·  **Commit:** [`{commit[:7]}`](https://github.com/fullmeltedalchemist/Detective-rpg/commit/{commit})',
      f'- **Dev preview (playable):** https://detective-rpg-dev.netlify.app  ·  **Stable v0.1:** https://detective-rpg-case-files.netlify.app',
      f'- **Testing environment:** {report["testing_environment"]}', '', '## Automated tests', '']
for t in tests:
    md.append(f'- **{t["suite"]}** — {t["passed"]} passed, {t["failed"]} failed' + (f' (failures: {"; ".join(t["failures"])})' if t['failures'] else ''))
md += ['', '## Screenshots (current build)', '']
for s in sections:
    md += [f'### {s["title"]}', f'![{s["name"]}]({s["src"]})', '']
    if s.get('compare'):
        md += [f'Before (v0.1) vs after — mean pixel change {s["change_pct"]}%', f'![{s["name"]} compare]({s["compare"]})', '']
if hit_frames:
    md += ['## Hit reactions (frames captured by tests/hits.py)', '']
    for h in hit_frames: md += [f'**{h["title"]}**', f'![{h["name"]}]({h["src"]})', '']
md += ['## Performance (software rendering — not phone numbers)', '', report['performance_note'], '']
for p_ in perf: md.append(f'- `{p_["view"]}`: {p_["overlay"]}')
open(os.path.join(DOC, 'README.md'), 'w').write('\n'.join(md) + '\n')
open(os.path.join(PUB, 'report.md'), 'w').write('\n'.join(md) + '\n')

# ---- HTML (served at /preview/) ----
def esc(s): return (s or '').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
cards = '\n'.join(f'''<figure><img src="{s["src"]}" alt="{esc(s["title"])}" loading="lazy"><figcaption>{esc(s["title"])}</figcaption>
{f'<details><summary>Before / after (v0.1 → now, {s["change_pct"]}% pixel change)</summary><img src="{s["compare"]}" alt="comparison" loading="lazy"></details>' if s.get("compare") else ''}</figure>''' for s in sections)
hits_html = '\n'.join(f'<figure><img src="{h["src"]}" alt="{esc(h["title"])}" loading="lazy"><figcaption>{esc(h["title"])}</figcaption></figure>' for h in hit_frames)
tests_html = '\n'.join(f'<tr><td>{esc(t["suite"])}</td><td class="ok">{t["passed"]}</td><td class="{"bad" if t["failed"] else "ok"}">{t["failed"]}</td><td>{esc("; ".join(t["failures"]))}</td></tr>' for t in tests)
perf_html = '\n'.join(f'<tr><td>{esc(p_["view"])}</td><td><code>{esc(p_["overlay"])}</code></td></tr>' for p_ in perf)
html = f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Case Files build preview</title>
<style>
:root{{--bg:#0f1115;--fg:#e9ecef;--mut:#9aa3ad;--card:#171a20;--line:#2a2f37;--acc:#e8b44c;--ok:#5cc58a;--bad:#e0564a}}
@media (prefers-color-scheme: light){{:root:not([data-theme="dark"]){{--bg:#f6f5f2;--fg:#15181d;--mut:#5b636d;--card:#fff;--line:#e2e0da;--acc:#9a6b10;--ok:#1f8a4c;--bad:#b3342a}}}}
body{{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}}
main{{max-width:1200px;margin:0 auto;padding:24px 16px 60px}}
h1{{font-size:26px;margin:0 0 4px}} h2{{margin:34px 0 10px;font-size:19px;border-bottom:1px solid var(--line);padding-bottom:6px}}
.meta{{color:var(--mut);font-size:14px}} a{{color:var(--acc)}}
.grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:14px}}
figure{{margin:0;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden}}
figure img{{width:100%;display:block}} figcaption{{padding:8px 10px;font-size:14px}}
details{{padding:0 10px 10px;font-size:13px;color:var(--mut)}} details img{{margin-top:6px;border-radius:6px}}
table{{border-collapse:collapse;width:100%;font-size:14px;background:var(--card)}} td,th{{border:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}}
.ok{{color:var(--ok);font-weight:600}} .bad{{color:var(--bad);font-weight:600}}
.note{{background:var(--card);border-left:3px solid var(--acc);padding:10px 12px;border-radius:6px;font-size:14px}}
code{{font-size:12px}}
</style></head><body><main>
<h1>Case Files — build preview</h1>
<p class="meta">v{version} · branch <code>{esc(branch)}</code> · commit <a href="https://github.com/fullmeltedalchemist/Detective-rpg/commit/{commit}"><code>{commit[:7]}</code></a> · generated {report["generated"][:16].replace("T"," ")} UTC</p>
<p><a href="../">▶ Play this build</a> · <a href="../health.json">health.json</a> · <a href="report.json">report.json</a> · <a href="report.md">report.md</a> · stable v0.1: <a href="https://detective-rpg-case-files.netlify.app">detective-rpg-case-files.netlify.app</a></p>
<p class="note"><b>How these were made:</b> {esc(report["testing_environment"])} Screenshots are real frames from this build, rendered on a CPU; real phones render the same scene on the GPU.</p>
<h2>Automated tests</h2><table><tr><th>Suite</th><th>Passed</th><th>Failed</th><th>Failures</th></tr>{tests_html}</table>
<h2>Screenshots</h2><div class="grid">{cards}</div>
<h2>Hit reactions</h2><div class="grid">{hits_html or '<p class="meta">Not captured in this run.</p>'}</div>
<h2>Performance</h2><p class="note">{esc(report["performance_note"])}</p><table><tr><th>View</th><th>In-game overlay (software render)</th></tr>{perf_html}</table>
</main></body></html>'''
open(os.path.join(PUB, 'index.html'), 'w').write(html)
print('preview written:', len(sections), 'views,', len(hit_frames), 'hit frames,', len(tests), 'test suites,', len(compare), 'comparisons')
