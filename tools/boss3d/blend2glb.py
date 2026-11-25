"""Blender 모델(.blend)을 glb로 내보낸다(동작마다 애니메이션 하나). 받은 모델 → glb → render.py 시트.
Blender 안에서 돈다:

    blender -b <파일.blend> --python tools/boss3d/blend2glb.py -- <나올.glb> [남길 메시 이름 ...] [메시=텍스처.png ...]

남길 메시를 주지 않으면 뼈대(아마추어)에 붙은 메시만 남긴다(바닥·조작 손잡이 같은 도우미를 뺀다).
메시=텍스처: 옛 파일은 재질에 그림이 안 이어져 있다 — 그 메시의 재질을 모두 이 그림(.blend 곁 경로)의 기본 재질로 바꾼다.
"""
import sys
import bpy

args = sys.argv[sys.argv.index('--') + 1:]
out = args[0]
keep = {a for a in args[1:] if '=' not in a}
tex = dict(a.split('=', 1) for a in args[1:] if '=' in a)
for o in list(bpy.data.objects):
    if o.type == 'MESH' and (o.name not in keep if keep else not (o.parent and o.parent.type == 'ARMATURE')):
        bpy.data.objects.remove(o)
    elif o.type in ('CAMERA', 'LIGHT', 'EMPTY'):
        bpy.data.objects.remove(o)
for o in bpy.data.objects:
    if o.type != 'MESH' or o.name not in tex:
        continue
    m = bpy.data.materials.new(o.name + '_tex')
    m.use_nodes = True
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    img = nt.nodes.new('ShaderNodeTexImage')
    img.image = bpy.data.images.load(bpy.path.abspath('//' + tex[o.name]))
    nt.links.new(img.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.85
    for slot in o.material_slots:
        slot.material = m
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_animations=True, export_animation_mode='ACTIONS', export_apply=True, export_yup=True)
print('glb:', out, sorted(a.name for a in bpy.data.actions))
