import * as THREE from 'three';

export function createMissile() {
  const root = new THREE.Group();
  const stack = new THREE.Group();
  root.add(stack);

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0xe6ebf2,
    roughness: 0.4,
    metalness: 0.42,
  });
  const darkMaterial = new THREE.MeshStandardMaterial({
    color: 0x1b2434,
    roughness: 0.5,
    metalness: 0.2,
  });
  const metalMaterial = new THREE.MeshStandardMaterial({
    color: 0x8b98ab,
    roughness: 0.36,
    metalness: 0.62,
  });
  const ringMaterial = new THREE.MeshStandardMaterial({
    color: 0xb8c4d4,
    roughness: 0.34,
    metalness: 0.52,
  });
  const reentryGlowMaterial = new THREE.MeshBasicMaterial({
    color: 0xff9d4d,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
  });
  const ablativeMaterial = new THREE.MeshStandardMaterial({
    color: 0x2a2a2e,
    roughness: 0.7,
    metalness: 0.15,
  });
  const thrusterMaterial = new THREE.MeshStandardMaterial({
    color: 0x444c58,
    roughness: 0.5,
    metalness: 0.4,
  });

  const parts = {
    stage1: buildStage1({ bodyMaterial, darkMaterial, metalMaterial, ringMaterial }),
    stage2: buildStage2({ bodyMaterial, darkMaterial, metalMaterial, ringMaterial }),
    stage3: buildStage3({ bodyMaterial, darkMaterial, metalMaterial, ringMaterial }),
    bus: buildBus({ bodyMaterial, darkMaterial, ringMaterial, thrusterMaterial, metalMaterial }),
    rv: buildWarhead({ ablativeMaterial, darkMaterial, metalMaterial, reentryGlowMaterial }),
  };

  const layout = layoutStack(parts);

  const fairings = buildFairings({
    shellMaterial: bodyMaterial,
    ringMaterial,
    darkMaterial,
    baseRadius: 0.0000038,
    bodyLength: 0.000019,
    noseLength: 0.000012,
  });
  fairings.group.position.y = layout.centers.bus.y + 0.000005;

  stack.add(
    parts.stage1.group,
    parts.stage2.group,
    parts.stage3.group,
    parts.bus.group,
    parts.rv.group,
    fairings.group,
  );

  const plume = createPlume();
  stack.add(plume.group);
  const halo = createHalo();
  root.add(halo);
  root.scale.setScalar(1);
  root.visible = false;

  return {
    object3d: root,
    forwardAxis: new THREE.Vector3(0, 1, 0),
    nativeLength: 0.000084,
    setVisualState(snapshot, elapsedSeconds = 0) {
      const stageIndex = snapshot?.stageIndex;
      const phase = snapshot?.phase ?? 'idle';
      const fairingsAttached = stageIndex === 0 || stageIndex === 1;

      parts.stage1.group.visible = stageIndex === 0;
      parts.stage2.group.visible = stageIndex === 0 || stageIndex === 1;
      parts.stage3.group.visible = stageIndex === 0 || stageIndex === 1 || stageIndex === 2;
      parts.bus.group.visible = phase === 'boost' || phase === 'midcourse' || phase === 'terminal';
      parts.rv.group.visible =
        stageIndex === 2 || phase === 'midcourse' || phase === 'terminal' || phase === 'impact';
      fairings.group.visible = fairingsAttached;

      if (phase === 'midcourse') {
        parts.stage1.group.visible = false;
        parts.stage2.group.visible = false;
        parts.stage3.group.visible = false;
        fairings.group.visible = false;
      }

      if (phase === 'terminal' || phase === 'impact') {
        parts.stage1.group.visible = false;
        parts.stage2.group.visible = false;
        parts.stage3.group.visible = false;
        parts.bus.group.visible = false;
        fairings.group.visible = false;
      }

      const activeNozzle =
        stageIndex === 0
          ? parts.stage1
          : stageIndex === 1
            ? parts.stage2
            : stageIndex === 2
              ? parts.stage3
              : parts.bus;

      const plumeVisible = phase === 'boost';
      plume.group.visible = plumeVisible;
      halo.visible = Boolean(snapshot?.visible && plumeVisible);

      if (plumeVisible) {
        plume.group.position.copy(activeNozzle.nozzleAnchor);
        const flicker =
          0.85 + Math.sin(elapsedSeconds * 34) * 0.08 + Math.sin(elapsedSeconds * 19) * 0.05;
        plume.core.scale.setScalar(flicker);
        plume.cone.scale.set(1, flicker, 1);
        halo.position.copy(activeNozzle.nozzleAnchor).multiplyScalar(0.72);

        const plumeScale = stageIndex === 0 ? 1.6 : stageIndex === 1 ? 1.2 : 0.85;
        plume.group.scale.setScalar(plumeScale);
      }

      parts.rv.terminalGlow.visible = phase === 'terminal' || phase === 'impact';
      parts.rv.group.scale.setScalar(phase === 'terminal' || phase === 'impact' ? 1.48 : 1);
      halo.material.opacity = snapshot?.visible && plumeVisible ? 0.12 : 0;
    },
    createSeparationFragment(stageKey) {
      if (parts[stageKey]) {
        const fragment = parts[stageKey].group.clone(true);
        fragment.visible = true;
        return {
          object3d: fragment,
          localOffset: layout.centers[stageKey].clone(),
        };
      }

      if (stageKey === 'fairingLeft' || stageKey === 'fairingRight') {
        const fairingPart = stageKey === 'fairingLeft' ? fairings.left : fairings.right;
        const fragment = fairingPart.clone(true);
        fragment.visible = true;
        return {
          object3d: fragment,
          localOffset: fairings.offsets[stageKey].clone(),
        };
      }

      return null;
    },
  };
}

