# 천막 소품: tools/art/rubberduck/*.png(OpenGameArt "isometric props and tents", rubberduck, CC0 — 원본 칸을 그대로 잘라 둔 것)를
# 게임 비율로 줄여 한 시트 src/assets/sprites/tents.png/json(동작 = 소품 이름, 방향 1)으로 묶는다.
# 원본은 타일 128×64 기준: 2×2 칸(256px)·4×4 칸(512px)의 바닥 마름모가 칸 맨 아래에 놓이고, 그 가운데가 기준점이다.
# 게임 칸 1m = 화면 마름모 가로 42.43px(tools/sprites.py TILE_SCALE)이라 원본 타일 128px → 42.43px.
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'tools/art/rubberduck'
OUT = ROOT / 'src/assets/sprites'
SCALE = 42.43 / 128
ALPHA_CUT = 96  # tools/sprites.py와 같은 기준(옅은 그림자는 버린다)
# 이름: (원본 파일, 칸 한 변 px) — 기준점 = (칸/2, 칸 × 3/4)
TENTS = {'tent_a': ('tent_a', 256), 'tent_b': ('tent_b', 256), 'tent_rope': ('tent_rope', 256), 'lean_to': ('lean_to', 256), 'tent_big': ('tent_big', 512), 'tent_round': ('tent_round', 512)}


def main():
    frames = {}
    for name, (file, side) in TENTS.items():
        im = Image.open(SRC / f'{file}.png').convert('RGBA')
        im = im.resize((round(side * SCALE), round(side * SCALE)), Image.LANCZOS)
        im.putalpha(im.getchannel('A').point(lambda v: 255 if v > ALPHA_CUT else 0))
        frames[name] = (im, (side / 2 * SCALE, side * 0.75 * SCALE))  # 그림, 기준점
    # 모든 그림을 같은 칸에: 기준점에서 위·아래·좌·우로 가장 먼 곳까지
    left = max(a[0] - im.getbbox()[0] for im, a in frames.values())
    right = max(im.getbbox()[2] - a[0] for im, a in frames.values())
    up = max(a[1] - im.getbbox()[1] for im, a in frames.values())
    down = max(im.getbbox()[3] - a[1] for im, a in frames.values())
    cw, ch = round(left + right), round(up + down)
    sheet = Image.new('RGBA', (cw, ch * len(frames)))
    for row, (im, (ax, ay)) in enumerate(frames.values()):
        sheet.alpha_composite(im, (round(left - ax), row * ch + round(up - ay)))
    sheet.quantize(colors=256, method=Image.Quantize.FASTOCTREE).save(OUT / 'tents.png', optimize=True)
    info = {'cell': [cw, ch], 'anchor': [round(left), round(up)], 'ppm': 30, 'cols': 1, 'rows': len(frames), 'anims': {n: {'row': i, 'frames': 1, 'ms': 1000, 'loop': 'play_once'} for i, n in enumerate(frames)}}
    (OUT / 'tents.json').write_text(json.dumps(info, indent=2) + '\n', encoding='utf-8')
    print(f'tents: cell {cw}x{ch}, {len(frames)}개')


if __name__ == '__main__':
    main()
