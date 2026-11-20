# 바닥 투구·신발 그림: loot.png에는 투구·신발이 없어 갑옷 그림으로 떨어졌다.
# 보관함 아이콘(gear_icons·wizard_gear_icons·ranger_gear_icons.png, 64칸 × 16 = 무기·갑옷·투구·신발 4단계씩)에서
# 투구·신발만 잘라 어두운 바탕을 투명하게 하고(runes.py와 같은 방법) 한 줄 시트 floor_gear.png/json으로 만든다.
# 줄 이름 = {직업 그림}_{helm|boots}{단계}. 강령술사는 마법사 그림을 쓴다(hud.ts GEAR_ICONS와 같게)
import json
from pathlib import Path
from PIL import Image
from runes import clear_background

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'src/assets/sprites'
CELL = 64
SHEETS = {'knight': 'gear_icons.png', 'wizard': 'wizard_gear_icons.png', 'ranger': 'ranger_gear_icons.png'}
SLOTS = {'helm': 8, 'boots': 12}  # 아이콘 띠에서 첫 칸


def main():
    names, tiles = [], []
    for cls, file in SHEETS.items():
        im = Image.open(OUT / file).convert('RGBA')
        for slot, at in SLOTS.items():
            for t in range(4):
                tiles.append(clear_background(im.crop(((at + t) * CELL, 0, (at + t + 1) * CELL, CELL))))
                names.append(f'{cls}_{slot}{t + 1}')
    sheet = Image.new('RGBA', (CELL, CELL * len(tiles)))
    for i, t in enumerate(tiles):
        sheet.paste(t, (0, i * CELL))
    sheet.save(OUT / 'floor_gear.png')
    info = {'cell': [CELL, CELL], 'anchor': [CELL // 2, CELL - 10], 'ppm': 90, 'cols': 1, 'rows': len(tiles),
            'anims': {n: {'row': i, 'frames': 1, 'ms': 1000, 'loop': 'looped'} for i, n in enumerate(names)}}
    (OUT / 'floor_gear.json').write_text(json.dumps(info), encoding='utf-8')
    print('floor gear:', len(tiles))


if __name__ == '__main__':
    main()
