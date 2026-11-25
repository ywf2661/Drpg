"""FLARE 스프라이트를 게임용 8방향 시트로 변환한다. 결과는 커밋한다.

실행: python tools/sprites.py   (Python 3 + Pillow)
원본: Flare: Empyrean Campaign 아트, CC-BY-SA 3.0. 가공 결과물도 CC-BY-SA 3.0.
"""
import functools
import json
import math
import re
import shutil
import urllib.request
from pathlib import Path

import random

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageOps

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
    # 초원·설원의 몬스터(같은 전투 원형에 그림·이름·수치만 다르다): 졸개·전사·마법사 / 졸개·전사
    'goblin': {'body': 'enemies/goblin'}, 'goblin_elite': {'body': 'enemies/goblin_elite'}, 'fire_ant': {'body': 'enemies/fire_ant'},
    'ice_ant': {'body': 'enemies/ice_ant'}, 'zombie': {'body': 'enemies/zombie'},
    # 지역의 보스(미노타우르스와 같은 전투 원형): 초원 개미귀신, 설원 서리 와이번
    'antlion': {'body': 'enemies/antlion'}, 'wyvern': {'body': 'enemies/wyvern_water'},
    # 기믹: 개미지옥의 새끼 개미귀신, 폐허의 저주받은 무덤. 폐허(Empyrean Campaign 모드 'ec:'): 어둠 좀비·홉고블린·홉고블린 궁수, 보스 해골 기사 왕
    'antlion_small': {'body': 'enemies/antlion_small'}, 'grave': {'body': 'enemies/cursed_grave'},
    'zombie_dark': {'body': 'ec:enemies/zombie_dark'}, 'hobgoblin': {'body': 'ec:enemies/hobgoblin'},
    'hobgoblin_archer': {'body': 'ec:enemies/hobgoblin_archer'}, 'bone_knight': {'body': 'ec:enemies/skeleton_knight_boss'},
    'demon': {'body': 'demon'},  # 폐허의 보스(악마): Flare 밖 그림 — GRIDS
}
# Flare 저장소 밖 그림: 256px 칸 격자 한 장(가로 = 프레임, 세로 = 방향), 정의 파일이 없다. 자동으로 못 받는다 — url에서 받아 tools/.cache/local/<이름>.png에 둔다.
# rows: FLARE 방향 번호 → 격자 줄, foot: 칸 안의 발, anims: FLARE 동작 → (첫 프레임, 수, ms, loop), sat·bright: 기존 그림에 맞춘 채도·밝기
GRIDS = {'demon': {'url': 'https://opengameart.org/content/demon-flare-sprite-sheets', 'rows': [7, 0, 1, 2, 3, 4, 5, 6], 'foot': (105, 188), 'sat': 0.75, 'bright': 0.8,
                   'anims': {'stance': (0, 4, 533, 'back_forth'), 'run': (4, 9, 600, 'looped'), 'swing': (13, 5, 500, 'play_once'),
                             'hit': (30, 2, 133, 'back_forth'), 'die': (32, 10, 1000, 'play_once')}}}
# 타락한 성기사(최종 보스 후보): Hormelz 「8 Directional Greatsword Knight」(CC0) 무료판. 자동으로 못 받는다 — url에서 받은 zip 셋
# (2hIdle5·2hWalk·Slash)을 tools/.cache/local/greatsword_knight/에 푼다. 512px 칸, PixelOver JSON, dir1 = 화면 왼쪽 아래부터 시계 방향(dir8 = 정면)
KNIGHT = {
    'url': 'https://hormelz.itch.io/8-directional-great-sword-knight-character', 'dir': 'greatsword_knight', 'foot': (256, 269), 'scale': 0.5,
    # 게임 동작 → (원본 동작, 쓸 프레임(None = 전부), loop). 대기 26장은 짝수 번째만
    'anims': {'stance': ('2hIdle5', range(0, 26, 2), 'looped'), 'move': ('2hWalk', None, 'looped'), 'attack': ('Slash', None, 'play_once')},
    'hit': ((8, 1.5), (4, 1.2)), 'hit_ms': 133,  # 지어낸 피격: (뒤로 젖히는 각도, 밝기)
    'die': ((15, 1), (35, 0.9), (55, 0.8), (70, 0.7), (80, 0.6), (85, 0.55)), 'die_ms': 900,  # 지어낸 쓰러짐
    # 배색 C(검붉은 판금·흑금·지옥불 칼): 부위 → (원본 색들, 어두운 쪽부터 밝은 쪽 기준점). 원본 색은 부위 안 밝기 비율로 기준점 사이를 보간
    'palette': [
        ([(54, 115, 143), (65, 128, 156), (43, 108, 136), (32, 96, 122), (79, 144, 171), (92, 154, 181), (72, 134, 163), (19, 84, 112), (108, 168, 192), (124, 186, 210)], [(28, 10, 12), (62, 22, 24), (108, 44, 40)]),  # 판금
        ([(52, 200, 225), (44, 183, 208), (24, 160, 181), (0, 134, 158), (0, 93, 118)], [(40, 14, 16), (90, 32, 30), (152, 64, 50)]),  # 가슴·등판
        ([(1, 64, 91), (0, 20, 51), (0, 45, 70)], [(8, 2, 4), (20, 6, 8)]),  # 그늘
        ([(132, 132, 0), (89, 89, 0), (47, 47, 0), (170, 170, 0)], [(36, 30, 20), (90, 76, 46), (140, 120, 70)]),  # 투구 꼭대기
        ([(147, 8, 0), (42, 0, 0), (100, 0, 0), (184, 25, 0)], [(120, 40, 0), (255, 140, 20), (255, 220, 120)]),  # 눈구멍·칼자루
        ([(147, 158, 95), (176, 187, 125)], [(60, 40, 36), (100, 70, 60)]),  # 얼굴 조각
        ([(164, 175, 177), (255, 255, 255), (240, 238, 238)], [(30, 20, 20), (255, 110, 10), (255, 230, 140)]),  # 칼날
    ],
}
KIND_ANIMS = {'archer':{**ANIMS, 'attack': 'shoot'}, 'mage': {**ANIMS, 'attack': 'cast'}, 'fire_ant': {**ANIMS, 'attack': 'cast'}, 'hobgoblin_archer': {**ANIMS, 'attack': 'shoot'},
              'grave': {**ANIMS, 'move': 'stance', 'attack': 'cast'}}  # 궁수는 활쏘기, 마법사는 시전, 무덤은 걷지 않는다
