import * as THREE from 'three';
import { altitudeKmToOrbitRadiusUnits, computeFootprintRadiusKm, computeOrbitsPerHour, EARTH_RADIUS_KM } from '../../game/data/radarCatalog.js';
import { createEarlyWarningSatellite } from '../entities/createEarlyWarningSatellite.js';
import { createLaunchVehicle } from '../entities/createLaunchVehicle.js';
import { buildSurfaceFrame, latLonToVector3, vector3ToLatLon } from '../geo/geoMath.js';

const CONE_SEGMENTS = 48;
const CONE_WIRE_SPOKES = 8;
const COVERAGE_FILL_COLOR = 0xffd388;
const COVERAGE_PREVIEW_COLOR = 0x7de4ff;
const SPEED_DOT_COUNT = 4;

export function createRadarVisualSystem({
  scene,
  earthGroup,
  worldConfig,
  renderConfig: _renderConfig,
}) {
  const groundRadarActors = new Map();
  const satelliteActors = new Map();
  const launchActors = new Map();
  const geoSelectionGroup = new THREE.Group();
  const geoSlotPickers = [];
  const tmpQuaternion = new THREE.Quaternion();
  let assetsVisible = true;
  let coverageVisible = true;
  let selectedGeoSlotId = null;
  let selectedSatelliteId = null;

  // Current orbit planner parameters
  let currentOrbitParams = { altitudeKm: 2000, inclinationDeg: 28, raanDeg: 0 };

  // Orbit preview group — tilted ring + speed dots + ground track
  const orbitPreviewGroup = new THREE.Group();
  const orbitRingMaterial = new THREE.LineBasicMaterial({
    color: COVERAGE_PREVIEW_COLOR,
    transparent: true,
    opacity: 0.45,
  });
  let orbitRingLine = null;
  const speedDots = [];
  const groundTrackGroup = new THREE.Group();

  rebuildOrbitPreview();
  orbitPreviewGroup.visible = false;
  geoSelectionGroup.visible = false;
  scene.add(orbitPreviewGroup);
  scene.add(geoSelectionGroup);
  earthGroup.add(groundTrackGroup);

  // Coverage cone for selected deployed satellite
  const deployedConeGroup = new THREE.Group();
  scene.add(deployedConeGroup);

  // Preview cone for selected slot (pre-launch preview)
  const previewConeGroup = new THREE.Group();
  scene.add(previewConeGroup);

  // Coverage fill disk on Earth surface for preview
  const previewDiskGroup = new THREE.Group();
  earthGroup.add(previewDiskGroup);

  // Orbital trajectory for selected satellite
  const orbitTrajectoryGroup = new THREE.Group();
  scene.add(orbitTrajectoryGroup);

  return {
    update(snapshot, camera, elapsedSeconds) {
      updateGroundRadars({
        snapshot,
        groundRadarActors,
        earthGroup,
        assetsVisible,
        coverageVisible,
        worldConfig,
      });
      updateSatellites({
        snapshot,
        satelliteActors,
        scene,
        earthGroup,
        elapsedSeconds,
        assetsVisible,
        coverageVisible,
        worldConfig,
        selectedSatelliteId,
      });
      updateLaunches({
        snapshot,
        launchActors,
        scene,
        camera,
        assetsVisible,
        elapsedSeconds,
        tmpQuaternion,
      });
      syncGeoSlots({
        snapshot,
        geoSelectionGroup,
        geoSlotPickers,
        selectedGeoSlotId,
        orbitParams: currentOrbitParams,
      });
      updateDeployedCone({
        snapshot,
        coneGroup: deployedConeGroup,
        selectedSatelliteId,
        earthGroup,
        worldConfig,
        color: COVERAGE_FILL_COLOR,
      });
      updatePreviewCone({
        coneGroup: previewConeGroup,
        diskGroup: previewDiskGroup,
        selectedGeoSlotId,
        orbitParams: currentOrbitParams,
        earthGroup,
        worldConfig,
        geoSelectionVisible: orbitPreviewGroup.visible,
      });
      updateOrbitTrajectory({
        snapshot,
        trajectoryGroup: orbitTrajectoryGroup,
        selectedSatelliteId,
      });
      // Animate speed dots along orbit preview
      if (orbitPreviewGroup.visible) {
        animateSpeedDots(elapsedSeconds);
      }
    },
    setOrbitPreviewVisible(visible) {
      orbitPreviewGroup.visible = visible;
      groundTrackGroup.visible = visible;
      geoSelectionGroup.visible = visible;
    },
    getGeoSlotPickers() {
      return geoSlotPickers;
    },
    setCoverageVisible(visible) {
      coverageVisible = Boolean(visible);
    },
    setAssetsVisible(visible) {
      assetsVisible = Boolean(visible);
    },
    setSelectedGeoSlot(slotId) {
      selectedGeoSlotId = slotId ?? null;
    },
    setSelectedSatellite(satelliteId) {
      selectedSatelliteId = satelliteId ?? null;
    },
    getSelectedSatelliteId() {
      return selectedSatelliteId;
    },
    setOrbitParameters(params) {
      currentOrbitParams = { ...params };
      rebuildOrbitPreview();
    },
    getSatelliteActors() {
      return satelliteActors;
    },
    dispose() {
      for (const actor of groundRadarActors.values()) {
        actor.coverage.removeFromParent();
      }
      groundRadarActors.clear();

      for (const actor of satelliteActors.values()) {
        actor.asset.object3d.removeFromParent();
        actor.coverage.removeFromParent();
      }
      satelliteActors.clear();

      for (const actor of launchActors.values()) {
        actor.asset.object3d.removeFromParent();
        actor.path.removeFromParent();
      }
      launchActors.clear();

      clearGroup(deployedConeGroup);
      deployedConeGroup.removeFromParent();
      clearGroup(previewConeGroup);
      previewConeGroup.removeFromParent();
      clearGroup(previewDiskGroup);
      previewDiskGroup.removeFromParent();
      clearGroup(orbitTrajectoryGroup);
      orbitTrajectoryGroup.removeFromParent();
      clearGroup(orbitPreviewGroup);
      orbitPreviewGroup.removeFromParent();
      clearGroup(groundTrackGroup);
      groundTrackGroup.removeFromParent();
      geoSelectionGroup.removeFromParent();
      geoSlotPickers.length = 0;
    },
  };

  // Build/rebuild the 3D orbit preview ring, speed dots, and ground track
  // based on currentOrbitParams (altitude, inclination, RAAN)
  function rebuildOrbitPreview() {
    clearGroup(orbitPreviewGroup);
    clearGroup(groundTrackGroup);
    speedDots.length = 0;

    const { altitudeKm, inclinationDeg, raanDeg } = currentOrbitParams;
    const radiusUnits = altitudeKmToOrbitRadiusUnits(altitudeKm);
    const incRad = THREE.MathUtils.degToRad(inclinationDeg);
    const raanRad = THREE.MathUtils.degToRad(raanDeg);

    // Compute the orbital plane basis vectors
    // Start with equatorial orbit, then tilt by inclination around X, then rotate by RAAN around Y
    const orbitBasis = computeOrbitBasis(incRad, raanRad);

    // Orbit ring
    const segments = 180;
    const ringPoints = [];
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const p = orbitBasis.u.clone().multiplyScalar(radiusUnits * Math.cos(angle))
        .add(orbitBasis.v.clone().multiplyScalar(radiusUnits * Math.sin(angle)));
      ringPoints.push(p);
    }
    orbitRingLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(ringPoints),
      orbitRingMaterial,
    );
    orbitPreviewGroup.add(orbitRingLine);

    // Speed dots — small spheres that orbit at the satellite's speed
    const orbitsPerHour = computeOrbitsPerHour(altitudeKm);
    for (let i = 0; i < SPEED_DOT_COUNT; i++) {
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 6, 6),
        new THREE.MeshBasicMaterial({
          color: COVERAGE_PREVIEW_COLOR,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
        }),
      );
      orbitPreviewGroup.add(dot);
      speedDots.push({
        mesh: dot,
        baseAngle: (i / SPEED_DOT_COUNT) * Math.PI * 2,
        orbitsPerHour,
        radiusUnits,
        basis: orbitBasis,
      });
    }

    // Ground track — project the orbit onto Earth's surface
    // Shows a sinusoidal path for inclined orbits
    const trackSegments = 360;
    const trackPoints = [];
    for (let i = 0; i <= trackSegments; i++) {
      const angle = (i / trackSegments) * Math.PI * 2;
      const orbitPoint = orbitBasis.u.clone().multiplyScalar(Math.cos(angle))
        .add(orbitBasis.v.clone().multiplyScalar(Math.sin(angle)));
      // Project down to Earth surface
      const surfacePoint = orbitPoint.normalize().multiplyScalar(worldConfig.earthRadius * 1.003);
      trackPoints.push(surfacePoint);
    }
    const groundTrack = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(trackPoints),
      new THREE.LineBasicMaterial({
        color: COVERAGE_PREVIEW_COLOR,
        transparent: true,
        opacity: 0.18,
      }),
    );
    groundTrackGroup.add(groundTrack);

    // Also rebuild geo selection group orbit ring to match inclination
    while (geoSelectionGroup.children.length > 0) {
      const child = geoSelectionGroup.children[0];
      if (child.geometry) child.geometry.dispose();
      geoSelectionGroup.remove(child);
    }
    // Thinner guide ring in geo selection group
    const guideRingPoints = [];
    for (let i = 0; i <= 128; i++) {
      const angle = (i / 128) * Math.PI * 2;
      const p = orbitBasis.u.clone().multiplyScalar(radiusUnits * Math.cos(angle))
        .add(orbitBasis.v.clone().multiplyScalar(radiusUnits * Math.sin(angle)));
      guideRingPoints.push(p);
    }
    geoSelectionGroup.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(guideRingPoints),
      new THREE.LineBasicMaterial({ color: COVERAGE_PREVIEW_COLOR, transparent: true, opacity: 0.2 }),
    ));
  }

  function animateSpeedDots(elapsedSeconds) {
    for (const dot of speedDots) {
      // Angular speed: orbitsPerHour * 2π radians / 3600 seconds
      const angularSpeed = dot.orbitsPerHour * Math.PI * 2 / 3600;
      const angle = dot.baseAngle + elapsedSeconds * angularSpeed;
      const pos = dot.basis.u.clone().multiplyScalar(dot.radiusUnits * Math.cos(angle))
        .add(dot.basis.v.clone().multiplyScalar(dot.radiusUnits * Math.sin(angle)));
      dot.mesh.position.copy(pos);
    }
  }

  function createOrbitRing(radiusUnits) {
    return new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(createEquatorialRingPoints(radiusUnits, 128)),
      orbitRingMaterial,
    );
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────

