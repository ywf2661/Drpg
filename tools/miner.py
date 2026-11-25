# 보랏빛 광산 졸개·궁수(설계: docs/superpowers/specs/2026-11-25-act2-mine-design.md 2절): Flare 시트(CC-BY-SA 3.0)의 색만 바꾼다.
#   광부 고블린(goblin → miner_goblin): 초록 살갗 → 흙먼지 낀 누런 회색, 살갗 군데군데 보랏빛 결정 조각(밝은 점 — 칸 위치로 정해 프레임마다 같은 자리)
#   결정 궁수(hobgoblin_archer → crystal_archer): 살갗을 잿빛 보라로, 옷·활은 어둡게, 살갗에 보랏빛 결정 조각
# 실행: python tools/miner.py → src/assets/sprites/miner_goblin.png/json, crystal_archer.png/json
import colorsys, shutil
from pathlib import Path
from PIL import Image

SPRITES = Path(__file__).resolve().parent.parent / 'src' / 'assets' / 'sprites'


def recolor(src, dst, skin, shard, other):
    im = Image.open(SPRITES / f'{src}.png').convert('RGBA')
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if not a:
                continue
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if skin(h, s, v):
                if (x * 5 + y * 3) % 19 == 0 or (x * 7 + y * 11) % 29 == 0:
                    rgb = colorsys.hsv_to_rgb(0.76, 0.45, min(1, v * 1.5 + 0.25))  # 결정 조각(밝은 보라)
                else:
                    rgb = shard(h, s, v)
            else:
                rgb = other(h, s, v)
            px[x, y] = (round(rgb[0] * 255), round(rgb[1] * 255), round(rgb[2] * 255), a)
    im.save(SPRITES / f'{dst}.png', optimize=True)
    shutil.copy(SPRITES / f'{src}.json', SPRITES / f'{dst}.json')
    print(dst)


recolor('goblin', 'miner_goblin', lambda h, s, v: 0.15 < h < 0.45 and s > 0.15, lambda h, s, v: colorsys.hsv_to_rgb(0.1, 0.25, min(1, v * 1.1)), lambda h, s, v: colorsys.hsv_to_rgb(h, s * 0.8, v * 0.9))
# 홉고블린 살갗은 누런 황토빛 — 그 범위만 잿빛 보라로
recolor('hobgoblin_archer', 'crystal_archer', lambda h, s, v: 0.06 < h < 0.2 and s > 0.2 and v > 0.3, lambda h, s, v: colorsys.hsv_to_rgb(0.74, 0.2, min(1, v * 1.05)), lambda h, s, v: colorsys.hsv_to_rgb(h, s * 0.7, v * 0.9))
