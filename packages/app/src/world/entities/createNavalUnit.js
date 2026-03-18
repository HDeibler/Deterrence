import * as THREE from 'three';

// ── Color palettes per variant ──────────────────────────────────────
const CARRIER_PALETTES = [
  // 0 – Nimitz-class (US Navy grey)
  {
    hull: 0x5a6370,
    hullDark: 0x2d3748,
    deck: 0x2a2f38,
    flightDeck: 0x1e2228,
    superstructure: 0x6b7b8d,
    superLight: 0x8899aa,
    mast: 0x9aa5b4,
    waterline: 0x8b0000,
  },
  // 1 – Queen Elizabeth-class (Royal Navy dark)
  {
    hull: 0x3e4a54,
    hullDark: 0x222d35,
    deck: 0x2c3238,
    flightDeck: 0x1a2028,
    superstructure: 0x556270,
    superLight: 0x708090,
    mast: 0x8a9baa,
    waterline: 0x6b1010,
  },
  // 2 – Liaoning-style (lighter hull, blue-grey tones)
  {
    hull: 0x64707c,
    hullDark: 0x384450,
    deck: 0x3a4248,
    flightDeck: 0x282e34,
    superstructure: 0x7a8898,
    superLight: 0x95a5b5,
    mast: 0xa8b8c8,
    waterline: 0x993020,
  },
  // 3 – Charles de Gaulle (warm grey)
  {
    hull: 0x585e66,
    hullDark: 0x30363e,
    deck: 0x363c42,
    flightDeck: 0x24282e,
    superstructure: 0x6e7680,
    superLight: 0x8c949e,
    mast: 0x9ea6b0,
    waterline: 0x7a1515,
  },
];

const CRUISER_PALETTES = [
  // 0 – Ticonderoga (US grey)
  {
    hull: 0x5a6370,
    hullDark: 0x2d3748,
    deck: 0x3b4252,
    superstructure: 0x6b7b8d,
    superLight: 0x8899aa,
    mast: 0x9aa5b4,
    waterline: 0x8b0000,
  },
  // 1 – Type 055 (Chinese navy dark blue-grey)
  {
    hull: 0x4a5565,
    hullDark: 0x253040,
    deck: 0x333d4a,
    superstructure: 0x5c6c7e,
    superLight: 0x7889a0,
    mast: 0x8898a8,
    waterline: 0x882010,
  },
  // 2 – Kirov-class (Soviet dark)
  {
    hull: 0x484e56,
    hullDark: 0x222830,
    deck: 0x30363e,
    superstructure: 0x5e6670,
    superLight: 0x7a828c,
    mast: 0x8a929c,
    waterline: 0x701515,
  },
  // 3 – Zumwalt-style (stealth angular, very dark)
  {
    hull: 0x3a4048,
    hullDark: 0x1e242c,
    deck: 0x282e36,
    superstructure: 0x4e5660,
    superLight: 0x687078,
    mast: 0x787e88,
    waterline: 0x661818,
  },
  // 4 – Arleigh Burke (lighter warm grey)
  {
    hull: 0x626870,
    hullDark: 0x363c44,
    deck: 0x404850,
    superstructure: 0x748290,
    superLight: 0x9aabb8,
    mast: 0xa0b0be,
    waterline: 0x8b0000,
  },
];

const _radomeMat = new THREE.MeshStandardMaterial({
  color: 0xd0d8e0,
  roughness: 0.3,
  metalness: 0.1,
});
const _weaponMat = new THREE.MeshStandardMaterial({
  color: 0x4a5568,
  roughness: 0.4,
  metalness: 0.7,
});
const _windowMat = new THREE.MeshStandardMaterial({
  color: 0x1a1a2e,
  roughness: 0.2,
  metalness: 0.8,
});
const _edgeMat = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  roughness: 0.5,
  metalness: 0.1,
});
const _circleMat = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  roughness: 0.5,
  side: THREE.DoubleSide,
});
const _hatchMat = new THREE.MeshStandardMaterial({
  color: 0x3a3a3a,
  roughness: 0.9,
  metalness: 0.1,
});
const _doorMat = new THREE.MeshStandardMaterial({
  color: 0x1e2430,
  roughness: 0.3,
  metalness: 0.5,
});

function makePaletteMaterials(palette) {
  return {
    hull: new THREE.MeshStandardMaterial({ color: palette.hull, roughness: 0.7, metalness: 0.3 }),
    hullDark: new THREE.MeshStandardMaterial({
      color: palette.hullDark,
      roughness: 0.8,
      metalness: 0.2,
    }),
    deck: new THREE.MeshStandardMaterial({ color: palette.deck, roughness: 0.9, metalness: 0.1 }),
    flightDeck: palette.flightDeck
      ? new THREE.MeshStandardMaterial({
          color: palette.flightDeck,
          roughness: 0.95,
          metalness: 0.05,
        })
      : null,
    superstructure: new THREE.MeshStandardMaterial({
      color: palette.superstructure,
      roughness: 0.5,
      metalness: 0.4,
    }),
    superLight: new THREE.MeshStandardMaterial({
      color: palette.superLight,
      roughness: 0.4,
      metalness: 0.5,
    }),
    mast: new THREE.MeshStandardMaterial({ color: palette.mast, roughness: 0.3, metalness: 0.6 }),
    waterline: new THREE.MeshStandardMaterial({
      color: palette.waterline,
      roughness: 0.8,
      metalness: 0.1,
    }),
  };
}

