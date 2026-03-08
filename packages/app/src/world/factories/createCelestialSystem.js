import * as THREE from 'three';
import { loadPlanetTextureSet } from '../../rendering/textures/loadPlanetTextureSet.js';
import { createFallbackTextureSet } from '../../rendering/textures/createFallbackTextureSet.js';
import { createEarthSystem } from '../entities/createEarthSystem.js';
import { createMissile } from '../entities/createMissile.js';
import { createCarrier, createCruiser } from '../entities/createNavalUnit.js';
import { latLonToVector3, buildSurfaceFrame } from '../geo/geoMath.js';

export async function createCelestialSystem({
  scene,
  renderer,
  worldConfig,
  renderConfig,
  onInvalidate,
}) {
  const textures = await loadPlanetTextureSet({ renderer }).catch(() =>
    createFallbackTextureSet({ renderer }),
  );
  const earthSystem = createEarthSystem({
    textures,
    worldConfig,
    renderConfig,
    sunDirection: new THREE.Vector3(...renderConfig.lighting.sunPosition).normalize(),
  });
  scene.add(earthSystem.group);

  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(worldConfig.moonRadius, 96, 96),
    new THREE.MeshStandardMaterial({
      map: textures.moon,
      bumpMap: textures.moonBump,
      bumpScale: 0.08,
      roughness: 1,
      metalness: 0,
      color: 0xe5e7eb,
    }),
  );
  const moonGlow = new THREE.Mesh(
    new THREE.SphereGeometry(worldConfig.moonRadius * 1.04, 48, 48),
    new THREE.MeshBasicMaterial({ color: 0xcfd8e3, transparent: true, opacity: 0.06 }),
  );
  moon.add(moonGlow);
  scene.add(moon);

  const stars = scene.children.find((child) => child.isPoints);
  const spentStages = [];
  const missileActors = new Map();
  const navalActors = new Map();
  const tmpQuaternion = new THREE.Quaternion();
  let navalVisible = true;
  const trajectoryVisibility = {
    actual: true,
    predicted: true,
  };
  const anchors = {
    moon: {
      position: new THREE.Vector3(worldConfig.earthMoonDistance, 0, 0),
    },
  };

  moon.position.copy(anchors.moon.position);

  // ── Ocean detection via earth surface texture sampling ────────────
  let oceanCanvas = null;
  let oceanCtx = null;
  let oceanWidth = 0;
  let oceanHeight = 0;
  try {
    const img = textures.surface?.image;
    if (img) {
      // Down-sample to 512px wide for fast lookup
      const scale = Math.min(1, 512 / (img.width || 512));
      oceanWidth = Math.round((img.width || 512) * scale);
      oceanHeight = Math.round((img.height || 256) * scale);
      oceanCanvas = document.createElement('canvas');
      oceanCanvas.width = oceanWidth;
      oceanCanvas.height = oceanHeight;
      oceanCtx = oceanCanvas.getContext('2d', { willReadFrequently: true });
      oceanCtx.drawImage(img, 0, 0, oceanWidth, oceanHeight);
    }
  } catch (e) {
    console.warn('Ocean detector: could not read earth texture', e);
  }

  function isOcean(lat, lon) {
    if (!oceanCtx) return true; // If no texture, allow placement anywhere
    // Equirectangular UV
    const u = ((lon + 180) % 360) / 360;
    const v = (90 - lat) / 180;
    const px = Math.round(u * (oceanWidth - 1));
    const py = Math.round(v * (oceanHeight - 1));
    const pixel = oceanCtx.getImageData(px, py, 1, 1).data;
    const r = pixel[0],
      g = pixel[1],
      b = pixel[2];
    // Water is blue-dominant and dark; land is green/brown/bright
    return b > r * 1.1 && b > g * 0.9 && r + g + b < 500;
  }

  return {
    anchors,
    isOcean,
    groups: {
      earth: earthSystem.group,
    },
    meshes: {
      earth: earthSystem.earth,
      cloudLayer: earthSystem.clouds,
      atmosphere: earthSystem.atmosphere,
      stars,
      moon,
    },
    updateNavalUnits(snapshots, camera = null) {
      const activeIds = new Set();
      for (const snapshot of snapshots) {
        activeIds.add(snapshot.id);
        let actor = navalActors.get(snapshot.id);
        if (!actor) {
          actor = new THREE.Group();
          // Echelon formation: carrier center, escorts flanking behind
          const formationSlots = [
            { x: 0, z: 0 }, // lead (carrier)
            { x: 0.0015, z: -0.002 }, // starboard escort
            { x: -0.0015, z: -0.002 }, // port escort
            { x: 0.003, z: -0.004 }, // far starboard
            { x: -0.003, z: -0.004 }, // far port
          ];
          for (let i = 0; i < snapshot.ships.length; i++) {
            const ship = snapshot.ships[i];
            const shipObj =
              ship.type === 'carrier' ? createCarrier(i).object3d : createCruiser(i).object3d;
            const slot = formationSlots[i % formationSlots.length];
            shipObj.position.set(slot.x, 0, slot.z);
            actor.add(shipObj);
          }
          earthSystem.group.add(actor);
          navalActors.set(snapshot.id, actor);
          actor.userData.nativeLength = 0.003;
        }
        actor.visible = navalVisible;

        const rawPos = latLonToVector3({
          lat: snapshot.lat,
          lon: snapshot.lon,
          radius: worldConfig.earthRadius,
        });

        // Scale based on distance to camera
        let radialLift = 0.005;
        if (camera) {
          const cameraDistance = camera.position.distanceTo(rawPos);
          const targetVisualLength = THREE.MathUtils.clamp(cameraDistance * 0.015, 0.03, 0.15);
          const visualScale = targetVisualLength / actor.userData.nativeLength;
          actor.scale.setScalar(visualScale);
          // Generous lift: half the visual length keeps formation above surface
          radialLift = Math.max(targetVisualLength * 0.15, 0.005);
        }

        // Position on ocean surface with radial lift
        const up = rawPos.clone().normalize();
        actor.position.copy(rawPos).addScaledVector(up, radialLift);

        // Build a proper surface-tangent orientation.
        // Ship local axes: +Z = forward (bow), +Y = up, +X = starboard.
        // We need: local Y → surface normal (up), local Z → forward along surface.
        const frame = buildSurfaceFrame(up);

        let forward;
        if (snapshot.isMoving) {
          const targetPos = latLonToVector3({
            lat: snapshot.targetLat,
            lon: snapshot.targetLon,
            radius: worldConfig.earthRadius,
          });
          const dir = targetPos.clone().sub(rawPos);
          // Project onto tangent plane (remove radial component)
          dir.sub(up.clone().multiplyScalar(dir.dot(up)));
          forward = dir.lengthSq() > 1e-12 ? dir.normalize() : frame.north;
        } else {
          forward = frame.north;
        }

        // Right = forward × up (starboard)
        const right = new THREE.Vector3().crossVectors(forward, up).normalize();
        // Re-derive forward to guarantee orthonormality
        forward.crossVectors(up, right).normalize();

        // Build rotation matrix: columns = [right (X), up (Y), forward (Z)]
        const rotMatrix = new THREE.Matrix4().makeBasis(right, up, forward);
        actor.quaternion.setFromRotationMatrix(rotMatrix);
      }

      for (const [id, actor] of navalActors.entries()) {
        if (activeIds.has(id)) continue;
        actor.removeFromParent();
        navalActors.delete(id);
      }
    },
    updateMissiles(snapshots, deltaSeconds = 0, elapsedSeconds = 0, camera = null) {
      const activeIds = new Set();

      for (const snapshot of snapshots) {
        activeIds.add(snapshot.id);
        const actor = ensureMissileActor({
          id: snapshot.id,
          missileActors,
          scene,
          earthGroup: earthSystem.group,
          renderConfig,
          trajectoryVisibility,
        });
        updateMissileActor({
          actor,
          snapshot,
          deltaSeconds,
          elapsedSeconds,
          camera,
          scene,
          spentStages,
          tmpQuaternion,
          trajectoryVisibility,
        });
      }

      for (const [id, actor] of missileActors.entries()) {
        if (activeIds.has(id)) {
          continue;
        }
        disposeMissileActor(actor);
        missileActors.delete(id);
      }

      updateSpentStages({ spentStages, deltaSeconds });
    },
    setTrajectoryVisibility({ actual, predicted }) {
      trajectoryVisibility.actual = actual;
      trajectoryVisibility.predicted = predicted;

      for (const actor of missileActors.values()) {
        actor.actualPath.line.visible = actual;
        actor.predictedPath.line.visible = predicted;
      }
      onInvalidate();
    },
    setNavalVisibility(enabled) {
      navalVisible = Boolean(enabled);
      for (const actor of navalActors.values()) {
        actor.visible = navalVisible;
      }
      onInvalidate();
    },
    updateVisuals({
      deltaSeconds,
      elapsedSeconds,
      camera,
      controls,
      sunLight,
      simulationConfig,
      renderConfig,
      worldConfig,
    }) {
      if (simulationConfig.simulationTimeScale > 0) {
        earthSystem.group.rotation.y +=
          deltaSeconds *
          ((Math.PI * 2 * simulationConfig.simulationTimeScale) /
            simulationConfig.earthRotationPeriodSeconds);
        earthSystem.clouds.rotation.y +=
          deltaSeconds *
          ((Math.PI * 2 * simulationConfig.simulationTimeScale) /
            simulationConfig.cloudRotationPeriodSeconds);
        earthSystem.clouds.rotation.z = Math.sin(elapsedSeconds * 0.05) * 0.006;
      }
      earthSystem.atmosphere.material.uniforms.sunDirection.value
        .copy(sunLight.position)
        .normalize();

      const cameraDistance = camera.position.distanceTo(controls.target);
      const closeRangeFactor = THREE.MathUtils.clamp(
        1 - (cameraDistance - worldConfig.earthRadius * 1.03) / 18,
        0,
        1,
      );
      if (earthSystem.earth.material.normalScale) {
        earthSystem.earth.material.normalScale.setScalar(0.45 + closeRangeFactor * 0.18);
      }
      earthSystem.earth.material.emissiveIntensity = THREE.MathUtils.lerp(
        0.08,
        0.24,
        1 - closeRangeFactor,
      );
      scene.fog.density = THREE.MathUtils.lerp(
        renderConfig.scene.fogRange[0],
        renderConfig.scene.fogRange[1],
        THREE.MathUtils.clamp(cameraDistance / 900, 0, 1),
      );

      if (simulationConfig.simulationTimeScale > 0) {
        stars.rotation.y += deltaSeconds * 0.002;
        stars.rotation.x += deltaSeconds * 0.0005;
      }
    },
    getCameraAltitudeKm(camera, controls) {
      return Math.max(
        (camera.position.distanceTo(controls.target) - worldConfig.earthRadius) * 1000,
        0,
      );
    },
    getEarthRotationRadians() {
      return earthSystem.group.rotation.y;
    },
  };
}

