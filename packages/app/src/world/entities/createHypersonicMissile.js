import * as THREE from 'three';

// Hypersonic glide vehicle / scramjet cruise missile visual.
// Wedge-shaped body with small control surfaces — DF-ZF / Avangard / Zircon proportions.

export function createHypersonicMissile() {
  const root = new THREE.Group();

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x2e3a4a,
    roughness: 0.55,
    metalness: 0.3,
  });
  const heatShieldMaterial = new THREE.MeshStandardMaterial({
    color: 0x1a1a1e,
    roughness: 0.7,
    metalness: 0.15,
  });
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: 0xff6622,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });

  // Body — wedge/lifting body shape (approximated with a flattened cone + box)
  const bodyLength = 0.000034;
  const bodyWidth = 0.0000045;
  const bodyHeight = 0.0000025;

  // Main body — flattened hexagonal cross-section
  const bodyGeo = new THREE.BoxGeometry(bodyWidth, bodyLength, bodyHeight);
  // Taper the front by scaling vertices — use a cone for the nose instead
  const body = new THREE.Mesh(bodyGeo, bodyMaterial);
  root.add(body);

  // Nose — sharp wedge
  const noseLength = 0.000014;
  const noseCone = new THREE.Mesh(
    new THREE.ConeGeometry(bodyWidth * 0.45, noseLength, 4, 1, false),
    heatShieldMaterial,
  );
  noseCone.rotation.y = Math.PI / 4;
  noseCone.position.y = bodyLength * 0.5 + noseLength * 0.5;
  root.add(noseCone);

  // Heat shield underside (darker plate)
  const heatPlate = new THREE.Mesh(
    new THREE.BoxGeometry(bodyWidth * 0.95, bodyLength * 0.9, bodyHeight * 0.15),
    heatShieldMaterial,
  );
  heatPlate.position.z = -bodyHeight * 0.45;
  root.add(heatPlate);

  // Small delta fins (2 on each side, canted)
  const finSpan = bodyWidth * 0.8;
  const finChord = bodyLength * 0.08;
  const finThick = bodyHeight * 0.06;
  const finGeo = new THREE.BoxGeometry(finSpan, finChord, finThick);

  const leftFin = new THREE.Mesh(finGeo, bodyMaterial);
  leftFin.position.set(-bodyWidth * 0.5 - finSpan * 0.4, -bodyLength * 0.35, 0);
  leftFin.rotation.y = -0.15;
  root.add(leftFin);

  const rightFin = new THREE.Mesh(finGeo, bodyMaterial);
  rightFin.position.set(bodyWidth * 0.5 + finSpan * 0.4, -bodyLength * 0.35, 0);
  rightFin.rotation.y = 0.15;
  root.add(rightFin);

  // Vertical stabilizers (2 small canted fins on top)
  const vertFinGeo = new THREE.BoxGeometry(finThick, finChord * 0.7, finSpan * 0.6);

  const leftVertFin = new THREE.Mesh(vertFinGeo, bodyMaterial);
  leftVertFin.position.set(-bodyWidth * 0.3, -bodyLength * 0.38, bodyHeight * 0.4);
  leftVertFin.rotation.y = -0.25;
  root.add(leftVertFin);

  const rightVertFin = new THREE.Mesh(vertFinGeo, bodyMaterial);
  rightVertFin.position.set(bodyWidth * 0.3, -bodyLength * 0.38, bodyHeight * 0.4);
  rightVertFin.rotation.y = 0.25;
  root.add(rightVertFin);

  // Plasma/reentry heating glow (visible during glide at hypersonic speed)
  const plasmaGlow = new THREE.Mesh(
    new THREE.SphereGeometry(bodyWidth * 1.2, 12, 12),
    glowMaterial,
  );
  plasmaGlow.position.y = bodyLength * 0.3;
  root.add(plasmaGlow);

  // Wake trail glow
  const wakeCone = new THREE.Mesh(
    new THREE.ConeGeometry(bodyWidth * 0.8, 0.000018, 10, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xff4400,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    }),
  );
  wakeCone.rotation.x = Math.PI;
  wakeCone.position.y = -bodyLength * 0.5 - 0.000009;
  root.add(wakeCone);

  // Boost motor plume (only during boost phase)
  const boostPlume = new THREE.Mesh(
    new THREE.ConeGeometry(bodyWidth * 0.6, 0.000014, 10, 1, false),
    new THREE.MeshBasicMaterial({
      color: 0xffcc44,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    }),
  );
  boostPlume.rotation.x = Math.PI;
  boostPlume.position.y = -bodyLength * 0.5 - 0.000007;
  boostPlume.visible = false;
  root.add(boostPlume);

  root.scale.setScalar(1);
  root.visible = false;

  return {
    object3d: root,
    forwardAxis: new THREE.Vector3(0, 1, 0),
    nativeLength: bodyLength + noseLength,
    setVisualState(snapshot, elapsedSeconds = 0) {
      const phase = snapshot?.phase ?? 'idle';
      root.visible = snapshot?.visible ?? false;

      // Boost plume: visible during boost phase
      const boosting = phase === 'boost';
      boostPlume.visible = boosting;
      if (boosting) {
        const flicker = 0.5 + Math.sin((elapsedSeconds ?? 0) * 30) * 0.1;
        boostPlume.material.opacity = flicker;
        boostPlume.scale.set(1, 0.88 + Math.sin((elapsedSeconds ?? 0) * 19) * 0.12, 1);
      }

      // Mach number from snapshot (altitude-corrected) or fallback
      const mach = snapshot?.machNumber ?? ((snapshot?.speedKmS ?? 0) * 1000 / 343);

      // Plasma heating glow — scales with Mach² (stagnation heating)
      // Visible above Mach 5, intensifies through Mach 20+
      // Fades at very high altitude (no atmosphere to heat)
      const altKm = snapshot?.altitudeKm ?? 0;
      const atmoFade = altKm > 80 ? Math.max(0, 1 - (altKm - 80) / 40) : 1;
      const plasmaIntensity = mach > 4
        ? Math.min((mach - 4) / 16, 1) * 0.4 * atmoFade
        : 0;
      plasmaGlow.material.opacity = plasmaIntensity;
      // Color temperature: orange → yellow → white with increasing Mach
      if (mach > 15) {
        plasmaGlow.material.color.setHex(0xffeecc); // white-hot
      } else if (mach > 10) {
        plasmaGlow.material.color.setHex(0xffbb44); // yellow-orange
      } else {
        plasmaGlow.material.color.setHex(0xff6622); // deep orange
      }

      // Wake/ionization trail — visible above Mach 3
      const wakeIntensity = mach > 3
        ? Math.min((mach - 3) / 12, 1) * 0.28 * atmoFade
        : 0;
      wakeCone.material.opacity = wakeIntensity;
      wakeCone.visible = wakeIntensity > 0.01;
      // Wake color: blue-white at high Mach
      if (mach > 12) {
        wakeCone.material.color.setHex(0x8899ff);
      } else {
        wakeCone.material.color.setHex(0xff4400);
      }
    },
  };
}
