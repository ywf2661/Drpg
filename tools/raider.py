# 뒤틀린 고블린(약탈자 진지 졸개, 설계: docs/superpowers/specs/2026-11-24-act2-raid-design.md 2절): Flare 고블린 시트(src/assets/sprites/goblin.png, CC-BY-SA 3.0)의 색만 바꾼다.
#   초록 살갗 → 잿빛, 군데군데 보랏빛 핏줄(칸 위치로 정해 프레임마다 같은 자리). 옷·무기는 조금 어둡게
# 실행: python tools/raider.py → src/assets/sprites/raider_goblin.png/json
import colorsys, shutil
from pathlib import Path
from PIL import Image

SPRITES = Path(__file__).resolve().parent.parent / 'src' / 'assets' / 'sprites'
im = Image.open(SPRITES / 'goblin.png').convert('RGBA')
px = im.load()
for y in range(im.height):
    for x in range(im.width):
        r, g, b, a = px[x, y]
        if not a:
            continue
        h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        if 0.15 < h < 0.45 and s > 0.15:  # 초록 살갗
            if (x * 3 + y * 7) % 17 == 0 or (x * 11 + y * 5) % 23 == 0:
                r2, g2, b2 = colorsys.hsv_to_rgb(0.78, 0.65, min(1, v * 1.1))  # 보랏빛 핏줄
            else:
                r2, g2, b2 = colorsys.hsv_to_rgb(0.75, 0.12, v * 0.95)  # 잿빛
        else:
            r2, g2, b2 = colorsys.hsv_to_rgb(h, s * 0.85, v * 0.85)
        px[x, y] = (round(r2 * 255), round(g2 * 255), round(b2 * 255), a)
im.save(SPRITES / 'raider_goblin.png', optimize=True)
shutil.copy(SPRITES / 'goblin.json', SPRITES / 'raider_goblin.json')
print('raider_goblin')