// ─── Stage 1: First stage booster with swept fins and interstage ────────────

function buildStage1({ bodyMaterial, darkMaterial, metalMaterial, ringMaterial }) {
  const length = 0.000028;
  const radiusTop = 0.0000037;
  const radiusBottom = 0.0000042;
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, length, 24, 4, false),
    bodyMaterial,
  );
  group.add(body);

  const lowerBand = createBand(radiusBottom * 1.025, 0.0000008, darkMaterial);
  lowerBand.position.y = -length * 0.5 + 0.0000018;
  group.add(lowerBand);

  const midBand1 = createBand(radiusTop * 1.015, 0.0000006, darkMaterial);
  midBand1.position.y = -0.000006;
  group.add(midBand1);

  const midBand2 = createBand(radiusTop * 1.015, 0.0000006, darkMaterial);
  midBand2.position.y = 0.000001;
  group.add(midBand2);

  const topCollar = createBand(radiusTop * 1.04, 0.0000007, ringMaterial);
  topCollar.position.y = length * 0.5 - 0.0000012;
  group.add(topCollar);

  const interstage = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop * 1.06, radiusTop * 1.02, 0.0000022, 24, 1, false),
    metalMaterial,
  );
  interstage.position.y = length * 0.5 - 0.0000003;
  group.add(interstage);

  const nozzleLength = 0.000005;
  const nozzleRadius = 0.0000027;
  const nozzle = new THREE.Mesh(
    new THREE.CylinderGeometry(nozzleRadius * 0.65, nozzleRadius, nozzleLength, 16, 1, false),
    metalMaterial,
  );
  nozzle.position.y = -length * 0.5 - nozzleLength * 0.5;
  group.add(nozzle);

  const nozzleBell = new THREE.Mesh(
    new THREE.CylinderGeometry(
      nozzleRadius * 1.12,
      nozzleRadius * 0.55,
      nozzleLength * 0.35,
      16,
      1,
      true,
    ),
    darkMaterial,
  );
  nozzleBell.position.y = -length * 0.5 - nozzleLength * 0.85;
  group.add(nozzleBell);

  buildSweptFins({
    group,
    count: 4,
    rootChord: length * 0.22,
    tipChord: length * 0.09,
    span: radiusBottom * 1.4,
    sweep: length * 0.06,
    thickness: radiusBottom * 0.13,
    baseY: -length * 0.5 + length * 0.08,
    mountRadius: radiusBottom * 1.02,
    material: darkMaterial,
  });

  return {
    group,
    length,
    nozzleAnchor: new THREE.Vector3(0, -length * 0.5 - nozzleLength, 0),
  };
}

