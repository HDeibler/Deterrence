import * as THREE from 'three';

export function createLaunchVehicle() {
  const root = new THREE.Group();
  const stack = new THREE.Group();
  root.add(stack);

  const whiteMaterial = new THREE.MeshStandardMaterial({
    color: 0xf0f2f5,
    roughness: 0.38,
    metalness: 0.28,
  });
  const darkMaterial = new THREE.MeshStandardMaterial({
    color: 0x1a2030,
    roughness: 0.52,
    metalness: 0.22,
  });
  const metalMaterial = new THREE.MeshStandardMaterial({
    color: 0x8a95a6,
    roughness: 0.32,
    metalness: 0.68,
  });
  const accentMaterial = new THREE.MeshStandardMaterial({
    color: 0xd4550a,
    roughness: 0.45,
    metalness: 0.3,
  });
  const fairingMaterial = new THREE.MeshStandardMaterial({
    color: 0xe8ecf0,
    roughness: 0.42,
    metalness: 0.18,
  });

  const parts = {
    firstStage: buildFirstStage({ whiteMaterial, darkMaterial, metalMaterial, accentMaterial }),
    secondStage: buildSecondStage({ whiteMaterial, darkMaterial, metalMaterial }),
    fairing: buildPayloadFairing({ fairingMaterial, darkMaterial, metalMaterial }),
  };

  const layout = layoutRocketStack(parts);

  stack.add(parts.firstStage.group, parts.secondStage.group, parts.fairing.group);

  const plume = createRocketPlume();
  stack.add(plume.group);
  const halo = createRocketHalo();
  root.add(halo);
  root.visible = false;

  return {
    object3d: root,
    forwardAxis: new THREE.Vector3(0, 1, 0),
    nativeLength: layout.totalLength,
    setVisualState(snapshot, elapsedSeconds = 0) {
      const stageIndex = snapshot?.stageIndex ?? 0;
      const engineOn = snapshot?.engineOn ?? false;
      const visible = snapshot?.visible ?? false;

      root.visible = visible;
      parts.firstStage.group.visible = stageIndex === 0;
      parts.secondStage.group.visible = true;
      parts.fairing.group.visible = stageIndex < 2;

      plume.group.visible = engineOn;
      halo.visible = visible && engineOn;

      if (engineOn) {
        const activeNozzle = stageIndex === 0 ? parts.firstStage : parts.secondStage;
        plume.group.position.copy(activeNozzle.nozzleAnchor);

        const flicker =
          0.88 + Math.sin(elapsedSeconds * 28) * 0.06 + Math.sin(elapsedSeconds * 17) * 0.04;
        plume.core.scale.setScalar(flicker);
        plume.cone.scale.set(1, flicker, 1);
        halo.position.copy(activeNozzle.nozzleAnchor).multiplyScalar(0.7);

        const plumeScale = stageIndex === 0 ? 1.8 : 1.1;
        plume.group.scale.setScalar(plumeScale);
      }

      halo.material.opacity = visible && engineOn ? 0.14 : 0;
    },
  };
}

// ─── First Stage: Large cylindrical booster ─────────────────────────────────

function buildFirstStage({ whiteMaterial, darkMaterial, metalMaterial, accentMaterial }) {
  const length = 0.000038;
  const radius = 0.0000048;
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius * 1.02, length, 28, 4, false),
    whiteMaterial,
  );
  group.add(body);

  const accentBand = createBand(radius * 1.03, length * 0.06, accentMaterial);
  accentBand.position.y = length * 0.18;
  group.add(accentBand);

  const lowerBand = createBand(radius * 1.025, 0.0000008, darkMaterial);
  lowerBand.position.y = -length * 0.46;
  group.add(lowerBand);

  const midBand = createBand(radius * 1.018, 0.0000006, darkMaterial);
  midBand.position.y = -length * 0.08;
  group.add(midBand);

  const interstage = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 1.06, radius * 1.01, 0.0000028, 28, 1, false),
    metalMaterial,
  );
  interstage.position.y = length * 0.5 - 0.0000005;
  group.add(interstage);

  const engineSection = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 1.02, radius * 0.92, 0.000003, 28, 1, false),
    darkMaterial,
  );
  engineSection.position.y = -length * 0.5 - 0.0000012;
  group.add(engineSection);

  const nozzleLength = 0.0000058;
  const mainNozzle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0000028, 0.0000038, nozzleLength, 18, 1, false),
    metalMaterial,
  );
  mainNozzle.position.y = -length * 0.5 - 0.000003 - nozzleLength * 0.5;
  group.add(mainNozzle);

  const bellRim = new THREE.Mesh(
    new THREE.TorusGeometry(0.0000039, 0.00000045, 8, 18),
    metalMaterial,
  );
  bellRim.position.y = -length * 0.5 - 0.000003 - nozzleLength;
  bellRim.rotation.x = Math.PI * 0.5;
  group.add(bellRim);

  for (let i = 0; i < 4; i += 1) {
    const angle = (Math.PI * 2 * i) / 4 + Math.PI * 0.25;
    const vernier = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0000008, 0.0000012, 0.0000025, 10, 1, false),
      metalMaterial,
    );
    vernier.position.set(
      Math.cos(angle) * radius * 0.82,
      -length * 0.5 - 0.000004,
      Math.sin(angle) * radius * 0.82,
    );
    group.add(vernier);
  }

  return {
    group,
    length,
    nozzleAnchor: new THREE.Vector3(0, -length * 0.5 - 0.000003 - nozzleLength, 0),
  };
}

