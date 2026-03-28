import * as THREE from 'three';

// ── LACM Visual (Tomahawk-class) ────────────────────────────────────
// Detailed subsonic cruise missile with folding wings, booster section,
// and phase-dependent visual states. Forward axis is +Y.
//
// Real Tomahawk: 6.25m long × 0.52m diameter, 2.67m wingspan
// World scale: 1 unit = 1000 km → missile is ~6.25e-6 units long.
// We exaggerate slightly for visibility.

export function createCruiseMissile() {
  const root = new THREE.Group();

  // ── Materials ───────────────────────────────────────────────────
  const bodyMat   = new THREE.MeshStandardMaterial({ color: 0x9aa6b6, roughness: 0.36, metalness: 0.42 });
  const noseMat   = new THREE.MeshStandardMaterial({ color: 0x3a4252, roughness: 0.50, metalness: 0.25 });
  const wingMat   = new THREE.MeshStandardMaterial({ color: 0x7a8898, roughness: 0.40, metalness: 0.35 });
  const finMat    = new THREE.MeshStandardMaterial({ color: 0x5a6a7a, roughness: 0.45, metalness: 0.30 });
  const intakeMat = new THREE.MeshStandardMaterial({ color: 0x1a2030, roughness: 0.60, metalness: 0.15 });
  const bandMat   = new THREE.MeshStandardMaterial({ color: 0x4a5568, roughness: 0.40, metalness: 0.30 });
  const boosterMat= new THREE.MeshStandardMaterial({ color: 0xd4cec0, roughness: 0.55, metalness: 0.20 });

  // ── Dimensions ──────────────────────────────────────────────────
  const L  = 0.0000055;  // fuselage length
  const R  = 0.00000022; // fuselage radius
  const NL = 0.0000010;  // nose length

  // ── Fuselage ────────────────────────────────────────────────────
  const fuselage = new THREE.Mesh(
    new THREE.CylinderGeometry(R * 0.92, R, L, 16, 1, false),
    bodyMat,
  );
  root.add(fuselage);

  // Panel line bands
  for (const yFrac of [-0.32, -0.05, 0.22]) {
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(R * 1.018, R * 1.018, L * 0.007, 16, 1, false),
      bandMat,
    );
    band.position.y = L * yFrac;
    root.add(band);
  }

  // ── Nose (ogive) ────────────────────────────────────────────────
  const noseProfile = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const r = R * 0.92 * Math.sqrt(1 - t * t) * (1 - t * 0.08);
    noseProfile.push(new THREE.Vector2(r, NL * t));
  }
  noseProfile.push(new THREE.Vector2(0, NL));
  const nose = new THREE.Mesh(new THREE.LatheGeometry(noseProfile, 16), bodyMat);
  nose.position.y = L * 0.5;
  root.add(nose);

  // Seeker dome
  const seeker = new THREE.Mesh(
    new THREE.SphereGeometry(R * 0.35, 8, 6),
    noseMat,
  );
  seeker.position.y = L * 0.5 + NL * 0.95;
  root.add(seeker);

  // GPS antenna blister (dorsal spine)
  const gpsAntenna = new THREE.Mesh(
    new THREE.BoxGeometry(R * 0.3, L * 0.08, R * 0.15),
    bandMat,
  );
  gpsAntenna.position.set(0, L * 0.15, R * 0.92);
  root.add(gpsAntenna);

  // TERCOM antenna (underside blister)
  const tercomAntenna = new THREE.Mesh(
    new THREE.BoxGeometry(R * 0.6, L * 0.06, R * 0.12),
    noseMat,
  );
  tercomAntenna.position.set(0, L * 0.08, -R * 0.92);
  root.add(tercomAntenna);

  // ── Folding wings ───────────────────────────────────────────────
  // Wings fold flat against the body during boost, then deploy
  const wingGroup = new THREE.Group();
  root.add(wingGroup);

  const wingSpan  = R * 7;
  const wingChord = L * 0.10;
  const wingThick = R * 0.05;

  function buildWing(sign) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(wingChord, 0);
    shape.lineTo(wingChord * 0.35 + wingChord * 0.3, wingSpan);
    shape.lineTo(wingChord * 0.3, wingSpan * 0.92);
    shape.closePath();

    const geo = new THREE.ExtrudeGeometry(shape, { depth: wingThick, bevelEnabled: false });
    geo.translate(-wingChord * 0.5, 0, -wingThick * 0.5);

    const wing = new THREE.Mesh(geo, wingMat);
    wing.rotation.z = sign > 0 ? -Math.PI * 0.5 : Math.PI * 0.5;
    if (sign < 0) wing.rotation.y = Math.PI;
    wing.position.set(sign * R * 0.75, -L * 0.05, 0);
    return wing;
  }

  const leftWing = buildWing(1);
  const rightWing = buildWing(-1);
  wingGroup.add(leftWing, rightWing);

  // ── Tail fins (cruciform × 4) ──────────────────────────────────
  const tailSpan  = R * 3;
  const tailChord = L * 0.055;
  const tailThick = R * 0.04;

  for (let i = 0; i < 4; i++) {
    const angle = Math.PI * 0.5 * i;
    const fin = new THREE.Mesh(
      new THREE.BoxGeometry(tailThick, tailChord, tailSpan),
      finMat,
    );
    fin.position.set(
      Math.cos(angle) * R * 1.02,
      -L * 0.47,
      Math.sin(angle) * R * 1.02,
    );
    fin.rotation.y = -angle;
    root.add(fin);
  }

  // ── Ventral air intake ──────────────────────────────────────────
  const intake = new THREE.Mesh(
    new THREE.BoxGeometry(R * 0.85, L * 0.14, R * 0.55),
    intakeMat,
  );
  intake.position.set(0, -L * 0.12, -R * 0.88);
  root.add(intake);

  // Intake lip
  const lip = new THREE.Mesh(
    new THREE.BoxGeometry(R * 0.95, L * 0.012, R * 0.65),
    bandMat,
  );
  lip.position.set(0, -L * 0.12 + L * 0.07, -R * 0.88);
  root.add(lip);

  // ── Conformal fuel tank belly ───────────────────────────────────
  const belly = new THREE.Mesh(
    new THREE.CylinderGeometry(R * 0.5, R * 0.65, L * 0.35, 10, 1, false),
    bodyMat,
  );
  belly.position.set(0, -L * 0.08, -R * 0.3);
  root.add(belly);

  // ── Exhaust nozzle ──────────────────────────────────────────────
  const nozzle = new THREE.Mesh(
    new THREE.CylinderGeometry(R * 0.38, R * 0.5, L * 0.025, 12, 1, false),
    intakeMat,
  );
  nozzle.position.y = -L * 0.515;
  root.add(nozzle);

  // ── Turbofan plume (faint blue-gray) ────────────────────────────
  const plume = new THREE.Mesh(
    new THREE.ConeGeometry(R * 0.35, L * 0.06, 8, 1, false),
    new THREE.MeshBasicMaterial({
      color: 0x99bbdd, transparent: true, opacity: 0.18, depthWrite: false,
    }),
  );
  plume.rotation.x = Math.PI;
  plume.position.y = -L * 0.55;
  plume.visible = false;
  root.add(plume);

  // ── Booster section (solid rocket, wraps around tail) ───────────
  const boosterGroup = new THREE.Group();
  const boosterLength = L * 0.35;
  const boosterRadius = R * 1.6;

  const boosterBody = new THREE.Mesh(
    new THREE.CylinderGeometry(boosterRadius * 0.9, boosterRadius, boosterLength, 14, 1, false),
    boosterMat,
  );
  boosterGroup.add(boosterBody);

  // Booster nozzle
  const boosterNozzle = new THREE.Mesh(
    new THREE.CylinderGeometry(boosterRadius * 0.5, boosterRadius * 0.7, boosterLength * 0.12, 10, 1, false),
    intakeMat,
  );
  boosterNozzle.position.y = -boosterLength * 0.55;
  boosterGroup.add(boosterNozzle);

  // Booster fins (4 small)
  for (let i = 0; i < 4; i++) {
    const a = Math.PI * 0.5 * i + Math.PI * 0.25;
    const bf = new THREE.Mesh(
      new THREE.BoxGeometry(R * 0.04, boosterLength * 0.2, boosterRadius * 0.6),
      finMat,
    );
    bf.position.set(
      Math.cos(a) * boosterRadius * 1.0,
      -boosterLength * 0.42,
      Math.sin(a) * boosterRadius * 1.0,
    );
    bf.rotation.y = -a;
    boosterGroup.add(bf);
  }

  boosterGroup.position.y = -L * 0.32;
  root.add(boosterGroup);

  // ── Booster plume (bright orange) ───────────────────────────────
  const boostPlume = new THREE.Mesh(
    new THREE.ConeGeometry(boosterRadius * 0.7, L * 0.2, 10, 1, false),
    new THREE.MeshBasicMaterial({
      color: 0xffaa33, transparent: true, opacity: 0.55, depthWrite: false,
    }),
  );
  boostPlume.rotation.x = Math.PI;
  boostPlume.position.y = -L * 0.32 - boosterLength * 0.5 - L * 0.1;
  boostPlume.visible = false;
  root.add(boostPlume);

  root.visible = false;

  // ── Public interface ────────────────────────────────────────────
  return {
    object3d: root,
    forwardAxis: new THREE.Vector3(0, 1, 0),
    nativeLength: L + NL + boosterLength * 0.5,

    setVisualState(snapshot, elapsedSeconds = 0) {
      const phase = snapshot?.phase ?? 'idle';
      root.visible = snapshot?.visible ?? false;

      // Wings: folded during canister/booster/wingDeploy, deployed after
      const deployed = snapshot?.wingsDeployed ?? (phase !== 'canister' && phase !== 'booster' && phase !== 'wingDeploy');
      wingGroup.visible = deployed;

      // Wing deploy animation (scale from 0 to 1 on X axis)
      if (phase === 'wingDeploy') {
        const deployT = Math.min((snapshot?.flightTimeSeconds ?? 0) / 2, 1);
        const s = THREE.MathUtils.smoothstep(deployT, 0, 1);
        leftWing.scale.set(s, 1, 1);
        rightWing.scale.set(s, 1, 1);
      } else if (deployed) {
        leftWing.scale.set(1, 1, 1);
        rightWing.scale.set(1, 1, 1);
      }

      // Booster: visible only during canister/booster phase
      const hasBooster = snapshot?.boosterAttached ?? (phase === 'canister' || phase === 'booster');
      boosterGroup.visible = hasBooster;

      // Plumes
      boostPlume.visible = phase === 'booster';
      plume.visible = phase === 'climb' || phase === 'cruise' || phase === 'terminal';

      if (boostPlume.visible) {
        const flk = 0.45 + Math.sin((elapsedSeconds ?? 0) * 26) * 0.1;
        boostPlume.material.opacity = flk;
        boostPlume.scale.set(1, 0.88 + Math.sin((elapsedSeconds ?? 0) * 17) * 0.12, 1);
      }

      if (plume.visible) {
        plume.material.opacity = 0.14 + Math.sin((elapsedSeconds ?? 0) * 11) * 0.04;
      }
    },

    // For spent-stage separation system
    createSeparationFragment(stageKey) {
      if (stageKey === 'booster') {
        const frag = boosterGroup.clone(true);
        frag.visible = true;
        return {
          object3d: frag,
          localOffset: new THREE.Vector3(0, -L * 0.32, 0),
        };
      }
      return null;
    },
  };
}