// ─── Stage 2: Second stage with slimmer profile ─────────────────────────────

function buildStage2({ bodyMaterial, darkMaterial, metalMaterial, ringMaterial }) {
  const length = 0.000022;
  const radiusTop = 0.0000032;
  const radiusBottom = 0.0000035;
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, length, 22, 3, false),
    bodyMaterial,
  );
  group.add(body);

  const lowerBand = createBand(radiusBottom * 1.02, 0.0000007, darkMaterial);
  lowerBand.position.y = -length * 0.5 + 0.0000016;
  group.add(lowerBand);

  const midBand = createBand(radiusTop * 1.015, 0.0000005, darkMaterial);
  midBand.position.y = 0.000003;
  group.add(midBand);

  const topCollar = createBand(radiusTop * 1.035, 0.0000006, ringMaterial);
  topCollar.position.y = length * 0.5 - 0.000001;
  group.add(topCollar);

  const interstage = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop * 1.05, radiusTop * 1.01, 0.0000018, 22, 1, false),
    metalMaterial,
  );
  interstage.position.y = length * 0.5 - 0.0000002;
  group.add(interstage);

  const nozzleLength = 0.000004;
  const nozzleRadius = 0.0000023;
  const nozzle = new THREE.Mesh(
    new THREE.CylinderGeometry(nozzleRadius * 0.68, nozzleRadius, nozzleLength, 16, 1, false),
    metalMaterial,
  );
  nozzle.position.y = -length * 0.5 - nozzleLength * 0.5;
  group.add(nozzle);

  const nozzleBell = new THREE.Mesh(
    new THREE.CylinderGeometry(
      nozzleRadius * 1.08,
      nozzleRadius * 0.6,
      nozzleLength * 0.3,
      16,
      1,
      true,
    ),
    darkMaterial,
  );
  nozzleBell.position.y = -length * 0.5 - nozzleLength * 0.82;
  group.add(nozzleBell);

  return {
    group,
    length,
    nozzleAnchor: new THREE.Vector3(0, -length * 0.5 - nozzleLength, 0),
  };
}

// ─── Stage 3: Upper stage, compact ──────────────────────────────────────────

function buildStage3({ bodyMaterial, darkMaterial, metalMaterial, ringMaterial }) {
  const length = 0.000014;
  const radiusTop = 0.0000025;
  const radiusBottom = 0.0000028;
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, length, 20, 2, false),
    bodyMaterial,
  );
  group.add(body);

  const lowerBand = createBand(radiusBottom * 1.02, 0.0000006, darkMaterial);
  lowerBand.position.y = -length * 0.5 + 0.0000012;
  group.add(lowerBand);

  const topCollar = createBand(radiusTop * 1.03, 0.00000055, ringMaterial);
  topCollar.position.y = length * 0.5 - 0.0000009;
  group.add(topCollar);

  const nozzleLength = 0.000003;
  const nozzleRadius = 0.0000018;
  const nozzle = new THREE.Mesh(
    new THREE.CylinderGeometry(nozzleRadius * 0.7, nozzleRadius, nozzleLength, 14, 1, false),
    metalMaterial,
  );
  nozzle.position.y = -length * 0.5 - nozzleLength * 0.5;
  group.add(nozzle);

  return {
    group,
    length,
    nozzleAnchor: new THREE.Vector3(0, -length * 0.5 - nozzleLength, 0),
  };
}

// ─── Post-Boost Vehicle (Bus) with attitude thrusters ───────────────────────

