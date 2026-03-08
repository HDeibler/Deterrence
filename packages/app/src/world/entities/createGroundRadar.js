import * as THREE from 'three';

export function createGroundRadar() {
  const root = new THREE.Group();

  const baseMaterial = new THREE.MeshStandardMaterial({
    color: 0x67717f,
    roughness: 0.65,
    metalness: 0.22,
  });
  const dishMaterial = new THREE.MeshStandardMaterial({
    color: 0xb6c0cd,
    roughness: 0.32,
    metalness: 0.48,
  });
  const emitterMaterial = new THREE.MeshBasicMaterial({
    color: 0x7de4ff,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  });

  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.16, 12), baseMaterial);
  pedestal.position.y = 0.08;
  root.add(pedestal);

  const mount = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.05), baseMaterial);
  mount.position.y = 0.18;
  root.add(mount);

  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.12, 20, 12, 0, Math.PI), dishMaterial);
  dish.rotation.z = Math.PI * 0.5;
  dish.position.set(0.08, 0.22, 0);
  root.add(dish);

  const emitter = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 16), emitterMaterial);
  emitter.position.set(0.08, 0.22, 0);
  root.add(emitter);

  return {
    object3d: root,
    nativeHeight: 0.38,
    update(elapsedSeconds) {
      dish.rotation.y = Math.sin(elapsedSeconds * 0.6) * 0.4;
      emitter.material.opacity = 0.2 + Math.sin(elapsedSeconds * 2.1) * 0.06;
    },
  };
}