function clearGroup(group) {
  while (group.children.length > 0) {
    const child = group.children[0];
    if (child.geometry) child.geometry.dispose();
    if (child.material && !child.material._shared) child.material.dispose();
    group.remove(child);
  }
}

// Build a translucent cone + wire spokes from an apex point down to a
// circle on the Earth surface.  Used for both live satellites and slot previews.
function buildConeVisual({ apexPosition, surfacePoints, color, fillOpacity, wireOpacity }) {
  const group = new THREE.Group();
  const segments = surfacePoints.length;

  // Translucent fill triangles
  const vertices = [];
  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % segments;
    vertices.push(
      apexPosition.x, apexPosition.y, apexPosition.z,
      surfacePoints[i].x, surfacePoints[i].y, surfacePoints[i].z,
      surfacePoints[next].x, surfacePoints[next].y, surfacePoints[next].z,
    );
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geo.computeVertexNormals();
  group.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: fillOpacity,
    side: THREE.DoubleSide,
    depthWrite: false,
  })));

  // Wire spokes from apex to surface
  const spokeStep = Math.max(1, Math.floor(segments / CONE_WIRE_SPOKES));
  const wirePoints = [];
  for (let i = 0; i < segments; i += spokeStep) {
    wirePoints.push(apexPosition.clone(), surfacePoints[i].clone());
  }
  if (wirePoints.length > 0) {
    group.add(new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(wirePoints),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: wireOpacity }),
    ));
  }

  // Rim ring on the surface
  const rimPoints = [...surfacePoints.map((p) => p.clone()), surfacePoints[0].clone()];
  group.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(rimPoints),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: wireOpacity * 1.4 }),
  ));

  return group;
}