function buildBus({ bodyMaterial, darkMaterial, ringMaterial, thrusterMaterial, metalMaterial }) {
  const length = 0.000009;
  const radiusTop = 0.0000021;
  const radiusBottom = 0.0000024;
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, length, 18, 2, false),
    bodyMaterial,
  );
  group.add(body);

  const aftRing = createBand(radiusBottom * 1.04, 0.00000055, ringMaterial);
  aftRing.position.y = -length * 0.5 + 0.0000012;
  group.add(aftRing);

  const forwardBand = createBand(radiusTop * 1.03, 0.00000045, darkMaterial);
  forwardBand.position.y = length * 0.16;
  group.add(forwardBand);

  const thrusterGeometry = new THREE.CylinderGeometry(
    0.00000035,
    0.0000005,
    0.0000012,
    8,
    1,
    false,
  );
  for (let i = 0; i < 4; i += 1) {
    const thruster = new THREE.Mesh(thrusterGeometry, thrusterMaterial);
    const angle = Math.PI * 0.5 * i + Math.PI * 0.25;
    thruster.position.set(
      Math.cos(angle) * radiusBottom * 1.12,
      -length * 0.28,
      Math.sin(angle) * radiusBottom * 1.12,
    );
    thruster.rotation.z = Math.cos(angle) * 0.3;
    thruster.rotation.x = -Math.sin(angle) * 0.3;
    group.add(thruster);
  }

  const nozzle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0000011, 0.0000016, 0.0000028, 14, 1, false),
    metalMaterial,
  );
  nozzle.position.y = -length * 0.5 - 0.0000013;
  group.add(nozzle);

  return {
    group,
    length,
    nozzleAnchor: new THREE.Vector3(0, -length * 0.5 - 0.0000027, 0),
  };
}

// ─── Triangular Warhead (Reentry Vehicle) ───────────────────────────────────

function buildWarhead({ ablativeMaterial, darkMaterial, metalMaterial, reentryGlowMaterial }) {
  const length = 0.000011;
  const group = new THREE.Group();

  const warheadCone = new THREE.Mesh(
    new THREE.ConeGeometry(0.0000022, length * 0.82, 3, 1, false),
    ablativeMaterial,
  );
  warheadCone.rotation.y = Math.PI / 6;
  warheadCone.position.y = 0.0000006;
  group.add(warheadCone);

  const edgeHighlight = new THREE.Mesh(
    new THREE.ConeGeometry(0.00000225, length * 0.83, 3, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0x3a3a42,
      roughness: 0.55,
      metalness: 0.35,
      wireframe: false,
    }),
  );
  edgeHighlight.rotation.y = Math.PI / 6;
  edgeHighlight.position.y = 0.0000006;
  group.add(edgeHighlight);

  const noseTip = new THREE.Mesh(
    new THREE.ConeGeometry(0.0000006, 0.0000024, 3, 1, false),
    metalMaterial,
  );
  noseTip.rotation.y = Math.PI / 6;
  noseTip.position.y = length * 0.42 + 0.0000004;
  group.add(noseTip);

  const baseRadius = 0.0000024;
  const heatShield = new THREE.Mesh(
    new THREE.CylinderGeometry(baseRadius, baseRadius * 0.95, 0.0000008, 3, 1, false),
    darkMaterial,
  );
  heatShield.rotation.y = Math.PI / 6;
  heatShield.position.y = -length * 0.38;
  group.add(heatShield);

  const terminalGlow = new THREE.Mesh(
    new THREE.SphereGeometry(0.0000035, 14, 14),
    reentryGlowMaterial,
  );
  terminalGlow.position.y = -0.0000024;
  terminalGlow.visible = false;
  group.add(terminalGlow);

  return {
    group,
    length,
    terminalGlow,
  };
}

// ─── Swept Delta Fins ───────────────────────────────────────────────────────

function buildSweptFins({
  group,
  count,
  rootChord,
  tipChord,
  span,
  sweep,
  thickness,
  baseY,
  mountRadius,
  material,
}) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(rootChord, 0);
  shape.lineTo(rootChord - tipChord * 0.3 + sweep, span);
  shape.lineTo(sweep, span);
  shape.closePath();

  const extrudeSettings = {
    depth: thickness,
    bevelEnabled: false,
  };

  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  geometry.translate(-rootChord * 0.5, 0, -thickness * 0.5);
  geometry.rotateX(Math.PI * 0.5);
  geometry.rotateZ(Math.PI * 0.5);

  for (let i = 0; i < count; i += 1) {
    const fin = new THREE.Mesh(geometry, material);
    const angle = (Math.PI * 2 * i) / count;
    fin.position.set(Math.cos(angle) * mountRadius, baseY, Math.sin(angle) * mountRadius);
    fin.rotation.y = -angle;
    group.add(fin);
  }
}