# 야영지 사람(FLARE fantasycore npcs): 서 있는 동작만 있다. 순찰대장 = 기사, 상인 = 떠돌이 상인, 주민 둘 = 농부
NPCS = {'npc_captain': 'npcs/knight', 'npc_merchant': 'npcs/wandering_trader', 'npc_villager1': 'npcs/peasant_man1', 'npc_villager2': 'npcs/peasant_woman1'}
KIND_SCALE = {'demon': 0.64, 'boss': 0.28,'wyvern': 0.28, 'antlion': 0.36, 'bone_knight': 0.3, 'grave': 0.26, 'hobgoblin': 0.45, 'hobgoblin_archer': 0.45}  # 홉고블린은 원본이 고블린만 하다 — 고블린보다 크게  # 0.32면 시트 세로가 4560px(> 4096)
# 주인공 = 부위별 레이어 시트(hero_<레이어>_<단계>.png). 게임이 장비에 맞춰 방향마다 LAYER_ORDER대로 겹친다.
# 모든 레이어가 같은 칸 크기·기준점이라 hero.json 하나를 공유한다. 단계 1~4 순
# 레이어 → FLARE 원본들. lower = 다리+손(모든 방향에서 그리는 순서가 붙어 있어 한 장으로)
HERO_LAYERS = {
    'main': [['dagger'], ['shortsword'], ['longsword'], ['greatsword']],  # 무기
    'head': [['mage_hood'], ['leather_hood'], ['chain_coif'], ['plate_helm']],  # 투구(천 세트엔 투구가 없어 마법사 두건)
    'feet': [['cloth_sandals'], ['leather_boots'], ['chain_boots'], ['plate_boots']],  # 신발
    'lower': [['cloth_pants', 'cloth_gloves'], ['leather_pants', 'leather_gloves'], ['chain_greaves', 'chain_gloves'], ['plate_greaves', 'plate_gauntlets']],  # 갑옷
    'chest': [['cloth_shirt'], ['leather_chest'], ['chain_cuirass'], ['plate_cuirass']],  # 갑옷
    'off': [['buckler'], ['iron_buckler'], ['kite_shield'], ['shield']],  # 갑옷(방패)
}
# 마법사: wizard_<레이어>_<단계>.png(방패 없음). 단계 1 = 천옷, 2~4 = 로브 갈색·남색·진홍
WIZARD_LAYERS = {
    'main': [['wand'], ['rod'], ['staff'], ['greatstaff']],
    'head': [['head_short'], ['mage_hood'], ['mage_hood_alt1'], ['mage_hood_alt2']],
    'feet': [['cloth_sandals'], ['mage_boots'], ['mage_boots_alt1'], ['mage_boots_alt2']],
    'lower': [['cloth_pants', 'cloth_gloves'], ['mage_skirt', 'mage_sleeves'], ['mage_skirt_alt1', 'mage_sleeves_alt1'], ['mage_skirt_alt2', 'mage_sleeves_alt2']],
    'chest': [['cloth_shirt'], ['mage_vest'], ['mage_vest_alt1'], ['mage_vest_alt2']],
}
# 궁수: ranger_<레이어>_<단계>.png(방패 없음). 단계 1 = 천옷, 2 = 가죽, 3 = 가죽+사슬 다리, 4 = 사슬
RANGER_LAYERS = {
    'main': [['slingshot'], ['shortbow'], ['longbow'], ['greatbow']],
    'head': [['head_short'], ['mage_hood'], ['leather_hood'], ['chain_coif']],
    'feet': [['cloth_sandals'], ['leather_boots'], ['leather_boots'], ['chain_boots']],
    'lower': [['cloth_pants', 'cloth_gloves'], ['leather_pants', 'leather_gloves'], ['chain_greaves', 'leather_gloves'], ['chain_greaves', 'chain_gloves']],
    'chest': [['cloth_shirt'], ['leather_chest'], ['leather_chest'], ['chain_cuirass']],
}
# 강령술사: necromancer_<레이어>_<단계>.png(방패 없음). 긴 치마 위에 단계 1 = 창백한 맨몸, 2 = 검은 가죽, 3 = 사슬, 4 = 판금.
# 이름 끝의 @necro = NECRO_TINTS로 다시 칠한 그림(Sheet가 처리). 무기는 완드·로드만(스태프는 마법사 전용), 2·4단계는 같은 그림을 강령술사 색으로
NECRO_LAYERS = {
    'main': [['wand'], ['wand@necro'], ['rod'], ['rod@necro']],
    'head': [['head_bald@necro'], ['leather_hood@necro'], ['mage_hood@necro'], ['plate_helm@necro']],
    'feet': [['cloth_sandals@necro'], ['leather_boots@necro'], ['chain_boots@necro'], ['plate_boots@necro']],
    'lower': [['mage_skirt@necro', 'cloth_gloves@necro'], ['mage_skirt@necro', 'leather_gloves@necro'], ['mage_skirt@necro', 'chain_gloves@necro'], ['mage_skirt@necro', 'plate_gauntlets@necro']],
    'chest': [['default_chest@necro'], ['leather_chest@necro'], ['chain_cuirass@necro'], ['plate_cuirass@necro']],
}
# (이름 앞머리들, 회색으로 섞는 정도, RGB 배율): 살갗은 창백하게, 천은 짙은 보라, 가죽은 검게, 쇠는 차갑게
NECRO_TINTS = [(('head_bald', 'default_'), 0.8, (1.15, 1.25, 1.2)), (('mage_', 'cloth_'), 0.85, (0.5, 0.38, 0.68)), (('leather_',), 0.8, (0.72, 0.64, 0.95)), (('chain_', 'plate_'), 0.4, (0.6, 0.66, 0.78)), (('wand', 'rod'), 0.45, (0.85, 0.62, 1.15))]
# 마법사의 공격 = 시전, 궁수 = 활쏘기(둘 다 4프레임·400ms로 베기와 같아 hero.json을 함께 쓴다)
CLASS_SHEETS = {'hero': (HERO_LAYERS, ANIMS), 'wizard': (WIZARD_LAYERS, {**ANIMS, 'attack': 'cast'}), 'ranger': (RANGER_LAYERS, {**ANIMS, 'attack': 'shoot'}),
                'necromancer': (NECRO_LAYERS, {**ANIMS, 'attack': 'cast'})}
PORTRAIT_GEAR = {'hero': 2, 'wizard': 2, 'ranger': 2, 'necromancer': 2}  # 시작 화면 초상의 장비 단계(시작 장비)
# 전설 무기 레이어(docs/superpowers/specs/2026-11-20-legend-weapons-design.md): 시트 이름 → (직업, 원본@색 또는 None, 덧그리기)
# 덧그리기 (종류, 색): edge = 무기 둘레 빛 띠, gem = 보석 둘레만, storm = 빛 띠 + 프레임마다 다른 번개, orb = 왼손 위 해골 구슬.
# 강령술사 전설의 로드는 4단계 그림(rod@necro) 그대로라 시트를 따로 굽지 않는다
LEGEND_LAYERS = {
    'hero_main_caliburx': ('hero', 'zweihander@holy', ('edge', (255, 190, 90)), 1.35),  # 넷째 = 칼날을 늘리는 배율(stretch)
    'wizard_main_elembase': ('wizard', 'greatstaff@base', ('gem', (90, 120, 255))),
    'wizard_main_elemfire': ('wizard', 'greatstaff@fire', ('gem', (255, 110, 30))),
    'wizard_main_elemfrost': ('wizard', 'greatstaff@frost', ('gem', (120, 220, 255))),
    'wizard_main_elembolt': ('wizard', 'greatstaff@bolt', ('gemstorm', (150, 200, 255))),
    'wizard_main_elemvoid': ('wizard', 'greatstaff@void', ('gem', (190, 80, 255))),
    'necromancer_off_skull': ('necromancer', None, ('orb', (60, 255, 170))),
    'ranger_main_storm': ('ranger', 'longbow@storm', ('storm', (110, 190, 255))),
    'hero_main_hammer': ('hero', 'maul', ('edge', (255, 110, 40))),
    'hero_main_spear': ('hero', 'staff', ('spear', (60, 110, 220)), 1.2),  # 원정대 깃발창(2막): FLARE엔 창이 없어 장대 끝에 창날·깃발을 덧그린다  # 우두머리의 화약 망치(2막): 양손 망치 + 잉걸불 빛
}
# 엘리멘탈 스태프 색(시안 staffs.py): 보석 색조(0~255)·밝기 배율, 자루 회색 섞기·RGB 배율. base = 색은 원본, 보석 표식만
STAFF_TINTS = {'base': None, 'fire': (8, 1.15, 0.2, (1.1, 0.75, 0.6)), 'frost': (133, 1.2, 0.5, (0.85, 1.0, 1.25)),
               'bolt': (158, 1.35, 0.5, (0.8, 0.9, 1.2)), 'void': (199, 0.9, 0.5, (0.45, 0.35, 0.6))}
GLOW = {'outer': 4, 'inner': 2, 'dim': 0.55}  # 빛 띠 두께(원본 px, 게임에선 ×SCALE). 주인공 재질이 알파 0.5 아래를 버려 부드러운 번짐 대신 또렷한 띠
BOLT = {'n': 3, 'core': 3, 'glow': 7, 'jitter': 6, 'out': (10, 22)}  # 번개: 프레임마다 줄 수, 심·번짐 두께, 꺾임, 밖으로 튀는 길이
ORB = {'r': 12, 'lift': 14}  # 해골 구슬 반지름, 손 위로 띄우는 높이(원본 px)
TORSO = (256, 284)  # 합성 캔버스의 가슴 자리(발 FOOT에서 약 100px 위): 무기 손잡이 = 무기 픽셀 중 여기에 가장 가까운 곳
LOWER_SLOTS = ['legs', 'hands']
LOOT_ITEMS = {'potion': 'hp_potion', 'dagger': 'dagger', 'shortsword': 'shortsword', 'longsword': 'longsword', 'greatsword': 'greatsword',
              'clothes': 'clothes', 'leather_armor': 'leather_armor', 'steel_armor': 'steel_armor',
              'coins5': 'coins5', 'coins25': 'coins25', 'coins100': 'coins100',
              'wand': 'wand', 'rod': 'rod', 'staff': 'staff', 'greatstaff': 'greatstaff',
              'slingshot': 'slingshot', 'shortbow': 'shortbow', 'longbow': 'longbow', 'greatbow': 'greatbow'}  # 동작 이름 → loot 애니메이션
