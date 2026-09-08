// Geometry invariants for the graphics-only draw-call optimization.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../.build/node_modules/three/build/three.module.js';

const scope = { THREE, window: {}, Float32Array, Uint16Array, Uint32Array };
vm.createContext(scope);
vm.runInContext(fs.readFileSync(new URL('../render.js', import.meta.url), 'utf8'), scope);
const render = scope.window.RENDER;
const scene = new THREE.Scene();
const material = new THREE.MeshStandardMaterial();
const station = new THREE.Group();
station.position.set(0.5, 0.2, 0.5);
scene.add(station);
const source = [];
for (let i = 0; i < 4; i++) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.4), material);
  mesh.position.set(i * 0.3, 0.6, 0);
  mesh.rotation.y = i * 0.25;
  mesh.scale.set(1, 1 + i * 0.1, 1);
  mesh.castShadow = mesh.receiveShadow = true;
  station.add(mesh);
  source.push(mesh);
}
const expectedBounds = new THREE.Box3().setFromObject(station);
const expectedPositions = [];
scene.updateMatrixWorld(true);
source.forEach((mesh) => {
  const p = mesh.geometry.attributes.position;
  for (let i = 0; i < p.count; i++) expectedPositions.push(
    new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld));
});
const protectedObjects = [];
for (let i = 0; i < 3; i++) {
  const transparent = new THREE.Mesh(new THREE.BoxGeometry(),
    new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.4 }));
  const animated = new THREE.Mesh(new THREE.BoxGeometry(), material);
  animated.userData.noBatch = true;
  const skinned = new THREE.SkinnedMesh(new THREE.BoxGeometry(), material);
  scene.add(transparent, animated, skinned);
  protectedObjects.push(transparent, animated, skinned);
}
const sprite = new THREE.Sprite();
sprite.visible = false;
station.add(sprite);
const stats = render.batchStatic(scene);
assert.equal(stats.parts, 4);
assert.equal(stats.batches, 1);
assert.equal(stats.saved, 3);
assert.equal(station.parent, scene, 'Interaction station group must be retained');
sprite.visible = true;
assert.equal(sprite.parent, station, 'Completion marker remains in its station');
protectedObjects.forEach((o) => assert.equal(o.parent, scene));
const batch = scene.getObjectByName('Clinic static furniture');
assert.equal(batch.castShadow, true);
assert.equal(batch.receiveShadow, true);
assert.equal(batch.geometry.index.count, 4 * 36);
assert.ok(batch.geometry.boundingBox.min.distanceTo(expectedBounds.min) < 1e-6);
assert.ok(batch.geometry.boundingBox.max.distanceTo(expectedBounds.max) < 1e-6);
const positions = batch.geometry.attributes.position;
expectedPositions.forEach((p, i) => assert.ok(
  p.distanceTo(new THREE.Vector3().fromBufferAttribute(positions, i)) < 1e-6));
const normals = batch.geometry.attributes.normal;
for (let i = 0; i < normals.count; i++) assert.ok(
  Math.abs(new THREE.Vector3().fromBufferAttribute(normals, i).length() - 1) < 1e-6);
console.log('PASS: world transforms, normals, triangle indices, bounds, interaction groups, transparency and skinned meshes');