// ─── Payload Fairing (clamshell halves) ─────────────────────────────────────

function buildFairings({
  shellMaterial,
  ringMaterial,
  darkMaterial,
  baseRadius,
  bodyLength,
  noseLength,
}) {
  const group = new THREE.Group();
  const left = buildFairingHalf({
    shellMaterial,
    ringMaterial,
    darkMaterial,
    baseRadius,
    bodyLength,
    noseLength,
    side: -1,
  });
  const right = buildFairingHalf({
    shellMaterial,
    ringMaterial,
    darkMaterial,
    baseRadius,
    bodyLength,
    noseLength,
    side: 1,
  });
  group.add(left, right);

  return {
    group,
    left,
    right,
    offsets: {
      fairingLeft: new THREE.Vector3(-baseRadius * 0.5, 0.000004, 0),
      fairingRight: new THREE.Vector3(baseRadius * 0.5, 0.000004, 0),
    },
  };
}

function buildFairingHalf({
  shellMaterial,
  ringMaterial,
  darkMaterial,
  baseRadius,
  bodyLength,
  noseLength,
  side,
}) {
  const group = new THREE.Group();
  const thetaStart = side < 0 ? 0 : Math.PI;
  const thetaLength = Math.PI;

  const shell = new THREE.Mesh(
    new THREE.CylinderGeometry(
      baseRadius * 0.84,
      baseRadius,
      bodyLength,
      16,
      1,
      true,
      thetaStart,
      thetaLength,
    ),
    shellMaterial,
  );
  shell.position.y = -noseLength * 0.12;
  group.add(shell);

  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(baseRadius * 0.84, noseLength, 16, 1, true, thetaStart, thetaLength),
    shellMaterial,
  );
  nose.position.y = bodyLength * 0.5 + noseLength * 0.5 - noseLength * 0.12;
  group.add(nose);

  const baseRing = new THREE.Mesh(
    new THREE.TorusGeometry(baseRadius * 0.99, 0.00000035, 8, 16, Math.PI),
    ringMaterial,
  );
  baseRing.rotation.y = side < 0 ? 0 : Math.PI;
  baseRing.position.y = -bodyLength * 0.5 - noseLength * 0.12;
  group.add(baseRing);

  const seamGeometry = new THREE.BoxGeometry(
    0.00000045,
    bodyLength + noseLength * 0.55,
    baseRadius * 0.1,
  );
  const seam = new THREE.Mesh(seamGeometry, darkMaterial);
  seam.position.set(0, noseLength * 0.1, side * baseRadius * 0.06);
  group.add(seam);

  return group;
}

// ─── Stack layout ───────────────────────────────────────────────────────────

function layoutStack(parts) {
  const ordered = ['stage1', 'stage2', 'stage3', 'bus', 'rv'];
  const totalLength = ordered.reduce((sum, key) => sum + parts[key].length, 0);
  let cursor = -totalLength * 0.5;
  const centers = {};

  for (const key of ordered) {
    const part = parts[key];
    const centerY = cursor + part.length * 0.5;
    part.group.position.y = centerY;
    centers[key] = new THREE.Vector3(0, centerY, 0);
    if (part.nozzleAnchor) {
      part.nozzleAnchor = part.nozzleAnchor.clone().add(centers[key]);
    }
    cursor += part.length;
  }

  return { totalLength, centers };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function createBand(radius, height, material) {
  return new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 18, 1, false), material);
}

function createPlume() {
  const group = new THREE.Group();
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(0.0000032, 0.000016, 14, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffb76b,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    }),
  );
  cone.rotation.x = Math.PI;
  cone.position.y = -0.000008;

  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.0000024, 12, 12),
    new THREE.MeshBasicMaterial({
      color: 0xfff1b8,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    }),
  );
  core.position.y = -0.000001;

  group.add(cone, core);
  group.visible = false;
  group.scale.setScalar(1.4);
  return { group, cone, core };
}

function createHalo() {
  return new THREE.Mesh(
    new THREE.SphereGeometry(0.0000029, 16, 16),
    new THREE.MeshBasicMaterial({
      color: 0xffd38d,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
    }),
  );
}