// ── Mesh helper (position/rotation are read-only on Object3D) ───────
function addMesh(parent, mesh, x, y, z, rx, ry, rz) {
  mesh.position.set(x || 0, y || 0, z || 0);
  if (rx !== undefined) mesh.rotation.x = rx;
  if (ry !== undefined) mesh.rotation.y = ry;
  if (rz !== undefined) mesh.rotation.z = rz;
  parent.add(mesh);
  return mesh;
}

// ── Geometry helpers ────────────────────────────────────────────────

function createTaperedHull(length, widthBow, widthMid, widthStern, depth, resolution) {
  const shape = new THREE.Shape();
  const halfBow = widthBow / 2;
  const halfMid = widthMid / 2;
  const halfStern = widthStern / 2;

  shape.moveTo(-halfStern, 0);
  shape.quadraticCurveTo(-halfMid * 1.05, length * 0.3, -halfMid, length * 0.4);
  shape.quadraticCurveTo(-halfMid * 0.7, length * 0.75, -halfBow * 0.3, length * 0.92);
  shape.quadraticCurveTo(0, length * 1.02, halfBow * 0.3, length * 0.92);
  shape.quadraticCurveTo(halfMid * 0.7, length * 0.75, halfMid, length * 0.4);
  shape.quadraticCurveTo(halfMid * 1.05, length * 0.3, halfStern, 0);
  shape.lineTo(-halfStern, 0);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    steps: resolution || 1,
    depth,
    bevelEnabled: false,
  });
  geometry.rotateX(-Math.PI / 2);
  // Shape draws bow at +Y, rotateX puts bow at -Z. Flip so bow is at +Z
  // where all component positions expect it.
  geometry.rotateY(Math.PI);
  return geometry;
}

function createRoundedBox(w, h, d, r) {
  const shape = new THREE.Shape();
  const hw = w / 2;
  const hd = d / 2;
  const cr = Math.min(r, hw, hd);

  shape.moveTo(-hw + cr, -hd);
  shape.lineTo(hw - cr, -hd);
  shape.quadraticCurveTo(hw, -hd, hw, -hd + cr);
  shape.lineTo(hw, hd - cr);
  shape.quadraticCurveTo(hw, hd, hw - cr, hd);
  shape.lineTo(-hw + cr, hd);
  shape.quadraticCurveTo(-hw, hd, -hw, hd - cr);
  shape.lineTo(-hw, -hd + cr);
  shape.quadraticCurveTo(-hw, -hd, -hw + cr, -hd);

  const geometry = new THREE.ExtrudeGeometry(shape, { steps: 1, depth: h, bevelEnabled: false });
  geometry.rotateX(-Math.PI / 2);
  geometry.rotateY(Math.PI);
  return geometry;
}

// Simple seeded-ish pick so same index always yields same variant
let _carrierCounter = 0;
let _cruiserCounter = 0;

