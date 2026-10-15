"""FLARE 스프라이트를 게임용 8방향 시트로 변환한다. 결과는 커밋한다.

실행: python tools/sprites.py   (Python 3 + Pillow)
원본: Flare: Empyrean Campaign 아트, CC-BY-SA 3.0. 가공 결과물도 CC-BY-SA 3.0.
"""
import functools
import json
import re
import shutil
import urllib.request
from pathlib import Path

from PIL import Image, ImageEnhance

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
KINDS = {  # 몬스터: 레이어 1장
    'minion': {'body': 'enemies/skeleton_weak'},
    'warrior': {'body': 'enemies/skeleton'},
    'archer': {'body': 'enemies/skeleton_archer'},
    'mage': {'body': 'enemies/skeleton_mage'},
    'boss': {'body': 'enemies/minotaur'},
}
KIND_ANIMS = {'archer': {**ANIMS, 'attack': 'shoot'}, 'mage': {**ANIMS, 'attack': 'cast'}}  # 궁수는 활쏘기, 마법사는 시전
KIND_SCALE = {'boss': 0.28}  # 0.32면 시트 세로가 4560px(> 4096)
# 주인공 = 무기 × 갑옷 세트 16조합. 모든 조합이 같은 칸 크기·기준점이라 hero.json 하나를 공유한다
HERO_WEAPONS = ['dagger', 'shortsword', 'longsword', 'greatsword']
HERO_ARMORS = {
    'cloth': {'head': 'head_short', 'chest': 'cloth_shirt', 'hands': 'cloth_gloves', 'legs': 'cloth_pants', 'feet': 'cloth_sandals', 'off': 'buckler'},
    'leather': {'head': 'leather_hood', 'chest': 'leather_chest', 'hands': 'leather_gloves', 'legs': 'leather_pants', 'feet': 'leather_boots', 'off': 'iron_buckler'},
    'chain': {'head': 'chain_coif', 'chest': 'chain_cuirass', 'hands': 'chain_gloves', 'legs': 'chain_greaves', 'feet': 'chain_boots', 'off': 'kite_shield'},
    'plate': {'head': 'plate_helm', 'chest': 'plate_cuirass', 'hands': 'plate_gauntlets', 'legs': 'plate_greaves', 'feet': 'plate_boots', 'off': 'shield'},
}
LOOT_ITEMS = {'potion': 'hp_potion', 'dagger': 'dagger', 'shortsword': 'shortsword', 'longsword': 'longsword', 'greatsword': 'greatsword',
              'clothes': 'clothes', 'leather_armor': 'leather_armor', 'steel_armor': 'steel_armor'}  # 동작 이름 → loot 애니메이션
SOUNDS = ROOT / 'src' / 'assets' / 'sounds'
MUSIC = ROOT / 'src' / 'assets' / 'music'
MUSIC_FILES = ['dungeon_theme', 'boss_theme']  # music/ 아래
SOUND_FILES = ['wood_open', 'level_up', 'melee_attack', 'melee_attack_2', 'melee_attack_3', 'male_hit', 'male_die', 'flying_loot',
               'enemies/skeleton_phys', 'enemies/skeleton_hit', 'enemies/skeleton_die',
               'enemies/minotaur_phys', 'enemies/minotaur_hit', 'enemies/minotaur_die',
               'inventory/inventory_potion', 'inventory/inventory_metal', 'inventory/inventory_maille', 'powers/shoot', 'powers/fireball', 'powers/burn']  # soundfx/ 아래
GEAR_ICONS = [96, 97, 98, 99, 129, 145, 153, 161]  # 단검·숏소드·롱소드·그레이트소드, 천옷·가죽·사슬·판금
SKILL_ICON = 22  # 가르기(Cleave)
BLAST_SCALE = 0.115  # 폭발 그림 가로 약 80px(2.7m) ≈ 폭발 판정 지름 2.4m
CURSORS = ['cursor_normal', 'cursor_attack']
CANVAS, FOOT = 512, (256, 384)  # 합성용 캔버스와 그 안의 발 위치
TILE_SCALE = 42.43 / 192  # FLARE 타일 1개(마름모 가로 192px) = 우리 칸 1개(화면 42.4px)
TILES = ROOT / 'src' / 'assets' / 'tiles'
TILESET = 'tileset_dungeon'
FLOOR_TILES = [16, 17, 18, 19, 42, 43, 44, 45]  # 평바닥 4 + 금 간 바닥 4
WALL_TILE, WALL_PX, WALL_GAIN = 48, 141, 1.8  # 벽돌 기둥, 1.2m 높이의 FLARE 픽셀(세로 1m = 117.6px), 밝기 보정
PROPS = {'brazier': 167, 'barrel': 146, 'barrel2': 162, 'crate': 147, 'crate2': 163, 'chest': 144, 'chest2': 145,
         'chest_open': 160, 'chest2_open': 161,
         'statue': 128, 'statue2': 130, **{f'bones{k + 1}': 176 + k for k in range(8)}}