function ensureMissileActor({
  id,
  missileActors,
  scene,
  earthGroup,
  renderConfig,
  trajectoryVisibility,
}) {
  let actor = missileActors.get(id);
  if (actor) {
    return actor;
  }

  const missile = createMissile();
  scene.add(missile.object3d);
  const actualPath = createTrajectoryLine({
    parent: earthGroup,
    maxPoints: renderConfig.trail.points,
    color: renderConfig.missile.actualPathColor,
    opacity: renderConfig.missile.actualPathOpacity,
  });
  const predictedPath = createTrajectoryLine({
    parent: earthGroup,
    maxPoints: renderConfig.trail.points,
    color: renderConfig.missile.predictedPathColor,
    opacity: renderConfig.missile.predictedPathOpacity,
  });
  actualPath.line.visible = trajectoryVisibility.actual;
  predictedPath.line.visible = trajectoryVisibility.predicted;

  actor = {
    missile,
    actualPath,
    predictedPath,
    previousStageIndex: null,
    previousPhase: 'idle',
  };
  missileActors.set(id, actor);
  return actor;
}

function updateMissileActor({
  actor,
  snapshot,
  deltaSeconds: _deltaSeconds,
  elapsedSeconds,
  camera,
  scene,
  spentStages,
  tmpQuaternion,
  trajectoryVisibility,
}) {
  const visible = Boolean(snapshot?.visible && snapshot?.position);
  actor.missile.object3d.visible = visible;
  if (visible) {
    const radial = snapshot.position.clone().normalize();
    const cameraDistance = camera ? camera.position.distanceTo(snapshot.position) : 20;
    const targetVisualLength = THREE.MathUtils.clamp(cameraDistance * 0.018, 0.045, 0.22);
    const visualScale = targetVisualLength / actor.missile.nativeLength;
    const radialLift = Math.max(targetVisualLength * 0.24, 0.014);
    actor.missile.object3d.scale.setScalar(visualScale);
    actor.missile.object3d.position.copy(snapshot.position).addScaledVector(radial, radialLift);
    const direction =
      snapshot.direction?.clone().normalize() ?? snapshot.position.clone().normalize();
    tmpQuaternion.setFromUnitVectors(actor.missile.forwardAxis, direction);
    actor.missile.object3d.quaternion.copy(tmpQuaternion);
    actor.missile.setVisualState(snapshot, elapsedSeconds);
  } else {
    actor.missile.setVisualState(
      { visible: false, phase: 'idle', stageIndex: null },
      elapsedSeconds,
    );
  }

  if (
    visible &&
    actor.previousPhase === 'boost' &&
    snapshot.phase === 'midcourse' &&
    actor.previousStageIndex === 2
  ) {
    spawnSpentStage({
      stageKey: 'stage3',
      snapshot,
      scene,
      spentStages,
      missile: actor.missile,
      tmpQuaternion,
    });
  }
  if (
    visible &&
    actor.previousStageIndex !== null &&
    snapshot.stageIndex !== null &&
    snapshot.stageIndex > actor.previousStageIndex
  ) {
    const stageKey =
      actor.previousStageIndex === 0
        ? 'stage1'
        : actor.previousStageIndex === 1
          ? 'stage2'
          : actor.previousStageIndex === 2
            ? 'stage3'
            : null;
    if (stageKey) {
      spawnSpentStage({
        stageKey,
        snapshot,
        scene,
        spentStages,
        missile: actor.missile,
        tmpQuaternion,
      });
    }
    if (actor.previousStageIndex === 1 && snapshot.stageIndex === 2) {
      spawnSpentStage({
        stageKey: 'fairingLeft',
        snapshot,
        scene,
        spentStages,
        missile: actor.missile,
        tmpQuaternion,
      });
      spawnSpentStage({
        stageKey: 'fairingRight',
        snapshot,
        scene,
        spentStages,
        missile: actor.missile,
        tmpQuaternion,
      });
    }
  }
  if (visible && actor.previousPhase !== 'terminal' && snapshot.phase === 'terminal') {
    spawnSpentStage({
      stageKey: 'bus',
      snapshot,
      scene,
      spentStages,
      missile: actor.missile,
      tmpQuaternion,
    });
  }

  actor.previousStageIndex = snapshot?.stageIndex ?? null;
  actor.previousPhase = snapshot?.phase ?? 'idle';

  actor.actualPath.line.visible = trajectoryVisibility.actual;
  actor.predictedPath.line.visible = trajectoryVisibility.predicted;
  updateTrajectoryLine(actor.actualPath, snapshot?.actualPath ?? []);
  updateTrajectoryLine(actor.predictedPath, snapshot?.predictedPath ?? []);
}