// Build a filled disk on the Earth surface showing the coverage footprint.
function buildSurfaceDisk({ lat, lon, radiusUnits, angularRadiusRadians, color, opacity }) {
  const segments = 64;
  const center = latLonToVector3({ lat, lon, radius: radiusUnits });
  const frame = buildSurfaceFrame(center);

  // Build a triangle-fan from center to perimeter
  const vertices = [];
  const perimeterPoints = [];
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    const tangent = frame.east
      .clone()
      .multiplyScalar(Math.cos(theta))
      .add(frame.north.clone().multiplyScalar(Math.sin(theta)));
    const point = center
      .clone()
      .normalize()
      .multiplyScalar(Math.cos(angularRadiusRadians))
      .add(tangent.multiplyScalar(Math.sin(angularRadiusRadians)))
      .normalize()
      .multiplyScalar(radiusUnits);
    perimeterPoints.push(point);
  }

  for (let i = 0; i < segments; i++) {
    vertices.push(
      center.x, center.y, center.z,
      perimeterPoints[i].x, perimeterPoints[i].y, perimeterPoints[i].z,
      perimeterPoints[i + 1].x, perimeterPoints[i + 1].y, perimeterPoints[i + 1].z,
    );
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geo.computeVertexNormals();

  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: false,
  }));
}