STAIRS = 286  # 4×4칸 내려가는 계단
LOOT_POTION = 0.5 / SCALE  # 바닥 아이템은 캐릭터 배율(0.32), 물약만 0.5배(작아서 안 보인다)
POTION_ICON = 64  # icons.png(64px 아이콘, 가로 8개)의 체력 물약


FETCHED = []  # 실제로 쓴 원본 파일(CREDITS 목록)


def fetch(rel):
    if rel not in FETCHED:
        FETCHED.append(rel)
    path = CACHE / rel
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(BASE + rel, path)
    return path


class Sheet:
    """FLARE 이미지 + 정의 파일(frame=번호,방향,x,y,w,h,기준x,기준y[,이미지 이름]).
    정의에 image=경로,이름 줄이 있으면 동작마다 다른 이미지(미노타우르스), 없으면 images/<name>.png 한 장."""

    def __init__(self, name):
        self.anims, self.images, self.src = {}, {}, {}  # src: (동작, 프레임, 방향) → 이미지 이름
        cur = None
        for line in fetch(f'mods/fantasycore/animations/{name}.txt').read_text(encoding='utf-8').splitlines():
            line = line.strip()
            if line.startswith('image=') and ',' in line:
                path, key = line[6:].split(',')
                self.images[key] = Image.open(fetch(f'mods/fantasycore/{path}')).convert('RGBA')
            elif m := re.match(r'^\[(\w+)\]$', line):
                section = m.group(1)
                cur = self.anims.setdefault(section, {'rects': {}})
            elif cur is not None and line.startswith('frame='):
                i, d, x, y, w, h, ox, oy, *key = line[6:].split(',')
                cur['rects'][(int(i), int(d))] = tuple(map(int, (x, y, w, h, ox, oy)))
                if key:
                    self.src[(section, int(i), int(d))] = key[0]
            elif cur is not None and '=' in line:
                k, v = line.split('=', 1)
                cur[k] = v
        if not self.images:
            self.images[None] = Image.open(fetch(f'mods/fantasycore/images/{name}.png')).convert('RGBA')
        self.img = next(iter(self.images.values()))

    def draw(self, canvas, anim, i, d):
        rect = self.anims[anim]['rects'].get((i, d))
        assert rect, f'프레임 없음: {anim} frame={i} dir={d}'
        x, y, w, h, ox, oy = rect
        img = self.images.get(self.src.get((anim, i, d)), self.img)
        canvas.alpha_composite(img.crop((x, y, x + w, y + h)), (FOOT[0] - ox, FOOT[1] - oy))


@functools.lru_cache(maxsize=None)
def sheet(name):
    return Sheet(name)


def hero_layers(weapon, armor):
    return {slot: f'avatar/male/{n}' for slot, n in {**HERO_ARMORS[armor], 'main': weapon}.items()}


def frames_of(layers, anims=ANIMS):
    """layers: {슬롯: 원본 이름}. 반환 {(동작, 방향, 프레임): (잘라낸 이미지, 캔버스 안 좌상단)}, {동작: (프레임 수, ms, loop)}"""
    sheets = {slot: sheet(name) for slot, name in layers.items()}
    meta_src = sheets.get('chest') or sheets['body']
    frames, meta = {}, {}
    for anim, src in anims.items():
        a = meta_src.anims[src]
        n = int(a['frames'])
        # 사망은 마지막 프레임(누운 시체)에 멈춘다. 미노타우르스 정의는 back_forth라 시체가 다시 일어선다
        meta[anim] = (n, int(a['duration'].removesuffix('ms')), 'play_once' if anim == 'die' else a.get('type', 'play_once'))
        for d, dname in enumerate(DIRS):
            order = ['body'] if 'body' in layers else LAYER_ORDER[dname].split()
            for i in range(n):
                c = Image.new('RGBA', (CANVAS, CANVAS))
                for slot in order:
                    sheets[slot].draw(c, src, i, d)
                bb = c.getbbox() or (FOOT[0], FOOT[1], FOOT[0] + 1, FOOT[1] + 1)
                frames[(anim, d, i)] = (c.crop(bb), bb[:2])
    return frames, meta


