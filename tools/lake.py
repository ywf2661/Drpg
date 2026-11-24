# 호숫가(2막 ①) 타일: tools/art/grassland_plus/(OpenGameArt "Regular Grassland Tileset Hills / Slopes / Ramps [16x190]",
# WithinAmnesia, CC-BY-SA 3.0 — Flare 초원 타일셋 개작)의 64×32 아이소 타일을 펴서 src/assets/tiles/에 쓴다.
#   plank.png  나루·다리 판자 4(가로 판자만 — 세로 판자와 섞으면 얼룩져 보인다). 물은 그림이 아니라 셰이더(src/render/water.ts)
#   wall_log.png  통나무집 벽 면(변형 1 × [+x 면, +z 면])
#   src/assets/sprites/lake_trees.png/json  나무 16(청록·고목·침엽·활엽 넷씩) — 호숫가의 숲 테두리(벽 칸 대신 나무)
#   src/assets/sprites/lake_plants.png/json  물가 풀 16(고사리·갈대·수풀·꽃·마른 풀)
# 풀 바닥·바위 벽은 이 묶음이 Flare 초원의 개작이라 초원 그림(floor_field·wall_field)과 같다 — 호숫가 테마도 그것을 쓴다
# 설계: docs/superpowers/specs/2026-11-24-act2-lake-design.md 9절
import json
from pathlib import Path
from PIL import Image, ImageEnhance
import sprites  # tools/sprites.py: floor_strip·TILES·SHEETS

ART = Path(__file__).resolve().parent / 'art' / 'grassland_plus'
PLANK = [345, 347, 345, 347]


class Tileset:
    """사용자 묶음의 64×32 타일을 Flare 타일 크기(192×96, 기준점 가운데)로 3배 키워 sprites.floor_strip에 넘긴다."""

    def __init__(self):
        self.img = Image.open(ART / 'tileset.png').convert('RGBA')
        self.tiles = {}
        for line in (ART / 'tileset_def.txt').read_text(encoding='utf-8').splitlines():
            line = line.strip()
            if line.startswith('tile='):
                i, *rect = [int(v) for v in line[5:].split(',') if v.strip()]
                self.tiles[i] = rect

    def tile(self, i):
        x, y, w, h, _, _ = self.tiles[i]
        return self.img.crop((x, y, x + w, y + h))

    def frames(self, i):
        return [self.tile(i).resize((192, 96), Image.BICUBIC)], (96, 48), 1000


SCALE = 42.43 / 64  # 이 묶음의 타일 가로 64px = 게임 칸 마름모 42.43px
TREES = (980, 1360)  # 나무 넷 줄(청록·고목 / 침엽·활엽)이 있는 세로 구간(px)
PLANTS = (320, 384)  # 풀 한 줄(64px 칸 16개)
LOG_FACE = (402, 100 + 700, 438, 148 + 700)  # 통나무집 앞면에서 벽 무늬(통나무만)로 쓸 곳


def pack(name, frames):
    # frames: {이름: (그림, (기준 x, 기준 y))} → 한 칸에 모두 들어가는 시트(동작 = 이름, 방향 1)
    left = max(a[0] - im.getbbox()[0] for im, a in frames.values())
    right = max(im.getbbox()[2] - a[0] for im, a in frames.values())
    up = max(a[1] - im.getbbox()[1] for im, a in frames.values())
    down = max(im.getbbox()[3] - a[1] for im, a in frames.values())
    cw, ch = round(left + right) + 1, round(up + down) + 1
    sheet = Image.new('RGBA', (cw, ch * len(frames)))
    for row, (im, (ax, ay)) in enumerate(frames.values()):
        sheet.alpha_composite(im, (round(left - ax), row * ch + round(up - ay)))
    sheet.quantize(colors=256, method=Image.Quantize.FASTOCTREE).save(sprites.SHEETS / f'{name}.png', optimize=True)
    info = {'cell': [cw, ch], 'anchor': [round(left), round(up)], 'ppm': 30, 'cols': 1, 'rows': len(frames), 'anims': {n: {'row': i, 'frames': 1, 'ms': 1000, 'loop': 'play_once'} for i, n in enumerate(frames)}}
    (sprites.SHEETS / f'{name}.json').write_text(json.dumps(info, indent=2) + '\n', encoding='utf-8')
    print(f'{name}: cell {cw}x{ch}, {len(frames)}개')


