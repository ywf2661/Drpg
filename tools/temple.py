# 사암 신전 몬스터(설계: docs/superpowers/specs/2026-11-26-act2-temple-design.md 4절): Flare 시트(CC-BY-SA 3.0)의 색만 바꾼다.
#   붕대 망령(zombie → mummy): 살갗 → 누렇게 바랜 붕대(가로 줄무늬로 붕대 감은 결), 옷·피 → 검게 마른 천, 군데군데 검은 틈
#   청동 해골 수호병(warrior → bronze_guard): 뼈 → 모래빛 뼈, 쇠 갑옷 → 청동(녹 슨 초록 얼룩 조금)
#   모래 해골 궁수(archer → sand_archer): 뼈 → 모래빛, 나머지는 따뜻한 갈색으로
# 실행: python tools/temple.py → src/assets/sprites/mummy.png/json, bronze_guard.png/json, sand_archer.png/json
import colorsys, shutil
from pathlib import Path
from PIL import Image

SPRITES = Path(__file__).resolve().parent.parent / 'src' / 'assets' / 'sprites'


def recolor(src, dst, fn):
    im = Image.open(SPRITES / f'{src}.png').convert('RGBA')
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if not a:
                continue
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            rgb = fn(x, y, h, s, v)
            px[x, y] = (round(rgb[0] * 255), round(rgb[1] * 255), round(rgb[2] * 255), a)
    im.save(SPRITES / f'{dst}.png', optimize=True)
    shutil.copy(SPRITES / f'{src}.json', SPRITES / f'{dst}.json')
    print(dst)


def mummy(x, y, h, s, v):
    if v < 0.1:  # 가장 어두운 곳(외곽선·그림자)은 그대로 검게
        return colorsys.hsv_to_rgb(0.08, 0.3, v)
    band = 0.78 if (y // 2) % 3 == 0 else 1.0  # 감은 붕대의 결(가로 줄)
    if (x * 7 + y * 13) % 29 == 0:
        band *= 0.35  # 붕대 사이 검은 틈
    return colorsys.hsv_to_rgb(0.11, 0.3, min(1, (0.3 + v * 0.95) * band))  # 몸 전체를 누렇게 바랜 붕대로


def bronze(x, y, h, s, v):
    if s < 0.18 and v > 0.55:  # 밝은 뼈
        return colorsys.hsv_to_rgb(0.1, 0.25, v * 0.95)
    if s < 0.25:  # 쇠 → 청동, 군데군데 녹
        rust = (x * 5 + y * 11) % 37 == 0
        return colorsys.hsv_to_rgb(0.42 if rust else 0.08, 0.55 if rust else 0.6, min(1, v * 1.15))
    return colorsys.hsv_to_rgb(h, s * 0.8, v * 0.9)


def sand(x, y, h, s, v):
    if s < 0.2 and v > 0.4:
        return colorsys.hsv_to_rgb(0.1, 0.28, v)
    return colorsys.hsv_to_rgb(0.07, min(1, s * 0.6 + 0.15), v * 0.9)


recolor('zombie', 'mummy', mummy)
recolor('warrior', 'bronze_guard', bronze)
recolor('archer', 'sand_archer', sand)