def pack(name, frames, meta, scale, dirs, bbox=None, json_name=None):
    """frames: {(동작, 방향, 프레임): (이미지, 좌상단)} — 좌상단은 발 기준점이 FOOT인 좌표(음수 가능).
    meta: {동작: (프레임 수, ms, loop)}. 시트 행 = 동작 순서 × dirs + 방향, 열 = 프레임.
    bbox: 여러 시트가 같은 칸을 쓰게 하는 공통 경계 상자. json_name: json 이름(기본 name)."""
    x0, y0, x1, y1 = bbox or (
        min(o[0] for _, o in frames.values()),
        min(o[1] for _, o in frames.values()),
        max(o[0] + im.width for im, o in frames.values()),
        max(o[1] + im.height for im, o in frames.values()),
    )
    cw, ch = round((x1 - x0) * scale), round((y1 - y0) * scale)
    cols, rows = max(n for n, _, _ in meta.values()), len(meta) * dirs
    assert cols * cw <= 4096 and rows * ch <= 4096, f'{name}: 시트가 너무 큼 {cols * cw}x{rows * ch}'
    atlas = Image.new('RGBA', (cols * cw, rows * ch))
    for (anim, d, i), (im, (bx, by)) in frames.items():
        full = Image.new('RGBA', (x1 - x0, y1 - y0))
        full.paste(im, (bx - x0, by - y0))
        small = full.resize((cw, ch), Image.LANCZOS)
        small.putalpha(small.getchannel('A').point(lambda v: 255 if v > ALPHA_CUT else 0))
        atlas.paste(small, (i * cw, (list(meta).index(anim) * dirs + d) * ch))
    atlas.quantize(colors=256, method=Image.Quantize.FASTOCTREE).save(SHEETS / f'{name}.png', optimize=True)
    info = {
        'cell': [cw, ch],
        'anchor': [round((FOOT[0] - x0) * scale), round((FOOT[1] - y0) * scale)],
        'ppm': PPM, 'cols': cols, 'rows': rows,
        'anims': {anim: {'row': k * dirs, 'frames': n, 'ms': ms, 'loop': loop} for k, (anim, (n, ms, loop)) in enumerate(meta.items())},
    }
    (SHEETS / f'{json_name or name}.json').write_text(json.dumps(info, indent=2) + '\n', encoding='utf-8')
    print(f'{name}: cell {cw}x{ch}, sheet {cols * cw}x{rows * ch}')


def hero():
    combos = [(w, a) for w in HERO_WEAPONS for a in HERO_ARMORS]
    # 공통 칸: 모든 조합·레이어·프레임 사각형의 합집합(합성하지 않고 정의만으로 계산)
    x0 = y0 = 10**9
    x1 = y1 = -10**9
    for w, a in combos:
        for name in hero_layers(w, a).values():
            for src in ANIMS.values():
                for _, _, rw, rh, ox, oy in sheet(name).anims[src]['rects'].values():
                    x0, y0 = min(x0, FOOT[0] - ox), min(y0, FOOT[1] - oy)
                    x1, y1 = max(x1, FOOT[0] - ox + rw), max(y1, FOOT[1] - oy + rh)
    for w, a in combos:
        pack(f'hero_{w}_{a}', *frames_of(hero_layers(w, a)), SCALE, 8, bbox=(x0, y0, x1, y1), json_name='hero')


class Tileset:
    """FLARE 타일셋 정의(tile=번호,x,y,w,h,기준x,기준y / animation=번호;x,y,ms;…)."""

    def __init__(self):
        self.img = Image.open(fetch(f'mods/fantasycore/images/tilesets/{TILESET}.png')).convert('RGBA')
        self.tiles, self.anims = {}, {}
        for line in fetch(f'mods/fantasycore/tilesetdefs/{TILESET}.txt').read_text(encoding='utf-8').splitlines():
            if line.startswith('tile='):
                i, *rect = map(int, line[5:].split(','))
                self.tiles[i] = rect
            elif line.startswith('animation='):
                i, *fs = line[10:].strip().strip(';').split(';')
                self.anims[int(i)] = [tuple(int(v.removesuffix('ms')) for v in f.split(',')) for f in fs]

    def frames(self, i):
        """([프레임 이미지], (기준x, 기준y), 한 바퀴 ms)"""
        x, y, w, h, ox, oy = self.tiles[i]
        anim = self.anims.get(i, [(x, y, 1000)])
        return [self.img.crop((fx, fy, fx + w, fy + h)) for fx, fy, _ in anim], (ox, oy), sum(f[2] for f in anim)