SOUNDS = ROOT / 'src' / 'assets' / 'sounds'
MUSIC = ROOT / 'src' / 'assets' / 'music'
MUSIC_FILES = ['dungeon_theme', 'boss_theme']  # music/ 아래
SOUND_FILES = ['wood_open', 'level_up', 'melee_attack', 'melee_attack_2', 'melee_attack_3', 'male_hit', 'male_die', 'flying_loot',
               'enemies/skeleton_phys', 'enemies/skeleton_hit', 'enemies/skeleton_die',
               'enemies/minotaur_phys', 'enemies/minotaur_hit', 'enemies/minotaur_die',
               'inventory/inventory_potion', 'inventory/inventory_coins', 'inventory/inventory_metal', 'inventory/inventory_maille', 'powers/shoot', 'powers/fireball', 'powers/burn', 'powers/teleport', 'powers/warcry']  # soundfx/ 아래
GEAR_ICONS = [96, 97, 98, 99, 129, 145, 153, 161, 136, 144, 152, 160, 132, 148, 156, 164]  # 무기 4, 갑옷 4, 투구 4, 신발 4(단계 순)
WIZARD_GEAR_ICONS = [104, 105, 106, 107, 129, 137, 185, 193, -136, 136, 184, 192, 132, 140, 188, 196]  # 마법사. 음수 = 그 아이콘을 회색으로(천 머리띠)
WIZARD_SKILL_ICONS = [34, 24, 7, 4, 19, 29, 26, 20, 46]  # 화염구·서리 고리·낙뢰·마나 방패·순간이동, 잔상 탭(잔상 남기기 옆얼굴·자리 바꾸기 맞물린 고리·떠난 자리 반짝임·지나온 길 소용돌이)
RANGER_GEAR_ICONS = [112, 113, 114, 115, 129, 137, 145, 153, -136, 136, 144, 152, 132, 140, 176, 156]  # 궁수(새총·활 3, 천·가죽 조끼·가죽·사슬, 두건 4, 신발 4)
RANGER_SKILL_ICONS = [41, 38, 8, 16, 9]  # 관통 사격·덫·화살비·집중·구르기
NECRO_SKILL_ICONS = [12, 25, 27, 4, 9]  # 해골 소환·시체 거인·죽음의 표식·해골 왕 강림·구르기(장비 아이콘은 마법사 것). ponytail: W·R 그림은 옛 스킬(생명 흡수·뼈 갑옷)의 것 그대로
SKILL_ICON = 22  # 가르기(Cleave)
DASH_ICON = 9  # 돌진 베기(달리는 사람)
SHOUT_ICON, THROW_ICON = 10, 33  # 전투의 함성(파동), 도끼 던지기
QUAKE_SCALE = 0.16  # 함성 땅 울림 효과(지름 약 4m ≈ 기절 범위)
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
# 사슬로 묶인 쇠창살 문: (문 타일, 사슬 타일, 사슬을 문 앞면으로 옮기는 px). gate_x = 법선 +x 면(x 방향 통로를 막는다), gate_z = +z 면
GATES = {'gate_x': (114, 193, (14, 40)), 'gate_z': (115, 192, (-14, 40))}
GATE_GAIN, CHAIN_GAIN = 1.5, 2.6  # 어두운 원본을 횃불 아래서 보이게
FLAME_BOX, FLAME_SCALE = (48, 190, 144, 296), 0.36  # 화로 타일에서 불꽃만(그릇 위), 바닥 불길용 배율(높이 약 1m)
CAVE_TILESET = 'tileset_cave'
CAVE_FLOOR = [16, 17, 18, 19, 48, 49, 50, 51]  # 흙 4 + 잔해 4
CAVE_WALLS = [72, 76]  # +x 면, +z 면으로 쓸 바위벽
CAVE_WALL_BOXES, CAVE_WALL_GAIN = [(40, 60, 150, 230), (30, 120, 140, 290), (50, 40, 160, 210), (35, 90, 145, 260)], 1.6  # 바위 면에서 자를 곳 4가지(무늬 반복 줄이기), 밝기
# 초원·설원: 동굴과 같은 방식(풀/눈 4 + 돌 섞인 바닥 4, 바위 기둥 면). (타일셋, 바닥, 벽 타일, 자를 곳, 밝기)
WILDS = {'field': ('tileset_grassland', [16, 17, 18, 19, 32, 33, 34, 35], [132, 134], [(50, 50, 115, 170), (50, 110, 115, 240), (55, 30, 120, 150), (50, 80, 115, 210)], 1.5),
         'snow': ('tileset_snowplains', [16, 17, 18, 19, 32, 33, 34, 35], [133, 134], [(15, 40, 100, 150), (10, 100, 95, 220), (20, 25, 105, 135), (15, 70, 100, 190)], 1.1)}
LOOT_POTION = 0.5 / SCALE  # 바닥 아이템은 캐릭터 배율(0.32), 물약만 0.5배(작아서 안 보인다)
POTION_ICON = 64  # icons.png(64px 아이콘, 가로 8개)의 체력 물약


FETCHED = []  # 실제로 쓴 원본 파일(CREDITS 목록)
MODS = {'ec': 'empyrean_campaign'}  # 이름 앞의 'ec:' = 그 모드의 파일


def fetch(rel):
    if rel not in FETCHED:
        FETCHED.append(rel)
    path = CACHE / rel
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(BASE + rel, path)
    return path


def necro_tint(im, name):
    gray, mult = next((g, m) for pre, g, m in NECRO_TINTS if name.startswith(pre))
    rgb = Image.blend(im.convert('RGB'), ImageOps.grayscale(im).convert('RGB'), gray)
    rgb = Image.merge('RGB', [ch.point(lambda v, m=m: min(255, round(v * m))) for ch, m in zip(rgb.split(), mult)])
    rgb.putalpha(im.getchannel('A'))
    return rgb


def staff_tint(im, key):
    """보석(채도·밝기 높고 갈색 나무가 아닌 픽셀)과 자루를 따로 칠한다. 보석은 알파 254로 표시해 덧그리기가 찾는다"""
    a = im.getchannel('A')
    rgb = im.convert('RGB')
    h, s, v = rgb.convert('HSV').split()
    gem = ImageChops.multiply(ImageChops.multiply(s.point(lambda p: 255 if p > 115 else 0), v.point(lambda p: 255 if p > 64 else 0)), h.point(lambda p: 0 if p <= 41 else 255))
    gem = ImageChops.multiply(gem, a.point(lambda p: 255 if p else 0))
    if t := STAFF_TINTS[key]:
        hue, gain, gray, mult = t
        jewel = Image.merge('HSV', (Image.new('L', im.size, hue), s, v.point(lambda p: min(255, round(p * gain))))).convert('RGB')
        shaft = Image.blend(rgb, ImageOps.grayscale(rgb).convert('RGB'), gray)
        shaft = Image.merge('RGB', [ch.point(lambda p, m=m: min(255, round(p * m))) for ch, m in zip(shaft.split(), mult)])
        rgb = Image.composite(jewel, shaft, gem)
    mark = ImageChops.multiply(gem, a.point(lambda p: 255 if p > ALPHA_CUT else 0))
    rgb.putalpha(Image.composite(Image.new('L', im.size, 254), a, mark))
    return rgb


def storm_tint(im, _):
    """장궁: 밝기만 남겨 남보라 → 하늘색"""
    l = ImageOps.grayscale(im.convert('RGB')).point(lambda p: min(255, round(p * 1.6)))
    rgb = Image.merge('RGB', [l.point(lambda p, lo=lo, hi=hi: round(lo + (hi - lo) * p / 255)) for lo, hi in zip((20, 30, 90), (150, 230, 255))])
    rgb.putalpha(im.getchannel('A'))
    return rgb


def holy_tint(im, _):
    """칼리버X: 쇠를 밝은 금빛 강철로(빛 띠 안이 어두우면 게임 크기에서 속 빈 테두리로 보인다)"""
    l = ImageOps.grayscale(im.convert('RGB')).point(lambda p: min(255, round(80 + p * 0.9)))
    rgb = Image.merge('RGB', [l.point(lambda p, m=m: min(255, round(p * m))) for m in (1.05, 0.95, 0.72)])
    rgb.putalpha(im.getchannel('A'))
    return rgb


