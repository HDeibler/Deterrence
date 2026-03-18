import * as THREE from 'three';

// Unified launch vehicle asset — one continuous object that transforms through
// all mission phases: full stack → stage sep → fairing sep → payload deploy.
// No popping between discrete meshes.

export function createLaunchVehicle() {
  const root = new THREE.Group();
  const stack = new THREE.Group();
  root.add(stack);

  // ── Materials ──────────────────────────────────────────────────────────
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
  const goldFoilMaterial = new THREE.MeshStandardMaterial({
    color: 0xd4a843,
    roughness: 0.25,
    metalness: 0.75,
  });
  const solarCellMaterial = new THREE.MeshStandardMaterial({
    color: 0x1a3a6e,
    roughness: 0.35,
    metalness: 0.25,
  });
  const sensorMaterial = new THREE.MeshStandardMaterial({
    color: 0x1a1a2a,
    roughness: 0.15,
    metalness: 0.80,
  });

  // ── Build all components ───────────────────────────────────────────────
  // Each separating part gets cloned materials so fading one doesn't affect others
  const firstStage = buildFirstStage({
    whiteMaterial: whiteMaterial.clone(),
    darkMaterial: darkMaterial.clone(),
    metalMaterial: metalMaterial.clone(),
    accentMaterial: accentMaterial.clone(),
  });
  const secondStage = buildSecondStage({ whiteMaterial, darkMaterial, metalMaterial });
  const fairingHalves = buildSplitFairing({
    fairingMaterial: fairingMaterial.clone(),
    darkMaterial: darkMaterial.clone(),
    metalMaterial: metalMaterial.clone(),
  });
  const payload = buildPayloadSatellite({ goldFoilMaterial, solarCellMaterial, sensorMaterial, metalMaterial, darkMaterial });

  // ── Layout the stack (cursor walks bottom→top, centered at y=0) ──────
  const totalLength = firstStage.length + secondStage.length + fairingHalves.length;
  let cursor = -totalLength * 0.5;

  // First stage
  const firstStageCenterY = cursor + firstStage.length * 0.5;
  firstStage.group.position.y = firstStageCenterY;
  firstStage.nozzleAnchor.add(new THREE.Vector3(0, firstStageCenterY, 0));
  cursor += firstStage.length;

  // Second stage
  const secondStageCenterY = cursor + secondStage.length * 0.5;
  secondStage.group.position.y = secondStageCenterY;
  secondStage.nozzleAnchor.add(new THREE.Vector3(0, secondStageCenterY, 0));
  cursor += secondStage.length;

  // Fairing halves (both at same position — they split sideways)
  const fairingCenterY = cursor + fairingHalves.length * 0.5;
  const fairingBaseY = fairingCenterY; // save for animation reference
  fairingHalves.leftHalf.position.y = fairingCenterY;
  fairingHalves.rightHalf.position.y = fairingCenterY;

  // Payload sits inside the fairing, centered vertically
  payload.group.position.y = cursor + fairingHalves.length * 0.35;

  stack.add(firstStage.group);
  stack.add(secondStage.group);
  stack.add(fairingHalves.leftHalf);
  stack.add(fairingHalves.rightHalf);
  stack.add(payload.group);

  // Payload hidden inside fairing initially
  payload.group.visible = false;

  // ── Plume & halo ───────────────────────────────────────────────────────
  const plume = createRocketPlume();
  stack.add(plume.group);
  const halo = createRocketHalo();
  root.add(halo);
  root.visible = false;

  // ── Animation state ────────────────────────────────────────────────────
  let stageSepProgress = 0;   // 0=attached, 1=fully separated
  let fairingSepProgress = 0; // 0=closed, 1=fully open and drifting away
  let payloadDeployProgress = 0; // 0=stowed, 1=fully deployed

  return {
    object3d: root,
    forwardAxis: new THREE.Vector3(0, 1, 0),
    nativeLength: totalLength,
    setVisualState(snapshot, elapsedSeconds = 0) {
      const stageIndex = snapshot?.stageIndex ?? 0;
      const engineOn = snapshot?.engineOn ?? false;
      const visible = snapshot?.visible ?? false;
      const fairingSeparated = snapshot?.fairingSeparated ?? false;
      const sequenceIndex = snapshot?.sequenceIndex ?? 0;
      const flightTimeSeconds = snapshot?.flightTimeSeconds ?? 0;

      root.visible = visible;
      secondStage.group.visible = true;

      // ── Stage separation animation ─────────────────────────────────
      if (stageIndex >= 1 && stageSepProgress < 1) {
        stageSepProgress = Math.min(1, stageSepProgress + 0.02);
      }

      if (stageSepProgress > 0) {
        // First stage drifts away from its original position and fades
        const sepDistance = easeOutCubic(stageSepProgress) * firstStage.length * 1.8;
        firstStage.group.position.y = firstStageCenterY - sepDistance;
        firstStage.group.visible = stageSepProgress < 0.95;
        if (stageSepProgress > 0.6) {
          const fadeAlpha = 1 - (stageSepProgress - 0.6) / 0.4;
          setGroupOpacity(firstStage.group, fadeAlpha);
        }
      } else {
        firstStage.group.position.y = firstStageCenterY;
        firstStage.group.visible = true;
        setGroupOpacity(firstStage.group, 1);
      }

      // ── Fairing separation animation ───────────────────────────────
      if (fairingSeparated && fairingSepProgress < 1) {
        fairingSepProgress = Math.min(1, fairingSepProgress + 0.012);
      }

      if (fairingSepProgress > 0) {
        const t = easeOutCubic(fairingSepProgress);

        // Halves hinge open then drift outward
        const hingeAngle = Math.min(t * 2, 1) * Math.PI * 0.55;
        const driftX = Math.max(0, t - 0.3) * fairingHalves.radius * 6;
        const driftY = Math.max(0, t - 0.3) * fairingHalves.length * 0.8;

        fairingHalves.leftHalf.rotation.z = hingeAngle;
        fairingHalves.leftHalf.position.x = -driftX;
        fairingHalves.leftHalf.position.y = fairingBaseY - driftY;

        fairingHalves.rightHalf.rotation.z = -hingeAngle;
        fairingHalves.rightHalf.position.x = driftX;
        fairingHalves.rightHalf.position.y = fairingBaseY - driftY;

        // Fade out the fairing halves
        if (fairingSepProgress > 0.5) {
          const fadeAlpha = 1 - (fairingSepProgress - 0.5) / 0.5;
          setGroupOpacity(fairingHalves.leftHalf, fadeAlpha);
          setGroupOpacity(fairingHalves.rightHalf, fadeAlpha);
        }

        fairingHalves.leftHalf.visible = fairingSepProgress < 0.92;
        fairingHalves.rightHalf.visible = fairingSepProgress < 0.92;

        // Reveal payload as fairing opens
        payload.group.visible = true;
        const payloadRevealT = Math.min(fairingSepProgress * 2.5, 1);
        setGroupOpacity(payload.group, payloadRevealT);
      } else {
        fairingHalves.leftHalf.position.y = fairingBaseY;
        fairingHalves.rightHalf.position.y = fairingBaseY;
        fairingHalves.leftHalf.visible = true;
        fairingHalves.rightHalf.visible = true;
        setGroupOpacity(fairingHalves.leftHalf, 1);
        setGroupOpacity(fairingHalves.rightHalf, 1);
        payload.group.visible = false;
      }

      // ── Payload deploy (solar panel unfold) ────────────────────────
      if (sequenceIndex >= 3 && fairingSepProgress >= 0.8) {
        payloadDeployProgress = Math.min(1, payloadDeployProgress + 0.008);
      }

      if (payloadDeployProgress > 0) {
        // Solar panels unfold
        const foldAngle = (1 - easeOutCubic(payloadDeployProgress)) * Math.PI * 0.48;
        payload.leftWing.rotation.y = -foldAngle;
        payload.rightWing.rotation.y = foldAngle;

        // Wings extend outward from body
        const extendX = easeOutCubic(payloadDeployProgress) * payload.wingOffset;
        payload.leftWing.position.x = -payload.busHalfLength - payload.yokeLength + payload.wingOffset - extendX;
        payload.rightWing.position.x = payload.busHalfLength + payload.yokeLength - payload.wingOffset + extendX;
      }

      // ── Plume ──────────────────────────────────────────────────────
      plume.group.visible = engineOn;
      halo.visible = visible && engineOn;

      if (engineOn) {
        const activeNozzle = stageIndex === 0 ? firstStage : secondStage;
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

// ─── First Stage ─────────────────────────────────────────────────────────────

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

// ─── Second Stage ────────────────────────────────────────────────────────────

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

// ─── Split Fairing (two halves that hinge open) ──────────────────────────────

function buildSplitFairing({ fairingMaterial, darkMaterial, metalMaterial }) {
  const bodyLength = 0.000018;
  const noseLength = 0.000014;
  const radius = 0.0000042;
  const totalLength = bodyLength + noseLength;

  const leftHalf = buildFairingHalf({ fairingMaterial, darkMaterial, metalMaterial, bodyLength, noseLength, radius, side: 1 });
  const rightHalf = buildFairingHalf({ fairingMaterial, darkMaterial, metalMaterial, bodyLength, noseLength, radius, side: -1 });

  return {
    leftHalf,
    rightHalf,
    length: totalLength,
    radius,
  };
}

function buildFairingHalf({ fairingMaterial, darkMaterial, metalMaterial, bodyLength, noseLength, radius, side }) {
  const group = new THREE.Group();
  // Offset so the visual center of the full fairing (body + nose) sits at y=0
  const centerOffset = -noseLength * 0.5;

  // Cylindrical section — half cylinder
  const cylinderGeo = new THREE.CylinderGeometry(
    radius, radius, bodyLength, 24, 2, false,
    side > 0 ? 0 : Math.PI,
    Math.PI,
  );
  const cylinder = new THREE.Mesh(cylinderGeo, fairingMaterial);
  cylinder.position.y = centerOffset;
  group.add(cylinder);

  // Nose cone — half ogive
  const ogivePoints = [];
  const ogiveSegments = 18;
  for (let i = 0; i <= ogiveSegments; i += 1) {
    const t = i / ogiveSegments;
    const y = t * noseLength;
    const r = radius * Math.sqrt(1 - t * t * 0.92);
    ogivePoints.push(new THREE.Vector2(r, y));
  }
  const ogiveGeometry = new THREE.LatheGeometry(
    ogivePoints, 12,
    side > 0 ? 0 : Math.PI,
    Math.PI,
  );
  const noseCone = new THREE.Mesh(ogiveGeometry, fairingMaterial);
  noseCone.position.y = bodyLength * 0.5 + centerOffset;
  group.add(noseCone);

  // Seam line along the split edge
  const seamLine = new THREE.Mesh(
    new THREE.BoxGeometry(0.0000004, bodyLength + noseLength * 0.6, radius * 0.06),
    darkMaterial,
  );
  seamLine.position.y = noseLength * 0.15 + centerOffset;
  seamLine.position.z = side > 0 ? radius * 0.01 : -radius * 0.01;
  group.add(seamLine);

  // Base ring (half)
  const baseRing = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 1.03, 0.0000004, 6, 12, Math.PI),
    metalMaterial,
  );
  baseRing.position.y = -bodyLength * 0.5 + centerOffset;
  baseRing.rotation.x = Math.PI * 0.5;
  if (side < 0) baseRing.rotation.y = Math.PI;
  group.add(baseRing);

  return group;
}

// ─── Payload Satellite (small version stowed in fairing) ─────────────────────

function buildPayloadSatellite({ goldFoilMaterial, solarCellMaterial, sensorMaterial, metalMaterial, darkMaterial }) {
  const group = new THREE.Group();

  // Miniature bus wrapped in gold foil
  const busWidth = 0.0000028;
  const busHeight = 0.0000022;
  const busDepth = 0.0000024;
  const bus = new THREE.Mesh(
    new THREE.BoxGeometry(busWidth, busHeight, busDepth),
    goldFoilMaterial,
  );
  group.add(bus);

  // Sensor boom pointing nadir
  const sensorBoom = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0000003, 0.0000004, 0.0000012, 6),
    metalMaterial,
  );
  sensorBoom.position.y = -busHeight * 0.5 - 0.0000006;
  group.add(sensorBoom);

  // Sensor lens
  const sensorLens = new THREE.Mesh(
    new THREE.CircleGeometry(0.0000005, 8),
    sensorMaterial,
  );
  sensorLens.position.y = -busHeight * 0.5 - 0.0000012;
  sensorLens.rotation.x = Math.PI * 0.5;
  group.add(sensorLens);

  // Folded solar panels (compact)
  const panelW = 0.0000018;
  const panelH = 0.0000028;
  const yokeLength = 0.0000006;
  const busHalfLength = busWidth * 0.5;
  const wingOffset = panelW * 0.5;

  const leftWing = new THREE.Group();
  const leftPanel = new THREE.Mesh(
    new THREE.BoxGeometry(panelW, 0.0000002, panelH),
    solarCellMaterial,
  );
  leftWing.add(leftPanel);
  leftWing.position.set(-busHalfLength - yokeLength, 0, 0);
  // Start folded
  leftWing.rotation.y = -Math.PI * 0.48;
  group.add(leftWing);

  const rightWing = new THREE.Group();
  const rightPanel = new THREE.Mesh(
    new THREE.BoxGeometry(panelW, 0.0000002, panelH),
    solarCellMaterial,
  );
  rightWing.add(rightPanel);
  rightWing.position.set(busHalfLength + yokeLength, 0, 0);
  rightWing.rotation.y = Math.PI * 0.48;
  group.add(rightWing);

  // Antenna dish
  const dish = new THREE.Mesh(
    new THREE.SphereGeometry(0.0000006, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.4),
    metalMaterial,
  );
  dish.rotation.x = Math.PI;
  dish.position.y = busHeight * 0.5 + 0.0000003;
  group.add(dish);

  return {
    group,
    leftWing,
    rightWing,
    busHalfLength,
    yokeLength,
    wingOffset,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function setGroupOpacity(group, opacity) {
  group.traverse((child) => {
    if (child.isMesh && child.material) {
      if (!child.material.transparent) {
        child.material.transparent = true;
      }
      child.material.opacity = opacity;
    }
  });
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}
