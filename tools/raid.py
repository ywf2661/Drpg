# 약탈자 진지(2막 ②) 소품: tools/art/rubberduck/props_1x1.png·props_2x2.png(OpenGameArt "isometric props and tents", rubberduck, CC0 — 받은 그대로)에서
# 말뚝·해골 말뚝·화약통·상자·장작·그루터기·보랏빛 솥(삼각대)·화덕을 잘라 한 시트 src/assets/sprites/raid_props.png/json(동작 = 이름, 방향 1)으로 묶는다.
# 원본은 타일 128×64 기준: 1×1 칸 128×256, 2×2 칸 256×256. 바닥 마름모가 칸 맨 아래에 놓이고 그 가운데가 기준점(tools/tents.py와 같은 비율).
# 설계: docs/superpowers/specs/2026-11-24-act2-raid-design.md 2절
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'tools/art/rubberduck'
OUT = ROOT / 'src/assets/sprites'
SCALE = 42.43 / 128
ALPHA_CUT = 96
# 이름: (파일, 줄, 칸) — 1×1은 한 줄에 16칸, 2×2는 8칸
PICK = {
    **{f'stake{i}': ('props_1x1', 0, c) for i, c in enumerate([0, 1, 2, 3, 8, 9, 10, 13])},
    **{f'skull{i}': ('props_1x1', 1, c) for i, c in enumerate([9, 10, 12, 14, 15])},
    **{f'cheval{i}': ('props_1x1', 1, c) for i, c in enumerate([0, 1, 3, 5, 6])},  # 엇걸린 말뚝(바리케이드)
    'keg': ('props_1x1', 5, 0),
    **{f'crate{i}': ('props_1x1', r, c) for i, (r, c) in enumerate([(4, 12), (5, 4), (5, 9), (6, 4)])},
    **{f'wood{i}': ('props_1x1', 3, c) for i, c in enumerate([12, 13])},
    **{f'stump{i}': ('props_1x1', 3, c) for i, c in enumerate([0, 3, 7])},
    'cauldron': ('props_2x2', 4, 3),
    'firepit': ('props_2x2', 3, 3),
}


def cell(file, row, col):
    im = Image.open(SRC / f'{file}.png').convert('RGBA')
    w, h = (128, 256) if file == 'props_1x1' else (256, 256)
    c = im.crop((col * w, row * h, (col + 1) * w, (row + 1) * h))
    c = c.resize((round(w * SCALE), round(h * SCALE)), Image.LANCZOS)
    c.putalpha(c.getchannel('A').point(lambda v: 255 if v > ALPHA_CUT else 0))
    return c, (w / 2 * SCALE, (h - w / 4) * SCALE)  # 기준점 = 바닥 마름모 가운데


def main():
    frames = {n: cell(*p) for n, p in PICK.items()}
    left = max(a[0] - im.getbbox()[0] for im, a in frames.values())
    right = max(im.getbbox()[2] - a[0] for im, a in frames.values())
    up = max(a[1] - im.getbbox()[1] for im, a in frames.values())
    down = max(im.getbbox()[3] - a[1] for im, a in frames.values())
    cw, ch = round(left + right) + 1, round(up + down) + 1
    sheet = Image.new('RGBA', (cw, ch * len(frames)))
    for row, (im, (ax, ay)) in enumerate(frames.values()):
        sheet.alpha_composite(im, (round(left - ax), row * ch + round(up - ay)))
    sheet.quantize(colors=256, method=Image.Quantize.FASTOCTREE).save(OUT / 'raid_props.png', optimize=True)
    info = {'cell': [cw, ch], 'anchor': [round(left), round(up)], 'ppm': 30, 'cols': 1, 'rows': len(frames), 'anims': {n: {'row': i, 'frames': 1, 'ms': 1000, 'loop': 'play_once'} for i, n in enumerate(frames)}}
    (OUT / 'raid_props.json').write_text(json.dumps(info, indent=2) + '\n', encoding='utf-8')
    print(f'raid_props: cell {cw}x{ch}, {len(frames)}개')


if __name__ == '__main__':
    main()