# 시간의 마녀(엔딩 연출, docs/superpowers/specs/2026-11-23-prayer-ending-design.md): 여성 아바타의 마법사 옷을 검은 로브·보라 천으로
WITCH_LAYERS = {'feet': 'mage_boots', 'legs': 'mage_skirt', 'hands': 'mage_sleeves', 'chest': 'mage_vest', 'head': 'mage_hood'}
WITCH_TINTS = {'mage_hood': (0.9, (0.36, 0.3, 0.48)), 'mage_vest': (0.9, (0.32, 0.27, 0.44)), 'mage_boots': (0.9, (0.3, 0.26, 0.38)),
               'mage_skirt': (0.7, (0.66, 0.38, 0.98)), 'mage_sleeves': (0.7, (0.66, 0.38, 0.98))}  # (회색으로 섞는 정도, RGB 배율): 로브는 검게, 치마·소매는 보라 천
WITCH_KNEEL = (0.56, 0.8)  # 무릎 꿇기: 서 있는 첫 장에서 키의 이 구간(위에서부터 비율)을 잘라 내 몸을 낮춘다(긴 치마라 무릎이 안 보인다)


def witch_tint(im, name):
    gray, mult = WITCH_TINTS[name]
    rgb = Image.blend(im.convert('RGB'), ImageOps.grayscale(im).convert('RGB'), gray)
    rgb = Image.merge('RGB', [ch.point(lambda v, m=m: min(255, round(v * m))) for ch, m in zip(rgb.split(), mult)])
    rgb.putalpha(im.getchannel('A'))
    return rgb


RECOLOR = {'necro': necro_tint, 'witch': witch_tint, 'storm': storm_tint, 'holy': holy_tint, **{k: (lambda im, _, k=k: staff_tint(im, k)) for k in STAFF_TINTS}}


class Sheet:
    """FLARE 이미지 + 정의 파일(frame=번호,방향,x,y,w,h,기준x,기준y[,이미지 이름]).
    정의에 image=경로,이름 줄이 있으면 동작마다 다른 이미지(미노타우르스), 없으면 images/<name>.png 한 장."""

    def __init__(self, name):
        self.anims, self.images, self.src = {}, {}, {}  # src: (동작, 프레임, 방향) → 이미지 이름
        name, _, tint = name.partition('@')
        if g := GRIDS.get(name):
            path = CACHE / 'local' / f'{name}.png'
            assert path.exists(), f'{path} 없음 — {g["url"]}에서 받아 둔다'
            im = Image.open(path).convert('RGBA')
            self.img = ImageEnhance.Brightness(ImageEnhance.Color(im.convert('RGB')).enhance(g['sat'])).enhance(g['bright'])
            self.img.putalpha(im.getchannel('A'))
            self.images[None] = self.img
            fx, fy = g['foot']
            for anim, (first, n, ms, loop) in g['anims'].items():
                rects = {(i, d): ((first + i) * 256, row * 256, 256, 256, fx, fy) for i in range(n) for d, row in enumerate(g['rows'])}
                self.anims[anim] = {'frames': n, 'duration': f'{ms}ms', 'type': loop, 'rects': rects}
            return
        mod, name = name.split(':') if ':' in name else ('fantasycore', name)
        mod = MODS.get(mod, mod)
        cur = None
        for line in fetch(f'mods/{mod}/animations/{name}.txt').read_text(encoding='utf-8').splitlines():
            line = line.strip()
            if line.startswith('image=') and ',' in line:
                path, key = line[6:].split(',')
                self.images[key] = Image.open(fetch(f'mods/{mod}/{path}')).convert('RGBA')
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
            self.images[None] = Image.open(fetch(f'mods/{mod}/images/{name}.png')).convert('RGBA')
        if tint:
            self.images = {k: RECOLOR[tint](im, name.rsplit('/', 1)[-1]) for k, im in self.images.items()}
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


def hero_layer(names):
    """레이어 하나의 FLARE 슬롯 → 원본: 한 장이면 body, 다리+손이면 legs·hands(방향별 순서대로 겹친다)"""
    slots = ['body'] if len(names) == 1 else LOWER_SLOTS
    return {slot: f'avatar/male/{n}' for slot, n in zip(slots, names)}


def frames_of(layers, anims=ANIMS):
    """layers: {슬롯: 원본 이름}. 반환 {(동작, 방향, 프레임): (잘라낸 이미지, 캔버스 안 좌상단)}, {동작: (프레임 수, ms, loop)}"""
    sheets = {slot: sheet(name) for slot, name in layers.items()}
    meta_src = next(iter(sheets.values()))
    frames, meta = {}, {}
    for anim, src in anims.items():
        a = meta_src.anims[src]
        n = int(a['frames'])
        # 사망은 마지막 프레임(누운 시체)에 멈춘다. 미노타우르스 정의는 back_forth라 시체가 다시 일어선다
        meta[anim] = (n, int(a['duration'].removesuffix('ms')), 'play_once' if anim == 'die' else a.get('type', 'play_once'))
        for d, dname in enumerate(DIRS):
            order = ['body'] if 'body' in layers else [s for s in LAYER_ORDER[dname].split() if s in layers]
            for i in range(n):
                c = Image.new('RGBA', (CANVAS, CANVAS))
                for slot in order:
                    sheets[slot].draw(c, src, i, d)
                bb = c.getbbox() or (FOOT[0], FOOT[1], FOOT[0] + 1, FOOT[1] + 1)
                frames[(anim, d, i)] = (c.crop(bb), bb[:2])
    return frames, meta


def glow_band(c, mask, color):
    """마스크 둘레의 또렷한 빛 띠 두 겹(바깥은 어둡게) — 그림 아래에 깐다"""
    out = Image.new('RGBA', c.size)
    for width, k in ((GLOW['outer'], GLOW['dim']), (GLOW['inner'], 1)):
        band = Image.new('RGBA', c.size, tuple(round(v * k) for v in color) + (255,))
        band.putalpha(mask.filter(ImageFilter.MaxFilter(width * 2 + 1)))
        out.alpha_composite(band)
    out.alpha_composite(c)
    return out


def bolts(c, mask, color, seed):
    """마스크 위 점들 사이·밖으로 튀는 꺾인 번개(프레임마다 seed가 달라 동작이 돌면 깜빡인다)"""
    pts = [(x, y) for y in range(0, c.height, 3) for x in range(0, c.width, 3) if mask.getpixel((x, y))]
    if not pts:
        return c
    rnd = random.Random(seed)
    glow, core = Image.new('L', c.size), Image.new('L', c.size)
    for _ in range(BOLT['n']):
        ax, ay = rnd.choice(pts)
        if rnd.random() < 0.5:
            bx, by = rnd.choice(pts)
        else:
            ang, ln = rnd.random() * math.tau, rnd.uniform(*BOLT['out'])
            bx, by = ax + math.cos(ang) * ln, ay + math.sin(ang) * ln
        nx, ny = -(by - ay), bx - ax
        ln = math.hypot(nx, ny) or 1
        seg = rnd.randint(4, 6)
        line = [(ax, ay)] + [(ax + (bx - ax) * k / seg + nx / ln * rnd.uniform(-1, 1) * BOLT['jitter'], ay + (by - ay) * k / seg + ny / ln * rnd.uniform(-1, 1) * BOLT['jitter']) for k in range(1, seg)] + [(bx, by)]
        ImageDraw.Draw(glow).line(line, fill=255, width=BOLT['glow'])
        ImageDraw.Draw(core).line(line, fill=255, width=BOLT['core'])
    for m, col in ((glow, color), (core, (235, 250, 255))):
        layer = Image.new('RGBA', c.size, col + (255,))
        layer.putalpha(m)
        c = Image.alpha_composite(c, layer)
    return c


@functools.lru_cache(maxsize=None)
def skull_orb(color):
    """해골이 비치는 구슬(또렷한 도트): 테두리 어둡게, 속은 color, 해골, 반사광, 둘레 빛 띠"""
    r = ORB['r']
    n = r * 2 + GLOW['outer'] * 2 + 4
    im = Image.new('RGBA', (n, n))
    d = ImageDraw.Draw(im)
    c0 = n / 2
    d.ellipse((c0 - r, c0 - r, c0 + r, c0 + r), fill=tuple(round(v * 0.25) for v in color) + (255,))
    d.ellipse((c0 - r * 0.82, c0 - r * 0.82, c0 + r * 0.82, c0 + r * 0.82), fill=tuple(round(v * 0.6) for v in color) + (255,))
    d.ellipse((c0 - r * 0.55, c0 - r * 0.6, c0 + r * 0.45, c0 + r * 0.4), fill=color + (255,))
    s = r * 0.3
    bone = (228, 232, 214, 255)
    d.ellipse((c0 - s * 1.5, c0 - s * 1.4, c0 + s * 1.5, c0 + s * 1.1), fill=bone)
    d.rectangle((c0 - s * 0.8, c0 + s * 0.5, c0 + s * 0.8, c0 + s * 1.5), fill=bone)
    for ex in (-0.6, 0.6):
        d.ellipse((c0 + s * ex - s * 0.45, c0 - s * 0.45, c0 + s * ex + s * 0.45, c0 + s * 0.3), fill=(10, 0, 20, 255))
    d.ellipse((c0 - r * 0.62, c0 - r * 0.7, c0 - r * 0.3, c0 - r * 0.4), fill=(255, 255, 255, 255))
    return glow_band(im, im.getchannel('A'), color)


