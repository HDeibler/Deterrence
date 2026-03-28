import * as THREE from 'three';
import { loadPlanetTextureSet } from '../../rendering/textures/loadPlanetTextureSet.js';
import { createFallbackTextureSet } from '../../rendering/textures/createFallbackTextureSet.js';
import { createEarthSystem } from '../entities/createEarthSystem.js';
import { createMissile } from '../entities/createMissile.js';
import { createCruiseMissile } from '../entities/createCruiseMissile.js';
import { createSupersonicCruiseMissile } from '../entities/createSupersonicCruiseMissile.js';
import { createHypersonicMissile } from '../entities/createHypersonicMissile.js';
import { createScramjetMissile } from '../entities/createScramjetMissile.js';
import { createCarrier, createCruiser, createSubmarine } from '../entities/createNavalUnit.js';
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
  // aircraftActors removed — aircraft now rendered via 2D SVG overlay
  const tmpQuaternion = new THREE.Quaternion();
  let navalVisible = true;
  let airVisible = true;
  const navalRouteLines = new Map();
  const airRouteLines = new Map();
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
  let oceanWidth = 0;
  let oceanHeight = 0;
  let oceanPixels = null;
  try {
    const img = textures.surface?.image;
    if (img) {
      const scale = Math.min(1, 2048 / (img.width || 2048));
      oceanWidth = Math.round((img.width || 2048) * scale);
      oceanHeight = Math.round((img.height || 1024) * scale);
      const canvas = document.createElement('canvas');
      canvas.width = oceanWidth;
      canvas.height = oceanHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, oceanWidth, oceanHeight);
      oceanPixels = ctx.getImageData(0, 0, oceanWidth, oceanHeight).data;
    }
  } catch (e) {
    console.warn('Ocean detector: could not read earth texture', e);
  }

  function isOcean(lat, lon) {
    if (!oceanPixels) return true;
    const u = ((lon + 180) % 360) / 360;
    const v = (90 - lat) / 180;
    const px = Math.round(u * (oceanWidth - 1));
    const py = Math.round(v * (oceanHeight - 1));
    const idx = (py * oceanWidth + px) * 4;
    const r = oceanPixels[idx];
    const g = oceanPixels[idx + 1];
    const b = oceanPixels[idx + 2];
    return b > r + 8 && b > g;
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
    updateNavalUnits(shipSnapshots, camera = null, altitudeKm = 0) {
      const activeIds = new Set();
      const show3D = navalVisible && altitudeKm < 800;

      for (const ship of shipSnapshots) {
        activeIds.add(ship.id);
        let actor = navalActors.get(ship.id);

        if (!actor) {
          const created =
            ship.type === 'carrier'
              ? createCarrier()
              : ship.type === 'submarine'
                ? createSubmarine()
                : createCruiser();
          actor = {
            object3d: created.object3d,
            nativeLength: ship.type === 'carrier' ? 0.003 : ship.type === 'submarine' ? 0.0013 : 0.002,
          };
          earthSystem.group.add(actor.object3d);
          navalActors.set(ship.id, actor);
        }

        actor.object3d.visible = show3D;

        if (!show3D) {
          continue;
        }

        // Position on globe surface (earth-local space)
        const localPos = latLonToVector3({
          lat: ship.lat,
          lon: ship.lon,
          radius: worldConfig.earthRadius,
        });

        // Convert to world space for accurate camera distance
        const worldPos = localPos.clone();
        earthSystem.group.localToWorld(worldPos);

        // Scale: use world-space camera distance for stability
        const camDist = camera ? camera.position.distanceTo(worldPos) : 20;
        const targetLen = THREE.MathUtils.clamp(camDist * 0.01, 0.015, 0.10);
        const visualScale = targetLen / actor.nativeLength;
        actor.object3d.scale.setScalar(visualScale);

        // Lift ship above surface proportional to its visual size
        // Generous multiplier + minimum floor to prevent z-fighting and clipping
        const radialLift = Math.max(targetLen * 0.5, 0.004);
        const up = localPos.clone().normalize();
        actor.object3d.position.copy(localPos).addScaledVector(up, radialLift);

        // Orientation: heading → forward direction on tangent plane
        // Ship models have bow at +Z, up at +Y in local space
        const frame = buildSurfaceFrame(up);
        const headingRad = (ship.heading ?? 0) * (Math.PI / 180);
        const forward = frame.north
          .clone()
          .multiplyScalar(Math.cos(headingRad))
          .addScaledVector(frame.east, Math.sin(headingRad))
          .normalize();

        // Use Object3D.lookAt to align +Z (bow) with forward, keeping Y roughly along up
        const lookTarget = actor.object3d.position.clone().add(forward);
        actor.object3d.up.copy(up);
        actor.object3d.lookAt(lookTarget);
      }

      for (const [id, actor] of navalActors.entries()) {
        if (activeIds.has(id)) {
          continue;
        }
        actor.object3d.removeFromParent();
        navalActors.delete(id);
      }
    },
    updateMissiles(snapshots, deltaSeconds = 0, elapsedSeconds = 0, camera = null, playerCountry = null) {
      const activeIds = new Set();

      for (const snapshot of snapshots) {
        activeIds.add(snapshot.id);
        const isEnemy = playerCountry && snapshot.launchSite?.countryIso3 !== playerCountry;
        const actor = ensureMissileActor({
          id: snapshot.id,
          missileType: snapshot.missileType,
          missileActors,
          scene,
          earthGroup: earthSystem.group,
          renderConfig,
          trajectoryVisibility,
          isEnemy,
        });
        // Update trail colors if enemy status changed
        if (actor.isEnemy !== isEnemy) {
          actor.isEnemy = isEnemy;
          if (isEnemy) {
            actor.actualPath.line.material.color.setHex(0xff4444);
            actor.actualPath.line.material.opacity = 0.6;
            actor.predictedPath.line.material.color.setHex(0xff4444);
            actor.predictedPath.line.material.opacity = 0.25;
          } else {
            actor.actualPath.line.material.color.setHex(renderConfig.missile.actualPathColor);
            actor.actualPath.line.material.opacity = renderConfig.missile.actualPathOpacity;
            actor.predictedPath.line.material.color.setHex(renderConfig.missile.predictedPathColor);
            actor.predictedPath.line.material.opacity = renderConfig.missile.predictedPathOpacity;
          }
        }
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
    updateNavalRoutes(routes) {
      const activeIds = new Set();
      const lineRadius = worldConfig.earthRadius * 1.002;

      for (const route of routes) {
        activeIds.add(route.id);
        let routeLine = navalRouteLines.get(route.id);

        if (!routeLine) {
          const geometry = new THREE.BufferGeometry();
          const material = new THREE.LineBasicMaterial({
            color: route.pending ? 0x62d0ff : 0x6bffd4,
            transparent: true,
            opacity: route.pending ? 0.7 : 0.35,
            depthWrite: false,
          });
          const line = new THREE.Line(geometry, material);
          earthSystem.group.add(line);
          routeLine = { line, geometry, material };
          navalRouteLines.set(route.id, routeLine);
        }

        routeLine.material.color.setHex(route.pending ? 0x62d0ff : 0x6bffd4);
        routeLine.material.opacity = route.pending ? 0.7 : 0.35;

        // Build path: live unit position → remaining waypoints
        const allPoints = [];
        if (route.fleetLat != null && route.fleetLon != null) {
          allPoints.push(latLonToVector3({ lat: route.fleetLat, lon: route.fleetLon, radius: lineRadius }));
        }
        for (const wp of route.waypoints) {
          allPoints.push(latLonToVector3({ lat: wp.lat, lon: wp.lon, radius: lineRadius }));
        }

        // Interpolate between points for smooth globe-following arcs
        const verts = [];
        for (let i = 0; i < allPoints.length; i++) {
          verts.push(allPoints[i]);
          if (i < allPoints.length - 1) {
            const a = allPoints[i];
            const b = allPoints[i + 1];
            const angle = a.angleTo(b);
            const steps = Math.max(1, Math.ceil(angle / 0.02));
            for (let s = 1; s < steps; s++) {
              verts.push(a.clone().lerp(b, s / steps).normalize().multiplyScalar(lineRadius));
            }
          }
        }

        const positions = new Float32Array(verts.length * 3);
        for (let i = 0; i < verts.length; i++) {
          positions[i * 3] = verts[i].x;
          positions[i * 3 + 1] = verts[i].y;
          positions[i * 3 + 2] = verts[i].z;
        }
        const posAttr = routeLine.geometry.getAttribute('position');
        if (posAttr && posAttr.count >= verts.length) {
          posAttr.array.set(positions);
          posAttr.needsUpdate = true;
          routeLine.geometry.setDrawRange(0, verts.length);
        } else {
          const attr = new THREE.BufferAttribute(positions, 3);
          attr.setUsage(THREE.DynamicDrawUsage);
          routeLine.geometry.setAttribute('position', attr);
          routeLine.geometry.setDrawRange(0, verts.length);
        }

        routeLine.line.visible = navalVisible && verts.length >= 2;
      }

      for (const [id, routeLine] of navalRouteLines.entries()) {
        if (activeIds.has(id)) {
          continue;
        }
        routeLine.line.removeFromParent();
        routeLine.geometry.dispose();
        routeLine.material.dispose();
        navalRouteLines.delete(id);
      }
    },
    // Aircraft rendering moved to 2D SVG overlay (createSquadronOverlaySystem)
    updateAirRoutes(routes) {
      const LEG_COLORS = [
        new THREE.Color(0x6ba3ff), new THREE.Color(0xffa94d),
        new THREE.Color(0x60d394), new THREE.Color(0xe599f7),
        new THREE.Color(0xffd43b), new THREE.Color(0x74c0fc),
        new THREE.Color(0xff8787), new THREE.Color(0xb197fc),
      ];
      const PENDING_COLOR = new THREE.Color(0x82b4ff);
      const TANKER_COLORS = {
        outbound: new THREE.Color(0x60d394),
        loitering: new THREE.Color(0xffd43b),
        returning: new THREE.Color(0xff8787),
      };
      const TANKER_DEFAULT = new THREE.Color(0x60d394);
      const lineRadius = worldConfig.earthRadius * 1.004;
      const activeIds = new Set();

      for (const route of routes) {
        activeIds.add(route.id);
        let routeLine = airRouteLines.get(route.id);

        // Build the raw point list: live position + remaining waypoints
        const rawPoints = [];
        const rawColors = [];

        // First point = unit's live position
        if (route.squadronLat != null && route.squadronLon != null) {
          rawPoints.push({ lat: route.squadronLat, lon: route.squadronLon });
          const c = route.isTanker ? (TANKER_COLORS[route.tankerPhase] || TANKER_DEFAULT)
            : route.legIndices ? LEG_COLORS[(route.legIndices[0] || 0) % LEG_COLORS.length]
            : route.pending ? PENDING_COLOR : LEG_COLORS[0];
          rawColors.push(c);
        }

        for (let i = 0; i < route.waypoints.length; i++) {
          rawPoints.push(route.waypoints[i]);
          let c;
          if (route.isTanker) {
            c = TANKER_COLORS[route.tankerPhase] || TANKER_DEFAULT;
          } else if (route.legIndices && route.legIndices[i] != null) {
            c = LEG_COLORS[route.legIndices[i] % LEG_COLORS.length];
          } else if (route.pending) {
            c = PENDING_COLOR;
          } else {
            c = LEG_COLORS[0];
          }
          rawColors.push(c);
        }

        // Convert to 3D and interpolate for smooth globe-following arcs
        const verts = [];
        const vertColors = [];
        for (let i = 0; i < rawPoints.length; i++) {
          const a = latLonToVector3({ lat: rawPoints[i].lat, lon: rawPoints[i].lon, radius: lineRadius });
          verts.push(a);
          vertColors.push(rawColors[i]);
          if (i < rawPoints.length - 1) {
            const b = latLonToVector3({ lat: rawPoints[i + 1].lat, lon: rawPoints[i + 1].lon, radius: lineRadius });
            const angle = a.angleTo(b);
            const steps = Math.max(1, Math.ceil(angle / 0.02));
            for (let s = 1; s < steps; s++) {
              verts.push(a.clone().lerp(b, s / steps).normalize().multiplyScalar(lineRadius));
              vertColors.push(rawColors[i]);
            }
          }
        }

        const totalVerts = verts.length;
        const positions = new Float32Array(totalVerts * 3);
        const colors = new Float32Array(totalVerts * 3);
        for (let i = 0; i < totalVerts; i++) {
          positions[i * 3] = verts[i].x;
          positions[i * 3 + 1] = verts[i].y;
          positions[i * 3 + 2] = verts[i].z;
          colors[i * 3] = vertColors[i].r;
          colors[i * 3 + 1] = vertColors[i].g;
          colors[i * 3 + 2] = vertColors[i].b;
        }

        if (!routeLine) {
          const geometry = new THREE.BufferGeometry();
          const material = new THREE.LineBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0.45,
            depthWrite: false,
          });
          const line = new THREE.Line(geometry, material);
          earthSystem.group.add(line);
          routeLine = { line, geometry, material, maxVerts: 0 };
          airRouteLines.set(route.id, routeLine);
        }

        routeLine.material.opacity = route.pending ? (route.isTanker ? 0.5 : 0.7) : route.isTanker ? 0.3 : 0.45;

        // Reuse buffer if large enough, otherwise allocate new
        const posAttr = routeLine.geometry.getAttribute('position');
        if (posAttr && routeLine.maxVerts >= totalVerts) {
          posAttr.array.set(positions);
          posAttr.needsUpdate = true;
          const colAttr = routeLine.geometry.getAttribute('color');
          colAttr.array.set(colors);
          colAttr.needsUpdate = true;
          routeLine.geometry.setDrawRange(0, totalVerts);
        } else {
          // Allocate with headroom to reduce reallocations
          const allocSize = Math.max(totalVerts, 256);
          routeLine.maxVerts = allocSize;
          const posBuf = new Float32Array(allocSize * 3);
          posBuf.set(positions);
          const pa = new THREE.BufferAttribute(posBuf, 3);
          pa.setUsage(THREE.DynamicDrawUsage);
          routeLine.geometry.setAttribute('position', pa);
          const colBuf = new Float32Array(allocSize * 3);
          colBuf.set(colors);
          const ca = new THREE.BufferAttribute(colBuf, 3);
          ca.setUsage(THREE.DynamicDrawUsage);
          routeLine.geometry.setAttribute('color', ca);
          routeLine.geometry.setDrawRange(0, totalVerts);
        }

        routeLine.line.visible = airVisible && totalVerts >= 2;
      }

      for (const [id, routeLine] of airRouteLines.entries()) {
        if (activeIds.has(id)) {
          continue;
        }
        routeLine.line.removeFromParent();
        routeLine.geometry.dispose();
        routeLine.material.dispose();
        airRouteLines.delete(id);
      }
    },
    // pickAirUnit removed — aircraft picking now via 2D overlay
    setAirVisibility(enabled) {
      airVisible = Boolean(enabled);
      for (const routeLine of airRouteLines.values()) {
        routeLine.line.visible = airVisible;
      }
      onInvalidate();
    },
    pickNavalUnit(raycaster) {
      let closestId = null;
      let closestDist = Infinity;

      for (const [id, actor] of navalActors.entries()) {
        if (!actor.object3d.visible) {
          continue;
        }
        const intersects = raycaster.intersectObject(actor.object3d, true);
        if (intersects.length > 0 && intersects[0].distance < closestDist) {
          closestDist = intersects[0].distance;
          closestId = id;
        }
      }

      return closestId;
    },
    pickMissile(raycaster) {
      let closestId = null;
      let closestDist = Infinity;

      for (const [id, actor] of missileActors.entries()) {
        if (!actor.missile.object3d.visible) {
          continue;
        }
        // Use a generous hit sphere — missiles are tiny at orbital distances
        const pos = actor.missile.object3d.position;
        const camDist = raycaster.ray.origin.distanceTo(pos);
        const threshold = Math.max(camDist * 0.02, 0.15);
        const closest = new THREE.Vector3();
        raycaster.ray.closestPointToPoint(pos, closest);
        const dist = closest.distanceTo(pos);
        if (dist < threshold && camDist < closestDist) {
          closestDist = camDist;
          closestId = id;
        }
      }

      return closestId;
    },
    setNavalVisibility(enabled) {
      navalVisible = Boolean(enabled);
      for (const actor of navalActors.values()) {
        actor.object3d.visible = navalVisible;
      }
      for (const routeLine of navalRouteLines.values()) {
        routeLine.line.visible = navalVisible;
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

function createMissileModelForType(missileType) {
  if (missileType === 'cruise_subsonic') return createCruiseMissile();
  if (missileType === 'cruise_supersonic') return createSupersonicCruiseMissile();
  if (missileType === 'hypersonic_glide') return createHypersonicMissile();
  if (missileType === 'hypersonic_cruise') return createScramjetMissile();
  if (missileType === 'rv') return createReentryVehicleModel();
  return createMissile();
}

// Standalone RV model for MIRVed warheads — just the conical RV with reentry glow
function createReentryVehicleModel() {
  const root = new THREE.Group();
  const rvLength = 0.000011;
  const rvRadius = 0.0000022;

  const ablativeMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.7, metalness: 0.15 });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x8b98ab, roughness: 0.36, metalness: 0.62 });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xff9d4d, transparent: true, opacity: 0, depthWrite: false });

  // RV cone (triangular cross-section like the ICBM warhead)
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(rvRadius, rvLength * 0.82, 3, 1, false),
    ablativeMat,
  );
  cone.rotation.y = Math.PI / 6;
  root.add(cone);

  // Nose tip
  const tip = new THREE.Mesh(
    new THREE.ConeGeometry(rvRadius * 0.25, rvLength * 0.2, 3, 1, false),
    metalMat,
  );
  tip.rotation.y = Math.PI / 6;
  tip.position.y = rvLength * 0.42;
  root.add(tip);

  // Reentry heating glow
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(rvRadius * 1.8, 10, 10),
    glowMat,
  );
  glow.position.y = -rvLength * 0.15;
  root.add(glow);

  // Plasma trail (elongated behind RV)
  const trail = new THREE.Mesh(
    new THREE.ConeGeometry(rvRadius * 0.8, rvLength * 1.5, 8, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xff6622, transparent: true, opacity: 0, depthWrite: false }),
  );
  trail.rotation.x = Math.PI;
  trail.position.y = -rvLength * 0.5;
  root.add(trail);

  root.visible = false;

  return {
    object3d: root,
    forwardAxis: new THREE.Vector3(0, 1, 0),
    nativeLength: rvLength,
    setVisualState(snapshot, elapsedSeconds = 0) {
      const phase = snapshot?.phase ?? 'idle';
      root.visible = snapshot?.visible ?? false;

      // Reentry glow: brilliant during terminal phase (Mach 15-23)
      const isReentry = phase === 'terminal' || phase === 'impact';
      const speedKmS = snapshot?.speedKmS ?? 0;
      const machApprox = speedKmS * 1000 / 343;

      if (isReentry && machApprox > 5) {
        const intensity = Math.min((machApprox - 5) / 18, 1);
        glow.material.opacity = intensity * 0.5;
        glow.material.color.setHex(machApprox > 15 ? 0xffeedd : 0xff9d4d);

        // Plasma trail — long and bright during reentry
        trail.material.opacity = intensity * 0.35;
        trail.visible = true;
        const trailLen = THREE.MathUtils.lerp(1, 3, intensity);
        trail.scale.set(1, trailLen, 1);
      } else {
        glow.material.opacity = 0;
        trail.material.opacity = 0;
        trail.visible = false;
      }
    },
  };
}

