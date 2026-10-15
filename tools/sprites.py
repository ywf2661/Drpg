"""FLARE 스프라이트를 게임용 8방향 시트로 변환한다. 결과는 커밋한다.

실행: python tools/sprites.py   (Python 3 + Pillow)
원본: Flare: Empyrean Campaign 아트, CC-BY-SA 3.0. 가공 결과물도 CC-BY-SA 3.0.
"""
import json
import re
import shutil
import urllib.request
from pathlib import Path

from PIL import Image

COMMIT = 'af6eee6d339ac98011864bfe89da837fe7769c28'
BASE = f'https://raw.githubusercontent.com/flareteam/flare-game/{COMMIT}/'
ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / 'tools' / '.cache'
SHEETS = ROOT / 'src' / 'assets' / 'sprites'
PUBLIC = ROOT / 'public' / 'sprites'

SCALE = 0.32  # 주인공 키 약 51px = 30px/m × 1.7m
PPM = 30
ALPHA_CUT = 110  # 축소 후 알파를 0/255로 나누는 기준(도트 가장자리)
ANIMS = {'stance': 'stance', 'move': 'run', 'attack': 'swing', 'hit': 'hit', 'die': 'die'}  # 게임 이름 → FLARE 이름
DIRS = ['SW', 'W', 'NW', 'N', 'NE', 'E', 'SE', 'S']  # FLARE 방향 번호 0..7
# engine/hero_layers.txt: 방향별 레이어 그리기 순서(앞이 먼저 = 아래에 깔림)
LAYER_ORDER = {
    'SW': 'main feet legs hands chest off head', 'W': 'main feet legs hands chest off head',
    'NW': 'main feet legs hands chest off head', 'N': 'feet legs hands chest off head main',
    'NE': 'feet legs hands chest off head main', 'E': 'feet legs hands chest off head main',
    'SE': 'feet legs hands main chest head off', 'S': 'main feet legs hands chest head off',
}
KINDS = {
    'hero': {'head': 'avatar/male/chain_coif', 'chest': 'avatar/male/chain_cuirass', 'hands': 'avatar/male/chain_gloves',
             'legs': 'avatar/male/chain_greaves', 'feet': 'avatar/male/chain_boots', 'main': 'avatar/male/longsword',
             'off': 'avatar/male/kite_shield'},
    'minion': {'body': 'enemies/skeleton_weak'},
    'warrior': {'body': 'enemies/skeleton'},
}
CURSORS = ['cursor_normal', 'cursor_attack']
CANVAS, FOOT = 512, (256, 384)  # 합성용 캔버스와 그 안의 발 위치


def fetch(rel):
    path = CACHE / rel
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(BASE + rel, path)
    return path


class Sheet:
    """FLARE 이미지 + 정의 파일(frame=번호,방향,x,y,w,h,기준x,기준y)."""

    def __init__(self, name):
        self.img = Image.open(fetch(f'mods/fantasycore/images/{name}.png')).convert('RGBA')
        self.anims = {}
        cur = None
        for line in fetch(f'mods/fantasycore/animations/{name}.txt').read_text(encoding='utf-8').splitlines():
            line = line.strip()
            if m := re.match(r'^\[(\w+)\]$', line):
                cur = self.anims.setdefault(m.group(1), {'rects': {}})
            elif cur is not None and line.startswith('frame='):
                i, d, x, y, w, h, ox, oy = map(int, line[6:].split(','))
                cur['rects'][(i, d)] = (x, y, w, h, ox, oy)
            elif cur is not None and '=' in line:
                k, v = line.split('=', 1)
                cur[k] = v

    def draw(self, canvas, anim, i, d):
        rect = self.anims[anim]['rects'].get((i, d))
        assert rect, f'프레임 없음: {anim} frame={i} dir={d}'
        x, y, w, h, ox, oy = rect
        canvas.alpha_composite(self.img.crop((x, y, x + w, y + h)), (FOOT[0] - ox, FOOT[1] - oy))