def stretch(c, k):
    """무기를 손잡이(가슴에 가장 가까운 픽셀)에서 칼끝(가장 먼 픽셀) 방향으로만 k배 늘린다 — 굵기는 그대로"""
    a = c.getchannel('A')
    pts = [(x, y) for y in range(0, c.height, 2) for x in range(0, c.width, 2) if a.getpixel((x, y)) > 60]
    if len(pts) < 2:
        return c
    hx, hy = min(pts, key=lambda p: (p[0] - TORSO[0]) ** 2 + (p[1] - TORSO[1]) ** 2)
    tx, ty = max(pts, key=lambda p: (p[0] - hx) ** 2 + (p[1] - hy) ** 2)
    ln = math.hypot(tx - hx, ty - hy) or 1
    ux, uy = (tx - hx) / ln, (ty - hy) / ln
    g = 1 / k - 1  # 거꾸로 매핑(출력 → 입력): I + (1/k − 1)·u·uᵀ, 손잡이 고정
    m11, m12, m21, m22 = 1 + g * ux * ux, g * ux * uy, g * ux * uy, 1 + g * uy * uy
    return c.transform(c.size, Image.AFFINE, (m11, m12, hx - m11 * hx - m12 * hy, m21, m22, hy - m21 * hx - m22 * hy), Image.BICUBIC)


def spearhead(c, color):
    """원정대 깃발창: 장대(지팡이) 끝 너머에 쇠 창날, 끝 조금 아래에 원정대 깃발 천(color, 금빛 줄)"""
    a = c.getchannel('A')
    pts = [(x, y) for y in range(0, c.height, 2) for x in range(0, c.width, 2) if a.getpixel((x, y)) > 60]
    if len(pts) < 2:
        return c
    px = c.load()
    gem = [(x, y) for x, y in pts if px[x, y][1] > px[x, y][0] + 40 and px[x, y][1] > px[x, y][2] + 40]  # 지팡이 머리의 초록 보석 = 창 머리 쪽
    if gem:
        gx, gy = sum(p[0] for p in gem) / len(gem), sum(p[1] for p in gem) / len(gem)
        hx, hy = max(pts, key=lambda p: (p[0] - gx) ** 2 + (p[1] - gy) ** 2)  # 반대쪽 끝
    else:
        hx, hy = min(pts, key=lambda p: (p[0] - TORSO[0]) ** 2 + (p[1] - TORSO[1]) ** 2)
    tx, ty = max(pts, key=lambda p: (p[0] - hx) ** 2 + (p[1] - hy) ** 2)
    ln = math.hypot(tx - hx, ty - hy) or 1
    ux, uy = (tx - hx) / ln, (ty - hy) / ln
    nx, ny = -uy, ux
    for y in range(c.height):  # 보석은 쇠 물림쇠로
        for x in range(c.width):
            r, g, b, al = px[x, y]
            if al and g > r + 40 and g > b + 40:
                px[x, y] = (110, 112, 120, al)
    d = ImageDraw.Draw(c)
    L, W = 34, 9  # 창날 길이·반폭(원본 픽셀, SCALE 전)
    blade = [(tx, ty), (tx + ux * L * 0.35 + nx * W, ty + uy * L * 0.35 + ny * W), (tx + ux * L, ty + uy * L), (tx + ux * L * 0.35 - nx * W, ty + uy * L * 0.35 - ny * W)]
    d.polygon(blade, fill=(70, 74, 86, 255))
    d.polygon([blade[0], blade[1], blade[2], (tx + ux * L * 0.35, ty + uy * L * 0.35)], fill=(200, 208, 222, 255))  # 한쪽 날은 밝게
    d.line([(tx - nx * 6, ty - ny * 6), (tx + nx * 6, ty + ny * 6)], fill=(150, 120, 60, 255), width=4)  # 날밑
    # 깃발: 끝에서 장대를 따라 조금 내려온 곳에 매달려 화면 아래쪽으로 늘어진다
    fx0, fy0 = tx - ux * 10, ty - uy * 10
    fx1, fy1 = tx - ux * 34, ty - uy * 34
    drop = 30
    cloth = [(fx0, fy0), (fx1, fy1), (fx1 + 4, fy1 + drop), (fx0 + 8, fy0 + drop * 0.8)]
    d.polygon(cloth, fill=tuple(round(v * 0.75) for v in color) + (255,))
    d.line([(fx0 + 2, fy0 + drop * 0.35), (fx1 + 2, fy1 + drop * 0.4)], fill=(222, 180, 70, 255), width=4)
    return c


def legend_frames(cls, src, fx, grow=1):
    """전설 무기 레이어 한 장의 프레임(frames_of와 같은 꼴). src = 원본@색(None = 그림 없이 덧그리기만), fx = (종류, 색), grow = 칼날 배율"""
    anims = CLASS_SHEETS[cls][1]
    base = sheet(f'avatar/male/{src}') if src else None
    ref = base or sheet('avatar/male/buckler')
    kind, color = fx
    frames, meta = {}, {}
    for anim, s in anims.items():
        a = ref.anims[s]
        n = int(a['frames'])
        meta[anim] = (n, int(a['duration'].removesuffix('ms')), 'play_once' if anim == 'die' else a.get('type', 'play_once'))
        for d in range(len(DIRS)):
            for i in range(n):
                c = Image.new('RGBA', (CANVAS, CANVAS))
                seed = list(anims).index(anim) * 1000 + d * 50 + i  # 번개 모양을 고정(다시 구워도 시트가 같다)
                if kind == 'orb':  # 왼손 자리 = 버클러 그림의 프레임별 중심
                    sheet('avatar/male/buckler').draw(c, s, i, d)
                    bb = c.getchannel('A').point(lambda p: 255 if p > 60 else 0).getbbox()
                    c = Image.new('RGBA', (CANVAS, CANVAS))
                    if bb:
                        orb = skull_orb(color)
                        c.alpha_composite(orb, (round((bb[0] + bb[2]) / 2 - orb.width / 2), round((bb[1] + bb[3]) / 2 - ORB['lift'] - orb.height / 2)))
                else:
                    base.draw(c, s, i, d)
                    if grow != 1:
                        c = stretch(c, grow)
                    if kind == 'spear':
                        c = spearhead(c, color)
                        bb = c.getbbox() or (FOOT[0], FOOT[1], FOOT[0] + 1, FOOT[1] + 1)
                        frames[(anim, d, i)] = (c.crop(bb), bb[:2])
                        continue
                    a_ = c.getchannel('A')
                    gem = a_.point(lambda p: 255 if p == 254 else 0)
                    c.putalpha(a_.point(lambda p: 255 if p == 254 else p))
                    mask = gem if kind.startswith('gem') else a_.point(lambda p: 255 if p > 60 else 0)
                    c = glow_band(c, mask, color)
                    if kind.endswith('storm'):
                        c = bolts(c, mask, color, seed)
                bb = c.getbbox() or (FOOT[0], FOOT[1], FOOT[0] + 1, FOOT[1] + 1)
                frames[(anim, d, i)] = (c.crop(bb), bb[:2])
    return frames, meta


def knight_palette():
    """KNIGHT 배색: 원본 색 → 새 색"""
    lum = lambda c: 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]
    out = {}
    for cols, stops in KNIGHT['palette']:
        lo, hi = min(map(lum, cols)), max(map(lum, cols))
        for c in cols:
            t = (lum(c) - lo) / (hi - lo) * (len(stops) - 1) if hi > lo else len(stops) - 1
            i = min(int(t), len(stops) - 2)
            out[c] = tuple(round(a + (b - a) * (t - i)) for a, b in zip(stops[i], stops[i + 1]))
    return out


