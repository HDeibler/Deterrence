import * as THREE from 'three';

// ── Shared materials ───────────────────────────────────────────────
const _dark = new THREE.MeshStandardMaterial({ color: 0x2a2e34, roughness: 0.6, metalness: 0.4 });
const _mid = new THREE.MeshStandardMaterial({ color: 0x4a5058, roughness: 0.5, metalness: 0.4 });
const _light = new THREE.MeshStandardMaterial({ color: 0x6a7078, roughness: 0.5, metalness: 0.3 });
const _glass = new THREE.MeshStandardMaterial({ color: 0x1a2030, roughness: 0.2, metalness: 0.8 });
const _engine = new THREE.MeshStandardMaterial({ color: 0x1e2228, roughness: 0.3, metalness: 0.7 });
const _white = new THREE.MeshStandardMaterial({ color: 0xc8ccd4, roughness: 0.5, metalness: 0.2 });
const _tankerGrey = new THREE.MeshStandardMaterial({ color: 0x8a9098, roughness: 0.5, metalness: 0.3 });
const _cargoGrey = new THREE.MeshStandardMaterial({ color: 0x5a6268, roughness: 0.6, metalness: 0.3 });

// ====================================================================
//  F-35 LIGHTNING II — stealth fighter
// ====================================================================
export function createF35() {
  const group = new THREE.Group();
  const L = 0.0008;
  const W = 0.00055;

  // Fuselage — angular stealth shape
  const fuselageGeo = new THREE.BoxGeometry(L * 0.18, L * 0.1, L);
  fuselageGeo.translate(0, 0, L * 0.05);
  group.add(new THREE.Mesh(fuselageGeo, _dark));

  // Nose cone
  const noseGeo = new THREE.ConeGeometry(L * 0.08, L * 0.22, 4);
  noseGeo.rotateX(Math.PI / 2);
  noseGeo.rotateY(Math.PI / 4);
  noseGeo.translate(0, L * 0.01, L * 0.6);
  group.add(new THREE.Mesh(noseGeo, _dark));

  // Canopy
  const canopyGeo = new THREE.BoxGeometry(L * 0.1, L * 0.06, L * 0.18);
  canopyGeo.translate(0, L * 0.08, L * 0.38);
  group.add(new THREE.Mesh(canopyGeo, _glass));

  // Main wings — trapezoidal
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0);
  wingShape.lineTo(W * 0.5, -L * 0.12);
  wingShape.lineTo(W * 0.48, -L * 0.32);
  wingShape.lineTo(0, -L * 0.16);
  wingShape.closePath();

  const wingGeo = new THREE.ExtrudeGeometry(wingShape, {
    steps: 1, depth: L * 0.02, bevelEnabled: false,
  });
  wingGeo.rotateX(-Math.PI / 2);
  wingGeo.translate(0, 0, L * 0.22);
  group.add(new THREE.Mesh(wingGeo, _dark));

  // Mirror wing
  const wingGeoL = wingGeo.clone();
  wingGeoL.scale(-1, 1, 1);
  group.add(new THREE.Mesh(wingGeoL, _dark));

  // Vertical stabilizers (canted)
  const tailGeo = new THREE.BoxGeometry(L * 0.015, L * 0.14, L * 0.1);
  const tailR = new THREE.Mesh(tailGeo, _mid);
  tailR.position.set(L * 0.06, L * 0.1, -L * 0.28);
  tailR.rotation.z = -0.35;
  group.add(tailR);

  const tailL = new THREE.Mesh(tailGeo.clone(), _mid);
  tailL.position.set(-L * 0.06, L * 0.1, -L * 0.28);
  tailL.rotation.z = 0.35;
  group.add(tailL);

  // Horizontal stabilizers
  const hStabGeo = new THREE.BoxGeometry(W * 0.45, L * 0.012, L * 0.1);
  hStabGeo.translate(0, 0, -L * 0.32);
  group.add(new THREE.Mesh(hStabGeo, _dark));

  // Engine nozzle
  const nozzleGeo = new THREE.CylinderGeometry(L * 0.04, L * 0.05, L * 0.08, 8);
  nozzleGeo.rotateX(Math.PI / 2);
  nozzleGeo.translate(0, 0, -L * 0.42);
  group.add(new THREE.Mesh(nozzleGeo, _engine));

  return { object3d: group, type: 'f35' };
}