// ── Update functions ────────────────────────────────────────────────────

// Ground radars: only coverage circles (3D LineLoops). Icons are rendered by defenseOverlay.
function updateGroundRadars({
  snapshot,
  groundRadarActors,
  earthGroup,
  assetsVisible,
  coverageVisible,
  worldConfig,
}) {
  const activeIds = new Set();
  for (const radar of snapshot.groundRadars) {
    activeIds.add(radar.id);
    let actor = groundRadarActors.get(radar.id);
    if (!actor) {
      const coverage = new THREE.LineLoop(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({
          color: 0x7de4ff,
          transparent: true,
          opacity: 0.34,
        }),
      );
      earthGroup.add(coverage);
      actor = { coverage };
      groundRadarActors.set(radar.id, actor);
    }

    actor.coverage.visible = assetsVisible && coverageVisible;

    const coveragePoints = createSurfaceCirclePoints({
      lat: radar.latitude,
      lon: radar.longitude,
      radiusUnits: worldConfig.earthRadius * 1.002,
      angularRadiusRadians: radar.coverageKm / 6371,
      segments: 96,
    });
    actor.coverage.geometry.dispose();
    actor.coverage.geometry = new THREE.BufferGeometry().setFromPoints(coveragePoints);
  }

  for (const [id, actor] of groundRadarActors.entries()) {
    if (activeIds.has(id)) {
      continue;
    }
    actor.coverage.removeFromParent();
    groundRadarActors.delete(id);
  }
}

