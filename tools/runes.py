# 룬 그림: tools/art/Runes1.png(5×4 격자, 검은 바탕의 돌 20개)을 잘라 바탕을 투명하게 하고
# 한 줄 시트 src/assets/sprites/runes.png(40×40 칸 × 세로 N)와 runes.json(바닥 판자용 SheetInfo)으로 만든다.
# 칸 순서 = RUNE_ICON(src/sim/rules.ts)이 가리키는 원본 번호(행 우선 0~19)를 그대로 쓴다.
import json
from collections import deque
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'tools/art/Runes1.png'  # 원본: OpenGameArt "FLARE Item Variation 60x60 ONLY"(public/sprites/CREDITS.txt)
OUT = ROOT / 'src/assets/sprites'
CELL = 40
# 원본에서 돌이 놓인 칸(검은 띠 사이). 열 x0, 행 y0와 한 변
XS, YS, SIDE = [13, 74, 135, 196, 257], [12, 73, 134, 195], 39


def clear_background(tile: Image.Image) -> Image.Image:
    # 가장자리에서 이어진 거의 검은 픽셀만 투명하게(돌 안의 검은 획은 남긴다)
    px = tile.load()
    w, h = tile.size
    dark = lambda x, y: sum(px[x, y][:3]) < 60
    seen = set()
    q = deque((x, y) for x in range(w) for y in (0, h - 1)) + deque((x, y) for y in range(h) for x in (0, w - 1))
    while q:
        x, y = q.popleft()
        if (x, y) in seen or not (0 <= x < w and 0 <= y < h) or not dark(x, y):
            continue
        seen.add((x, y))
        px[x, y] = (0, 0, 0, 0)
        q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    return tile


def main():
    im = Image.open(SRC).convert('RGBA')
    tiles = [clear_background(im.crop((x - 1, y - 1, x - 1 + CELL, y - 1 + CELL))) for y in YS for x in XS]
    sheet = Image.new('RGBA', (CELL, CELL * len(tiles)))
    for i, t in enumerate(tiles):
        sheet.paste(t, (0, i * CELL))
    sheet.save(OUT / 'runes.png')
    info = {'cell': [CELL, CELL], 'anchor': [CELL // 2, CELL - 6], 'ppm': 48, 'cols': 1, 'rows': len(tiles),
            'anims': {f'rune{i}': {'row': i, 'frames': 1, 'ms': 1000, 'loop': 'looped'} for i in range(len(tiles))}}
    (OUT / 'runes.json').write_text(json.dumps(info), encoding='utf-8')
    print('runes:', len(tiles))


if __name__ == '__main__':
    main()