// ====================================================================
//  B-2 SPIRIT — flying wing stealth bomber
// ====================================================================
export function createB2() {
  const group = new THREE.Group();
  const L = 0.001;
  const W = 0.0018;

  // Central body
  const bodyGeo = new THREE.BoxGeometry(W * 0.22, L * 0.06, L * 0.65);
  bodyGeo.translate(0, 0, L * 0.05);
  group.add(new THREE.Mesh(bodyGeo, _dark));

  // Flying wing — swept chevron shape
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0);
  wingShape.lineTo(W * 0.5, -L * 0.08);
  wingShape.lineTo(W * 0.42, -L * 0.38);
  wingShape.lineTo(W * 0.12, -L * 0.26);
  wingShape.lineTo(0, -L * 0.3);
  wingShape.closePath();

  const wingGeo = new THREE.ExtrudeGeometry(wingShape, {
    steps: 1, depth: L * 0.025, bevelEnabled: false,
  });
  wingGeo.rotateX(-Math.PI / 2);
  wingGeo.translate(0, 0, L * 0.2);
  group.add(new THREE.Mesh(wingGeo, _dark));

  const wingGeoL = wingGeo.clone();
  wingGeoL.scale(-1, 1, 1);
  group.add(new THREE.Mesh(wingGeoL, _dark));

  // Cockpit windows
  const canopyGeo = new THREE.BoxGeometry(W * 0.08, L * 0.03, L * 0.1);
  canopyGeo.translate(0, L * 0.045, L * 0.28);
  group.add(new THREE.Mesh(canopyGeo, _glass));

  // Engine intakes (flush with wing surface)
  for (const side of [-1, 1]) {
    const intakeGeo = new THREE.BoxGeometry(W * 0.04, L * 0.03, L * 0.08);
    intakeGeo.translate(side * W * 0.12, L * 0.02, L * 0.06);
    group.add(new THREE.Mesh(intakeGeo, _engine));
  }

  // Sawtooth trailing edge nozzles (embedded)
  for (const side of [-1, 1]) {
    const nozzleGeo = new THREE.BoxGeometry(W * 0.035, L * 0.02, L * 0.04);
    nozzleGeo.translate(side * W * 0.1, 0, -L * 0.18);
    group.add(new THREE.Mesh(nozzleGeo, _engine));
  }

  return { object3d: group, type: 'b2' };
}

// ====================================================================
//  KC-135 STRATOTANKER — aerial refueling
// ====================================================================
export function createTanker() {
  const group = new THREE.Group();
  const L = 0.001;
  const W = 0.001;

  // Fuselage — cylindrical
  const fuselageGeo = new THREE.CapsuleGeometry(L * 0.06, L * 0.7, 6, 12);
  fuselageGeo.rotateX(Math.PI / 2);
  fuselageGeo.translate(0, 0, L * 0.05);
  group.add(new THREE.Mesh(fuselageGeo, _tankerGrey));

  // Nose cone
  const noseGeo = new THREE.ConeGeometry(L * 0.055, L * 0.12, 8);
  noseGeo.rotateX(Math.PI / 2);
  noseGeo.translate(0, L * 0.005, L * 0.48);
  group.add(new THREE.Mesh(noseGeo, _tankerGrey));

  // Cockpit windows
  const canopyGeo = new THREE.BoxGeometry(L * 0.06, L * 0.03, L * 0.04);
  canopyGeo.translate(0, L * 0.055, L * 0.4);
  group.add(new THREE.Mesh(canopyGeo, _glass));

  // Swept wings
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0);
  wingShape.lineTo(W * 0.5, -L * 0.05);
  wingShape.lineTo(W * 0.45, -L * 0.28);
  wingShape.lineTo(0, -L * 0.14);
  wingShape.closePath();

  const wingGeo = new THREE.ExtrudeGeometry(wingShape, {
    steps: 1, depth: L * 0.018, bevelEnabled: false,
  });
  wingGeo.rotateX(-Math.PI / 2);
  wingGeo.translate(0, 0, L * 0.08);
  group.add(new THREE.Mesh(wingGeo, _white));

  const wingGeoL = wingGeo.clone();
  wingGeoL.scale(-1, 1, 1);
  group.add(new THREE.Mesh(wingGeoL, _white));

  // 4 engine pods under wings
  const engineGeo = new THREE.CylinderGeometry(L * 0.02, L * 0.022, L * 0.08, 8);
  engineGeo.rotateX(Math.PI / 2);
  const enginePositions = [
    [W * 0.15, -L * 0.03, L * 0.03],
    [W * 0.3, -L * 0.04, -L * 0.01],
    [-W * 0.15, -L * 0.03, L * 0.03],
    [-W * 0.3, -L * 0.04, -L * 0.01],
  ];
  for (const [ex, ey, ez] of enginePositions) {
    const eng = new THREE.Mesh(engineGeo, _engine);
    eng.position.set(ex, ey, ez);
    group.add(eng);
  }

  // Vertical stabilizer
  const vStabGeo = new THREE.BoxGeometry(L * 0.015, L * 0.14, L * 0.12);
  vStabGeo.translate(0, L * 0.12, -L * 0.3);
  group.add(new THREE.Mesh(vStabGeo, _tankerGrey));

  // Horizontal stabilizers
  const hStabGeo = new THREE.BoxGeometry(W * 0.32, L * 0.012, L * 0.08);
  hStabGeo.translate(0, L * 0.04, -L * 0.32);
  group.add(new THREE.Mesh(hStabGeo, _white));

  // Refueling boom (distinctive tanker feature — extends from tail)
  const boomGeo = new THREE.CylinderGeometry(L * 0.008, L * 0.01, L * 0.2, 6);
  boomGeo.rotateX(Math.PI / 2);
  boomGeo.translate(0, -L * 0.04, -L * 0.4);
  const boomMesh = new THREE.Mesh(boomGeo, _mid);
  boomMesh.rotation.x = 0.25;
  group.add(boomMesh);

  return { object3d: group, type: 'tanker' };
}