// ====================================================================
//  AIRCRAFT CARRIER  — variant-aware
// ====================================================================
export function createCarrier(variant) {
  const vi = variant ?? _carrierCounter++;
  const palette = CARRIER_PALETTES[vi % CARRIER_PALETTES.length];
  const mat = makePaletteMaterials(palette);
  const group = new THREE.Group();

  // Variant-specific proportions
  const configs = [
    // 0 Nimitz: long, flat deck, island far aft-starboard, CATOBAR
    {
      L: 0.0032,
      B: 0.00085,
      H: 0.00035,
      islandPos: 0.55,
      islandSide: 1,
      hasSkiJump: false,
      hasAngledDeck: true,
      aircraftCount: 6,
      deckOverhang: 1.35,
    },
    // 1 QE: twin-island, ski-jump, big
    {
      L: 0.003,
      B: 0.00078,
      H: 0.00038,
      islandPos: 0.5,
      islandSide: 1,
      hasSkiJump: true,
      hasAngledDeck: false,
      aircraftCount: 4,
      deckOverhang: 1.2,
      twinIsland: true,
    },
    // 2 Liaoning: ski-jump, island mid-starboard
    {
      L: 0.0028,
      B: 0.00076,
      H: 0.00034,
      islandPos: 0.45,
      islandSide: 1,
      hasSkiJump: true,
      hasAngledDeck: true,
      aircraftCount: 4,
      deckOverhang: 1.25,
    },
    // 3 CDG: compact, nuclear, CATOBAR, small island
    {
      L: 0.0026,
      B: 0.00072,
      H: 0.00032,
      islandPos: 0.52,
      islandSide: 1,
      hasSkiJump: false,
      hasAngledDeck: true,
      aircraftCount: 3,
      deckOverhang: 1.3,
    },
  ];
  const cfg = configs[vi % configs.length];
  const { L, B, H } = cfg;
  const draft = H * 0.43;

  // ─── Hull ─────────────────────────────────────────────────────
  const hullGeo = createTaperedHull(L, B * 0.15, B, B * 0.7, H, 2);
  const hull = new THREE.Mesh(hullGeo, mat.hull);
  hull.position.y = draft;
  group.add(hull);

  // Waterline paint
  const wlGeo = createTaperedHull(L * 0.96, B * 0.12, B * 0.95, B * 0.65, draft * 0.4, 1);
  addMesh(group, new THREE.Mesh(wlGeo, mat.waterline), 0, 0, L * 0.02);

  // ─── Flight deck ──────────────────────────────────────────────
  const deckW = B * cfg.deckOverhang;
  const deckH = H * 0.08;
  const deckL = L * 1.05;
  const dHW = deckW / 2;

  const deckShape = new THREE.Shape();
  if (cfg.hasAngledDeck) {
    deckShape.moveTo(-dHW * 0.6, 0);
    deckShape.lineTo(-dHW, deckL * 0.15);
    deckShape.quadraticCurveTo(-dHW * 1.02, deckL * 0.5, -dHW * 0.7, deckL * 0.85);
  } else {
    deckShape.moveTo(-dHW * 0.5, 0);
    deckShape.quadraticCurveTo(-dHW * 0.9, deckL * 0.4, -dHW * 0.65, deckL * 0.85);
  }
  deckShape.quadraticCurveTo(-dHW * 0.15, deckL * 1.01, 0, deckL * 1.02);
  deckShape.quadraticCurveTo(dHW * 0.15, deckL * 1.01, dHW * 0.55, deckL * 0.85);
  deckShape.quadraticCurveTo(dHW * 0.8, deckL * 0.5, dHW * 0.7, deckL * 0.15);
  deckShape.lineTo(dHW * 0.5, 0);
  deckShape.closePath();

  const deckGeo = new THREE.ExtrudeGeometry(deckShape, {
    steps: 1,
    depth: deckH,
    bevelEnabled: false,
  });
  deckGeo.rotateX(-Math.PI / 2);
  deckGeo.rotateY(Math.PI);
  const deck = new THREE.Mesh(deckGeo, mat.flightDeck);
  deck.position.set(0, H + draft, -L * 0.025);
  group.add(deck);

  // Runway markings
  const lineGeo = new THREE.BoxGeometry(B * 0.012, deckH * 0.4, L * 0.55);
  const centerLine = new THREE.Mesh(lineGeo, _edgeMat);
  centerLine.position.set(0, H + draft + deckH + 0.000002, L * 0.25);
  group.add(centerLine);

  if (cfg.hasAngledDeck) {
    const angleLine = new THREE.Mesh(lineGeo.clone(), _edgeMat);
    angleLine.position.set(-B * 0.15, H + draft + deckH + 0.000002, L * 0.2);
    angleLine.rotation.y = 0.15;
    group.add(angleLine);
  }

  // ─── Ski-jump (if applicable) ─────────────────────────────────
  if (cfg.hasSkiJump) {
    const rampGeo = new THREE.BoxGeometry(B * 0.45, deckH * 3, L * 0.055);
    rampGeo.translate(0, 0, L * 0.0275);
    const ramp = new THREE.Mesh(rampGeo, mat.deck);
    ramp.position.set(0, H + draft + deckH, L * 0.97);
    ramp.rotation.x = -0.28;
    group.add(ramp);
  }

  // ─── Island superstructure ────────────────────────────────────
  const islandX = B * 0.38 * cfg.islandSide;
  const islandZ = L * cfg.islandPos;

  function addIsland(ix, iz, scale) {
    const s = scale || 1;
    const iBaseW = B * 0.22 * s;
    const iBaseH = H * 0.6 * s;
    const iBaseL = L * 0.16 * s;

    const iBase = new THREE.Mesh(
      createRoundedBox(iBaseW, iBaseH, iBaseL, iBaseW * 0.15),
      mat.superstructure,
    );
    iBase.position.set(ix, H + draft + deckH, iz);
    group.add(iBase);

    const iBridgeW = iBaseW * 0.85;
    const iBridgeH = H * 0.38 * s;
    const iBridgeL = iBaseL * 0.72;
    const iBridge = new THREE.Mesh(
      createRoundedBox(iBridgeW, iBridgeH, iBridgeL, iBridgeW * 0.12),
      mat.superLight,
    );
    iBridge.position.set(ix, H + draft + deckH + iBaseH, iz + iBaseL * 0.04);
    group.add(iBridge);

    // Windows
    const winGeo = new THREE.BoxGeometry(iBridgeW * 1.02, iBridgeH * 0.25, iBridgeL * 0.85);
    const win = new THREE.Mesh(winGeo, _windowMat);
    win.position.set(ix, H + draft + deckH + iBaseH + iBridgeH * 0.55, iz + iBaseL * 0.04);
    group.add(win);

    // Top
    const iTopW = iBridgeW * 0.6;
    const iTopH = H * 0.22 * s;
    const iTopL = iBridgeL * 0.5;
    const iTop = new THREE.Mesh(
      createRoundedBox(iTopW, iTopH, iTopL, iTopW * 0.1),
      mat.superstructure,
    );
    iTop.position.set(ix, H + draft + deckH + iBaseH + iBridgeH, iz + iBaseL * 0.06);
    group.add(iTop);

    // Mast
    const mH = H * 1.1 * s;
    const mastGeo = new THREE.CylinderGeometry(B * 0.011 * s, B * 0.016 * s, mH, 6);
    const mast = new THREE.Mesh(mastGeo, mat.mast);
    mast.position.set(
      ix,
      H + draft + deckH + iBaseH + iBridgeH + iTopH + mH / 2,
      iz + iBaseL * 0.06,
    );
    group.add(mast);

    // Primary radar
    const rGeo = new THREE.CylinderGeometry(B * 0.07 * s, B * 0.07 * s, B * 0.007, 12);
    const radar = new THREE.Mesh(rGeo, _radomeMat);
    radar.position.set(
      ix,
      H + draft + deckH + iBaseH + iBridgeH + iTopH + mH * 0.65,
      iz + iBaseL * 0.06,
    );
    radar.rotation.z = Math.PI / 2;
    radar.rotation.y = 0.3 * (scale === 0.7 ? -1 : 1);
    group.add(radar);

    // Secondary radar
    const r2Geo = new THREE.CylinderGeometry(B * 0.035 * s, B * 0.035 * s, B * 0.005, 8);
    const r2 = new THREE.Mesh(r2Geo, _radomeMat);
    r2.position.set(ix, H + draft + deckH + iBaseH + iBridgeH + iTopH + mH * 0.92, iz);
    r2.rotation.z = Math.PI / 2;
    group.add(r2);

    return { baseH: iBaseH, bridgeH: iBridgeH };
  }

  addIsland(islandX, islandZ, 1);

  // QE-class twin island
  if (cfg.twinIsland) {
    addIsland(islandX, islandZ - L * 0.18, 0.7);
  }

  // ─── Exhaust stacks ──────────────────────────────────────────
  const stackGeo = new THREE.CylinderGeometry(B * 0.028, B * 0.034, H * 0.45, 8);
  const s1 = new THREE.Mesh(stackGeo, mat.hullDark);
  s1.position.set(islandX - B * 0.06, H + draft + deckH + H * 0.85, islandZ - L * 0.09);
  group.add(s1);
  const s2 = s1.clone();
  s2.position.x = islandX + B * 0.06;
  group.add(s2);

  // ─── Aircraft on deck ────────────────────────────────────────
  const acMat = new THREE.MeshStandardMaterial({
    color: palette.hullDark,
    roughness: 0.6,
    metalness: 0.3,
  });
  const acBodyGeo = new THREE.BoxGeometry(B * 0.055, deckH * 1.5, B * 0.11);
  const acWingGeo = new THREE.BoxGeometry(B * 0.14, deckH * 0.5, B * 0.035);

  // Scatter aircraft differently per variant
  const basePositions = [
    [B * 0.08, L * 0.72],
    [-B * 0.18, L * 0.62],
    [B * 0.04, L * 0.5],
    [-B * 0.22, L * 0.37],
    [B * 0.14, L * 0.27],
    [-B * 0.08, L * 0.18],
  ];
  const count = Math.min(cfg.aircraftCount, basePositions.length);
  const offset = vi % 2; // stagger positions between variants
  for (let i = 0; i < count; i++) {
    const [ax, az] = basePositions[(i + offset) % basePositions.length];
    const acG = new THREE.Group();
    acG.add(new THREE.Mesh(acBodyGeo, acMat));
    const wing = new THREE.Mesh(acWingGeo, acMat);
    wing.position.z = -B * 0.01;
    acG.add(wing);
    acG.position.set(ax, H + draft + deckH + deckH, az);
    acG.rotation.y = ((vi * 0.4 + i * 0.2) % 0.8) - 0.4; // slight varied rotation
    group.add(acG);
  }

  // ─── CIWS mounts ─────────────────────────────────────────────
  const cwsBaseGeo = new THREE.CylinderGeometry(B * 0.024, B * 0.028, H * 0.14, 8);
  const cwsBarrelGeo = new THREE.CylinderGeometry(B * 0.005, B * 0.005, B * 0.075, 4);
  const cwsSpots = [
    [-B * 0.48, L * 0.78],
    [B * 0.33, L * 0.13],
    [-B * 0.42, L * 0.08],
  ];
  for (const [cx, cz] of cwsSpots) {
    const cg = new THREE.Group();
    cg.add(new THREE.Mesh(cwsBaseGeo, _weaponMat));
    const brl = new THREE.Mesh(cwsBarrelGeo, _weaponMat);
    brl.position.set(0, H * 0.09, B * 0.028);
    brl.rotation.x = -0.5;
    cg.add(brl);
    cg.position.set(cx, H + draft + deckH + H * 0.07, cz);
    group.add(cg);
  }

  return { object3d: group, type: 'carrier' };
}

