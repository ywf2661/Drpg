// 받은 모델(glb, blend2glb.py로 만든 것)을 보스 도구와 같은 카메라로 찍는다. 주소 ?model=orc&h=1.9&yaw=0
// h = 서 있는 키(m)로 맞춘다, yaw = 모델의 앞이 +Z(카메라)를 보게 돌리는 각(라디안). render.py가 renderFrame(facing, 동작 이름, t)를 부른다
import { THREE, root, start } from './kit.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const q = new URLSearchParams(location.search);
const gltf = await new GLTFLoader().loadAsync(`/models/${q.get('model')}.glb`);
const model = gltf.scene;
model.traverse((o) => {
  if (o.isMesh) {
    o.frustumCulled = false; // 뼈로 움직인 메시가 처음 상자 밖으로 나가도 그린다
    if (q.get('normals')) o.geometry.computeVertexNormals(); // 법선이 뒤집혀 나온 옛 모델(앞이 어둡다)
    for (const m of [o.material].flat()) if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
  }
});
const holder = new THREE.Group(); // 크기·발밑·앞 방향을 맞추는 곳(root가 방향을 돌린다)
holder.add(model);
holder.rotation.y = +(q.get('yaw') ?? 0);
root.add(holder);
const mixer = new THREE.AnimationMixer(model);
const clips = Object.fromEntries(gltf.animations.map((c) => [c.name, c]));
// 키·발밑: 첫 동작(서 있기)의 첫 자세에서 잰다
const first = clips[q.get('rest')] ?? gltf.animations[0];
mixer.clipAction(first).play();
mixer.setTime(0);
const box = new THREE.Box3().setFromObject(model, true);
const s = +(q.get('h') ?? 1.8) / (box.max.y - box.min.y);
holder.scale.setScalar(s);
holder.position.y = -box.min.y * s;
mixer.stopAllAction();

let cur = null;
start((name, t) => {
  const clip = clips[name];
  if (!clip) throw new Error(`동작 없음: ${name} (있는 것: ${Object.keys(clips).join(', ')})`);
  if (cur !== clip) {
    mixer.stopAllAction();
    mixer.clipAction(clip).play();
    cur = clip;
  }
  mixer.setTime(t * clip.duration * 0.999);
  model.updateMatrixWorld(true);
});