function updateSatellites({
  snapshot,
  satelliteActors,
  scene,
  earthGroup,
  elapsedSeconds,
  assetsVisible,
  coverageVisible,
  worldConfig,
  selectedSatelliteId,
}) {
  const inverseEarthQuaternion = earthGroup.quaternion.clone().invert();
  const localPosition = new THREE.Vector3();
  const velocityDirection = new THREE.Vector3();
  const nadirDirection = new THREE.Vector3();
  const crossTrack = new THREE.Vector3();
  const alignmentMatrix = new THREE.Matrix4();
  const activeIds = new Set();
  for (const satellite of snapshot.satellites) {
    activeIds.add(satellite.id);
    let actor = satelliteActors.get(satellite.id);
    if (!actor) {
      const asset = createEarlyWarningSatellite();
      const coverage = new THREE.LineLoop(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({
          color: 0xfff5a3,
          transparent: true,
          opacity: 0.22,
        }),
      );
      scene.add(asset.object3d);
      earthGroup.add(coverage);
      actor = { asset, coverage, satelliteId: satellite.id };
      satelliteActors.set(satellite.id, actor);
    }

    actor.asset.object3d.position.copy(satellite.position);
    actor.asset.object3d.scale.setScalar(0.3);
    actor.asset.object3d.visible = assetsVisible;
    actor.asset.update(elapsedSeconds);
    actor.asset.object3d.userData.satelliteId = satellite.id;

    nadirDirection.copy(satellite.position).normalize().multiplyScalar(-1);
    velocityDirection.copy(satellite.velocity);
    if (velocityDirection.lengthSq() > 1e-12) {
      velocityDirection.normalize();
      crossTrack.crossVectors(velocityDirection, nadirDirection).normalize();
      if (crossTrack.lengthSq() > 1e-12) {
        alignmentMatrix.makeBasis(nadirDirection, crossTrack, velocityDirection);
        actor.asset.object3d.quaternion.setFromRotationMatrix(alignmentMatrix);
      }
    }

    localPosition.copy(satellite.position).applyQuaternion(inverseEarthQuaternion);
    const subpoint = vector3ToLatLon(localPosition);
    const isSelected = satellite.id === selectedSatelliteId;
    actor.coverage.visible = assetsVisible && coverageVisible && satellite.operational;

    const footprintPoints = createSurfaceCirclePoints({
      lat: subpoint.lat,
      lon: subpoint.lon,
      radiusUnits: worldConfig.earthRadius * 1.002,
      angularRadiusRadians: satellite.footprintRadiusKm / EARTH_RADIUS_KM,
      segments: 160,
    });
    actor.coverage.geometry.dispose();
    actor.coverage.geometry = new THREE.BufferGeometry().setFromPoints(footprintPoints);

    if (isSelected && satellite.operational) {
      actor.coverage.material.color.setHex(COVERAGE_FILL_COLOR);
      actor.coverage.material.opacity = 0.55;
    } else {
      actor.coverage.material.color.setHex(0xfff5a3);
      actor.coverage.material.opacity = 0.22;
    }
  }

  for (const [id, actor] of satelliteActors.entries()) {
    if (activeIds.has(id)) {
      continue;
    }
    actor.asset.object3d.removeFromParent();
    actor.coverage.removeFromParent();
    satelliteActors.delete(id);
  }
}

// Cone from a deployed satellite down to the Earth — shown when clicking a live satellite.
function updateDeployedCone({ snapshot, coneGroup, selectedSatelliteId, earthGroup, worldConfig, color }) {
  clearGroup(coneGroup);

  if (!selectedSatelliteId) return;

  const satellite = snapshot.satellites.find((s) => s.id === selectedSatelliteId);
  if (!satellite || !satellite.operational) return;

  const satPos = satellite.position;
  const footprintAngularRadius = satellite.footprintRadiusKm / EARTH_RADIUS_KM;

  const inverseEarthQuaternion = earthGroup.quaternion.clone().invert();
  const localPos = satPos.clone().applyQuaternion(inverseEarthQuaternion);
  const subpoint = vector3ToLatLon(localPos);

  const surfacePoints = createSurfaceCirclePoints({
    lat: subpoint.lat,
    lon: subpoint.lon,
    radiusUnits: worldConfig.earthRadius * 1.001,
    angularRadiusRadians: footprintAngularRadius,
    segments: CONE_SEGMENTS,
  });

  // Transform local-earth points to world space
  for (const p of surfacePoints) {
    p.applyQuaternion(earthGroup.quaternion);
  }

  const cone = buildConeVisual({
    apexPosition: satPos,
    surfacePoints,
    color,
    fillOpacity: 0.06,
    wireOpacity: 0.28,
  });
  coneGroup.add(cone);
}