// ─── Second Stage: Slimmer upper stage ──────────────────────────────────────

function buildSecondStage({ whiteMaterial, darkMaterial, metalMaterial }) {
  const length = 0.000022;
  const radius = 0.0000038;
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius * 1.01, length, 24, 3, false),
    whiteMaterial,
  );
  group.add(body);

  const lowerBand = createBand(radius * 1.02, 0.0000007, darkMaterial);
  lowerBand.position.y = -length * 0.44;
  group.add(lowerBand);

  const upperBand = createBand(radius * 1.015, 0.0000005, darkMaterial);
  upperBand.position.y = length * 0.28;
  group.add(upperBand);

  const topAdapter = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 1.04, radius * 1.0, 0.0000016, 24, 1, false),
    metalMaterial,
  );
  topAdapter.position.y = length * 0.5 - 0.0000003;
  group.add(topAdapter);

  const nozzleLength = 0.0000042;
  const nozzle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.000002, 0.0000032, nozzleLength, 16, 1, false),
    metalMaterial,
  );
  nozzle.position.y = -length * 0.5 - nozzleLength * 0.5;
  group.add(nozzle);

  const extensionSkirt = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0000033, 0.0000024, nozzleLength * 0.28, 16, 1, true),
    darkMaterial,
  );
  extensionSkirt.position.y = -length * 0.5 - nozzleLength * 0.88;
  group.add(extensionSkirt);

  return {
    group,
    length,
    nozzleAnchor: new THREE.Vector3(0, -length * 0.5 - nozzleLength, 0),
  };
}

// ─── Payload Fairing: Ogive nose cone ───────────────────────────────────────

function buildPayloadFairing({ fairingMaterial, darkMaterial, metalMaterial }) {
  const bodyLength = 0.000018;
  const noseLength = 0.000014;
  const radius = 0.0000042;
  const group = new THREE.Group();

  const cylinderSection = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, bodyLength, 24, 2, false),
    fairingMaterial,
  );
  group.add(cylinderSection);

  const ogivePoints = [];
  const ogiveSegments = 18;
  for (let i = 0; i <= ogiveSegments; i += 1) {
    const t = i / ogiveSegments;
    const y = t * noseLength;
    const r = radius * Math.sqrt(1 - t * t * 0.92);
    ogivePoints.push(new THREE.Vector2(r, y));
  }
  const ogiveGeometry = new THREE.LatheGeometry(ogivePoints, 24);
  const noseCone = new THREE.Mesh(ogiveGeometry, fairingMaterial);
  noseCone.position.y = bodyLength * 0.5;
  group.add(noseCone);

  const seamLine1 = new THREE.Mesh(
    new THREE.BoxGeometry(0.0000004, bodyLength + noseLength * 0.6, radius * 0.06),
    darkMaterial,
  );
  seamLine1.position.y = noseLength * 0.15;
  seamLine1.position.z = radius * 0.02;
  group.add(seamLine1);

  const seamLine2 = seamLine1.clone();
  seamLine2.position.z = -radius * 0.02;
  seamLine2.rotation.y = Math.PI;
  group.add(seamLine2);

  const baseRing = createBand(radius * 1.03, 0.0000008, metalMaterial);
  baseRing.position.y = -bodyLength * 0.5;
  group.add(baseRing);

  return {
    group,
    length: bodyLength + noseLength,
  };
}

// ─── Stack layout ───────────────────────────────────────────────────────────

function layoutRocketStack(parts) {
  const ordered = ['firstStage', 'secondStage', 'fairing'];
  const totalLength = ordered.reduce((sum, key) => sum + parts[key].length, 0);
  let cursor = -totalLength * 0.5;

  for (const key of ordered) {
    const part = parts[key];
    const centerY = cursor + part.length * 0.5;
    part.group.position.y = centerY;
    if (part.nozzleAnchor) {
      part.nozzleAnchor = part.nozzleAnchor.clone().add(new THREE.Vector3(0, centerY, 0));
    }
    cursor += part.length;
  }

  return { totalLength };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function createBand(radius, height, material) {
  return new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 22, 1, false), material);
}

function createRocketPlume() {
  const group = new THREE.Group();
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(0.000004, 0.000022, 16, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xff9944,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
    }),
  );
  cone.rotation.x = Math.PI;
  cone.position.y = -0.000011;

  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.0000028, 14, 14),
    new THREE.MeshBasicMaterial({
      color: 0xfff4d0,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    }),
  );
  core.position.y = -0.0000014;

  const outerGlow = new THREE.Mesh(
    new THREE.ConeGeometry(0.0000055, 0.000028, 14, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xff6622,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
    }),
  );
  outerGlow.rotation.x = Math.PI;
  outerGlow.position.y = -0.000014;

  group.add(outerGlow, cone, core);
  group.visible = false;
  group.scale.setScalar(1.5);
  return { group, cone, core };
}

function createRocketHalo() {
  return new THREE.Mesh(
    new THREE.SphereGeometry(0.0000035, 16, 16),
    new THREE.MeshBasicMaterial({
      color: 0xffcc66,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
    }),
  );
}
