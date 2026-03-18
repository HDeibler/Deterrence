import * as THREE from 'three';

// Two-stage interceptor missile (NGI kill vehicle).
// Much thinner and shorter than ICBMs. Green-tinted plume.
// Stage 1 separates, then kill vehicle continues to target.

export function createInterceptorMissile() {
  const root = new THREE.Group();

  const whiteMaterial = new THREE.MeshStandardMaterial({ color: 0xeef0f4, roughness: 0.40, metalness: 0.25 });
  const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x1e2530, roughness: 0.50, metalness: 0.20 });
  const metalMaterial = new THREE.MeshStandardMaterial({ color: 0x7a8594, roughness: 0.30, metalness: 0.65 });
  const accentMaterial = new THREE.MeshStandardMaterial({ color: 0xbb2222, roughness: 0.45, metalness: 0.30 });
  const noseMaterial = new THREE.MeshStandardMaterial({ color: 0x222228, roughness: 0.20, metalness: 0.75 });

  // ── Dimensions (~40% of ICBM first stage) ────────────────────────
  const s1Radius = 0.0000018;
  const s1Length = 0.0000012;
  const s2Radius = 0.0000014;
  const s2Length = 0.000008;
  const noseLength = 0.0000045;
  const nozzleLength = 0.0000015;

  // ── Stage 1 (booster) ────────────────────────────────────────────
  const stage1 = new THREE.Group();
  const s1Body = new THREE.Mesh(
    new THREE.CylinderGeometry(s1Radius, s1Radius * 1.03, s1Length, 12, 1),
    whiteMaterial.clone(),
  );
  stage1.add(s1Body);

  const s1Band = new THREE.Mesh(
    new THREE.CylinderGeometry(s1Radius * 1.05, s1Radius * 1.05, s1Length * 0.12, 12),
    accentMaterial.clone(),
  );
  s1Band.position.y = s1Length * 0.2;
  stage1.add(s1Band);

  const s1Nozzle = new THREE.Mesh(
    new THREE.CylinderGeometry(s1Radius * 0.4, s1Radius * 0.7, nozzleLength, 10),
    metalMaterial.clone(),
  );
  s1Nozzle.position.y = -s1Length * 0.5 - nozzleLength * 0.5;
  stage1.add(s1Nozzle);

  root.add(stage1);

  // ── Stage 2 (sustainer + kill vehicle) ───────────────────────────
  const stage2 = new THREE.Group();
  const s2Body = new THREE.Mesh(
    new THREE.CylinderGeometry(s2Radius, s2Radius * 1.01, s2Length, 12, 1),
    whiteMaterial,
  );
  stage2.add(s2Body);

  const s2Band = new THREE.Mesh(
    new THREE.CylinderGeometry(s2Radius * 1.04, s2Radius * 1.04, s2Length * 0.06, 12),
    darkMaterial,
  );
  s2Band.position.y = -s2Length * 0.3;
  stage2.add(s2Band);

  // Interstage adapter
  const interstage = new THREE.Mesh(
    new THREE.CylinderGeometry(s2Radius * 1.02, s1Radius * 0.98, s1Length * 0.15, 12),
    metalMaterial,
  );
  interstage.position.y = -s2Length * 0.5 - s1Length * 0.075;
  stage2.add(interstage);

  root.add(stage2);

  // ── Nose cone (kill vehicle shroud) ──────────────────────────────
  const nosePoints = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const y = t * noseLength;
    const r = s2Radius * Math.sqrt(1 - t * t * 0.96);
    nosePoints.push(new THREE.Vector2(r, y));
  }
  
  const noseHalf1 = new THREE.Mesh(new THREE.LatheGeometry(nosePoints, 12, 0, Math.PI), noseMaterial);
  const noseHalf2 = new THREE.Mesh(new THREE.LatheGeometry(nosePoints, 12, Math.PI, Math.PI), noseMaterial);
  const nose = new THREE.Group();
  nose.add(noseHalf1, noseHalf2);
  root.add(nose);

  // ── Layout stack (bottom to top: nozzle, stage1, stage2, nose) ───
  const totalLength = nozzleLength + s1Length + s2Length + noseLength;
  let cursor = -totalLength * 0.5;

  stage1.position.y = cursor + nozzleLength + s1Length * 0.5;
  cursor += nozzleLength + s1Length;

  stage2.position.y = cursor + s2Length * 0.5;
  cursor += s2Length;

  nose.position.y = cursor;

  // ── Bus & Multiple Kill Vehicles (Payload) ───────────────────────
  const payloadGroup = new THREE.Group();
  payloadGroup.position.y = cursor;

  // The bus structure (central pillar)
  const busBody = new THREE.Mesh(
    new THREE.CylinderGeometry(s2Radius * 0.3, s2Radius * 0.45, noseLength * 0.7, 6),
    metalMaterial
  );
  busBody.position.y = noseLength * 0.35;
  payloadGroup.add(busBody);

  // 3 KVs attached to the bus
  for (let i = 0; i < 3; i++) {
    const kv = new THREE.Group();
    
    // KV Body (hexagonal)
    const kvMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(s2Radius * 0.35, s2Radius * 0.35, noseLength * 0.35, 6),
      darkMaterial
    );
    kv.add(kvMesh);
    
    // DACS thrusters
    const thrusterGeom = new THREE.BoxGeometry(s2Radius * 0.2, s2Radius * 0.2, s2Radius * 0.2);
    for (let j = 0; j < 4; j++) {
      const thruster = new THREE.Mesh(thrusterGeom, metalMaterial);
      const thrusterAngle = (j / 4) * Math.PI * 2;
      thruster.position.set(Math.cos(thrusterAngle) * s2Radius * 0.35, 0, Math.sin(thrusterAngle) * s2Radius * 0.35);
      kv.add(thruster);
    }
    
    // Position around the bus
    const angle = (i / 3) * Math.PI * 2;
    kv.position.set(Math.cos(angle) * s2Radius * 0.55, noseLength * 0.35, Math.sin(angle) * s2Radius * 0.55);
    kv.rotation.y = -angle; // Face outward
    
    payloadGroup.add(kv);
  }

  root.add(payloadGroup);

  // ── Plume ────────────────────────────────────────────────────────
  const plumeGroup = new THREE.Group();
  const plumeCone = new THREE.Mesh(
    new THREE.ConeGeometry(s1Radius * 0.8, s1Length * 0.6, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x44dd88, transparent: true, opacity: 0.35, depthWrite: false }),
  );
  plumeCone.rotation.x = Math.PI;
  plumeCone.position.y = -s1Length * 0.3;

  const plumeCore = new THREE.Mesh(
    new THREE.SphereGeometry(s1Radius * 0.6, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xccffee, transparent: true, opacity: 0.85, depthWrite: false }),
  );
  plumeCore.position.y = -s1Radius * 0.3;

  plumeGroup.add(plumeCone, plumeCore);
  plumeGroup.position.y = stage1.position.y - s1Length * 0.5 - nozzleLength;
  plumeGroup.visible = false;
  root.add(plumeGroup);

  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(s1Radius * 1.2, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0x88ffcc, transparent: true, opacity: 0, depthWrite: false }),
  );
  halo.position.copy(plumeGroup.position);
  root.add(halo);

  root.visible = false;
  let stage1Visible = true;
  let fairingSeparated = false;

  // ── Kill Vehicle payload (visible in standalone KV mode) ───────────
  const kvGroup = new THREE.Group();
  const standaloneKVBody = new THREE.Mesh(
    new THREE.CylinderGeometry(s2Radius * 0.35, s2Radius * 0.35, noseLength * 0.35, 6),
    whiteMaterial.clone(), // Use bright white instead of dark material so it pops out visually
  );
  kvGroup.add(standaloneKVBody);
  
  // DACS thrusters for standalone KV
  const standaloneThrusterGeom = new THREE.BoxGeometry(s2Radius * 0.25, s2Radius * 0.25, s2Radius * 0.25);
  for (let i = 0; i < 4; i++) {
    const thruster = new THREE.Mesh(standaloneThrusterGeom, accentMaterial.clone()); // Red thrusters for contrast
    const angle = (i / 4) * Math.PI * 2;
    thruster.position.set(Math.cos(angle) * s2Radius * 0.35, 0, Math.sin(angle) * s2Radius * 0.35);
    kvGroup.add(thruster);
  }
  
  kvGroup.visible = false;
  root.add(kvGroup);

  return {
    object3d: root,
    forwardAxis: new THREE.Vector3(0, 1, 0),
    nativeLength: totalLength,
    setEngineOn(on, elapsedSeconds = 0) {
      // Hide plume in KV mode (KVs use cold gas or small thrusters)
      if (kvGroup.visible) {
          plumeGroup.visible = false;
          halo.visible = false;
          return;
      }
      
      plumeGroup.visible = on;
      halo.visible = on;
      if (on) {
        const flicker = 0.88 + Math.sin(elapsedSeconds * 32) * 0.06 + Math.sin(elapsedSeconds * 19) * 0.04;
        plumeCore.scale.setScalar(flicker);
        plumeCone.scale.set(1, flicker, 1);
        halo.material.opacity = 0.10;
      } else {
        halo.material.opacity = 0;
      }
    },
    setStageSeparated(separated) {
      if (separated && stage1Visible) {
        stage1Visible = false;
        stage1.visible = false;
        // Move plume to stage 2 nozzle area
        plumeGroup.position.y = stage2.position.y - s2Length * 0.5;
      }
    },
    setFairingSeparation(progress) {
      if (progress > 0) {
        fairingSeparated = true;
        // Separate the two halves
        noseHalf1.position.x = progress * s2Radius * 8;
        noseHalf1.rotation.z = -progress * Math.PI * 0.2;
        noseHalf2.position.x = -progress * s2Radius * 8;
        noseHalf2.rotation.z = progress * Math.PI * 0.2;
        
        // Make them disappear completely if fully separated
        if (progress >= 1.0) {
           nose.visible = false;
        }
      }
    },
    setKVMode(isKV) {
      if (isKV) {
        stage1.visible = false;
        stage2.visible = false;
        nose.visible = false;
        payloadGroup.visible = false;
        plumeGroup.visible = false;
        halo.visible = false;
        kvGroup.visible = true;
        // Increase the scale multiplier drastically so they are large, distinct objects in space.
        kvGroup.scale.setScalar(5.0); 
      }
    }
  };
}
