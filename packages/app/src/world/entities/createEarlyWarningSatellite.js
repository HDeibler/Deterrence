import * as THREE from 'three';

// Realistic SBIRS-like Early Warning Satellite
// Bus + sensor payload + articulated solar arrays + antenna cluster + thermal radiators

export function createEarlyWarningSatellite() {
  const root = new THREE.Group();

  // ── Materials ──────────────────────────────────────────────────────────
  const busMaterial = new THREE.MeshStandardMaterial({
    color: 0xc8cdd6,
    roughness: 0.30,
    metalness: 0.65,
  });
  const goldFoilMaterial = new THREE.MeshStandardMaterial({
    color: 0xd4a843,
    roughness: 0.25,
    metalness: 0.75,
    emissive: 0x3a2800,
    emissiveIntensity: 0.08,
  });
  const panelFrameMaterial = new THREE.MeshStandardMaterial({
    color: 0x2a3040,
    roughness: 0.50,
    metalness: 0.40,
  });
  const solarCellMaterial = new THREE.MeshStandardMaterial({
    color: 0x1a3a6e,
    roughness: 0.35,
    metalness: 0.25,
    emissive: 0x0a1830,
    emissiveIntensity: 0.05,
  });
  const trussMaterial = new THREE.MeshStandardMaterial({
    color: 0x6a7585,
    roughness: 0.45,
    metalness: 0.55,
  });
  const radiatorMaterial = new THREE.MeshStandardMaterial({
    color: 0xf0f0f0,
    roughness: 0.20,
    metalness: 0.50,
  });
  const sensorMaterial = new THREE.MeshStandardMaterial({
    color: 0x1a1a2a,
    roughness: 0.15,
    metalness: 0.80,
  });
  const lensMaterial = new THREE.MeshStandardMaterial({
    color: 0x2244aa,
    roughness: 0.08,
    metalness: 0.90,
    emissive: 0x112255,
    emissiveIntensity: 0.15,
  });
  const antennaMaterial = new THREE.MeshStandardMaterial({
    color: 0xb8bfc8,
    roughness: 0.28,
    metalness: 0.72,
  });
  const rcsMaterial = new THREE.MeshStandardMaterial({
    color: 0x888888,
    roughness: 0.50,
    metalness: 0.60,
  });
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: 0x5ac8ff,
    transparent: true,
    opacity: 0.10,
    depthWrite: false,
  });

  // ── Spacecraft Bus ─────────────────────────────────────────────────────
  // Main body — hexagonal cross-section for realism
  const busLength = 0.28;
  const busWidth = 0.18;
  const busHeight = 0.16;
  const bus = new THREE.Mesh(
    new THREE.BoxGeometry(busLength, busHeight, busWidth),
    busMaterial,
  );
  root.add(bus);

  // Gold multi-layer insulation blankets on top and bottom
  const mliBlanketTop = new THREE.Mesh(
    new THREE.BoxGeometry(busLength * 0.92, 0.005, busWidth * 0.88),
    goldFoilMaterial,
  );
  mliBlanketTop.position.y = busHeight * 0.5 + 0.003;
  root.add(mliBlanketTop);

  const mliBlanketBottom = new THREE.Mesh(
    new THREE.BoxGeometry(busLength * 0.92, 0.005, busWidth * 0.88),
    goldFoilMaterial,
  );
  mliBlanketBottom.position.y = -busHeight * 0.5 - 0.003;
  root.add(mliBlanketBottom);

  // ── Sensor Payload (nadir-pointing) ────────────────────────────────────
  // Sensor boom extending downward
  const sensorBoomLength = 0.14;
  const sensorBoom = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.014, sensorBoomLength, 8),
    trussMaterial,
  );
  sensorBoom.position.set(0.06, -busHeight * 0.5 - sensorBoomLength * 0.5, 0);
  root.add(sensorBoom);

  // Sensor telescope housing
  const sensorHousingRadius = 0.038;
  const sensorHousingLength = 0.08;
  const sensorHousing = new THREE.Mesh(
    new THREE.CylinderGeometry(sensorHousingRadius, sensorHousingRadius * 1.15, sensorHousingLength, 16),
    sensorMaterial,
  );
  sensorHousing.position.set(0.06, -busHeight * 0.5 - sensorBoomLength - sensorHousingLength * 0.4, 0);
  root.add(sensorHousing);

  // Sensor lens (IR detector aperture)
  const sensorLens = new THREE.Mesh(
    new THREE.CircleGeometry(sensorHousingRadius * 0.82, 20),
    lensMaterial,
  );
  sensorLens.position.set(0.06, -busHeight * 0.5 - sensorBoomLength - sensorHousingLength * 0.9, 0);
  sensorLens.rotation.x = Math.PI * 0.5;
  root.add(sensorLens);

  // Sensor baffle (light shade ring)
  const sensorBaffle = new THREE.Mesh(
    new THREE.TorusGeometry(sensorHousingRadius * 1.05, 0.006, 8, 20),
    sensorMaterial,
  );
  sensorBaffle.position.copy(sensorLens.position);
  sensorBaffle.position.y += 0.008;
  sensorBaffle.rotation.x = Math.PI * 0.5;
  root.add(sensorBaffle);

  // Gold foil wrap on sensor housing
  const sensorFoil = new THREE.Mesh(
    new THREE.CylinderGeometry(sensorHousingRadius * 1.01, sensorHousingRadius * 1.16, sensorHousingLength * 0.5, 16, 1, true),
    goldFoilMaterial,
  );
  sensorFoil.position.copy(sensorHousing.position);
  sensorFoil.position.y += sensorHousingLength * 0.2;
  root.add(sensorFoil);

  // ── Solar Arrays (two wings, multi-panel) ──────────────────────────────
  const panelWidth = 0.22;
  const panelDepth = 0.14;
  const panelThickness = 0.008;
  const panelGap = 0.03;
  const panelsPerWing = 3;
  const wingSpan = panelsPerWing * (panelWidth + panelGap) - panelGap;

  const leftWing = new THREE.Group();
  const rightWing = new THREE.Group();

  for (let i = 0; i < panelsPerWing; i++) {
    const offsetX = -(i * (panelWidth + panelGap) + panelWidth * 0.5);

    // Panel frame
    const frameL = new THREE.Mesh(
      new THREE.BoxGeometry(panelWidth, panelThickness, panelDepth),
      panelFrameMaterial,
    );
    frameL.position.x = offsetX;
    leftWing.add(frameL);

    // Solar cells on top face — subdivided grid
    const cellRows = 4;
    const cellCols = 6;
    const cellW = (panelWidth - 0.012) / cellCols;
    const cellD = (panelDepth - 0.012) / cellRows;
    for (let r = 0; r < cellRows; r++) {
      for (let c = 0; c < cellCols; c++) {
        const cell = new THREE.Mesh(
          new THREE.PlaneGeometry(cellW * 0.92, cellD * 0.92),
          solarCellMaterial,
        );
        cell.position.set(
          offsetX - (panelWidth - 0.012) * 0.5 + cellW * (c + 0.5),
          panelThickness * 0.5 + 0.001,
          -(panelDepth - 0.012) * 0.5 + cellD * (r + 0.5),
        );
        cell.rotation.x = -Math.PI * 0.5;
        leftWing.add(cell);
      }
    }

    // Hinge strut between panels
    if (i > 0) {
      const hinge = new THREE.Mesh(
        new THREE.CylinderGeometry(0.004, 0.004, panelDepth * 0.6, 6),
        trussMaterial,
      );
      hinge.position.set(offsetX + panelWidth * 0.5 + panelGap * 0.5, 0, 0);
      hinge.rotation.x = Math.PI * 0.5;
      leftWing.add(hinge);
    }

    // Mirror for right wing
    const frameR = frameL.clone();
    frameR.position.x = -offsetX;
    rightWing.add(frameR);

    for (let r = 0; r < cellRows; r++) {
      for (let c = 0; c < cellCols; c++) {
        const cell = new THREE.Mesh(
          new THREE.PlaneGeometry(cellW * 0.92, cellD * 0.92),
          solarCellMaterial,
        );
        cell.position.set(
          -offsetX - (panelWidth - 0.012) * 0.5 + cellW * (c + 0.5),
          panelThickness * 0.5 + 0.001,
          -(panelDepth - 0.012) * 0.5 + cellD * (r + 0.5),
        );
        cell.rotation.x = -Math.PI * 0.5;
        rightWing.add(cell);
      }
    }

    if (i > 0) {
      const hinge = new THREE.Mesh(
        new THREE.CylinderGeometry(0.004, 0.004, panelDepth * 0.6, 6),
        trussMaterial,
      );
      hinge.position.set(-offsetX - panelWidth * 0.5 - panelGap * 0.5, 0, 0);
      hinge.rotation.x = Math.PI * 0.5;
      rightWing.add(hinge);
    }
  }

  // Wing yoke (connects to bus)
  const yokeLength = 0.06;
  const leftYoke = new THREE.Mesh(
    new THREE.CylinderGeometry(0.006, 0.006, yokeLength, 6),
    trussMaterial,
  );
  leftYoke.rotation.z = Math.PI * 0.5;
  leftYoke.position.set(-busLength * 0.5 - yokeLength * 0.5, 0, 0);
  root.add(leftYoke);

  const rightYoke = leftYoke.clone();
  rightYoke.position.set(busLength * 0.5 + yokeLength * 0.5, 0, 0);
  root.add(rightYoke);

  leftWing.position.set(-busLength * 0.5 - yokeLength, 0, 0);
  rightWing.position.set(busLength * 0.5 + yokeLength, 0, 0);
  root.add(leftWing);
  root.add(rightWing);

  // ── Thermal Radiator Panels ────────────────────────────────────────────
  const radiatorWidth = 0.10;
  const radiatorHeight = 0.06;
  const leftRadiator = new THREE.Mesh(
    new THREE.BoxGeometry(0.004, radiatorHeight, radiatorWidth),
    radiatorMaterial,
  );
  leftRadiator.position.set(0, busHeight * 0.5 + radiatorHeight * 0.5, busWidth * 0.3);
  root.add(leftRadiator);

  const rightRadiator = leftRadiator.clone();
  rightRadiator.position.z = -busWidth * 0.3;
  root.add(rightRadiator);

  // ── Communication Antennas ─────────────────────────────────────────────
  // High-gain dish antenna
  const dishRadius = 0.055;
  const dish = new THREE.Mesh(
    new THREE.SphereGeometry(dishRadius, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.45),
    antennaMaterial,
  );
  dish.rotation.x = Math.PI;
  dish.position.set(-0.08, busHeight * 0.5 + 0.03, 0.06);
  root.add(dish);

  // Dish feed horn
  const feedHorn = new THREE.Mesh(
    new THREE.CylinderGeometry(0.004, 0.008, 0.03, 8),
    trussMaterial,
  );
  feedHorn.position.set(-0.08, busHeight * 0.5 + 0.06, 0.06);
  root.add(feedHorn);

  // Dish support strut
  const dishStrut = new THREE.Mesh(
    new THREE.CylinderGeometry(0.003, 0.003, 0.04, 6),
    trussMaterial,
  );
  dishStrut.position.set(-0.08, busHeight * 0.5 + 0.02, 0.06);
  root.add(dishStrut);

  // Omni antennas (two whip antennas)
  for (let i = 0; i < 2; i++) {
    const whip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.002, 0.002, 0.08, 4),
      trussMaterial,
    );
    whip.position.set(
      busLength * 0.3 * (i === 0 ? 1 : -1),
      busHeight * 0.5 + 0.04,
      busWidth * 0.35 * (i === 0 ? -1 : 1),
    );
    whip.rotation.z = (i === 0 ? -1 : 1) * 0.2;
    root.add(whip);

    const whipTip = new THREE.Mesh(
      new THREE.SphereGeometry(0.004, 6, 6),
      antennaMaterial,
    );
    whipTip.position.copy(whip.position);
    whipTip.position.y += 0.04;
    root.add(whipTip);
  }

  // ── RCS Thrusters ──────────────────────────────────────────────────────
  const thrusterPositions = [
    [busLength * 0.45, 0, busWidth * 0.45],
    [busLength * 0.45, 0, -busWidth * 0.45],
    [-busLength * 0.45, 0, busWidth * 0.45],
    [-busLength * 0.45, 0, -busWidth * 0.45],
  ];
  for (const pos of thrusterPositions) {
    const thruster = new THREE.Mesh(
      new THREE.CylinderGeometry(0.005, 0.007, 0.012, 6),
      rcsMaterial,
    );
    thruster.position.set(pos[0], pos[1], pos[2]);
    root.add(thruster);
  }

  // ── Star Tracker (small sensor on bus side) ────────────────────────────
  const starTracker = new THREE.Mesh(
    new THREE.BoxGeometry(0.018, 0.018, 0.022),
    sensorMaterial,
  );
  starTracker.position.set(busLength * 0.35, busHeight * 0.3, busWidth * 0.5 + 0.01);
  root.add(starTracker);

  const starTrackerLens = new THREE.Mesh(
    new THREE.CircleGeometry(0.006, 10),
    lensMaterial,
  );
  starTrackerLens.position.copy(starTracker.position);
  starTrackerLens.position.z += 0.012;
  root.add(starTrackerLens);

  // ── Subtle operational glow ────────────────────────────────────────────
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.38, 18, 18), glowMaterial);
  root.add(glow);

  // ── Animation state ────────────────────────────────────────────────────
  let panelDeployProgress = 1.0; // 0 = folded, 1 = fully deployed

  return {
    object3d: root,
    nativeLength: busLength + wingSpan * 2 + yokeLength * 2,
    forwardAxis: new THREE.Vector3(1, 0, 0),
    setPanelDeployProgress(t) {
      panelDeployProgress = THREE.MathUtils.clamp(t, 0, 1);
    },
    update(elapsedSeconds) {
      // Gentle solar panel sun tracking oscillation
      const trackAngle = Math.sin(elapsedSeconds * 0.25) * 0.015;
      leftWing.rotation.z = trackAngle;
      rightWing.rotation.z = -trackAngle;

      // Panel deploy animation
      const deployAngle = (1 - panelDeployProgress) * Math.PI * 0.48;
      leftWing.rotation.y = -deployAngle;
      rightWing.rotation.y = deployAngle;

      // Wing fold toward body when not deployed
      const foldX = (1 - panelDeployProgress) * (wingSpan * 0.65);
      leftWing.position.x = -busLength * 0.5 - yokeLength + foldX;
      rightWing.position.x = busLength * 0.5 + yokeLength - foldX;

      // Sensor lens shimmer
      const lensGlow = 0.12 + Math.sin(elapsedSeconds * 1.8) * 0.03;
      lensMaterial.emissiveIntensity = lensGlow;

      // Subtle glow pulse
      glow.material.opacity = 0.08 + Math.sin(elapsedSeconds * 1.3) * 0.02;

      // Radiator panels gentle thermal flex
      leftRadiator.rotation.x = Math.sin(elapsedSeconds * 0.4) * 0.01;
      rightRadiator.rotation.x = -Math.sin(elapsedSeconds * 0.4) * 0.01;
    },
  };
}
