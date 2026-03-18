import * as THREE from 'three';
import { latLonToVector3 } from '../geo/geoMath.js';
import { createInterceptorMissile } from '../entities/createInterceptorMissile.js';

const RADAR_ICON_COLOR = 'rgba(125, 228, 255, 0.92)';
const NGI_ICON_COLOR = 'rgba(255, 179, 71, 0.92)';
const DETECTION_LINE_COLOR = 0x44dd88;
const DATALINK_LINE_COLOR = 0x7de4ff;
const ICON_SIZE = 18;

export function createDefenseOverlaySystem({
  document,
  mountNode,
  renderer,
  camera,
  earthGroup,
  scene,
  worldConfig,
}) {
  // ── 2D canvas overlay for icons ──────────────────────────────────────
  const canvas = document.createElement('canvas');
  canvas.className = 'defense-overlay';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText =
    'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:4;';
  mountNode.parentElement.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  let canvasWidth = 0;
  let canvasHeight = 0;
  let visible = true;

  // Pre-render SVG icons
  let radarIcon = null;
  let ngiIcon = null;
  let sbirsIcon = null;
  loadTintedIcon('/assets/military/assets/spaceforce-radar.svg', RADAR_ICON_COLOR, (img) => { radarIcon = img; });
  loadTintedIcon('/assets/military/assets/spaceforce-ngi.svg', NGI_ICON_COLOR, (img) => { ngiIcon = img; });
  loadTintedIcon('/assets/military/assets/spaceforce-sbirs.svg', 'rgba(125, 228, 255, 0.85)', (img) => { sbirsIcon = img; });

  // ── Explosion effects ─────────────────────────────────────────────────
  const explosions = []; // { mesh, birthTime, position }

  // ── 3D groups for lines and interceptor missiles ─────────────────────
  const linesGroup = new THREE.Group();
  scene.add(linesGroup);

  const interceptorActors = new Map();

  let selectedInterceptorId = null;

  // Reusable vectors
  const localVector = new THREE.Vector3();
  const worldPosition = new THREE.Vector3();
  const worldNormal = new THREE.Vector3();
  const toCamera = new THREE.Vector3();
  const projected = new THREE.Vector3();
  const tmpQuaternion = new THREE.Quaternion();

  return {
    setVisible(v) {
      visible = v;
      canvas.style.display = v ? '' : 'none';
      linesGroup.visible = v;
    },
    setSelectedInterceptor(id) {
      selectedInterceptorId = id ?? null;
    },
    getSelectedInterceptorId() {
      return selectedInterceptorId;
    },
    getInterceptorActors() {
      return interceptorActors;
    },
    spawnExplosion(position) {
      // Bright flash sphere + expanding ring
      const group = new THREE.Group();
      group.position.copy(position);

      const flash = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0xffcc44, transparent: true, opacity: 1.0, depthWrite: false }),
      );
      group.add(flash);

      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.02, 0.08, 24),
        new THREE.MeshBasicMaterial({ color: 0xff8844, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }),
      );
      // Face the camera
      ring.lookAt(camera.position);
      group.add(ring);

      const outerGlow = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 10, 10),
        new THREE.MeshBasicMaterial({ color: 0xff6622, transparent: true, opacity: 0.3, depthWrite: false }),
      );
      group.add(outerGlow);

      scene.add(group);
      explosions.push({ group, flash, ring, outerGlow, birthTime: performance.now() / 1000 });
    },
    render({ radarSnapshot, defenseSnapshot, missileSnapshots, elapsedSeconds }) {
      if (!visible) return;

      syncCanvasSize();
      const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);

      // Draw radar icons
      for (const radar of radarSnapshot.groundRadars) {
        drawIcon(radar.latitude, radar.longitude, radarIcon, ICON_SIZE, dpr);
      }

      // Draw NGI icons with interceptor count
      for (const site of radarSnapshot.interceptorSites ?? []) {
        drawIcon(site.latitude, site.longitude, ngiIcon, ICON_SIZE, dpr);
        // Badge with remaining count
        const screen = projectLatLon(site.latitude, site.longitude);
        if (screen) {
          ctx.font = `bold ${Math.round(9 * dpr)}px monospace`;
          ctx.fillStyle = NGI_ICON_COLOR;
          ctx.textAlign = 'center';
          ctx.fillText(
            `${site.interceptorsRemaining}/${site.interceptorsTotal}`,
            screen.x * dpr,
            (screen.y + ICON_SIZE + 6) * dpr,
          );
        }
      }

      // Draw SBIRS satellite icons (clickable when zoomed out)
      for (const satellite of radarSnapshot.satellites ?? []) {
        if (!satellite.operational) continue;
        if (!satellite.position) continue;
        // Project the 3D satellite position to screen
        const satScreen = projectWorldPos(satellite.position);
        if (satScreen) {
          const s = ICON_SIZE * dpr;
          if (sbirsIcon) {
            ctx.drawImage(sbirsIcon, satScreen.x * dpr - s / 2, satScreen.y * dpr - s / 2, s, s);
          }
          ctx.font = `${Math.round(8 * dpr)}px "Space Grotesk", monospace`;
          ctx.fillStyle = 'rgba(125, 228, 255, 0.7)';
          ctx.textAlign = 'center';
          ctx.fillText(
            satellite.id,
            satScreen.x * dpr,
            (satScreen.y + ICON_SIZE + 5) * dpr,
          );
        }
      }

      // ── 3D detection and data-link lines ─────────────────────────
      clearGroup(linesGroup);

      // Green tracking lines: interceptor → ICBM for active engagements,
      // radar → ICBM for unengaged tracked threats
      const engagedThreatIds = new Set();
      for (const intc of defenseSnapshot.interceptors) {
        if (intc.phase === 'complete' || intc.isKV) continue;
        engagedThreatIds.add(intc.targetMissileId);

        // Green line from the interceptor to its target ICBM
        const missile = missileSnapshots.find((m) => m.id === intc.targetMissileId && m.active);
        if (missile) {
          linesGroup.add(new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([intc.position, missile.position]),
            new THREE.LineBasicMaterial({ color: DETECTION_LINE_COLOR, transparent: true, opacity: 0.35 }),
          ));
        }
      }

      // Detection lines for threats with NO active interceptor
      for (const threat of defenseSnapshot.threats) {
        if (threat.status === 'undetected') continue;
        if (engagedThreatIds.has(threat.missileId)) continue;
        const missile = missileSnapshots.find((m) => m.id === threat.missileId && m.active);
        if (!missile) continue;

        if (threat.status === 'radar-tracked' && threat.nearestRadarLat !== null) {
          // Green line from radar to ICBM
          const radarWorldPos = latLonToWorld(threat.nearestRadarLat, threat.nearestRadarLon);
          linesGroup.add(new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([radarWorldPos, missile.position]),
            new THREE.LineBasicMaterial({ color: DETECTION_LINE_COLOR, transparent: true, opacity: 0.35 }),
          ));
        } else if (threat.status === 'satellite-tracked') {
          // Fainter line for satellite-only tracking (no ground radar)
          // Find the detecting satellite
          const satId = [...(threat.detectedByIds ?? [])].at(-1);
          const sat = radarSnapshot.satellites?.find((s) => s.id === satId);
          if (sat?.position) {
            linesGroup.add(new THREE.Line(
              new THREE.BufferGeometry().setFromPoints([sat.position, missile.position]),
              new THREE.LineBasicMaterial({ color: 0x44bbff, transparent: true, opacity: 0.2 }),
            ));
          }
        }
      }

      // Ghost tracks: gray dashed predicted trajectory for threats that lost detection.
      // Shows where the missile PROBABLY is based on the last known trajectory.
      // Fades with age as uncertainty grows.
      for (const threat of defenseSnapshot.threats) {
        if (!threat.ghostPath || threat.ghostPath.length < 2) continue;
        // Only show ghost when missile is NOT actively visible
        if (threat.status === 'radar-tracked') continue;

        const fadeT = Math.min(threat.ghostAge / 300, 1); // fade over 5 minutes
        const opacity = 0.35 * (1 - fadeT);
        if (opacity < 0.02) continue;

        const ghostGeo = new THREE.BufferGeometry().setFromPoints(threat.ghostPath);
        const ghostLine = new THREE.Line(ghostGeo, new THREE.LineDashedMaterial({
          color: 0x888888,
          transparent: true,
          opacity,
          dashSize: 0.3,
          gapSize: 0.15,
        }));
        ghostLine.computeLineDistances();
        linesGroup.add(ghostLine);
      }

      // Selected interceptor: show blue dotted line to target only (no predicted trajectory/impact)
      if (selectedInterceptorId) {
        const selIntc = defenseSnapshot.interceptors.find((i) => i.id === selectedInterceptorId && i.phase !== 'complete');
        if (selIntc) {
          const targetMissile = missileSnapshots.find((m) => m.id === selIntc.targetMissileId && m.active);
          if (targetMissile) {
            const blueGeo = new THREE.BufferGeometry().setFromPoints([selIntc.position, targetMissile.position]);
            const blueLine = new THREE.Line(blueGeo, new THREE.LineDashedMaterial({
              color: 0x4488ff,
              transparent: true,
              opacity: 0.5,
              dashSize: 0.2,
              gapSize: 0.1,
            }));
            blueLine.computeLineDistances();
            linesGroup.add(blueLine);
          }
        } else {
          selectedInterceptorId = null;
        }
      }

      // ── 3D interceptor missile actors ────────────────────────────
      const activeInterceptorIds = new Set();
      for (const intc of defenseSnapshot.interceptors) {
        if (intc.phase === 'complete') continue;
        activeInterceptorIds.add(intc.id);

        let actor = interceptorActors.get(intc.id);
        if (!actor) {
          const asset = createInterceptorMissile();
          scene.add(asset.object3d);
          // Invisible hit sphere for easier clicking — much larger than the visual
          const hitSphere = new THREE.Mesh(
            new THREE.SphereGeometry(0.5, 6, 6),
            new THREE.MeshBasicMaterial({ visible: false, depthWrite: false }),
          );
          asset.object3d.add(hitSphere);
          actor = { asset, hitSphere };
          interceptorActors.set(intc.id, actor);
        }

        actor.asset.object3d.visible = true;

        // Position and orient — noticeably smaller than ICBM RV
        const radial = intc.position.clone().normalize();
        const cameraDistance = camera.position.distanceTo(intc.position);
        const targetVisualLength = THREE.MathUtils.clamp(cameraDistance * 0.003, 0.012, 0.05);
        const visualScale = targetVisualLength / actor.asset.nativeLength;
        const radialLift = Math.max(targetVisualLength * 0.1, 0.005);

        actor.asset.object3d.scale.setScalar(visualScale);
        actor.asset.object3d.position.copy(intc.position).addScaledVector(radial, radialLift);

        // Scale hit sphere inversely so it stays a fixed world size regardless of visual scale
        const hitRadius = THREE.MathUtils.clamp(cameraDistance * 0.015, 0.3, 1.5);
        actor.hitSphere.scale.setScalar(hitRadius / (visualScale * 0.5));

        if (intc.velocity.lengthSq() > 1e-12) {
          tmpQuaternion.setFromUnitVectors(actor.asset.forwardAxis, intc.velocity.clone().normalize());
          actor.asset.object3d.quaternion.copy(tmpQuaternion);
        }

        const burnTime = intc.burnTimeSeconds;
        const isBurning = intc.flightTimeSeconds < burnTime;
        actor.asset.setEngineOn(isBurning, elapsedSeconds);
        // Stage 1 separates at 35% of burn time
        actor.asset.setStageSeparated(intc.flightTimeSeconds > burnTime * 0.35);
        
        // Fairing separation happens at 85% of burn time
        if (actor.asset.setFairingSeparation) {
            const fairingStart = burnTime * 0.85;
            const fairingDuration = burnTime * 0.05;
            const progress = THREE.MathUtils.clamp((intc.flightTimeSeconds - fairingStart) / fairingDuration, 0, 1);
            actor.asset.setFairingSeparation(progress);
        }
        
        // Handle MKV Kill Vehicle mode
        if (intc.isKV && actor.asset.setKVMode) {
            actor.asset.setKVMode(true);
        }
      }

      // Clean up completed interceptor actors
      for (const [id, actor] of interceptorActors.entries()) {
        if (activeInterceptorIds.has(id)) continue;
        actor.asset.object3d.removeFromParent();
        interceptorActors.delete(id);
      }

      // Update explosions
      const now = performance.now() / 1000;
      for (let i = explosions.length - 1; i >= 0; i--) {
        const exp = explosions[i];
        const age = now - exp.birthTime;
        const duration = 2.0;

        if (age > duration) {
          exp.group.removeFromParent();
          explosions.splice(i, 1);
          continue;
        }

        const t = age / duration;
        // Flash shrinks and fades
        const flashScale = 1 + t * 2;
        exp.flash.scale.setScalar(flashScale);
        exp.flash.material.opacity = Math.max(0, 1 - t * 2);

        // Ring expands and fades
        exp.ring.scale.setScalar(1 + t * 6);
        exp.ring.material.opacity = Math.max(0, 0.7 * (1 - t));
        exp.ring.lookAt(camera.position);

        // Outer glow expands and fades
        exp.outerGlow.scale.setScalar(1 + t * 4);
        exp.outerGlow.material.opacity = Math.max(0, 0.3 * (1 - t * 1.5));
      }
    },
    dispose() {
      canvas.remove();
      clearGroup(linesGroup);
      linesGroup.removeFromParent();
      for (const actor of interceptorActors.values()) {
        actor.asset.object3d.removeFromParent();
      }
      interceptorActors.clear();
      for (const exp of explosions) {
        exp.group.removeFromParent();
      }
      explosions.length = 0;
    },
  };

  function syncCanvasSize() {
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    const w = renderer.domElement.clientWidth;
    const h = renderer.domElement.clientHeight;
    const pw = Math.round(w * dpr);
    const ph = Math.round(h * dpr);
    if (pw !== canvasWidth || ph !== canvasHeight) {
      canvasWidth = pw;
      canvasHeight = ph;
      canvas.width = pw;
      canvas.height = ph;
    }
  }

  function projectLatLon(lat, lon) {
    latLonToVector3({ lat, lon, radius: worldConfig.earthRadius * 1.002, out: localVector });
    worldPosition.copy(localVector).applyQuaternion(earthGroup.quaternion);
    worldNormal.copy(localVector).normalize().applyQuaternion(earthGroup.quaternion).normalize();
    toCamera.copy(camera.position).sub(worldPosition).normalize();

    if (worldNormal.dot(toCamera) < 0.06) return null;

    projected.copy(worldPosition).project(camera);
    if (projected.z < -1 || projected.z > 1 || Math.abs(projected.x) > 1.1 || Math.abs(projected.y) > 1.1) {
      return null;
    }

    const w = renderer.domElement.clientWidth;
    const h = renderer.domElement.clientHeight;
    return {
      x: (projected.x * 0.5 + 0.5) * w,
      y: (-projected.y * 0.5 + 0.5) * h,
    };
  }

  function projectWorldPos(pos) {
    projected.copy(pos).project(camera);
    if (projected.z < -1 || projected.z > 1 || Math.abs(projected.x) > 1.1 || Math.abs(projected.y) > 1.1) {
      return null;
    }
    const w = renderer.domElement.clientWidth;
    const h = renderer.domElement.clientHeight;
    return {
      x: (projected.x * 0.5 + 0.5) * w,
      y: (-projected.y * 0.5 + 0.5) * h,
    };
  }

  function drawIcon(lat, lon, icon, size, dpr) {
    if (!icon) return;
    const screen = projectLatLon(lat, lon);
    if (!screen) return;

    const s = size * dpr;
    ctx.drawImage(icon, screen.x * dpr - s / 2, screen.y * dpr - s / 2, s, s);
  }

  function latLonToWorld(lat, lon) {
    latLonToVector3({ lat, lon, radius: worldConfig.earthRadius * 1.005, out: localVector });
    return localVector.clone().applyQuaternion(earthGroup.quaternion);
  }

  function loadTintedIcon(src, tintColor, callback) {
    const img = new Image();
    img.onload = () => {
      const size = 64;
      const offscreen = document.createElement('canvas');
      offscreen.width = size;
      offscreen.height = size;
      const c = offscreen.getContext('2d');
      c.drawImage(img, 0, 0, size, size);
      c.globalCompositeOperation = 'source-in';
      c.fillStyle = tintColor;
      c.fillRect(0, 0, size, size);
      callback(offscreen);
    };
    img.src = src;
  }
}

function clearGroup(group) {
  while (group.children.length > 0) {
    const child = group.children[0];
    if (child.geometry) child.geometry.dispose();
    group.remove(child);
  }
}