// ====================================================================
//  C-17 GLOBEMASTER III — strategic cargo
// ====================================================================
export function createCargo() {
  const group = new THREE.Group();
  const L = 0.0012;
  const W = 0.0012;

  // Fuselage — fat cylindrical body
  const fuselageGeo = new THREE.CapsuleGeometry(L * 0.08, L * 0.65, 6, 12);
  fuselageGeo.rotateX(Math.PI / 2);
  fuselageGeo.translate(0, 0, L * 0.05);
  group.add(new THREE.Mesh(fuselageGeo, _cargoGrey));

  // Nose cone
  const noseGeo = new THREE.ConeGeometry(L * 0.075, L * 0.1, 8);
  noseGeo.rotateX(Math.PI / 2);
  noseGeo.translate(0, L * 0.01, L * 0.46);
  group.add(new THREE.Mesh(noseGeo, _cargoGrey));

  // Cockpit
  const canopyGeo = new THREE.BoxGeometry(L * 0.07, L * 0.04, L * 0.06);
  canopyGeo.translate(0, L * 0.07, L * 0.38);
  group.add(new THREE.Mesh(canopyGeo, _glass));

  // High-mounted swept wings (distinctive C-17 feature)
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0);
  wingShape.lineTo(W * 0.5, -L * 0.04);
  wingShape.lineTo(W * 0.46, -L * 0.26);
  wingShape.lineTo(0, -L * 0.12);
  wingShape.closePath();

  const wingGeo = new THREE.ExtrudeGeometry(wingShape, {
    steps: 1, depth: L * 0.022, bevelEnabled: false,
  });
  wingGeo.rotateX(-Math.PI / 2);
  wingGeo.translate(0, L * 0.06, L * 0.1);
  group.add(new THREE.Mesh(wingGeo, _cargoGrey));

  const wingGeoL = wingGeo.clone();
  wingGeoL.scale(-1, 1, 1);
  group.add(new THREE.Mesh(wingGeoL, _cargoGrey));

  // 4 engine pods under wings
  const engineGeo = new THREE.CylinderGeometry(L * 0.025, L * 0.028, L * 0.1, 8);
  engineGeo.rotateX(Math.PI / 2);
  const enginePositions = [
    [W * 0.14, L * 0.02, L * 0.06],
    [W * 0.32, L * 0.01, L * 0.02],
    [-W * 0.14, L * 0.02, L * 0.06],
    [-W * 0.32, L * 0.01, L * 0.02],
  ];
  for (const [ex, ey, ez] of enginePositions) {
    const eng = new THREE.Mesh(engineGeo, _engine);
    eng.position.set(ex, ey, ez);
    group.add(eng);
  }

  // T-tail vertical stabilizer (tall)
  const vStabGeo = new THREE.BoxGeometry(L * 0.018, L * 0.2, L * 0.14);
  vStabGeo.translate(0, L * 0.16, -L * 0.28);
  group.add(new THREE.Mesh(vStabGeo, _cargoGrey));

  // T-tail horizontal stabilizer (at top of vertical)
  const hStabGeo = new THREE.BoxGeometry(W * 0.35, L * 0.012, L * 0.08);
  hStabGeo.translate(0, L * 0.26, -L * 0.3);
  group.add(new THREE.Mesh(hStabGeo, _cargoGrey));

  // Upswept rear fuselage (cargo ramp area)
  const rampGeo = new THREE.BoxGeometry(L * 0.12, L * 0.06, L * 0.08);
  rampGeo.translate(0, -L * 0.02, -L * 0.28);
  const ramp = new THREE.Mesh(rampGeo, _cargoGrey);
  ramp.rotation.x = -0.3;
  group.add(ramp);

  return { object3d: group, type: 'cargo' };
}