def cut(im, cut=140):
    # 반투명 그림자(알파 cut 미만)·검은 그림자 점은 버리고, 가장 큰 덩어리(옆 그림 조각을 뺀다)만 남겨 줄인다
    im = im.copy()
    px = im.load()
    W, H = im.size
    for y in range(H):
        for x in range(W):
            r, g, b, a = px[x, y]
            px[x, y] = (r, g, b, 255) if a >= cut and max(r, g, b) >= 10 else (0, 0, 0, 0)
    seen, best = set(), []
    for y in range(H):
        for x in range(W):
            if px[x, y][3] and (x, y) not in seen:
                part, stack = [], [(x, y)]
                seen.add((x, y))
                while stack:
                    cx, cy = stack.pop()
                    part.append((cx, cy))
                    for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1), (cx + 1, cy + 1), (cx - 1, cy - 1), (cx + 1, cy - 1), (cx - 1, cy + 1)):
                        if 0 <= nx < W and 0 <= ny < H and (nx, ny) not in seen and px[nx, ny][3]:
                            seen.add((nx, ny))
                            stack.append((nx, ny))
                if len(part) > len(best):
                    best = part
    keep = set(best)
    for y in range(H):
        for x in range(W):
            if (x, y) not in keep:
                px[x, y] = (0, 0, 0, 0)
    small = im.resize((round(W * SCALE), round(H * SCALE)), Image.LANCZOS)
    small.putalpha(small.getchannel('A').point(lambda v: 255 if v > 96 else 0))
    return small


def trees(ts):
    # 나무는 가로 128px마다 하나(8개씩 두 줄). 기준점 = 줄기 밑동(그림자를 뺀 그림의 맨 아래 줄 가운데)
    band = ts.img.crop((0, TREES[0], 1024, TREES[1]))
    frames = {}
    for row, (y0, y1) in enumerate([(0, 190), (170, TREES[1] - TREES[0])]):
        for k in range(8):
            im = cut(band.crop((k * 128, y0, (k + 1) * 128, y1)))
            bb = im.getbbox()
            if not bb:
                continue
            a = im.getchannel('A')
            bottom = bb[3] - 1
            xs = [x for x in range(im.width) if a.getpixel((x, bottom))]
            frames[f'tree{row * 8 + k}'] = (im, ((min(xs) + max(xs)) / 2, bottom - 1))
    pack('lake_trees', frames)


def plants(ts):
    band = ts.img.crop((0, PLANTS[0], 1024, PLANTS[1]))
    frames = {}
    for k in range(16):
        im = cut(band.crop((k * 64, 0, (k + 1) * 64, 64)), cut=110)
        if im.getbbox():
            frames[f'plant{k}'] = (im, (im.width / 2, im.getbbox()[3] - 2))
    pack('lake_plants', frames)


def log_wall(ts):
    face = ts.img.crop(LOG_FACE).convert('RGB')
    face = ImageEnhance.Brightness(face).enhance(1.25).resize((32, 38), Image.LANCZOS)
    out = Image.new('RGB', (64, 38))
    out.paste(face, (0, 0))
    out.paste(face.transpose(Image.Transpose.FLIP_LEFT_RIGHT), (32, 0))
    out.save(sprites.TILES / 'wall_log.png', optimize=True)


def main():
    ts = Tileset()
    trees(ts)
    plants(ts)
    log_wall(ts)
    sprites.floor_strip(ts, PLANK, 'plank.png')
    print('lake tiles: plank')


if __name__ == '__main__':
    main()