function disposeMissileActor(actor) {
  actor.missile.object3d.removeFromParent();
  actor.actualPath.line.removeFromParent();
  actor.predictedPath.line.removeFromParent();
}

function spawnSpentStage({ stageKey, snapshot, scene, spentStages, missile, tmpQuaternion }) {
  const fragment = missile.createSeparationFragment(stageKey);
  if (!fragment || !snapshot?.position || !snapshot?.direction) {
    return;
  }

  tmpQuaternion.setFromUnitVectors(missile.forwardAxis, snapshot.direction.clone().normalize());
  fragment.object3d.position
    .copy(snapshot.position)
    .add(fragment.localOffset.clone().applyQuaternion(tmpQuaternion));
  fragment.object3d.quaternion.copy(tmpQuaternion);
  fragment.object3d.traverse((child) => {
    if (child.material) {
      child.material = child.material.clone();
      child.material.transparent = true;
      child.material.userData.baseOpacity = child.material.opacity ?? 1;
    }
  });
  scene.add(fragment.object3d);

  const backward = snapshot.direction.clone().normalize().multiplyScalar(-0.0018);
  const lateral = new THREE.Vector3(snapshot.direction.z, 0, -snapshot.direction.x)
    .normalize()
    .multiplyScalar(0.00035 * (spentStages.length % 2 === 0 ? 1 : -1));
  spentStages.push({
    object3d: fragment.object3d,
    velocity: backward.add(lateral),
    angularVelocity: new THREE.Vector3(0.8, 0.35, 0.55).multiplyScalar(
      spentStages.length % 2 === 0 ? 1 : -1,
    ),
    lifeSeconds: 9,
  });
}