def knight_frames():
    """타락한 성기사: frames_of와 같은 형식. 피격·쓰러짐은 대기 첫 장을 발을 축으로 돌려 지어낸다"""
    root = CACHE / 'local' / KNIGHT['dir']
    assert root.exists(), f'{root} 없음 — {KNIGHT["url"]}에서 받은 zip을 푼다'
    pal = knight_palette()
    fx, fy = KNIGHT['foot']

    def recolor(im):  # 그림이 있는 곳만 잘라 색을 바꾼 512 칸(원본 칸과 같은 좌표)
        bb = im.getbbox()
        part = im.crop(bb)
        px = part.load()
        for y in range(part.height):
            for x in range(part.width):
                p = px[x, y]
                if p[3] and p[:3] in pal:
                    px[x, y] = pal[p[:3]] + (p[3],)
        out = Image.new('RGBA', im.size)
        out.paste(part, bb[:2])
        return out

    @functools.lru_cache(maxsize=None)
    def load(src, d):  # 시트 방향 d(화면 0=W 1=NW 2=N 3=NE 4=E 5=SE 6=S 7=SW) → 원본 dir((d+1)%8+1)의 칸들(색 바꾼 것)
        base = next(root.glob(f'**/GreatSwordKnight_{src}_dir{(d + 1) % 8 + 1}.png'))
        im = Image.open(base).convert('RGBA')
        fr = json.loads(base.with_suffix('.json').read_text(encoding='utf-8'))['frames']
        cells = [recolor(im.crop((f['frame']['x'], f['frame']['y'], f['frame']['x'] + f['frame']['w'], f['frame']['y'] + f['frame']['h']))) for f in fr]
        return cells, [f['duration'] for f in fr]

    def put(im):  # 원본 칸(발 = foot) → (잘라낸 그림, 발이 FOOT인 좌상단)
        bb = im.getbbox()
        return im.crop(bb), (FOOT[0] - fx + bb[0], FOOT[1] - fy + bb[1])

    def tilt(im, deg, bright, d):  # 바라보는 쪽의 반대로 넘어간다: W·NW·SW·N은 화면 시계 방향(PIL 음수 각), 나머지는 반시계
        pad = Image.new('RGBA', (im.width * 2, im.height * 2))
        pad.paste(im, (im.width // 2, im.height // 2))
        sign = -1 if d in (0, 1, 2, 7) else 1
        r = pad.rotate(sign * deg, resample=Image.BICUBIC, center=(fx + im.width // 2, fy + im.height // 2))
        rgb = ImageEnhance.Brightness(r.convert('RGB')).enhance(bright)
        rgb.putalpha(r.getchannel('A'))
        bb = rgb.getbbox()
        return rgb.crop(bb), (FOOT[0] - fx - im.width // 2 + bb[0], FOOT[1] - fy - im.height // 2 + bb[1])

    frames, meta = {}, {}
    for d in range(8):
        for anim, (src, pick, loop) in KNIGHT['anims'].items():
            cells, ms = load(src, d)
            idx = list(pick) if pick is not None else list(range(len(cells)))
            # 고른 장들이 원본과 같은 시간이 걸리게(솎은 대기는 한 장이 두 장 몫)
            meta[anim] = (len(idx), sum(ms), loop)
            for i, k in enumerate(idx):
                frames[(anim, d, i)] = put(cells[k])
        idle = load('2hIdle5', d)[0][0]
        for i, (deg, bright) in enumerate(KNIGHT['hit']):
            frames[('hit', d, i)] = tilt(idle, deg, bright, d)
        for i, (deg, bright) in enumerate(KNIGHT['die']):
            frames[('die', d, i)] = tilt(idle, deg, bright, d)
    meta['hit'] = (len(KNIGHT['hit']), KNIGHT['hit_ms'], 'play_once')
    meta['die'] = (len(KNIGHT['die']), KNIGHT['die_ms'], 'play_once')
    return frames, meta


def knight_heads(frames, meta):
    """후광 고리 자리: 장면마다 투구 꼭대기(투구 꼭대기 색 픽셀의 가운데·맨 위)를 발 기준 화면 m로(x 오른쪽, y 위).
    피격·쓰러짐(돌려 지어낸 장면)은 대기 첫 장의 머리 자리를 tilt와 같은 각도로 발을 축으로 돌린 것"""
    pal = knight_palette()
    crest = {pal[c] for c in KNIGHT['palette'][3][0]}
    k = KNIGHT['scale'] / PPM

    def head(im, xy):
        pts = [(x, y) for y in range(im.height) for x in range(im.width) if im.getpixel((x, y))[3] and im.getpixel((x, y))[:3] in crest]
        assert pts, '투구 꼭대기 색이 없는 장면'
        x = sum(p[0] for p in pts) / len(pts) + xy[0] - FOOT[0]
        y = min(p[1] for p in pts) + xy[1] - FOOT[1]
        return [round(x * k, 3), round(-y * k, 3)]

    def turned(xy, deg, d):  # tilt과 같은 회전(PIL 양수 = 화면 반시계, W·NW·N·SW는 음수)
        a = math.radians((-1 if d in (0, 1, 2, 7) else 1) * deg)
        x, y = xy
        return [round(x * math.cos(a) - y * math.sin(a), 3), round(x * math.sin(a) + y * math.cos(a), 3)]

    out = {}
    for anim, (n, _, _) in meta.items():
        if anim in KNIGHT['anims']:
            out[anim] = [[head(*frames[(anim, d, i)]) for i in range(n)] for d in range(8)]
        else:
            out[anim] = [[turned(head(*frames[('stance', d, 0)]), deg, d) for deg, _ in KNIGHT[anim]] for d in range(8)]
    return out


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


def legend_layers(bbox):
    """전설 무기 레이어: 직업 레이어와 같은 칸(bbox)에 굽는다 — 칸 밖으로 번진 빛은 잘린다"""
    for name, (cls, src, fx, *grow) in LEGEND_LAYERS.items():
        pack(name, *legend_frames(cls, src, fx, *grow), SCALE, 8, bbox=bbox, json_name='hero')


def hero_layers():
    return {(cls, slot, t + 1): hero_layer(names) for cls, (table, _) in CLASS_SHEETS.items() for slot, tiers in table.items() for t, names in enumerate(tiers)}


def hero_bbox(layers):
    """공통 칸: 모든 직업 모든 레이어·프레임 사각형의 합집합(합성하지 않고 정의만으로 계산)"""
    x0 = y0 = 10**9
    x1 = y1 = -10**9
    for (cls, _, _), srcs in layers.items():
        for name in srcs.values():
            for src in CLASS_SHEETS[cls][1].values():
                for _, _, rw, rh, ox, oy in sheet(name).anims[src]['rects'].values():
                    x0, y0 = min(x0, FOOT[0] - ox), min(y0, FOOT[1] - oy)
                    x1, y1 = max(x1, FOOT[0] - ox + rw), max(y1, FOOT[1] - oy + rh)
    return x0, y0, x1, y1


def hero():
    layers = hero_layers()
    x0, y0, x1, y1 = hero_bbox(layers)
    for (cls, slot, t), srcs in layers.items():
        pack(f'{cls}_{slot}_{t}', *frames_of(srcs, CLASS_SHEETS[cls][1]), SCALE, 8, bbox=(x0, y0, x1, y1), json_name='hero')
    legend_layers((x0, y0, x1, y1))
    # 시작 화면 초상: 정면(S)으로 선 시작 장비 모습, 2배
    for cls, (table, _) in CLASS_SHEETS.items():
        c = Image.new('RGBA', (CANVAS, CANVAS))
        t = PORTRAIT_GEAR[cls]
        srcs = {}
        for slot, tiers in table.items():
            for k, name in enumerate(tiers[t - 1]):
                srcs[LOWER_SLOTS[k] if len(tiers[t - 1]) > 1 else slot] = f'avatar/male/{name}'
        for slot in LAYER_ORDER['S'].split():
            if slot in srcs:
                sheet(srcs[slot]).draw(c, 'stance', 0, DIRS.index('S'))
        im = c.crop(c.getbbox())
        im.resize((round(im.width * SCALE * 2), round(im.height * SCALE * 2)), Image.LANCZOS).save(SHEETS / f'portrait_{cls}.png', optimize=True)
    # 방향별 레이어 순서(게임이 겹칠 때 쓴다). legs·hands는 lower 한 장
    order = {d: [s for s in o.replace('legs hands', 'lower').split()] for d, o in LAYER_ORDER.items()}
    (SHEETS / 'hero_layers.json').write_text(json.dumps([order[d] for d in DIRS]) + '\n', encoding='utf-8')


class Tileset:
    """FLARE 타일셋 정의(tile=번호,x,y,w,h,기준x,기준y / animation=번호;x,y,ms;…)."""

    def __init__(self, name=TILESET):
        mod, name = name.split(':') if ':' in name else ('fantasycore', name)
        mod = MODS.get(mod, mod)
        self.img = Image.open(fetch(f'mods/{mod}/images/tilesets/{name}.png')).convert('RGBA')
        self.tiles, self.anims = {}, {}
        for line in fetch(f'mods/{mod}/tilesetdefs/{name}.txt').read_text(encoding='utf-8').splitlines():
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


def floor_strip(ts, ids, out):
    # 바닥: 칸의 (x, z)∈[0,1]² → 마름모 (96 + 96x − 96z, 48x + 48z). 열 = +x, 행 = +z. 가장자리 반투명 줄을 피해 3% 안쪽만
    S, E = 128, 0.03
    s = (1 - 2 * E) / S
    floor = Image.new('RGB', (32 * len(ids), 32))
    for k, i in enumerate(ids):
        (im,), (ox, oy), _ = ts.frames(i)
        c = Image.new('RGBA', (192, 96))
        c.paste(im, (96 - ox, 48 - oy))
        t = flatten(c, (S, S), (96 * s, -96 * s, 96, 48 * s, 48 * s, 96 * E))
        floor.paste(t.convert('RGB').resize((32, 32), Image.LANCZOS), (32 * k, 0))
    floor.save(TILES / out, optimize=True)


def cave(name='cave', tileset=CAVE_TILESET, floor=CAVE_FLOOR, walls=CAVE_WALLS, boxes=CAVE_WALL_BOXES, gain=CAVE_WALL_GAIN):
    # 4~5층 동굴(과 초원·설원): 흙바닥 4 + 잔해 바닥 4, 벽은 울퉁불퉁한 바위라 정밀하게 펴지 않고 가운데를 잘라 쓴다
    ts = Tileset(tileset)
    floor_strip(ts, floor, f'floor_{name}.png')
    # 변형 v마다 [+x 면, +z 면] 두 칸 → 가로 64 × 변형 수
    wall = Image.new('RGB', (64 * len(boxes), 38))
    for v, box in enumerate(boxes):
        for k, i in enumerate(walls):
            (im,), _, _ = ts.frames(i)
            face = ImageEnhance.Brightness(im.crop(box).convert('RGB')).enhance(gain)
            wall.paste(face.resize((32, 38), Image.LANCZOS), (64 * v + 32 * k, 0))
    wall.save(TILES / f'wall_{name}.png', optimize=True)


def tiles():
    ts = Tileset()
    floor_strip(ts, FLOOR_TILES, 'floor.png')
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


# 폐허(Empyrean Campaign tileset_ruins): 돌바닥 4 + 흙 섞인 바닥 4, 벽은 이끼 낀 돌 기둥의 왼쪽 면(+x)·오른쪽 면(+z)을 잘라 쓴다.
# 변형 = (왼쪽 아래 면이 보이는 기둥, 오른쪽 아래 면이 보이는 기둥, 바닥에서 위로 띄울 px — 받침돌을 피해 무늬를 다르게)
RUINS_TILESET = 'ec:tileset_ruins'
RUINS_FLOOR = [24, 25, 26, 27, 32, 33, 64, 65]
RUINS_WALLS = [(137, 136, 20), (171, 170, 20), (137, 136, 60), (171, 170, 60)]
RUINS_WALL_GAIN = 1.3
# 기믹 소품(같은 시트): 세운 것(성소 구슬 기둥, 시련의 해골 상자)은 발 기준점, 눕힌 것(가시 바닥, 푸른 마법진)은 마름모 위 꼭짓점이 기준점
RUIN_STAND = {'shrine': 293, 'shrine_off': 294, 'trial': 384, 'trial_open': 385}
RUIN_FLAT = {'spikes': 120, 'spikes_up': 121, 'portal': 381, 'portal_off': 380}


def ruins():
    ts = Tileset(RUINS_TILESET)
    floor_strip(ts, RUINS_FLOOR, 'floor_ruins.png')
    wall = Image.new('RGB', (64 * len(RUINS_WALLS), 38))
    W, H = 128, 152
    for v, (left, right, lift) in enumerate(RUINS_WALLS):
        # 기둥의 바닥 마름모(가로 192, 세로 96)는 기준점이 가운데. 왼쪽 아래 면: 왼 꼭짓점 → 아래 꼭짓점, 오른쪽 아래 면: 아래 → 오른 꼭짓점. 위로 1.2m(WALL_PX)
        for k, i in enumerate([left, right]):
            (im,), (ox, oy), _ = ts.frames(i)
            y0 = oy - WALL_PX - lift
            coeffs = (80 / W, 0, ox - 88, 40 / W, WALL_PX / H, y0 + 4) if k == 0 else (80 / W, 0, ox + 8, -40 / W, WALL_PX / H, y0 + 44)  # 모서리 8px씩 안쪽(바깥은 검은 틈)
            face = ImageEnhance.Brightness(flatten(im, (W, H), coeffs).convert('RGB')).enhance(RUINS_WALL_GAIN)
            wall.paste(face.resize((32, 38), Image.LANCZOS), (64 * v + 32 * k, 0))
    wall.save(TILES / 'wall_ruins.png', optimize=True)
    frames, meta = {}, {}
    for name, i in {**RUIN_STAND, **RUIN_FLAT}.items():
        ims, (ox, oy), ms = ts.frames(i)
        meta[name] = (len(ims), ms, 'looped' if len(ims) > 1 else 'play_once')
        for k, f in enumerate(ims):
            frames[(name, 0, k)] = (f, (FOOT[0] - ox, FOOT[1] - oy) if name in RUIN_STAND else (FOOT[0] - f.width // 2, FOOT[1]))
    pack('ruin_props', frames, meta, TILE_SCALE, 1)


def gate():
    # 문 타일의 검은 면(FLARE가 벽 윗부분을 가리는 용도)은 투명하게 → 창살 사이로 뒤가 보인다. 사슬은 문 그림 범위 안만 남긴다
    ts = Tileset()
    frames, meta = {}, {}
    for name, (door, chain, (sx, sy)) in GATES.items():
        (im,), (ox, oy), _ = ts.frames(door)
        px = im.load()
        for y in range(im.height):
            for x in range(im.width):
                r, g, b, a = px[x, y]
                if a and max(r, g, b) < 10:
                    px[x, y] = (0, 0, 0, 0)
        bright = lambda img, k: Image.merge('RGBA', (*ImageEnhance.Brightness(img.convert('RGB')).enhance(k).split(), img.getchannel('A')))
        c = Image.new('RGBA', (CANVAS, CANVAS))
        c.alpha_composite(bright(im, GATE_GAIN), (FOOT[0] - ox, FOOT[1] - oy))
        bb = c.getbbox()
        (ch,), (cx, cy), _ = ts.frames(chain)
        ch = bright(ch, CHAIN_GAIN)
        c.alpha_composite(ch, (FOOT[0] - cx + sx, FOOT[1] - cy + sy))
        frames[(name, 0, 0)] = (c.crop(bb), bb[:2])
        meta[name] = (1, 1000, 'play_once')
    pack('gate', frames, meta, TILE_SCALE, 1)


def flame():
    # 돌진 '불길'의 불꽃: 화로(8프레임)에서 그릇을 빼고 불꽃만. 기준점 = 불꽃 아래 가운데
    ims, _, ms = Tileset().frames(PROPS['brazier'])
    x0, y0, x1, y1 = FLAME_BOX
    frames = {}
    for k, f in enumerate(ims):
        f = f.crop(FLAME_BOX)
        px = f.load()
        for y in range(f.height):
            for x in range(f.width):
                r, g, b, a = px[x, y]
                if r < 120 or r - b < 40:  # 연기·그릇 가장자리(어둡거나 잿빛)는 버린다 — 크게 그리면 검은 덩어리로 보인다
                    px[x, y] = (0, 0, 0, 0)
        frames[('flame', 0, k)] = (f, (FOOT[0] - (x1 - x0) // 2, FOOT[1] - (y1 - y0)))
    pack('flame', frames, {'flame': (len(ims), ms, 'looped')}, FLAME_SCALE, 1)


def effect(name, src, dirs=8, scale=SCALE, ms=None, first=0, grow=1):
    # FLARE 기술 효과('power' 동작, 8방향. first = 쓸 첫 방향). 기준점(바닥)이 칸 안에 들어오도록 경계 상자에 FOOT 포함
    # — 판자의 바닥선이 칸 밖이면 지오메트리가 뒤집힌다
    # grow: 그림만 제자리(중심)에서 키운다. scale은 바닥에서의 높이까지 키우므로 날아가는 것은 grow로 키운다
    sh = sheet(f'powers/{src}')
    a = sh.anims['power']
    n = int(a['frames'])
    frames = {}
    for d in range(dirs):
        for i in range(n):
            x, y, w, h, ox, oy = a['rects'][(i, d + first)]
            im = sh.img.crop((x, y, x + w, y + h))
            if grow != 1:
                im = im.resize((round(w * grow), round(h * grow)), Image.LANCZOS)
                ox, oy = ox + (im.width - w) // 2, oy + (im.height - h) // 2
            frames[('fly' if name == 'arrow' else name, d, i)] = (im, (FOOT[0] - ox, FOOT[1] - oy))
    x0 = min(min(o[0] for _, o in frames.values()), FOOT[0])
    y0 = min(min(o[1] for _, o in frames.values()), FOOT[1])
    x1 = max(max(o[0] + im.width for im, o in frames.values()), FOOT[0] + 1)
    y1 = max(max(o[1] + im.height for im, o in frames.values()), FOOT[1] + 1)
    loop = 'looped' if a.get('type') == 'looped' else 'play_once'
    clip = 'fly' if name == 'arrow' else name
    pack(name, frames, {clip: (n, ms or int(a['duration'].removesuffix('ms')), loop)}, scale, dirs, bbox=(x0, y0, x1, y1))


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
    icon(DASH_ICON).save(SHEETS / 'dash_icon.png', optimize=True)
    icon(SHOUT_ICON).save(SHEETS / 'shout_icon.png', optimize=True)
    icon(THROW_ICON).save(SHEETS / 'throw_icon.png', optimize=True)
    strip = Image.new('RGBA', (64 * len(GEAR_ICONS), 64))
    for k, i in enumerate(GEAR_ICONS):
        strip.paste(icon(i), (64 * k, 0))
    strip.save(SHEETS / 'gear_icons.png', optimize=True)

    def strip_of(ids, name):
        out = Image.new('RGBA', (64 * len(ids), 64))
        for k, i in enumerate(ids):
            im = icon(abs(i))
            if i < 0:
                im = Image.merge('RGBA', (*ImageEnhance.Color(im.convert('RGB')).enhance(0).split(), im.getchannel('A')))
            out.paste(im, (64 * k, 0))
        out.save(SHEETS / name, optimize=True)

    strip_of(WIZARD_GEAR_ICONS, 'wizard_gear_icons.png')
    strip_of(WIZARD_SKILL_ICONS, 'wizard_skill_icons.png')
    strip_of(RANGER_GEAR_ICONS, 'ranger_gear_icons.png')
    strip_of(RANGER_SKILL_ICONS, 'ranger_skill_icons.png')
    strip_of(NECRO_SKILL_ICONS, 'necro_skill_icons.png')


def credits():
    files = '\n'.join(f'  {f}' for f in FETCHED)
    flare = fetch('CREDITS.txt').read_text(encoding='utf-8')
    (PUBLIC / 'CREDITS.txt').write_text(
        f'''이 폴더와 게임의 캐릭터·던전·아이템 그림·마우스 커서·효과음·음악은 Flare: Empyrean Campaign의 아트를 가공한 것입니다.
Character sprites, dungeon tiles, item images, mouse cursors, sound effects and music in this game are derived from Flare: Empyrean Campaign art.

Source: https://github.com/flareteam/flare-game (commit {COMMIT})
License: CC-BY-SA 3.0 - https://creativecommons.org/licenses/by-sa/3.0/
The derived sprite sheets are also licensed under CC-BY-SA 3.0.
Modifications: selected frames, equipment layers (weapon, armor, helm, boots; legs and hands merged) scaled by {SCALE},
necromancer layers recolored,
alpha thresholded, reduced to 256 colors. Dungeon tiles: floor and wall faces flattened
from isometric into square textures, wall brightened; props and stairs scaled by {TILE_SCALE:.3f}.
Sound effects and music: copied unchanged (Ogg Vorbis).
Items: drop animations scaled by {SCALE} (potion by 0.5), item icons cropped from the icon atlas.

Demon (ruins boss): "Demon - Flare sprite sheets", OpenGameArt, CC0 - {GRIDS['demon']['url']}
Modifications: selected frames, saturation and brightness lowered, scaled by {KIND_SCALE['demon']}, alpha thresholded, reduced to 256 colors.

Time witch (ending): female avatar mage hood, vest, skirt, sleeves and boots recolored black and purple; kneeling frame made by cutting the knees out of the idle frame.

Fallen paladin (boss): "8 Directional Greatsword Knight" by Hormelz, itch.io, CC0 - {KNIGHT['url']}
Modifications: idle frames halved, recolored (32-color palette swap), hit and death frames made by rotating the idle frame, scaled by {KNIGHT['scale']}, alpha thresholded, reduced to 256 colors.

Files used:
{files}

--- Flare CREDITS.txt ---
{flare}''', encoding='utf-8')


def witch():
    frames, meta = frames_of({slot: f'avatar/female/{n}@witch' for slot, n in WITCH_LAYERS.items()}, {'stance': 'stance', 'move': 'run'})
    for d in range(8):
        im, (x, y) = frames[('stance', d, 0)]
        a, b = (round(im.height * k) for k in WITCH_KNEEL)
        out = Image.new('RGBA', (im.width, im.height - (b - a)))
        out.paste(im.crop((0, 0, im.width, a)), (0, 0))
        out.paste(im.crop((0, b, im.width, im.height)), (0, a))
        frames[('kneel', d, 0)] = (out, (x, y + b - a))
    meta['kneel'] = (1, 1000, 'play_once')
    pack('witch', frames, meta, SCALE, 8)


if __name__ == '__main__':
    import sys
    if sys.argv[1:] == ['witch']:  # 마녀만 다시 굽는다(CREDITS.txt는 전체 실행에서)
        witch()
        sys.exit()
    SHEETS.mkdir(parents=True, exist_ok=True)
    PUBLIC.mkdir(parents=True, exist_ok=True)
    TILES.mkdir(parents=True, exist_ok=True)
    for kind in KINDS:
        pack(kind, *frames_of(KINDS[kind], KIND_ANIMS.get(kind, ANIMS)), KIND_SCALE.get(kind, SCALE), 8)
    knight = knight_frames()
    pack('fallen_paladin', *knight, KNIGHT['scale'], 8)
    (SHEETS / 'fallen_paladin_heads.json').write_text(json.dumps(knight_heads(*knight)) + '\n', encoding='utf-8')  # 후광 고리가 따라갈 머리 자리
    for name, src in NPCS.items():
        pack(name, *frames_of({'body': src}, {'stance': 'stance'}), SCALE, 8)
    effect('arrow', 'arrows')  # 화살: 8방향 3프레임, 기준점 위로 비행 높이가 들어 있다
    effect('cleave', 'cleave')
    effect('fireball', 'fireball')  # 화염구: 8방향 4프레임
    effect('blast', 'blast', dirs=1, scale=BLAST_SCALE)  # 폭발: 6프레임, 방향 무관
    effect('axe', 'throw_axe')  # 도끼: 8방향 8프레임 회전
    effect('quake', 'quake', dirs=1, scale=QUAKE_SCALE)  # 함성: 땅 울림
    # 마법사
    effect('ember', 'ember', grow=0.9 / SCALE)  # 마력탄: 작은 불씨(8방향). 크기는 키우되 화살처럼 가슴 높이(약 1m)로 난다
    effect('thunder', 'thunderstrike', dirs=1, scale=0.17, ms=500)  # 낙뢰: 높이 약 3.8m. 원본(200ms)은 너무 짧아 늘린다
    effect('spark', 'lightning', dirs=1, scale=0.35, ms=450)  # 연쇄 번개가 튄 적
    effect('ice', 'freeze', dirs=1, scale=0.4)  # 얼어붙은 적: 얼음 결정
    effect('frost', 'freeze', dirs=3, scale=0.4)  # 서리 고리 장판에서 솟는 얼음 결정(모양 3가지 = 줄 3개, 프레임 0 = 다 자란 결정 → 3 = 부서짐)
    effect('blink', 'sparkle', dirs=1, scale=0.28)  # 순간이동
    effect('heal', 'heal', dirs=1, scale=0.33)  # 치유
    # 궁수
    effect('trap', 'bear_trap', dirs=1, scale=0.35, first=2)  # 덫(정면 방향): 프레임 0 = 벌린 덫(놓인 동안), 0→3 = 닫힘
    effect('stuck', 'arrow_stuck')  # 화살비: 땅에 꽂힌 화살(8방향, 3초)
    hero()
    tiles()
    gate()
    flame()
    cave()
    for name, args in WILDS.items():
        cave(name, *args)
    ruins()
    loot()
    witch()
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