def frames_of(kind):
    """{(동작, 방향, 프레임): (잘라낸 이미지, 캔버스 안 좌상단)}, {동작: (프레임 수, ms, loop)}"""
    sheets = {slot: Sheet(name) for slot, name in KINDS[kind].items()}
    meta_src = sheets.get('chest') or sheets['body']
    frames, meta = {}, {}
    for anim, src in ANIMS.items():
        a = meta_src.anims[src]
        n = int(a['frames'])
        meta[anim] = (n, int(a['duration'].removesuffix('ms')), a.get('type', 'play_once'))
        for d, dname in enumerate(DIRS):
            order = LAYER_ORDER[dname].split() if kind == 'hero' else ['body']
            for i in range(n):
                c = Image.new('RGBA', (CANVAS, CANVAS))
                for slot in order:
                    sheets[slot].draw(c, src, i, d)
                bb = c.getbbox() or (FOOT[0], FOOT[1], FOOT[0] + 1, FOOT[1] + 1)
                frames[(anim, d, i)] = (c.crop(bb), bb[:2])
    return frames, meta


def build(kind):
    frames, meta = frames_of(kind)
    x0 = min(o[0] for _, o in frames.values())
    y0 = min(o[1] for _, o in frames.values())
    x1 = max(o[0] + im.width for im, o in frames.values())
    y1 = max(o[1] + im.height for im, o in frames.values())
    cw, ch = round((x1 - x0) * SCALE), round((y1 - y0) * SCALE)
    cols, rows = max(n for n, _, _ in meta.values()), len(ANIMS) * 8
    assert cols * cw <= 4096 and rows * ch <= 4096, f'{kind}: 시트가 너무 큼 {cols * cw}x{rows * ch}'
    atlas = Image.new('RGBA', (cols * cw, rows * ch))
    for (anim, d, i), (im, (bx, by)) in frames.items():
        full = Image.new('RGBA', (x1 - x0, y1 - y0))
        full.paste(im, (bx - x0, by - y0))
        small = full.resize((cw, ch), Image.LANCZOS)
        small.putalpha(small.getchannel('A').point(lambda v: 255 if v > ALPHA_CUT else 0))
        atlas.paste(small, (i * cw, (list(ANIMS).index(anim) * 8 + d) * ch))
    atlas.quantize(colors=256, method=Image.Quantize.FASTOCTREE).save(SHEETS / f'{kind}.png', optimize=True)
    info = {
        'cell': [cw, ch],
        'anchor': [round((FOOT[0] - x0) * SCALE), round((FOOT[1] - y0) * SCALE)],
        'ppm': PPM, 'cols': cols, 'rows': rows,
        'anims': {anim: {'row': k * 8, 'frames': n, 'ms': ms, 'loop': loop} for k, (anim, (n, ms, loop)) in enumerate(meta.items())},
    }
    (SHEETS / f'{kind}.json').write_text(json.dumps(info, indent=2) + '\n', encoding='utf-8')
    print(f'{kind}: cell {cw}x{ch}, sheet {cols * cw}x{rows * ch}')


def credits():
    used = sorted({n for k in KINDS.values() for n in k.values()})
    files = '\n'.join(f'  mods/fantasycore/images/{n}.png, mods/fantasycore/animations/{n}.txt' for n in used)
    files += '\n' + '\n'.join(f'  mods/fantasycore/images/cursors/{c}.png' for c in CURSORS)
    flare = fetch('CREDITS.txt').read_text(encoding='utf-8')
    (PUBLIC / 'CREDITS.txt').write_text(
        f'''이 폴더와 게임의 캐릭터 그림·마우스 커서는 Flare: Empyrean Campaign의 아트를 가공한 것입니다.
Character sprites and mouse cursors in this game are derived from Flare: Empyrean Campaign art.

Source: https://github.com/flareteam/flare-game (commit {COMMIT})
License: CC-BY-SA 3.0 - https://creativecommons.org/licenses/by-sa/3.0/
The derived sprite sheets are also licensed under CC-BY-SA 3.0.
Modifications: selected frames, composited equipment layers, scaled by {SCALE},
alpha thresholded, reduced to 256 colors.

Files used:
{files}

--- Flare CREDITS.txt ---
{flare}''', encoding='utf-8')


if __name__ == '__main__':
    SHEETS.mkdir(parents=True, exist_ok=True)
    PUBLIC.mkdir(parents=True, exist_ok=True)
    for kind in KINDS:
        build(kind)
    for c in CURSORS:
        shutil.copy(fetch(f'mods/fantasycore/images/cursors/{c}.png'), PUBLIC / f'{c}.png')
    credits()
    print('done')