// ====================================================================
//  CRUISER / ATTACK SHIP — variant-aware
// ====================================================================
export function createCruiser(variant) {
  const vi = variant ?? _cruiserCounter++;
  const palette = CRUISER_PALETTES[vi % CRUISER_PALETTES.length];
  const mat = makePaletteMaterials(palette);
  const group = new THREE.Group();

  // Variant-specific proportions
  const configs = [
    // 0 Ticonderoga — classic cruiser, twin VLS, prominent superstructure
    {
      L: 0.002,
      B: 0.00035,
      H: 0.00025,
      superPos: 0.46,
      hasGun: true,
      gunSize: 1,
      hasTorpedoes: true,
      hasHeloPad: true,
      aftVLS: true,
      superScale: 1.0,
      mastHeight: 1.5,
    },
    // 1 Type 055 — longer, cleaner lines, integrated mast
    {
      L: 0.0022,
      B: 0.00036,
      H: 0.00026,
      superPos: 0.44,
      hasGun: true,
      gunSize: 0.9,
      hasTorpedoes: true,
      hasHeloPad: true,
      aftVLS: true,
      superScale: 1.1,
      mastHeight: 1.8,
    },
    // 2 Kirov — battlecruiser, massive, heavy weapons
    {
      L: 0.0025,
      B: 0.00042,
      H: 0.0003,
      superPos: 0.42,
      hasGun: true,
      gunSize: 1.3,
      hasTorpedoes: false,
      hasHeloPad: true,
      aftVLS: true,
      superScale: 1.3,
      mastHeight: 1.4,
    },
    // 3 Zumwalt — angular stealth, tumblehome hull, low profile
    {
      L: 0.0019,
      B: 0.00038,
      H: 0.00022,
      superPos: 0.4,
      hasGun: true,
      gunSize: 1.4,
      hasTorpedoes: false,
      hasHeloPad: true,
      aftVLS: false,
      superScale: 0.85,
      mastHeight: 1.0,
    },
    // 4 Arleigh Burke — compact destroyer/cruiser
    {
      L: 0.0018,
      B: 0.00032,
      H: 0.00023,
      superPos: 0.48,
      hasGun: true,
      gunSize: 0.8,
      hasTorpedoes: true,
      hasHeloPad: true,
      aftVLS: true,
      superScale: 0.9,
      mastHeight: 1.3,
    },
  ];
  const cfg = configs[vi % configs.length];
  const { L, B, H } = cfg;
  const draft = H * 0.4;

  // ─── Hull ─────────────────────────────────────────────────────
  const hullGeo = createTaperedHull(L, B * 0.08, B, B * 0.55, H, 2);
  const hull = new THREE.Mesh(hullGeo, mat.hull);
  hull.position.y = draft;
  group.add(hull);

  // Waterline
  const wlGeo = createTaperedHull(L * 0.94, B * 0.06, B * 0.9, B * 0.5, draft * 0.5, 1);
  addMesh(group, new THREE.Mesh(wlGeo, mat.waterline), 0, 0, L * 0.03);

  // Main deck
  const deckGeo = createTaperedHull(L * 0.95, B * 0.06, B * 0.95, B * 0.5, H * 0.06, 1);
  addMesh(group, new THREE.Mesh(deckGeo, mat.deck), 0, H + draft, L * 0.025);

  // ─── Forecastle ───────────────────────────────────────────────
  const fcL = L * 0.18;
  const fcH = H * 0.2;
  const fcGeo = createTaperedHull(fcL, B * 0.06, B * 0.7, B * 0.85, fcH, 1);
  addMesh(group, new THREE.Mesh(fcGeo, mat.hull), 0, H + draft, L * 0.76);

  // ─── Forward VLS ──────────────────────────────────────────────
  const vlsW = B * 0.45;
  const vlsH = H * 0.12;
  const vlsL = L * 0.1;
  const vlsGeo = new THREE.BoxGeometry(vlsW, vlsH, vlsL);
  const vlsFwd = new THREE.Mesh(vlsGeo, _weaponMat);
  vlsFwd.position.set(0, H + draft + fcH + vlsH / 2, L * 0.72);
  group.add(vlsFwd);

  // VLS hatch lines
  for (let i = 0; i < 3; i++) {
    const hl = new THREE.Mesh(
      new THREE.BoxGeometry(vlsW * 0.9, vlsH * 0.3, vlsL * 0.02),
      _hatchMat,
    );
    hl.position.set(0, H + draft + fcH + vlsH + 0.000001, L * 0.7 + vlsL * 0.3 * i);
    group.add(hl);
  }

  // ─── Main gun ─────────────────────────────────────────────────
  if (cfg.hasGun) {
    const gs = cfg.gunSize;
    const tBase = new THREE.Mesh(
      new THREE.CylinderGeometry(B * 0.18 * gs, B * 0.22 * gs, H * 0.2 * gs, 10),
      _weaponMat,
    );
    tBase.position.set(0, H + draft + fcH + H * 0.1 * gs, L * 0.82);
    group.add(tBase);

    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(B * 0.025 * gs, B * 0.03 * gs, L * 0.08 * gs, 6),
      _weaponMat,
    );
    barrel.rotation.x = -Math.PI / 2 + 0.15;
    barrel.position.set(0, H + draft + fcH + H * 0.2 * gs, L * 0.86);
    group.add(barrel);
  }

  // ─── Main superstructure ──────────────────────────────────────
  const ss = cfg.superScale;
  const sBaseW = B * 0.65 * ss;
  const sBaseH = H * 0.65 * ss;
  const sBaseL = L * 0.2 * ss;
  const sBase = new THREE.Mesh(
    createRoundedBox(sBaseW, sBaseH, sBaseL, sBaseW * 0.12),
    mat.superstructure,
  );
  sBase.position.set(0, H + draft, L * cfg.superPos);
  group.add(sBase);

  // Bridge
  const bW = sBaseW * 0.8;
  const bH = H * 0.35 * ss;
  const bL = sBaseL * 0.65;
  const bridge = new THREE.Mesh(createRoundedBox(bW, bH, bL, bW * 0.1), mat.superLight);
  bridge.position.set(0, H + draft + sBaseH, L * cfg.superPos + sBaseL * 0.04);
  group.add(bridge);

  // Windows
  const winGeo = new THREE.BoxGeometry(bW * 1.02, bH * 0.3, bL * 0.9);
  addMesh(
    group,
    new THREE.Mesh(winGeo, _windowMat),
    0,
    H + draft + sBaseH + bH * 0.6,
    L * cfg.superPos + sBaseL * 0.04,
  );

  // ─── Main mast & radar ───────────────────────────────────────
  const mH = H * cfg.mastHeight;
  const mastGeo = new THREE.CylinderGeometry(B * 0.02 * ss, B * 0.03 * ss, mH, 6);
  addMesh(
    group,
    new THREE.Mesh(mastGeo, mat.mast),
    0,
    H + draft + sBaseH + bH + mH / 2,
    L * cfg.superPos + sBaseL * 0.02,
  );

  // AEGIS-style flat radar panels (4 faces for some variants, 1 for others)
  const radarPanelCount = vi % 2 === 0 ? 4 : 1;
  const rW = B * 0.22 * ss;
  const rH = H * 0.32 * ss;
  if (radarPanelCount === 4) {
    const panelGeo = new THREE.BoxGeometry(rW, rH, B * 0.015);
    const angles = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
    const offsets = [
      [0, 1],
      [1, 0],
      [0, -1],
      [-1, 0],
    ];
    for (let i = 0; i < 4; i++) {
      const panel = new THREE.Mesh(panelGeo, _radomeMat);
      const dist = sBaseW * 0.35;
      panel.position.set(
        offsets[i][0] * dist,
        H + draft + sBaseH + bH * 0.3,
        L * cfg.superPos + sBaseL * 0.04 + offsets[i][1] * dist,
      );
      panel.rotation.y = angles[i];
      group.add(panel);
    }
  } else {
    const panelGeo = new THREE.BoxGeometry(rW, rH, B * 0.015);
    const panel = new THREE.Mesh(panelGeo, _radomeMat);
    panel.position.set(0, H + draft + sBaseH + bH * 0.4, L * cfg.superPos + sBaseL * 0.5);
    group.add(panel);
  }

  // Rotating radar
  const r2Geo = new THREE.CylinderGeometry(B * 0.055 * ss, B * 0.055 * ss, B * 0.005, 10);
  addMesh(
    group,
    new THREE.Mesh(r2Geo, _radomeMat),
    0,
    H + draft + sBaseH + bH + mH * 0.88,
    L * cfg.superPos + sBaseL * 0.02,
    0,
    0,
    Math.PI / 2,
  );

  // ─── Aft superstructure ───────────────────────────────────────
  const aftW = B * 0.5 * ss;
  const aftH = H * 0.42 * ss;
  const aftL = L * 0.11;
  const aft = new THREE.Mesh(createRoundedBox(aftW, aftH, aftL, aftW * 0.1), mat.superstructure);
  aft.position.set(0, H + draft, L * 0.28);
  group.add(aft);

  // Aft mast
  const amH = H * 0.75 * ss;
  addMesh(
    group,
    new THREE.Mesh(new THREE.CylinderGeometry(B * 0.014 * ss, B * 0.019 * ss, amH, 6), mat.mast),
    0,
    H + draft + aftH + amH / 2,
    L * 0.31,
  );

  // ─── Aft VLS ──────────────────────────────────────────────────
  if (cfg.aftVLS) {
    addMesh(group, new THREE.Mesh(vlsGeo, _weaponMat), 0, H + draft + vlsH / 2, L * 0.38);
  }

  // ─── Exhaust stacks ──────────────────────────────────────────
  const stGeo = new THREE.CylinderGeometry(B * 0.038, B * 0.048, H * 0.33, 8);
  const st1 = new THREE.Mesh(stGeo, mat.hullDark);
  st1.position.set(B * 0.18, H + draft + sBaseH * 0.5, L * cfg.superPos - sBaseL * 0.2);
  st1.rotation.z = -0.15;
  group.add(st1);
  const st2 = st1.clone();
  st2.position.x = -B * 0.18;
  st2.rotation.z = 0.15;
  group.add(st2);

  // ─── Torpedo tubes ────────────────────────────────────────────
  if (cfg.hasTorpedoes) {
    const tGeo = new THREE.CylinderGeometry(B * 0.02, B * 0.02, B * 0.14, 6);
    tGeo.rotateZ(Math.PI / 2);
    const tStbd = new THREE.Mesh(tGeo, _weaponMat);
    tStbd.position.set(B * 0.38, H + draft + H * 0.15, L * 0.42);
    group.add(tStbd);
    const tPort = tStbd.clone();
    tPort.position.x = -B * 0.38;
    group.add(tPort);
  }

  // ─── Helo pad ─────────────────────────────────────────────────
  if (cfg.hasHeloPad) {
    const heloH = H * 0.04;
    const heloL = L * 0.12;
    const helo = new THREE.Mesh(new THREE.BoxGeometry(B * 0.78, heloH, heloL), mat.deck);
    helo.position.set(0, H + draft + heloH / 2, L * 0.08);
    group.add(helo);

    const circle = new THREE.Mesh(new THREE.RingGeometry(B * 0.14, B * 0.17, 16), _circleMat);
    circle.rotation.x = -Math.PI / 2;
    circle.position.set(0, H + draft + heloH + 0.000002, L * 0.08);
    group.add(circle);

    // Hangar
    const hW = B * 0.58;
    const hH = H * 0.38;
    const hL = L * 0.075;
    addMesh(
      group,
      new THREE.Mesh(new THREE.BoxGeometry(hW, hH, hL), mat.hullDark),
      0,
      H + draft + hH / 2,
      L * 0.17,
    );
    addMesh(
      group,
      new THREE.Mesh(new THREE.BoxGeometry(hW * 0.7, hH * 0.85, hL * 0.05), _doorMat),
      0,
      H + draft + hH * 0.45,
      L * 0.133,
    );
  }

  // ─── CIWS mounts ─────────────────────────────────────────────
  const cwBGeo = new THREE.CylinderGeometry(B * 0.028, B * 0.033, H * 0.11, 8);
  const cwBarGeo = new THREE.CylinderGeometry(B * 0.007, B * 0.007, B * 0.09, 4);
  const cwsSpots = [
    [B * 0.22, L * 0.62, 0.3],
    [-B * 0.22, L * 0.2, -0.3],
  ];
  for (const [cx, cz, rot] of cwsSpots) {
    const cg = new THREE.Group();
    cg.add(new THREE.Mesh(cwBGeo, _weaponMat));
    const brl = new THREE.Mesh(cwBarGeo, _weaponMat);
    brl.position.set(0, H * 0.07, B * 0.035);
    brl.rotation.x = -0.4;
    cg.add(brl);
    cg.position.set(cx, H + draft + H * 0.06, cz);
    cg.rotation.y = rot;
    group.add(cg);
  }

  return { object3d: group, type: 'cruiser' };
}