// Preview cone from the selected slot marker down to the Earth surface —
// shows what the satellite *will* cover before you launch it.
function updatePreviewCone({
  coneGroup,
  diskGroup,
  selectedGeoSlotId,
  orbitParams,
  earthGroup,
  worldConfig,
  geoSelectionVisible,
}) {
  clearGroup(coneGroup);
  clearGroup(diskGroup);

  if (!selectedGeoSlotId || !geoSelectionVisible) return;

  const { altitudeKm, inclinationDeg, raanDeg } = orbitParams;
  const radiusUnits = altitudeKmToOrbitRadiusUnits(altitudeKm);
  const footprintRadiusKm = computeFootprintRadiusKm(altitudeKm);
  const footprintAngularRadius = footprintRadiusKm / EARTH_RADIUS_KM;

  // Compute slot position on the inclined orbit
  const incRad = THREE.MathUtils.degToRad(inclinationDeg);
  const raanRad = THREE.MathUtils.degToRad(raanDeg);
  const basis = computeOrbitBasis(incRad, raanRad);
  const slotAngle = THREE.MathUtils.degToRad(getSlotLongitude(selectedGeoSlotId) + 180);

  // Slot position in scene space (orbit preview is in scene space)
  const slotScenePos = basis.u.clone().multiplyScalar(radiusUnits * Math.cos(slotAngle))
    .add(basis.v.clone().multiplyScalar(radiusUnits * Math.sin(slotAngle)));

  // Subpoint: project slot position down to Earth surface
  const subpointDir = slotScenePos.clone().normalize();
  // Convert to earthGroup local space to get lat/lon
  const inverseEarthQ = earthGroup.quaternion.clone().invert();
  const subpointLocal = subpointDir.clone().applyQuaternion(inverseEarthQ);
  const subpoint = vector3ToLatLon(subpointLocal);

  // Coverage circle on Earth surface (in earthGroup local space)
  const surfacePointsLocal = createSurfaceCirclePoints({
    lat: subpoint.lat,
    lon: subpoint.lon,
    radiusUnits: worldConfig.earthRadius * 1.002,
    angularRadiusRadians: footprintAngularRadius,
    segments: CONE_SEGMENTS,
  });

  // World-space versions for the cone geometry
  const surfacePointsWorld = surfacePointsLocal.map((p) =>
    p.clone().applyQuaternion(earthGroup.quaternion).add(earthGroup.position),
  );

  const cone = buildConeVisual({
    apexPosition: slotScenePos,
    surfacePoints: surfacePointsWorld,
    color: COVERAGE_PREVIEW_COLOR,
    fillOpacity: 0.05,
    wireOpacity: 0.22,
  });
  coneGroup.add(cone);

  const disk = buildSurfaceDisk({
    lat: subpoint.lat,
    lon: subpoint.lon,
    radiusUnits: worldConfig.earthRadius * 1.003,
    angularRadiusRadians: footprintAngularRadius,
    color: COVERAGE_PREVIEW_COLOR,
    opacity: 0.08,
  });
  diskGroup.add(disk);
}

// Orbital trajectory ring — shows current orbit and target orbit of a selected satellite
function updateOrbitTrajectory({ snapshot, trajectoryGroup, selectedSatelliteId }) {
  clearGroup(trajectoryGroup);

  if (!selectedSatelliteId) return;

  const satellite = snapshot.satellites.find((s) => s.id === selectedSatelliteId);
  if (!satellite) return;

  const orbitalRadius = satellite.position.length();
  if (orbitalRadius < 0.1) return;

  const pos = satellite.position.clone().normalize();
  const vel = satellite.velocity.clone();

  // Orbital plane normal = position × velocity
  const orbitNormal = new THREE.Vector3().crossVectors(pos, vel);
  if (orbitNormal.lengthSq() < 1e-12) {
    orbitNormal.set(0, 1, 0);
  } else {
    orbitNormal.normalize();
  }

  const segments = 180;

  // Two perpendicular vectors in the orbital plane
  const uDir = pos.clone();
  const vDir = new THREE.Vector3().crossVectors(orbitNormal, pos).normalize();

  // ── Current orbit ring (gold, solid) ───────────────────────────────
  const currentPoints = buildOrbitCircle(uDir, vDir, orbitalRadius, segments);
  trajectoryGroup.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(currentPoints),
    new THREE.LineBasicMaterial({ color: COVERAGE_FILL_COLOR, transparent: true, opacity: 0.3 }),
  ));

  // ── Target orbit ring (cyan, dashed) — only if not yet at target ──
  const targetRadius = satellite.targetRadiusUnits;
  if (Math.abs(targetRadius - orbitalRadius) > 0.08) {
    const dashPoints = [];
    for (let i = 0; i < segments; i += 2) {
      const a1 = (i / segments) * Math.PI * 2;
      const a2 = ((i + 1) / segments) * Math.PI * 2;
      dashPoints.push(
        uDir.clone().multiplyScalar(targetRadius * Math.cos(a1)).add(vDir.clone().multiplyScalar(targetRadius * Math.sin(a1))),
        uDir.clone().multiplyScalar(targetRadius * Math.cos(a2)).add(vDir.clone().multiplyScalar(targetRadius * Math.sin(a2))),
      );
    }
    trajectoryGroup.add(new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(dashPoints),
      new THREE.LineBasicMaterial({ color: COVERAGE_PREVIEW_COLOR, transparent: true, opacity: 0.35 }),
    ));
  }

  // ── Velocity arrow ─────────────────────────────────────────────────
  const speed = vel.length();
  if (speed > 1e-8) {
    const arrowDir = vel.clone().normalize();
    const arrowLength = orbitalRadius * 0.08;
    const arrowStart = satellite.position.clone();
    const arrowEnd = arrowStart.clone().add(arrowDir.clone().multiplyScalar(arrowLength));

    trajectoryGroup.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([arrowStart, arrowEnd]),
      new THREE.LineBasicMaterial({ color: COVERAGE_FILL_COLOR, transparent: true, opacity: 0.5 }),
    ));

    const perp = new THREE.Vector3().crossVectors(arrowDir, orbitNormal).normalize();
    const headSize = arrowLength * 0.3;
    const headBase = arrowEnd.clone().sub(arrowDir.clone().multiplyScalar(headSize));
    trajectoryGroup.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        headBase.clone().add(perp.clone().multiplyScalar(headSize * 0.4)),
        arrowEnd,
        headBase.clone().sub(perp.clone().multiplyScalar(headSize * 0.4)),
      ]),
      new THREE.LineBasicMaterial({ color: COVERAGE_FILL_COLOR, transparent: true, opacity: 0.5 }),
    ));
  }

  // ── Satellite position marker on orbit ─────────────────────────────
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(orbitalRadius * 0.012, 8, 8),
    new THREE.MeshBasicMaterial({ color: COVERAGE_FILL_COLOR, transparent: true, opacity: 0.8, depthWrite: false }),
  );
  marker.position.copy(satellite.position);
  trajectoryGroup.add(marker);
}