function updateSpentStages({ spentStages, deltaSeconds }) {
  for (let index = spentStages.length - 1; index >= 0; index -= 1) {
    const fragment = spentStages[index];
    fragment.lifeSeconds -= deltaSeconds;
    fragment.object3d.position.addScaledVector(fragment.velocity, deltaSeconds);
    fragment.object3d.rotation.x += fragment.angularVelocity.x * deltaSeconds;
    fragment.object3d.rotation.y += fragment.angularVelocity.y * deltaSeconds;
    fragment.object3d.rotation.z += fragment.angularVelocity.z * deltaSeconds;

    if (fragment.object3d.traverse) {
      const alpha = THREE.MathUtils.clamp(fragment.lifeSeconds / 9, 0, 1);
      fragment.object3d.traverse((child) => {
        if (child.material?.transparent !== undefined) {
          child.material.opacity = (child.material.userData.baseOpacity ?? 1) * alpha;
        }
      });
    }

    if (fragment.lifeSeconds <= 0) {
      fragment.object3d.removeFromParent();
      spentStages.splice(index, 1);
    }
  }
}

function createTrajectoryLine({ parent, maxPoints, color, opacity }) {
  const positions = new Float32Array(maxPoints * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setDrawRange(0, 0);
  const line = new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
    }),
  );
  parent.add(line);
  return { line, geometry, positions, maxPoints };
}

function updateTrajectoryLine(lineState, points) {
  const count = Math.min(points.length, lineState.maxPoints);
  if (count === 0) {
    lineState.geometry.setDrawRange(0, 0);
    lineState.geometry.attributes.position.needsUpdate = true;
    return;
  }

  const offset = points.length > count ? points.length - count : 0;
  for (let index = 0; index < count; index += 1) {
    const point = points[index + offset];
    lineState.positions[index * 3] = point.x;
    lineState.positions[index * 3 + 1] = point.y;
    lineState.positions[index * 3 + 2] = point.z;
  }
  lineState.geometry.attributes.position.needsUpdate = true;
  lineState.geometry.setDrawRange(0, count);
}
