import * as THREE from 'three';

// ── ASCM Visual (BrahMos-class) ─────────────────────────────────────
// Supersonic anti-ship cruise missile. Completely different silhouette
// from the subsonic LACM — cylindrical ramjet body, prominent air intake,
// stubby fixed delta wings, and a longer solid-rocket booster that wraps
// around the rear half and separates at Mach 1.5.
//
// Real BrahMos: 8.4m long × 0.67m diameter, ~1.7m wingspan
// Forward axis is +Y.

export function createSupersonicCruiseMissile() {
  const root = new THREE.Group();

  // ── Materials ───────────────────────────────────────────────────
  const bodyMat    = new THREE.MeshStandardMaterial({ color: 0x778899, roughness: 0.32, metalness: 0.48 });
  const noseMat    = new THREE.MeshStandardMaterial({ color: 0x2a3040, roughness: 0.50, metalness: 0.30 });
  const intakeMat  = new THREE.MeshStandardMaterial({ color: 0x111820, roughness: 0.65, metalness: 0.15 });
  const wingMat    = new THREE.MeshStandardMaterial({ color: 0x5a6878, roughness: 0.40, metalness: 0.40 });
  const finMat     = new THREE.MeshStandardMaterial({ color: 0x4a5a6a, roughness: 0.45, metalness: 0.35 });
  const boosterMat = new THREE.MeshStandardMaterial({ color: 0xc8c0b0, roughness: 0.50, metalness: 0.22 });
  const bandMat    = new THREE.MeshStandardMaterial({ color: 0x3a4858, roughness: 0.38, metalness: 0.35 });
  const radome     = new THREE.MeshStandardMaterial({ color: 0x1e2830, roughness: 0.60, metalness: 0.20 });

  // ── Dimensions ──────────────────────────────────────────────────
  const L  = 0.0000065;  // ramjet body length (without booster)
  const R  = 0.0000028;  // body radius
  const NL = 0.0000012;  // nose cone length
  const BL = 0.0000045;  // booster length
  const BR = 0.0000038;  // booster radius

  // ── Ramjet body (main cylinder) ─────────────────────────────────
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(R, R, L, 18, 1, false),
    bodyMat,
  );
  root.add(body);

  // Body panel bands (3 rings)
  for (const yFrac of [-0.28, 0.05, 0.30]) {
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(R * 1.025, R * 1.025, L * 0.008, 18, 1, false),
      bandMat,
    );
    band.position.y = L * yFrac;
    root.add(band);
  }

  // ── Nose cone (radar seeker radome) ─────────────────────────────
  // Ogive shape — tapered for supersonic aerodynamics
  const noseProfile = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    // Sharper taper than subsonic — pointed for Mach 2.8
    const r = R * (1 - t * t) * (1 - t * 0.15);
    noseProfile.push(new THREE.Vector2(r, NL * t));
  }
  noseProfile.push(new THREE.Vector2(0, NL));
  const nose = new THREE.Mesh(new THREE.LatheGeometry(noseProfile, 18), radome);
  nose.position.y = L * 0.5;
  root.add(nose);

  // Radar seeker tip (metallic point)
  const seekerTip = new THREE.Mesh(
    new THREE.ConeGeometry(R * 0.12, NL * 0.3, 8, 1, false),
    new THREE.MeshStandardMaterial({ color: 0x556677, roughness: 0.3, metalness: 0.6 }),
  );
  seekerTip.position.y = L * 0.5 + NL * 0.88;
  root.add(seekerTip);

  // ── Air intake (rectangular, under the nose) ────────────────────
  // BrahMos has a prominent rectangular ramjet air intake
  const intakeW = R * 1.4;
  const intakeH = R * 0.9;
  const intakeL = L * 0.22;
  const intake = new THREE.Mesh(
    new THREE.BoxGeometry(intakeW, intakeL, intakeH),
    intakeMat,
  );
  intake.position.set(0, L * 0.18, -R * 1.05);
  root.add(intake);

  // Intake ramp (angled shock plate)
  const ramp = new THREE.Mesh(
    new THREE.BoxGeometry(intakeW * 0.9, intakeL * 0.6, R * 0.08),
    bandMat,
  );
  ramp.position.set(0, L * 0.22, -R * 0.65);
  ramp.rotation.x = 0.15;
  root.add(ramp);

  // Intake lip (bright edge)
  const intakeLip = new THREE.Mesh(
    new THREE.BoxGeometry(intakeW * 1.05, L * 0.012, intakeH * 1.05),
    bandMat,
  );
  intakeLip.position.set(0, L * 0.18 + intakeL * 0.48, -R * 1.05);
  root.add(intakeLip);

  // ── Stubby delta wings (fixed, not folding) ─────────────────────
  const wingSpan  = R * 4;
  const wingChord = L * 0.12;
  const wingThick = R * 0.04;

  function buildDeltaWing(sign) {
    // Swept delta planform
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(wingChord, 0);
    shape.lineTo(wingChord * 0.15, wingSpan);
    shape.closePath();

    const geo = new THREE.ExtrudeGeometry(shape, { depth: wingThick, bevelEnabled: false });
    geo.translate(-wingChord * 0.6, 0, -wingThick * 0.5);

    const wing = new THREE.Mesh(geo, wingMat);
    wing.rotation.z = sign > 0 ? -Math.PI * 0.5 : Math.PI * 0.5;
    if (sign < 0) wing.rotation.y = Math.PI;
    wing.position.set(sign * R * 0.85, -L * 0.15, 0);
    return wing;
  }

  root.add(buildDeltaWing(1));
  root.add(buildDeltaWing(-1));

  // ── Tail control fins (4, cruciform, slightly canted) ───────────
  const tailSpan  = R * 2.8;
  const tailChord = L * 0.06;
  const tailThick = R * 0.035;

  for (let i = 0; i < 4; i++) {
    const angle = Math.PI * 0.5 * i + Math.PI * 0.25; // 45° offset
    const fin = new THREE.Mesh(
      new THREE.BoxGeometry(tailThick, tailChord, tailSpan),
      finMat,
    );
    fin.position.set(
      Math.cos(angle) * R * 1.05,
      -L * 0.47,
      Math.sin(angle) * R * 1.05,
    );
    fin.rotation.y = -angle + 0.05 * (i % 2 === 0 ? 1 : -1); // slight cant
    root.add(fin);
  }

  // ── Ramjet exhaust nozzle ───────────────────────────────────────
  const nozzle = new THREE.Mesh(
    new THREE.CylinderGeometry(R * 0.55, R * 0.72, L * 0.035, 14, 1, false),
    intakeMat,
  );
  nozzle.position.y = -L * 0.52;
  root.add(nozzle);

  // ── Ramjet exhaust plume (bright orange-white) ──────────────────
  const ramjetPlume = new THREE.Mesh(
    new THREE.ConeGeometry(R * 0.55, L * 0.12, 10, 1, false),
    new THREE.MeshBasicMaterial({
      color: 0xff8833, transparent: true, opacity: 0.45, depthWrite: false,
    }),
  );
  ramjetPlume.rotation.x = Math.PI;
  ramjetPlume.position.y = -L * 0.58;
  ramjetPlume.visible = false;
  root.add(ramjetPlume);

  // Mach diamonds (shock pattern inside ramjet exhaust)
  const machDiamonds = new THREE.Mesh(
    new THREE.ConeGeometry(R * 0.25, L * 0.06, 6, 1, false),
    new THREE.MeshBasicMaterial({
      color: 0xffdd88, transparent: true, opacity: 0.3, depthWrite: false,
    }),
  );
  machDiamonds.rotation.x = Math.PI;
  machDiamonds.position.y = -L * 0.56;
  machDiamonds.visible = false;
  root.add(machDiamonds);

  // ── Booster section (solid rocket, wraps around rear) ───────────
  const boosterGroup = new THREE.Group();

  const boosterBody = new THREE.Mesh(
    new THREE.CylinderGeometry(BR * 0.92, BR, BL, 16, 1, false),
    boosterMat,
  );
  boosterGroup.add(boosterBody);

  // Booster forward adapter ring
  const boosterRing = new THREE.Mesh(
    new THREE.CylinderGeometry(BR * 0.98, BR * 1.02, BL * 0.04, 16, 1, false),
    bandMat,
  );
  boosterRing.position.y = BL * 0.48;
  boosterGroup.add(boosterRing);

  // Booster nozzle
  const boosterNozzle = new THREE.Mesh(
    new THREE.CylinderGeometry(BR * 0.45, BR * 0.65, BL * 0.1, 12, 1, false),
    intakeMat,
  );
  boosterNozzle.position.y = -BL * 0.52;
  boosterGroup.add(boosterNozzle);

  // Booster stabilizer fins (4)
  for (let i = 0; i < 4; i++) {
    const a = Math.PI * 0.5 * i;
    const bf = new THREE.Mesh(
      new THREE.BoxGeometry(R * 0.04, BL * 0.18, BR * 0.7),
      finMat,
    );
    bf.position.set(
      Math.cos(a) * BR * 1.02,
      -BL * 0.40,
      Math.sin(a) * BR * 1.02,
    );
    bf.rotation.y = -a;
    boosterGroup.add(bf);
  }

  boosterGroup.position.y = -L * 0.5 - BL * 0.3;
  root.add(boosterGroup);

  // ── Booster plume (large, bright orange) ────────────────────────
  const boostPlume = new THREE.Mesh(
    new THREE.ConeGeometry(BR * 0.8, L * 0.25, 10, 1, false),
    new THREE.MeshBasicMaterial({
      color: 0xffaa22, transparent: true, opacity: 0.6, depthWrite: false,
    }),
  );
  boostPlume.rotation.x = Math.PI;
  boostPlume.position.y = -L * 0.5 - BL * 0.5 - L * 0.12;
  boostPlume.visible = false;
  root.add(boostPlume);

  // ── Mach cone (faint conical shockwave at supersonic speeds) ────
  const machCone = new THREE.Mesh(
    new THREE.ConeGeometry(R * 3, L * 0.6, 16, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xccddff, transparent: true, opacity: 0, depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  machCone.rotation.x = Math.PI;
  machCone.position.y = L * 0.15;
  root.add(machCone);

  root.visible = false;

  // ── Public interface ────────────────────────────────────────────
  return {
    object3d: root,
    forwardAxis: new THREE.Vector3(0, 1, 0),
    nativeLength: L + NL + BL * 0.5,

    setVisualState(snapshot, elapsedSeconds = 0) {
      const phase = snapshot?.phase ?? 'idle';
      root.visible = snapshot?.visible ?? false;

      // Booster: visible during booster phase
      const hasBooster = snapshot?.boosterAttached ?? (phase === 'booster');
      boosterGroup.visible = hasBooster;

      // Plumes
      boostPlume.visible = phase === 'booster';
      const cruising = phase === 'climb' || phase === 'cruise' || phase === 'terminal'
        || phase === 'scramjetLight';
      ramjetPlume.visible = cruising;
      machDiamonds.visible = cruising;

      if (boostPlume.visible) {
        const flk = 0.50 + Math.sin((elapsedSeconds ?? 0) * 24) * 0.10;
        boostPlume.material.opacity = flk;
        boostPlume.scale.set(1, 0.85 + Math.sin((elapsedSeconds ?? 0) * 16) * 0.15, 1);
      }

      if (ramjetPlume.visible) {
        // Ramjet exhaust: intense orange-white, pulsing
        const pulse = 0.35 + Math.sin((elapsedSeconds ?? 0) * 18) * 0.10;
        ramjetPlume.material.opacity = pulse;
        // Mach diamonds flicker
        machDiamonds.material.opacity = 0.2 + Math.sin((elapsedSeconds ?? 0) * 35) * 0.1;
      }

      // Mach cone: visible above Mach 1, intensity grows with speed
      const mach = snapshot?.machNumber ?? ((snapshot?.speedKmS ?? 0) * 1000 / 343);
      if (mach > 1.05) {
        machCone.visible = true;
        const coneIntensity = Math.min((mach - 1) / 2, 1) * 0.08;
        machCone.material.opacity = coneIntensity;
        // Cone half-angle narrows with Mach: sin(μ) = 1/M
        const halfAngle = Math.asin(Math.min(1 / mach, 1));
        const coneRadius = Math.tan(halfAngle) * L * 0.6;
        machCone.geometry.dispose();
        machCone.geometry = new THREE.ConeGeometry(
          Math.max(coneRadius, R * 1.5), L * 0.6, 16, 1, true,
        );
      } else {
        machCone.visible = false;
      }
    },

    createSeparationFragment(stageKey) {
      if (stageKey === 'booster') {
        const frag = boosterGroup.clone(true);
        frag.visible = true;
        return {
          object3d: frag,
          localOffset: new THREE.Vector3(0, -L * 0.5 - BL * 0.3, 0),
        };
      }
      return null;
    },
  };
}