// ====================================================================
//  SUBMARINE — variant-aware
// ====================================================================

const SUBMARINE_PALETTES = [
  // 0 – Virginia-class (US – very dark grey)
  {
    hull: 0x2a2e34,
    hullDark: 0x1a1e22,
    sail: 0x3a3e44,
    planes: 0x4a4e54,
    waterline: 0x8b0000,
  },
  // 1 – Type 094 (Chinese – medium dark grey)
  {
    hull: 0x3a4048,
    hullDark: 0x242830,
    sail: 0x4a5058,
    planes: 0x5a5e66,
    waterline: 0x882010,
  },
  // 2 – Yasen-class (Russian – dark)
  {
    hull: 0x2e3238,
    hullDark: 0x1c2026,
    sail: 0x3e4248,
    planes: 0x4e5258,
    waterline: 0x701515,
  },
];

let _submarineCounter = 0;

export function createSubmarine(variant) {
  const vi = variant ?? _submarineCounter++;
  const palette = SUBMARINE_PALETTES[vi % SUBMARINE_PALETTES.length];
  const group = new THREE.Group();

  const L = 0.0013;
  const B = 0.00024;
  const H = 0.00024;

  const hullMat = new THREE.MeshStandardMaterial({ color: palette.hull, roughness: 0.6, metalness: 0.4 });
  const hullDarkMat = new THREE.MeshStandardMaterial({ color: palette.hullDark, roughness: 0.7, metalness: 0.3 });
  const sailMat = new THREE.MeshStandardMaterial({ color: palette.sail, roughness: 0.5, metalness: 0.4 });
  const planeMat = new THREE.MeshStandardMaterial({ color: palette.planes, roughness: 0.5, metalness: 0.5 });
  const wlMat = new THREE.MeshStandardMaterial({ color: palette.waterline, roughness: 0.8, metalness: 0.1 });

  // ─── Main hull (capsule) ────────────────────────────────────────
  const hullGeo = new THREE.CapsuleGeometry(B * 0.5, L * 0.65, 8, 16);
  hullGeo.rotateX(Math.PI / 2);
  const hull = new THREE.Mesh(hullGeo, hullMat);
  hull.position.set(0, 0, L * 0.32);
  group.add(hull);

  // Waterline band
  const wlGeo = new THREE.CapsuleGeometry(B * 0.52, L * 0.55, 6, 12);
  wlGeo.rotateX(Math.PI / 2);
  const waterline = new THREE.Mesh(wlGeo, wlMat);
  waterline.position.set(0, -B * 0.08, L * 0.32);
  waterline.scale.set(1, 0.4, 1);
  group.add(waterline);

  // ─── Conning tower (sail) ───────────────────────────────────────
  const sailW = B * 0.28;
  const sailH = H * 0.85;
  const sailL = L * 0.14;
  const sailGeo = createRoundedBox(sailW, sailH, sailL, sailW * 0.2);
  const sail = new THREE.Mesh(sailGeo, sailMat);
  sail.position.set(0, B * 0.35, L * 0.45);
  group.add(sail);

  // Sail top fairing
  const fairGeo = new THREE.BoxGeometry(sailW * 0.7, sailH * 0.15, sailL * 0.6);
  const fairing = new THREE.Mesh(fairGeo, sailMat);
  fairing.position.set(0, B * 0.35 + sailH + sailH * 0.075, L * 0.45);
  group.add(fairing);

  // Periscope masts
  const mastGeo = new THREE.CylinderGeometry(B * 0.015, B * 0.015, H * 0.5, 6);
  const mast1 = new THREE.Mesh(mastGeo, planeMat);
  mast1.position.set(0, B * 0.35 + sailH + H * 0.25, L * 0.47);
  group.add(mast1);
  const mast2 = new THREE.Mesh(mastGeo.clone(), planeMat);
  mast2.position.set(B * 0.04, B * 0.35 + sailH + H * 0.2, L * 0.44);
  group.add(mast2);

  // ─── Dive planes (sail-mounted) ─────────────────────────────────
  const dpGeo = new THREE.BoxGeometry(B * 1.4, H * 0.04, L * 0.05);
  const divePlanes = new THREE.Mesh(dpGeo, planeMat);
  divePlanes.position.set(0, B * 0.12, L * 0.45);
  group.add(divePlanes);

  // ─── Stern planes + rudder ──────────────────────────────────────
  // Horizontal stabilizers
  const sternPlaneGeo = new THREE.BoxGeometry(B * 1.1, H * 0.03, L * 0.045);
  const sternPlanes = new THREE.Mesh(sternPlaneGeo, planeMat);
  sternPlanes.position.set(0, 0, L * 0.01);
  group.add(sternPlanes);

  // Vertical rudder
  const rudderGeo = new THREE.BoxGeometry(B * 0.04, H * 0.55, L * 0.045);
  const rudder = new THREE.Mesh(rudderGeo, planeMat);
  rudder.position.set(0, H * 0.12, L * 0.01);
  group.add(rudder);

  // ─── Propeller shroud ──────────────────────────────────────────
  const shroudGeo = new THREE.TorusGeometry(B * 0.32, B * 0.04, 8, 16);
  const shroud = new THREE.Mesh(shroudGeo, hullDarkMat);
  shroud.position.set(0, 0, -L * 0.01);
  group.add(shroud);

  // Propeller blades (simple cross)
  const bladeGeo = new THREE.BoxGeometry(B * 0.5, B * 0.03, L * 0.008);
  const blade1 = new THREE.Mesh(bladeGeo, hullDarkMat);
  blade1.position.set(0, 0, -L * 0.01);
  group.add(blade1);
  const blade2 = new THREE.Mesh(bladeGeo.clone(), hullDarkMat);
  blade2.position.set(0, 0, -L * 0.01);
  blade2.rotation.z = Math.PI / 2;
  group.add(blade2);

  // ─── Torpedo tube hatches (bow) ─────────────────────────────────
  for (let i = 0; i < 4; i++) {
    const hatchGeo = new THREE.CylinderGeometry(B * 0.045, B * 0.045, B * 0.01, 8);
    hatchGeo.rotateX(Math.PI / 2);
    const hatch = new THREE.Mesh(hatchGeo, hullDarkMat);
    const angle = ((i - 1.5) / 3.5) * 0.6;
    hatch.position.set(Math.sin(angle) * B * 0.22, Math.cos(angle) * B * 0.22, L * 0.65);
    group.add(hatch);
  }

  return { object3d: group, type: 'submarine' };
}