def flatten(src, size, coeffs):
    """아핀 변환: 결과 픽셀 (i, j) → 원본 (a·i + b·j + c, d·i + e·j + f)."""
    return src.transform(size, Image.AFFINE, coeffs, resample=Image.BICUBIC)


def tiles():
    ts = Tileset()
    # 바닥: 칸의 (x, z)∈[0,1]² → 마름모 (96 + 96x − 96z, 48x + 48z). 열 = +x, 행 = +z. 가장자리 반투명 줄을 피해 3% 안쪽만
    S, E = 128, 0.03
    s = (1 - 2 * E) / S
    floor = Image.new('RGB', (32 * len(FLOOR_TILES), 32))
    for k, i in enumerate(FLOOR_TILES):
        (im,), (ox, oy), _ = ts.frames(i)
        c = Image.new('RGBA', (192, 96))
        c.paste(im, (96 - ox, 48 - oy))
        t = flatten(c, (S, S), (96 * s, -96 * s, 96, 48 * s, 48 * s, 96 * E))
        floor.paste(t.convert('RGB').resize((32, 32), Image.LANCZOS), (32 * k, 0))
    floor.save(TILES / 'floor.png', optimize=True)
    # 벽: 기둥의 왼쪽 면 = 법선 +x 면(열 i → z = 1 − i/W), 오른쪽 면 = 법선 +z 면(열 i → x = i/W). 행 = 아래로 1.2m.
    # 원본은 아래로 갈수록 투명해지는 장식이라 알파는 버리고 밝기를 올린다
    (im,), _, _ = ts.frames(WALL_TILE)
    im = ImageEnhance.Brightness(im.convert('RGB')).enhance(WALL_GAIN)
    W, H = 128, 152
    wall = Image.new('RGB', (64, 38))
    wall.paste(flatten(im, (W, H), (96 / W, 0, 0, -48 / W, WALL_PX / H, 48)).resize((32, 38), Image.LANCZOS), (0, 0))
    wall.paste(flatten(im, (W, H), (96 / W, 0, 96, 48 / W, WALL_PX / H, 0)).resize((32, 38), Image.LANCZOS), (32, 0))
    wall.save(TILES / 'wall.png', optimize=True)
    # 소품: 캐릭터와 같은 시트 형식(동작 = 소품 이름, 방향 1개)
    frames, meta = {}, {}
    for name, i in PROPS.items():
        ims, (ox, oy), ms = ts.frames(i)
        meta[name] = (len(ims), ms, 'looped' if len(ims) > 1 else 'play_once')
        for k, f in enumerate(ims):
            frames[(name, 0, k)] = (f, (FOOT[0] - ox, FOOT[1] - oy))
    pack('props', frames, meta, TILE_SCALE, 1)
    # 계단: 기준점을 마름모 위 꼭짓점(가로 중앙, 맨 위)으로 → 그림 전체가 바닥에 눕는다
    (im,), _, _ = ts.frames(STAIRS)
    pack('stairs', {('stairs', 0, 0): (im, (FOOT[0] - im.width // 2, FOOT[1]))}, {'stairs': (1, 1000, 'play_once')}, TILE_SCALE, 1)


def effect(name, src, dirs=8, scale=SCALE):
    # FLARE 기술 효과('power' 동작, 8방향). 기준점(바닥)이 칸 안에 들어오도록 경계 상자에 FOOT 포함
    # — 판자의 바닥선이 칸 밖이면 지오메트리가 뒤집힌다
    sh = sheet(f'powers/{src}')
    a = sh.anims['power']
    n = int(a['frames'])
    frames = {}
    for d in range(dirs):
        for i in range(n):
            x, y, w, h, ox, oy = a['rects'][(i, d)]
            frames[('fly' if name == 'arrow' else name, d, i)] = (sh.img.crop((x, y, x + w, y + h)), (FOOT[0] - ox, FOOT[1] - oy))
    x0 = min(min(o[0] for _, o in frames.values()), FOOT[0])
    y0 = min(min(o[1] for _, o in frames.values()), FOOT[1])
    x1 = max(max(o[0] + im.width for im, o in frames.values()), FOOT[0] + 1)
    y1 = max(max(o[1] + im.height for im, o in frames.values()), FOOT[1] + 1)
    loop = 'looped' if a.get('type') == 'looped' else 'play_once'
    clip = 'fly' if name == 'arrow' else name
    pack(name, frames, {clip: (n, int(a['duration'].removesuffix('ms')), loop)}, scale, dirs, bbox=(x0, y0, x1, y1))


def loot():
    # 아이템이 날아가 떨어지는 애니메이션(FLARE 'power' 동작, 방향 0)
    frames, meta = {}, {}
    for clip, name in LOOT_ITEMS.items():
        sh = sheet(f'loot/{name}')
        a = sh.anims['power']
        n = int(a['frames'])
        meta[clip] = (n, int(a['duration'].removesuffix('ms')), 'play_once')
        k = LOOT_POTION if clip == 'potion' else 1
        for i in range(n):
            x, y, w, h, ox, oy = a['rects'][(i, 0)]
            im = sh.img.crop((x, y, x + w, y + h)).resize((round(w * k), round(h * k)), Image.LANCZOS)
            frames[(clip, 0, i)] = (im, (FOOT[0] - round(ox * k), FOOT[1] - round(oy * k)))
    pack('loot', frames, meta, SCALE, 1)
    icons = Image.open(fetch('mods/fantasycore/images/icons/icons.png')).convert('RGBA')

    def icon(k):
        x, y = k % 8 * 64, k // 8 * 64
        return icons.crop((x, y, x + 64, y + 64))

    icon(POTION_ICON).save(SHEETS / 'potion_icon.png', optimize=True)
    icon(SKILL_ICON).save(SHEETS / 'skill_icon.png', optimize=True)
    strip = Image.new('RGBA', (64 * len(GEAR_ICONS), 64))
    for k, i in enumerate(GEAR_ICONS):
        strip.paste(icon(i), (64 * k, 0))
    strip.save(SHEETS / 'gear_icons.png', optimize=True)


def credits():
    files = '\n'.join(f'  {f}' for f in FETCHED)
    flare = fetch('CREDITS.txt').read_text(encoding='utf-8')
    (PUBLIC / 'CREDITS.txt').write_text(
        f'''이 폴더와 게임의 캐릭터·던전·아이템 그림·마우스 커서·효과음·음악은 Flare: Empyrean Campaign의 아트를 가공한 것입니다.
Character sprites, dungeon tiles, item images, mouse cursors, sound effects and music in this game are derived from Flare: Empyrean Campaign art.

Source: https://github.com/flareteam/flare-game (commit {COMMIT})
License: CC-BY-SA 3.0 - https://creativecommons.org/licenses/by-sa/3.0/
The derived sprite sheets are also licensed under CC-BY-SA 3.0.
Modifications: selected frames, composited equipment layers (16 weapon x armor sets), scaled by {SCALE},
alpha thresholded, reduced to 256 colors. Dungeon tiles: floor and wall faces flattened
from isometric into square textures, wall brightened; props and stairs scaled by {TILE_SCALE:.3f}.
Sound effects and music: copied unchanged (Ogg Vorbis).
Items: drop animations scaled by {SCALE} (potion by 0.5), item icons cropped from the icon atlas.

Files used:
{files}

--- Flare CREDITS.txt ---
{flare}''', encoding='utf-8')


if __name__ == '__main__':
    SHEETS.mkdir(parents=True, exist_ok=True)
    PUBLIC.mkdir(parents=True, exist_ok=True)
    TILES.mkdir(parents=True, exist_ok=True)
    for kind in KINDS:
        pack(kind, *frames_of(KINDS[kind], KIND_ANIMS.get(kind, ANIMS)), KIND_SCALE.get(kind, SCALE), 8)
    effect('arrow', 'arrows')  # 화살: 8방향 3프레임, 기준점 위로 비행 높이가 들어 있다
    effect('cleave', 'cleave')
    effect('fireball', 'fireball')  # 화염구: 8방향 4프레임
    effect('blast', 'blast', dirs=1, scale=BLAST_SCALE)  # 폭발: 6프레임, 방향 무관
    hero()
    tiles()
    loot()
    SOUNDS.mkdir(parents=True, exist_ok=True)
    for f in SOUND_FILES:
        shutil.copy(fetch(f'mods/fantasycore/soundfx/{f}.ogg'), SOUNDS / f'{f.split("/")[-1]}.ogg')
    MUSIC.mkdir(parents=True, exist_ok=True)
    for f in MUSIC_FILES:
        shutil.copy(fetch(f'mods/fantasycore/music/{f}.ogg'), MUSIC / f'{f}.ogg')
    for c in CURSORS:
        shutil.copy(fetch(f'mods/fantasycore/images/cursors/{c}.png'), PUBLIC / f'{c}.png')
    credits()
    print('done')
