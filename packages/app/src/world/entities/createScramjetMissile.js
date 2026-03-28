import * as THREE from 'three';

// ── HCM Visual (Zircon / 3M22 class) ────────────────────────────────
// Scramjet-powered hypersonic cruise missile. Cylindrical body with
// axisymmetric air intake, distinct from the flat-delta HGV waverider.
//
// Real Zircon: ~8-9m long × 0.7m diameter
// Forward axis is +Y.

export function createScramjetMissile() {
  const root = new THREE.Group();

  // ── Materials ───────────────────────────────────────────────────
  const bodyMat    = new THREE.MeshStandardMaterial({ color: 0x3a4858, roughness: 0.40, metalness: 0.42 });
  const noseMat    = new THREE.MeshStandardMaterial({ color: 0x222830, roughness: 0.55, metalness: 0.25 });
  const intakeMat  = new THREE.MeshStandardMaterial({ color: 0x0e1418, roughness: 0.65, metalness: 0.15 });
  const finMat     = new THREE.MeshStandardMaterial({ color: 0x2e3a48, roughness: 0.45, metalness: 0.35 });
  const bandMat    = new THREE.MeshStandardMaterial({ color: 0x4a5868, roughness: 0.38, metalness: 0.38 });
  const heatMat    = new THREE.MeshStandardMaterial({ color: 0x1a1a1e, roughness: 0.70, metalness: 0.15 });
  const boosterMat = new THREE.MeshStandardMaterial({ color: 0xb8b0a0, roughness: 0.50, metalness: 0.20 });

  // ── Dimensions ──────────────────────────────────────────────────
  const L  = 0.0000060;  // body length
  const R  = 0.0000026;  // body radius
  const NL = 0.0000014;  // nose length
  const BL = 0.0000030;  // booster length
  const BR = 0.0000034;  // booster radius

  // ── Main body (cylindrical) ─────────────────────────────────────
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(R, R * 1.02, L, 18, 1, false),
    bodyMat,
  );
  root.add(body);

  // Panel bands
  for (const yf of [-0.30, -0.05, 0.20, 0.38]) {
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(R * 1.03, R * 1.03, L * 0.007, 18, 1, false),
      bandMat,
    );
    band.position.y = L * yf;
    root.add(band);
  }

  // ── Nose cone with central body (axisymmetric scramjet intake) ──
  // The Zircon has a nose cone with a central spike/body that creates
  // the shock structure for the scramjet inlet.

  // Outer nose cone (radome / intake cowl)
  const outerNoseProfile = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const r = R * (1 - t * t * 0.85) * (1 - t * 0.1);
    outerNoseProfile.push(new THREE.Vector2(r, NL * t));
  }
  outerNoseProfile.push(new THREE.Vector2(R * 0.15, NL));
  const outerNose = new THREE.Mesh(new THREE.LatheGeometry(outerNoseProfile, 18), noseMat);
  outerNose.position.y = L * 0.5;
  root.add(outerNose);

  // Central body / spike (scramjet center body)
  const spike = new THREE.Mesh(
    new THREE.ConeGeometry(R * 0.22, NL * 1.3, 10, 1, false),
    new THREE.MeshStandardMaterial({ color: 0x667788, roughness: 0.3, metalness: 0.55 }),
  );
  spike.position.y = L * 0.5 + NL * 0.35;
  root.add(spike);

  // Intake annular gap (dark ring between center body and cowl)
  const intakeRing = new THREE.Mesh(
    new THREE.TorusGeometry(R * 0.55, R * 0.12, 8, 18),
    intakeMat,
  );
  intakeRing.rotation.x = Math.PI * 0.5;
  intakeRing.position.y = L * 0.5 + NL * 0.15;
  root.add(intakeRing);

  // ── Heat-resistant tiles on forward section ─────────────────────
  const heatTiles = new THREE.Mesh(
    new THREE.CylinderGeometry(R * 1.01, R * 1.01, L * 0.2, 18, 1, false),
    heatMat,
  );
  heatTiles.position.y = L * 0.35;
  root.add(heatTiles);

  // ── Small fixed fins (4, rear) ──────────────────────────────────
  const finSpan  = R * 2.5;
  const finChord = L * 0.055;
  const finThick = R * 0.04;

  for (let i = 0; i < 4; i++) {
    const angle = Math.PI * 0.5 * i;
    const fin = new THREE.Mesh(
      new THREE.BoxGeometry(finThick, finChord, finSpan),
      finMat,
    );
    fin.position.set(
      Math.cos(angle) * R * 1.04,
      -L * 0.46,
      Math.sin(angle) * R * 1.04,
    );
    fin.rotation.y = -angle;
    root.add(fin);
  }

  // ── Scramjet exhaust nozzle ─────────────────────────────────────
  const nozzle = new THREE.Mesh(
    new THREE.CylinderGeometry(R * 0.6, R * 0.78, L * 0.03, 14, 1, false),
    intakeMat,
  );
  nozzle.position.y = -L * 0.52;
  root.add(nozzle);

  // ── Scramjet plume (diamond-shock pattern) ──────────────────────
  // Two interleaved cones simulate the shock diamond pattern
  const plumeMat = new THREE.MeshBasicMaterial({
    color: 0xff7733, transparent: true, opacity: 0.4, depthWrite: false,
  });
  const diamondMat = new THREE.MeshBasicMaterial({
    color: 0xffdd88, transparent: true, opacity: 0.25, depthWrite: false,
  });

  const plumeCone = new THREE.Mesh(
    new THREE.ConeGeometry(R * 0.5, L * 0.1, 8, 1, false), plumeMat,
  );
  plumeCone.rotation.x = Math.PI;
  plumeCone.position.y = -L * 0.57;
  plumeCone.visible = false;
  root.add(plumeCone);

  const diamond1 = new THREE.Mesh(
    new THREE.ConeGeometry(R * 0.2, L * 0.025, 6, 1, false), diamondMat,
  );
  diamond1.position.y = -L * 0.56;
  diamond1.visible = false;
  root.add(diamond1);

  const diamond2 = new THREE.Mesh(
    new THREE.ConeGeometry(R * 0.15, L * 0.02, 6, 1, false), diamondMat,
  );
  diamond2.rotation.x = Math.PI;
  diamond2.position.y = -L * 0.60;
  diamond2.visible = false;
  root.add(diamond2);

  // ── Booster section ─────────────────────────────────────────────
  const boosterGroup = new THREE.Group();

  const boosterBody = new THREE.Mesh(
    new THREE.CylinderGeometry(BR * 0.92, BR, BL, 16, 1, false),
    boosterMat,
  );
  boosterGroup.add(boosterBody);

  const bRing = new THREE.Mesh(
    new THREE.CylinderGeometry(BR * 0.98, BR * 1.02, BL * 0.035, 16, 1, false),
    bandMat,
  );
  bRing.position.y = BL * 0.48;
  boosterGroup.add(bRing);

  const bNozzle = new THREE.Mesh(
    new THREE.CylinderGeometry(BR * 0.4, BR * 0.58, BL * 0.08, 10, 1, false),
    intakeMat,
  );
  bNozzle.position.y = -BL * 0.52;
  boosterGroup.add(bNozzle);

  for (let i = 0; i < 4; i++) {
    const a = Math.PI * 0.5 * i + Math.PI * 0.25;
    const bf = new THREE.Mesh(
      new THREE.BoxGeometry(R * 0.035, BL * 0.15, BR * 0.55),
      finMat,
    );
    bf.position.set(Math.cos(a) * BR * 1.0, -BL * 0.42, Math.sin(a) * BR * 1.0);
    bf.rotation.y = -a;
    boosterGroup.add(bf);
  }

  boosterGroup.position.y = -L * 0.5 - BL * 0.25;
  root.add(boosterGroup);

  // Booster plume
  const boostPlume = new THREE.Mesh(
    new THREE.ConeGeometry(BR * 0.7, L * 0.2, 10, 1, false),
    new THREE.MeshBasicMaterial({
      color: 0xffaa22, transparent: true, opacity: 0.55, depthWrite: false,
    }),
  );
  boostPlume.rotation.x = Math.PI;
  boostPlume.position.y = -L * 0.5 - BL * 0.5 - L * 0.1;
  boostPlume.visible = false;
  root.add(boostPlume);

  // ── Plasma heating glow ─────────────────────────────────────────
  const plasmaGlow = new THREE.Mesh(
    new THREE.SphereGeometry(R * 1.3, 10, 10),
    new THREE.MeshBasicMaterial({
      color: 0xff6622, transparent: true, opacity: 0, depthWrite: false,
    }),
  );
  plasmaGlow.position.y = L * 0.3;
  root.add(plasmaGlow);

  // Wake trail
  const wake = new THREE.Mesh(
    new THREE.ConeGeometry(R * 0.7, L * 0.3, 8, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xff4400, transparent: true, opacity: 0, depthWrite: false,
    }),
  );
  wake.rotation.x = Math.PI;
  wake.position.y = -L * 0.5 - L * 0.15;
  root.add(wake);

  root.visible = false;

  return {
    object3d: root,
    forwardAxis: new THREE.Vector3(0, 1, 0),
    nativeLength: L + NL + BL * 0.4,

    setVisualState(snapshot, elapsedSeconds = 0) {
      const phase = snapshot?.phase ?? 'idle';
      root.visible = snapshot?.visible ?? false;

      const hasBooster = snapshot?.boosterAttached ?? (phase === 'boost');
      boosterGroup.visible = hasBooster;

      // Boost plume
      boostPlume.visible = phase === 'boost';
      if (boostPlume.visible) {
        const flk = 0.45 + Math.sin((elapsedSeconds ?? 0) * 28) * 0.10;
        boostPlume.material.opacity = flk;
      }

      // Scramjet plume + diamonds
      const scramjetting = phase === 'cruise' || phase === 'scramjetLight'
        || phase === 'climb' || phase === 'terminal';
      plumeCone.visible = scramjetting;
      diamond1.visible = scramjetting;
      diamond2.visible = scramjetting;

      if (scramjetting) {
        const p = 0.30 + Math.sin((elapsedSeconds ?? 0) * 20) * 0.10;
        plumeCone.material.opacity = p;
        // Diamonds flicker rapidly
        const d = 0.18 + Math.sin((elapsedSeconds ?? 0) * 42) * 0.08;
        diamond1.material.opacity = d;
        diamond2.material.opacity = d * 0.8;
      }

      // Plasma glow
      const mach = snapshot?.machNumber ?? ((snapshot?.speedKmS ?? 0) * 1000 / 343);
      const altKm = snapshot?.altitudeKm ?? 0;
      const atmoFade = altKm > 60 ? Math.max(0, 1 - (altKm - 60) / 30) : 1;
      const plasmaInt = mach > 4
        ? Math.min((mach - 4) / 6, 1) * 0.3 * atmoFade
        : 0;
      plasmaGlow.material.opacity = plasmaInt;
      plasmaGlow.material.color.setHex(mach > 7 ? 0xffcc44 : 0xff6622);

      // Wake trail
      const wakeInt = mach > 3
        ? Math.min((mach - 3) / 5, 1) * 0.2 * atmoFade
        : 0;
      wake.material.opacity = wakeInt;
      wake.visible = wakeInt > 0.01;
    },

    createSeparationFragment(stageKey) {
      if (stageKey === 'booster') {
        const frag = boosterGroup.clone(true);
        frag.visible = true;
        return {
          object3d: frag,
          localOffset: new THREE.Vector3(0, -L * 0.5 - BL * 0.25, 0),
        };
      }
      return null;
    },
  };
}
