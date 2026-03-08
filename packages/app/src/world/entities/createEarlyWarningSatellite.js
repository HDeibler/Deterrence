import * as THREE from 'three';

export function createEarlyWarningSatellite() {
  const root = new THREE.Group();

  const busMaterial = new THREE.MeshStandardMaterial({
    color: 0xd8dde6,
    roughness: 0.34,
    metalness: 0.6,
  });
  const panelMaterial = new THREE.MeshStandardMaterial({
    color: 0x1e4f8a,
    roughness: 0.4,
    metalness: 0.2,
  });
  const trussMaterial = new THREE.MeshStandardMaterial({
    color: 0x7f8a98,
    roughness: 0.48,
    metalness: 0.52,
  });
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: 0x7de4ff,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
  });

  const bus = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.22, 0.22), busMaterial);
  root.add(bus);

  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 14, 0, Math.PI), busMaterial);
  dish.rotation.z = Math.PI * 0.5;
  dish.position.set(0.16, 0, 0);
  root.add(dish);

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.38, 10), trussMaterial);
  mast.rotation.z = Math.PI * 0.5;
  mast.position.x = -0.08;
  root.add(mast);

  const panelGeometry = new THREE.BoxGeometry(0.44, 0.02, 0.18);
  const leftPanel = new THREE.Mesh(panelGeometry, panelMaterial);
  leftPanel.position.set(-0.38, 0, 0);
  root.add(leftPanel);

  const rightPanel = new THREE.Mesh(panelGeometry, panelMaterial);
  rightPanel.position.set(0.38, 0, 0);
  root.add(rightPanel);

  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.36, 18, 18), glowMaterial);
  root.add(glow);

  return {
    object3d: root,
    nativeLength: 1.02,
    forwardAxis: new THREE.Vector3(1, 0, 0),
    update(elapsedSeconds) {
      leftPanel.rotation.z = Math.sin(elapsedSeconds * 0.35) * 0.025;
      rightPanel.rotation.z = -Math.sin(elapsedSeconds * 0.35) * 0.025;
      glow.material.opacity = 0.14 + Math.sin(elapsedSeconds * 1.3) * 0.02;
    },
  };
}
