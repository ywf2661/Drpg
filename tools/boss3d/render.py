"""보스 그림 도구: tools/boss3d/<이름>.js 모형을 헤드리스 크롬으로 렌더해 게임 시트(src/assets/sprites/<이름>.png/.json)로 묶는다.
설계: docs/superpowers/specs/2026-11-24-boss3d-tool-design.md

    python tools/boss3d/render.py time_warden            # 시트를 만든다
    python tools/boss3d/render.py time_warden --preview  # + 게임 비율로 움직여 보는 미리보기 html(임시 폴더)

필요: 파이썬 playwright, 크롬(channel='chrome'), node_modules/three.
"""
import base64, functools, http.server, io, json, math, shutil, sys, tempfile, threading
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
SHEETS = ROOT / 'src' / 'assets' / 'sprites'
THREE = ROOT / 'node_modules' / 'three' / 'build'
W, VIEW, TARGET_Y = 832, 4.4, 1.15  # kit.js와 같은 값
PPM = 30  # 모든 시트 공통(src/render/sprites.ts PPM)
K = PPM / (W / VIEW)  # 렌더 px → 시트 px
ANCHOR = (W / 2, W / 2 + TARGET_Y * math.cos(math.pi / 6) * W / VIEW)  # 발밑(원점)이 렌더에서 찍히는 자리
ALPHA_CUT = 96  # tools/sprites.py와 같은 기준
MAX_SHEET = 4096  # 모바일 텍스처 한계
# 보스마다 동작: (프레임 수, 한 번 도는 ms, 반복). 게임 시트 키(stance·move·attack·hit·die)를 다 채운다
BOSSES = {
    'time_warden': {'stance': (12, 2400, 'looped'), 'move': (12, 1100, 'looped'), 'attack': (13, 1300, 'play_once'), 'hit': (2, 200, 'play_once'), 'die': (10, 1300, 'play_once')},
    'plague_ferryman': {'stance': (12, 2600, 'looped'), 'move': (12, 1200, 'looped'), 'attack': (13, 1200, 'play_once'), 'hit': (2, 200, 'play_once'), 'die': (10, 1400, 'play_once')},
}
PAGE = '<!doctype html><meta charset="utf-8"><body style="margin:0"><script type="importmap">{"imports":{"three":"/three/three.module.js"}}</script><script type="module" src="/%s.js"></script>'


def serve(name):
    class H(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def do_GET(self):
            if self.path in ('/', '/index.html'):
                body = (PAGE % name).encode()
                self.send_response(200)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            else:
                super().do_GET()

        def translate_path(self, path):
            path = path.split('?')[0]
            if path.startswith('/three/'):
                return str(THREE / path[len('/three/'):])
            return str(HERE / path.lstrip('/'))

    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def render(name):
    anims = BOSSES[name]
    srv = serve(name)
    frames = {}
    try:
        with sync_playwright() as p:
            b = p.chromium.launch(channel='chrome', args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
            pg = b.new_page()
            errors = []
            pg.on('pageerror', lambda e: errors.append(str(e)))
            pg.goto(f'http://127.0.0.1:{srv.server_address[1]}/')
            try:
                pg.wait_for_function('window.ready === true', timeout=30000)
            except Exception:
                raise SystemExit(f'{name}.js를 띄우지 못했다: {errors}')
            for anim, (n, _, loop) in anims.items():
                for d in range(8):  # FLARE 화면 방향 0=W 1=NW 2=N 3=NE 4=E 5=SE 6=S 7=SW → 모형 회전(6=S가 카메라를 본다)
                    for f in range(n):
                        t = f / n if loop == 'looped' else f / max(1, n - 1)
                        data = pg.evaluate('([a, b, c]) => renderFrame(a, b, c)', [(6 - d) * math.pi / 4, anim, t])
                        im = Image.open(io.BytesIO(base64.b64decode(data.split(',')[1]))).convert('RGBA')
                        im = im.resize((round(W * K), round(W * K)), Image.LANCZOS)
                        im.putalpha(im.getchannel('A').point(lambda v: 255 if v > ALPHA_CUT else 0))
                        frames[(anim, d, f)] = im
            b.close()
    finally:
        srv.shutdown()
    boxes = [im.getbbox() for im in frames.values() if im.getbbox()]
    box = (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))
    cw, ch = box[2] - box[0], box[3] - box[1]
    cols, rows = max(n for n, _, _ in anims.values()), 8 * len(anims)
    if rows * ch > MAX_SHEET or cols * cw > MAX_SHEET:  # 어느 동작이 칸을 키우는지
        for a in anims:
            bb = [frames[k].getbbox() for k in frames if k[0] == a and frames[k].getbbox()]
            print(f'  {a}: 위 {min(b[1] for b in bb)} 아래 {max(b[3] for b in bb)} 왼 {min(b[0] for b in bb)} 오른 {max(b[2] for b in bb)}')
    assert cols * cw <= MAX_SHEET and rows * ch <= MAX_SHEET, f'{name}: 시트가 너무 큼 {cols * cw}x{rows * ch} (칸 {cw}x{ch}) — 동작이 칸 밖으로 크게 뻗는다'
    atlas = Image.new('RGBA', (cols * cw, rows * ch))
    for (anim, d, f), im in frames.items():
        atlas.paste(im.crop(box), (f * cw, (list(anims).index(anim) * 8 + d) * ch))
    atlas.quantize(colors=256, method=Image.Quantize.FASTOCTREE).save(SHEETS / f'{name}.png', optimize=True)
    info = {
        'cell': [cw, ch],
        'anchor': [round(ANCHOR[0] * K - box[0]), round(ANCHOR[1] * K - box[1])],
        'ppm': PPM, 'cols': cols, 'rows': rows,
        'anims': {a: {'row': k * 8, 'frames': n, 'ms': ms, 'loop': loop} for k, (a, (n, ms, loop)) in enumerate(anims.items())},
    }
    (SHEETS / f'{name}.json').write_text(json.dumps(info, indent=2) + '\n', encoding='utf-8')
    print(f'{name}: cell {cw}x{ch}, sheet {cols * cw}x{rows * ch}')
    return info


def preview(name):
    """게임 비율 미리보기: 새 보스 옆에 지금 게임 시트(기도하는 자·해골 기사·악마)를 세워 둔다"""
    out = Path(tempfile.gettempdir()) / 'boss3d_preview'
    out.mkdir(exist_ok=True)
    sheets = {}
    for n in [name, 'fallen_paladin', 'bone_knight', 'demon']:
        shutil.copy(SHEETS / f'{n}.png', out / f'{n}.png')
        sheets[n] = json.loads((SHEETS / f'{n}.json').read_text(encoding='utf-8'))
    (out / 'sheets.js').write_text(f'window.BOSS = {json.dumps(name)};\nwindow.SHEETS = {json.dumps(sheets)};\n', encoding='utf-8')
    shutil.copy(HERE / 'preview.html', out / 'index.html')
    print('미리보기:', out / 'index.html')


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if not args or args[0] not in BOSSES:
        raise SystemExit(f'보스 이름: {", ".join(BOSSES)}')
    render(args[0])
    if '--preview' in sys.argv:
        preview(args[0])
