"""대장장이 창 그림: 모루(3D 모델을 블렌더로 렌더)와 대장 망치·모루 소리(FLARE 원본)를 받아 게임 자산으로 만든다. 결과는 커밋한다.

실행: python tools/forge_art.py   (Python 3 + Pillow·soundfile, Blender — BLENDER 환경 변수 또는 기본 설치 경로)
모루: tools/art/models/Anvil.zip — PagDev "Anvil"(OpenGameArt, CC-BY 4.0)
망치·소리: Flare: Empyrean Campaign(CC-BY-SA 3.0) — tools/sprites.py와 같은 커밋
"""
import io, os, subprocess, sys, tempfile, urllib.request, zipfile
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'src/assets/sprites'
SOUNDS = ROOT / 'src/assets/sounds'
FLARE = 'https://raw.githubusercontent.com/flareteam/flare-game/af6eee6d339ac98011864bfe89da837fe7769c28/'
BLENDER = os.environ.get('BLENDER', r'C:\Program Files\Blender Foundation\Blender 5.3\blender.exe')
SIZE = 512  # 렌더 한 변(px). 창에서는 반 크기로 그린다

# 블렌더 안에서 도는 부분: obj를 읽어 텍스처를 붙이고, FLARE 아이콘처럼 왼쪽 위 빛·위에서 비스듬히 내려다본 각도로 투명 바탕에 렌더한다
SCENE = r'''
import bpy, math, sys
from mathutils import Vector
src, out, size = sys.argv[-3], sys.argv[-2], int(sys.argv[-1])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.obj_import(filepath=src + '/Anvil.obj')
obj = [o for o in bpy.context.scene.objects if o.type == 'MESH']
mat = bpy.data.materials.new('anvil'); mat.use_nodes = True
nt = mat.node_tree; bsdf = nt.nodes['Principled BSDF']
tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = bpy.data.images.load(src + '/Texturen/Diffuse.png')
nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
spec = nt.nodes.new('ShaderNodeTexImage'); spec.image = bpy.data.images.load(src + '/Texturen/Specular.png'); spec.image.colorspace_settings.name = 'Non-Color'
inv = nt.nodes.new('ShaderNodeInvert'); nt.links.new(spec.outputs['Color'], inv.inputs['Color'])
nt.links.new(inv.outputs['Color'], bsdf.inputs['Roughness'])
bsdf.inputs['Metallic'].default_value = 0.55  # 너무 높으면 어두운 바탕만 비쳐 새까맣다
for o in obj:
    o.data.materials.clear(); o.data.materials.append(mat)
# 모델을 원점에 앉히고 크기 1로
lo = Vector((min(v[i] for o in obj for v in [o.matrix_world @ Vector(c) for c in o.bound_box]) for i in range(3)))
hi = Vector((max(v[i] for o in obj for v in [o.matrix_world @ Vector(c) for c in o.bound_box]) for i in range(3)))
s = 1 / max(hi - lo)
for o in obj:
    o.location = (o.location - (lo + hi) / 2) * s; o.scale = o.scale * s
bpy.context.view_layer.update()
sc = bpy.context.scene
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'; cam.data.ortho_scale = 1.25
el, az, d = math.radians(26), math.radians(-12), 6  # 옆에서 조금 비껴 위로: 뿔이 옆으로 뻗은 실루엣
cam.location = (d * math.cos(el) * math.sin(az), -d * math.cos(el) * math.cos(az), d * math.sin(el))
cam.rotation_euler = (Vector((0, 0, 0)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
def light(name, kind, energy, color, rot):
    l = bpy.data.objects.new(name, bpy.data.lights.new(name, kind)); sc.collection.objects.link(l)
    l.data.energy = energy; l.data.color = color; l.rotation_euler = [math.radians(a) for a in rot]
light('key', 'SUN', 7.0, (1, 0.95, 0.88), (50, 0, -60))   # 왼쪽 위(FLARE 아이콘과 같은 쪽)
light('fill', 'SUN', 1.5, (0.6, 0.7, 1), (60, 0, 120))
light('forge', 'SUN', 3.5, (1, 0.45, 0.15), (105, 0, 20))  # 아래 앞쪽에서 올라오는 화덕 빛
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.12, 0.1, 0.08, 1)
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 64  # 헤드리스에서 Eevee는 GPU가 없으면 죽는다
sc.render.film_transparent = True
sc.render.resolution_x = sc.render.resolution_y = size
sc.render.filepath = out
bpy.ops.render.render(write_still=True)
'''


def anvil():
    with tempfile.TemporaryDirectory() as tmp:
        zipfile.ZipFile(ROOT / 'tools/art/models/Anvil.zip').extractall(tmp)
        script = Path(tmp) / 'scene.py'
        script.write_text(SCENE, encoding='utf8')
        out = Path(tmp) / 'anvil.png'
        subprocess.run([BLENDER, '-b', '--factory-startup', '-P', str(script), '--', str(Path(tmp) / 'Anvil'), str(out), str(SIZE)], check=True, stdout=subprocess.DEVNULL if os.environ.get('QUIET', '1') == '1' else None)
        im = Image.open(out).convert('RGBA')
        im.crop(im.getbbox()).save(OUT / 'anvil.png', optimize=True)


def flare(path: str) -> bytes:
    with urllib.request.urlopen(FLARE + path) as r:
        return r.read()


def hammer():
    # 아이콘(256×256, 검은 바탕): 가장자리 검은색을 투명하게 해서 모루 위에 겹쳐 그린다
    im = Image.open(io.BytesIO(flare('art_src/icons/weapons_xpac/4smith_hammer.png'))).convert('RGBA')
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            v = max(r, g, b)
            if v < 40: px[x, y] = (r, g, b, int(a * v / 40))
    im.crop(im.getbbox()).save(OUT / 'smith_hammer.png', optimize=True)


def sound():
    # 원본은 25초 동안 여러 번 두드리는 고리 소리: 홀로 떨어진 한 번(8.06초)만 0.9초 잘라 끝을 줄인다. soundfile(pip) 필요
    import numpy as np, soundfile as sf
    d, rate = sf.read(io.BytesIO(flare('mods/fantasycore/soundfx/environment/anvil_loop.ogg')))
    a, n = int(8.06 * rate), int(0.9 * rate)
    clip = d[a:a + n] * np.linspace(1, 0, n) ** 2 if d.ndim == 1 else d[a:a + n] * (np.linspace(1, 0, n) ** 2)[:, None]
    sf.write(SOUNDS / 'anvil.ogg', clip, rate, format='OGG', subtype='VORBIS')


if __name__ == '__main__':
    only = sys.argv[1:] or ['anvil', 'hammer', 'sound']
    for f in only:
        globals()[f]()
        print('done', f)