function ensureMissileActor({
  id,
  missileType,
  missileActors,
  scene,
  earthGroup,
  renderConfig,
  trajectoryVisibility,
  isEnemy,
}) {
  let actor = missileActors.get(id);
  if (actor) {
    return actor;
  }

  const missile = createMissileModelForType(missileType);
  scene.add(missile.object3d);

  // Trail colors by missile type — distinct colors aid situational awareness
  const TRAIL_COLORS = {
    icbm:              { actual: 0xffbb74, predicted: 0x74dcff },  // orange / cyan
    rv:                { actual: 0xff7744, predicted: 0xff5522 },  // bright orange-red (reentry)
    cruise_subsonic:   { actual: 0x66dd88, predicted: 0x44aa66 },  // green (stealthy)
    cruise_supersonic: { actual: 0xff66aa, predicted: 0xcc4488 },  // magenta (aggressive)
    hypersonic_glide:  { actual: 0xffaa33, predicted: 0xcc8822 },  // amber (hot)
    hypersonic_cruise: { actual: 0xff6644, predicted: 0xcc4422 },  // red-orange
  };
  const trailPreset = TRAIL_COLORS[missileType] ?? TRAIL_COLORS.icbm;
  const pathColor = isEnemy ? 0xff4444 : trailPreset.actual;
  const pathOpacity = isEnemy ? 0.6 : renderConfig.missile.actualPathOpacity;
  const predColor = isEnemy ? 0xff4444 : trailPreset.predicted;
  const predOpacity = isEnemy ? 0.25 : renderConfig.missile.predictedPathOpacity;

  const actualPath = createTrajectoryLine({
    parent: earthGroup,
    maxPoints: renderConfig.trail.points,
    color: pathColor,
    opacity: pathOpacity,
  });
  const predictedPath = createTrajectoryLine({
    parent: earthGroup,
    maxPoints: renderConfig.trail.points,
    color: predColor,
    opacity: predOpacity,
  });
  actualPath.line.visible = trajectoryVisibility.actual;
  predictedPath.line.visible = trajectoryVisibility.predicted;

  actor = {
    missile,
    actualPath,
    predictedPath,
    isEnemy: !!isEnemy,
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
    // Visual size varies by missile type — all use the same formula
    // but with different multipliers so they appear proportional on screen.
    // The key: targetVisualLength is the desired screen-space size,
    // and we divide by nativeLength to get the uniform scale factor.
    // So missiles with smaller native geometry DON'T get blown up.
    const mtype = snapshot.missileType;
    const isCruise = mtype?.startsWith('cruise');
    const isHypersonic = mtype?.startsWith('hypersonic');
    const isRV = mtype === 'rv';
    // All non-ICBM types use the same base sizing to avoid inflation
    const sizeMultiplier = 0.012;
    const sizeMin = isRV ? 0.02 : isCruise ? 0.025 : 0.035;
    const sizeMax = isRV ? 0.06 : isCruise ? 0.10 : isHypersonic ? 0.14 : 0.22;
    const targetVisualLength = THREE.MathUtils.clamp(cameraDistance * sizeMultiplier, sizeMin, sizeMax);
    const visualScale = targetVisualLength / actor.missile.nativeLength;
    const radialLift = Math.max(targetVisualLength * 0.18, isCruise ? 0.002 : isRV ? 0.004 : 0.010);
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

  // Stage separation effects — only for ballistic ICBMs (they have multi-stage rockets)
  const isBallisticMissile = !snapshot.missileType || snapshot.missileType === 'icbm';
  if (isBallisticMissile) {
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
