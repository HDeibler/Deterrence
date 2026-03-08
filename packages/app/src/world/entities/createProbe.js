import * as THREE from 'three';

export function createProbe() {
  const probe = new THREE.Group();
  const probeCore = new THREE.Mesh(
    new THREE.BoxGeometry(0.13, 0.13, 0.22),
    new THREE.MeshStandardMaterial({ color: 0xe8edf6, roughness: 0.48, metalness: 0.7 }),
  );
  const panelMaterial = new THREE.MeshStandardMaterial({
    color: 0x3d78d8,
    roughness: 0.35,
    metalness: 0.4,
  });
  const leftPanel = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.02, 0.16), panelMaterial);
  const rightPanel = leftPanel.clone();
  leftPanel.position.x = -0.27;
  rightPanel.position.x = 0.27;
  probe.add(probeCore, leftPanel, rightPanel);
  return probe;
}