function buildOrbitCircle(uDir, vDir, radius, segments) {
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    points.push(uDir.clone().multiplyScalar(radius * Math.cos(angle)).add(vDir.clone().multiplyScalar(radius * Math.sin(angle))));
  }
  return points;
}

function updateLaunches({
  snapshot,
  launchActors,
  scene,
  camera,
  assetsVisible,
  elapsedSeconds,
  tmpQuaternion,
}) {
  const activeIds = new Set();
  for (const launch of snapshot.launches) {
    activeIds.add(launch.id);
    let actor = launchActors.get(launch.id);
    if (!actor) {
      const asset = createLaunchVehicle();
      const path = new THREE.Line(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({
          color: 0xffd388,
          transparent: true,
          opacity: 0.35,
        }),
      );
      scene.add(asset.object3d);
      scene.add(path);
      actor = { asset, path };
      launchActors.set(launch.id, actor);
    }

    const radial = launch.position.clone().normalize();
    const cameraDistance = camera ? camera.position.distanceTo(launch.position) : 40;
    const targetVisualLength = THREE.MathUtils.clamp(cameraDistance * 0.018, 0.08, 0.28);
    const visualScale = targetVisualLength / actor.asset.nativeLength;
    const radialLift = Math.max(targetVisualLength * 0.24, 0.025);

    actor.asset.object3d.scale.setScalar(visualScale);
    actor.asset.object3d.position.copy(launch.position).addScaledVector(radial, radialLift);
    tmpQuaternion.setFromUnitVectors(actor.asset.forwardAxis, launch.direction.clone().normalize());
    actor.asset.object3d.quaternion.copy(tmpQuaternion);
    actor.asset.setVisualState(
      {
        visible: assetsVisible,
        stageIndex: Math.min(launch.stageIndex, 2),
        engineOn: launch.engineOn,
        fairingSeparated: launch.fairingSeparated,
        flightTimeSeconds: launch.flightTimeSeconds,
        sequenceIndex: launch.sequenceIndex,
      },
      elapsedSeconds,
    );
    actor.path.visible = assetsVisible;
    actor.path.geometry.dispose();
    actor.path.geometry = new THREE.BufferGeometry().setFromPoints(launch.path);
  }

  for (const [id, actor] of launchActors.entries()) {
    if (activeIds.has(id)) {
      continue;
    }
    actor.asset.object3d.removeFromParent();
    actor.path.removeFromParent();
    launchActors.delete(id);
  }
}

