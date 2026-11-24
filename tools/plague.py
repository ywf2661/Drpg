# 역병 걸린 마을 사람(호숫가 졸개, 설계: docs/superpowers/specs/2026-11-24-act2-lake-design.md 6절): Flare 좀비 시트(src/assets/sprites/zombie.png, CC-BY-SA 3.0)의 색만 바꾼다.
#   살갗(밝은 회색) → 잿빛 섞인 회녹색, 옷(검붉은 천) → 빛바랜 갈색 농부 옷, 살갗에 검은 딱지 점(칸 위치로 정해 프레임마다 같은 자리)
# 실행: python tools/plague.py → src/assets/sprites/plague_villager.png/json
import colorsys, shutil
from pathlib import Path
from PIL import Image

SPRITES = Path(__file__).resolve().parent.parent / 'src' / 'assets' / 'sprites'
im = Image.open(SPRITES / 'zombie.png').convert('RGBA')
px = im.load()
for y in range(im.height):
    for x in range(im.width):
        r, g, b, a = px[x, y]
        if not a:
            continue
        h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        if s < 0.22 and v > 0.35:  # 살갗
            v2 = v * 0.86
            if (x * 7 + y * 13) % 23 == 0 or (x * 5 + y * 3) % 31 == 0:
                v2 *= 0.25  # 검은 딱지
            r2, g2, b2 = colorsys.hsv_to_rgb(0.22, 0.28, v2)
        else:  # 옷·피
            r2, g2, b2 = colorsys.hsv_to_rgb(0.08, min(1, s * 0.75), v * 1.05)
        px[x, y] = (round(r2 * 255), round(g2 * 255), round(b2 * 255), a)
im.save(SPRITES / 'plague_villager.png', optimize=True)
shutil.copy(SPRITES / 'zombie.json', SPRITES / 'plague_villager.json')
print('plague_villager')
