import * as THREE from 'three';
import { GEO_RADIUS_UNITS } from '../../game/data/radarCatalog.js';
import { createGroundRadar } from '../entities/createGroundRadar.js';
import { createEarlyWarningSatellite } from '../entities/createEarlyWarningSatellite.js';
import { createLaunchVehicle } from '../entities/createLaunchVehicle.js';
import { buildSurfaceFrame, latLonToVector3, vector3ToLatLon } from '../geo/geoMath.js';

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

  const geoRing = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(createEquatorialRingPoints(GEO_RADIUS_UNITS, 128)),
    new THREE.LineBasicMaterial({
      color: 0x7de4ff,
      transparent: true,
      opacity: 0.35,
    }),
  );
  geoSelectionGroup.add(geoRing);
  geoSelectionGroup.visible = false;
  earthGroup.add(geoSelectionGroup);

  return {
    update(snapshot, camera, elapsedSeconds) {
      updateGroundRadars({
        snapshot,
        groundRadarActors,
        earthGroup,
        elapsedSeconds,
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
      });
    },
    setGeoSelectionVisible(visible) {
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
    dispose() {
      for (const actor of groundRadarActors.values()) {
        actor.asset.object3d.removeFromParent();
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

      geoSelectionGroup.removeFromParent();
      geoSlotPickers.length = 0;
    },
  };
}

function updateGroundRadars({
  snapshot,
  groundRadarActors,
  earthGroup,
  elapsedSeconds,
  assetsVisible,
  coverageVisible,
  worldConfig,
}) {
  const activeIds = new Set();
  for (const radar of snapshot.groundRadars) {
    activeIds.add(radar.id);
    let actor = groundRadarActors.get(radar.id);
    if (!actor) {
      const asset = createGroundRadar();
      const coverage = new THREE.LineLoop(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({
          color: 0x7de4ff,
          transparent: true,
          opacity: 0.34,
        }),
      );
      earthGroup.add(asset.object3d);
      earthGroup.add(coverage);
      actor = { asset, coverage };
      groundRadarActors.set(radar.id, actor);
    }

    const localPosition = latLonToVector3({
      lat: radar.latitude,
      lon: radar.longitude,
      radius: worldConfig.earthRadius,
    });
    const radial = localPosition.clone().normalize();
    const frame = buildSurfaceFrame(radial);
    const rotationMatrix = new THREE.Matrix4().makeBasis(frame.east, frame.up, frame.north);

    actor.asset.object3d.position.copy(localPosition).addScaledVector(radial, 0.025);
    actor.asset.object3d.scale.setScalar(0.18);
    actor.asset.object3d.quaternion.setFromRotationMatrix(rotationMatrix);
    actor.asset.object3d.visible = assetsVisible;
    actor.asset.update(elapsedSeconds);
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
    actor.asset.object3d.removeFromParent();
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
      actor = { asset, coverage };
      satelliteActors.set(satellite.id, actor);
    }

    actor.asset.object3d.position.copy(satellite.position);
    actor.asset.object3d.scale.setScalar(0.3);
    actor.asset.object3d.visible = assetsVisible;
    actor.asset.update(elapsedSeconds);

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
    actor.coverage.visible = assetsVisible && coverageVisible && satellite.operational;

    const footprintPoints = createSurfaceCirclePoints({
      lat: subpoint.lat,
      lon: subpoint.lon,
      radiusUnits: worldConfig.earthRadius * 1.002,
      angularRadiusRadians: satellite.footprintRadiusKm / 6371,
      segments: 160,
    });
    actor.coverage.geometry.dispose();
    actor.coverage.geometry = new THREE.BufferGeometry().setFromPoints(footprintPoints);
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

function syncGeoSlots({ snapshot, geoSelectionGroup, geoSlotPickers, selectedGeoSlotId }) {
  while (geoSelectionGroup.children.length > 1) {
    geoSelectionGroup.remove(geoSelectionGroup.children[1]);
  }
  geoSlotPickers.length = 0;

  for (const slot of snapshot.geoSlots) {
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(slot.id === selectedGeoSlotId ? 0.42 : 0.32, 18, 18),
      new THREE.MeshBasicMaterial({
        color: slot.id === selectedGeoSlotId ? 0xffd388 : 0x7de4ff,
        transparent: true,
        opacity: slot.id === selectedGeoSlotId ? 0.92 : 0.78,
      }),
    );
    marker.position.copy(
      latLonToVector3({
        lat: 0,
        lon: slot.longitude,
        radius: GEO_RADIUS_UNITS,
      }),
    );
    marker.userData.geoSlot = slot;
    geoSelectionGroup.add(marker);
    geoSlotPickers.push(marker);
  }
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