function syncGeoSlots({ snapshot, geoSelectionGroup, geoSlotPickers, selectedGeoSlotId, orbitParams }) {
  // Keep the first child (the guide ring from rebuildOrbitPreview), remove slot markers
  while (geoSelectionGroup.children.length > 1) {
    geoSelectionGroup.remove(geoSelectionGroup.children[1]);
  }
  geoSlotPickers.length = 0;

  // Slots only make sense for geostationary orbits
  const isGeo = orbitParams.altitudeKm >= 35000 && orbitParams.inclinationDeg < 2;
  if (!isGeo) return;

  const { altitudeKm, inclinationDeg, raanDeg } = orbitParams;
  const radiusUnits = altitudeKmToOrbitRadiusUnits(altitudeKm);
  const incRad = THREE.MathUtils.degToRad(inclinationDeg);
  const raanRad = THREE.MathUtils.degToRad(raanDeg);
  const basis = computeOrbitBasis(incRad, raanRad);

  for (const slot of snapshot.geoSlots) {
    const isSelected = slot.id === selectedGeoSlotId;
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(isSelected ? 0.42 : 0.32, 18, 18),
      new THREE.MeshBasicMaterial({
        color: isSelected ? 0xffd388 : 0x7de4ff,
        transparent: true,
        opacity: isSelected ? 0.92 : 0.78,
      }),
    );
    const angle = THREE.MathUtils.degToRad(slot.longitude + 180);
    marker.position.copy(
      basis.u.clone().multiplyScalar(radiusUnits * Math.cos(angle))
        .add(basis.v.clone().multiplyScalar(radiusUnits * Math.sin(angle))),
    );
    marker.userData.geoSlot = slot;
    geoSelectionGroup.add(marker);
    geoSlotPickers.push(marker);
  }
}

// ── Geometry helpers ────────────────────────────────────────────────────

function getSlotLongitude(slotId) {
  const SLOT_LONGITUDES = {
    americas: -105,
    atlantic: -15,
    'europe-africa': 45,
    indian: 85,
    'asia-pacific': 135,
  };
  return SLOT_LONGITUDES[slotId] ?? 0;
}

// Compute orbital plane basis vectors from inclination and RAAN.
// Returns { u, v, normal } where u and v span the orbital plane.
// u points toward the ascending node, v is 90° ahead in the orbit.
function computeOrbitBasis(inclinationRad, raanRad) {
  // Start with equatorial: u = +X, v = +Z, normal = +Y
  // 1. Tilt by inclination around X axis (rotates v and normal)
  // 2. Rotate the whole plane around Y axis by RAAN
  const cosI = Math.cos(inclinationRad);
  const sinI = Math.sin(inclinationRad);
  const cosR = Math.cos(raanRad);
  const sinR = Math.sin(raanRad);

  // After inclination tilt around X: u stays along X, v tilts from Z toward Y
  // u_tilted = (1, 0, 0)
  // v_tilted = (0, sinI, cosI)

  // After RAAN rotation around Y:
  const u = new THREE.Vector3(cosR, 0, sinR);
  const v = new THREE.Vector3(-sinR * cosI, sinI, cosR * cosI);
  const normal = new THREE.Vector3(sinR * sinI, cosI, -cosR * sinI);

  return { u, v, normal };
}

function createEquatorialRingPoints(radius, segments) {
  const points = [];
  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
  }
  return points;
}

function createSurfaceCirclePoints({ lat, lon, radiusUnits, angularRadiusRadians, segments }) {
  const center = latLonToVector3({ lat, lon, radius: radiusUnits });
  const frame = buildSurfaceFrame(center);
  const points = [];

  for (let index = 0; index < segments; index += 1) {
    const theta = (index / segments) * Math.PI * 2;
    const tangent = frame.east
      .clone()
      .multiplyScalar(Math.cos(theta))
      .add(frame.north.clone().multiplyScalar(Math.sin(theta)));
    const point = center
      .clone()
      .normalize()
      .multiplyScalar(Math.cos(angularRadiusRadians))
      .add(tangent.multiplyScalar(Math.sin(angularRadiusRadians)))
      .normalize()
      .multiplyScalar(radiusUnits);
    points.push(point);
  }

  return points;
}
