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
    'position:absolute;top:0;left:0;pointer-events:none;z-index:4;';
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
      explosions.push({ group, flash, ring, outerGlow, birthTime: performance.now() / 1000, type: 'intercept' });
    },
    spawnGroundImpact(position, warheadId = 'nuclear_300kt') {
      // Warhead-specific ground impact effects.
      // Each category gets a distinct visual signature.
      const category = getWarheadCategory(warheadId);
      const group = new THREE.Group();
      group.position.copy(position);
      const radial = position.clone().normalize();
      const up = new THREE.Vector3(0, 1, 0);
      const quat = new THREE.Quaternion().setFromUnitVectors(up, radial);
      const now = performance.now() / 1000;

      if (category === 'nuclear') {
        const yieldKt = getWarheadYield(warheadId);
        const s = Math.pow(yieldKt / 300, 1 / 3);
        const exp = buildNuclearExplosion(group, s, quat, radial);
        scene.add(group);
        explosions.push({ ...exp, group, birthTime: now, type: 'nuclear', yieldScale: s });

      } else if (category === 'thermobaric') {
        const exp = buildThermobaricExplosion(group, quat, radial);
        scene.add(group);
        explosions.push({ ...exp, group, birthTime: now, type: 'thermobaric' });

      } else if (category === 'emp') {
        const exp = buildEmpExplosion(group, quat, radial);
        scene.add(group);
        explosions.push({ ...exp, group, birthTime: now, type: 'emp' });

      } else if (warheadId === 'cluster') {
        // Cluster: multiple small impacts spread over footprint
        const exp = buildClusterImpact(group, position, radial, quat);
        scene.add(group);
        explosions.push({ ...exp, group, birthTime: now, type: 'cluster' });

      } else if (warheadId === 'conventional_penetrator') {
        const exp = buildBunkerBusterExplosion(group, quat, radial);
        scene.add(group);
        explosions.push({ ...exp, group, birthTime: now, type: 'bunkerbuster' });

      } else {
        // Default: conventional HE
        const exp = buildConventionalExplosion(group, quat, radial);
        scene.add(group);
        explosions.push({ ...exp, group, birthTime: now, type: 'conventional' });
      }
    },
    render({ radarSnapshot, defenseSnapshot, missileSnapshots, elapsedSeconds }) {
      if (!visible) return;

      syncCanvasSize();
      const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);


      // Draw radar icons (all radars, including deploying)
      for (const radar of radarSnapshot.allGroundRadars ?? radarSnapshot.groundRadars) {
        const deploying = radar.status === 'deploying';
        drawIcon(radar.latitude, radar.longitude, radarIcon, ICON_SIZE, dpr, deploying ? 0.4 : 1.0);
        if (deploying) {
          const screen = projectLatLon(radar.latitude, radar.longitude);
          if (screen) {
            drawDeployArcAt(screen, ICON_SIZE, dpr, radar.deployProgress / radar.deployDuration, RADAR_ICON_COLOR);
          }
        }
      }

      // Draw NGI icons with interceptor count (all sites, including deploying)
      for (const site of radarSnapshot.allInterceptorSites ?? radarSnapshot.interceptorSites ?? []) {
        const deploying = site.status === 'deploying';
        drawIcon(site.latitude, site.longitude, ngiIcon, ICON_SIZE, dpr, deploying ? 0.4 : 1.0);
        const screen = projectLatLon(site.latitude, site.longitude);
        if (!screen) continue;
        if (deploying) {
          drawDeployArcAt(screen, ICON_SIZE, dpr, site.deployProgress / site.deployDuration, NGI_ICON_COLOR);
        } else {
          // Badge with remaining count (only when operational)
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
      const DURATIONS = {
        intercept: 2, nuclear: 8, conventional: 1.5,
        thermobaric: 3, emp: 4, cluster: 3, bunkerbuster: 2.5,
      };
      for (let i = explosions.length - 1; i >= 0; i--) {
        const exp = explosions[i];
        const age = now - exp.birthTime;
        const dur = DURATIONS[exp.type] ?? 2;

        if (age > dur) {
          exp.group.removeFromParent();
          explosions.splice(i, 1);
          continue;
        }
        const t = age / dur;

        if (exp.type === 'intercept') {
          exp.flash.scale.setScalar(1 + t * 2);
          exp.flash.material.opacity = Math.max(0, 1 - t * 2);
          exp.ring.scale.setScalar(1 + t * 6);
          exp.ring.material.opacity = Math.max(0, 0.7 * (1 - t));
          exp.ring.lookAt(camera.position);
          exp.outerGlow.scale.setScalar(1 + t * 4);
          exp.outerGlow.material.opacity = Math.max(0, 0.3 * (1 - t * 1.5));
        } else if (exp.type === 'nuclear') {
          updateNuclearExplosion(exp, t);
        } else if (exp.type === 'conventional') {
          updateConventionalExplosion(exp, t);
        } else if (exp.type === 'thermobaric') {
          updateThermobaricExplosion(exp, t);
        } else if (exp.type === 'emp') {
          updateEmpExplosion(exp, t, camera);
        } else if (exp.type === 'cluster') {
          updateClusterImpact(exp, t);
        } else if (exp.type === 'bunkerbuster') {
          updateBunkerBusterExplosion(exp, t);
        }
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
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }
  }

  function projectLatLon(lat, lon) {
    latLonToVector3({ lat, lon, radius: worldConfig.earthRadius * 1.002, out: localVector });
    worldPosition.copy(localVector).applyQuaternion(earthGroup.quaternion);
    worldNormal.copy(localVector).normalize().applyQuaternion(earthGroup.quaternion).normalize();
    toCamera.copy(camera.position).sub(worldPosition).normalize();

    // Tighter horizon cutoff prevents icons at the limb from jumping wildly.
    // Points near the edge of the visible hemisphere project to unstable
    // screen positions — cull them aggressively.
    if (worldNormal.dot(toCamera) < 0.15) return null;

    projected.copy(worldPosition).project(camera);
    if (projected.z < -1 || projected.z > 1 || Math.abs(projected.x) > 1.05 || Math.abs(projected.y) > 1.05) {
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

  function drawIcon(lat, lon, icon, size, dpr, opacity = 1.0) {
    if (!icon) return;
    const screen = projectLatLon(lat, lon);
    if (!screen) return;

    const s = size * dpr;
    const prevAlpha = ctx.globalAlpha;
    ctx.globalAlpha = opacity;
    ctx.drawImage(icon, screen.x * dpr - s / 2, screen.y * dpr - s / 2, s, s);
    ctx.globalAlpha = prevAlpha;
  }

  function drawDeployArcAt(screen, size, dpr, progress, color) {
    const cx = screen.x * dpr;
    const cy = screen.y * dpr;
    const radius = (size * dpr) / 2 + 3 * dpr;
    const startAngle = -Math.PI / 2;
    const endAngle = startAngle + Math.PI * 2 * Math.min(progress, 1);

    ctx.beginPath();
    ctx.arc(cx, cy, radius, startAngle, endAngle);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2 * dpr;
    ctx.stroke();
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

// ── Warhead category helpers ────────────────────────────────────────
function getWarheadCategory(warheadId) {
  const nuclear = ['nuclear_300kt', 'nuclear_800kt', 'nuclear_5kt'];
  if (nuclear.includes(warheadId)) return 'nuclear';
  if (warheadId === 'thermobaric') return 'thermobaric';
  if (warheadId === 'emp') return 'emp';
  if (warheadId === 'cluster') return 'cluster';
  return 'conventional';
}

function getWarheadYield(warheadId) {
  const yields = { nuclear_300kt: 300, nuclear_800kt: 800, nuclear_5kt: 5, emp: 10 };
  return yields[warheadId] ?? 0;
}

// ═══════════════════════════════════════════════════════════════════
// EXPLOSION BUILDERS — each returns the meshes needed for its update fn
// ═══════════════════════════════════════════════════════════════════

function buildNuclearExplosion(group, s, quat, radial) {
  const mk = (geo, color, opacity) => new THREE.Mesh(geo,
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));

  const fireball = mk(new THREE.SphereGeometry(0.005 * s, 14, 14), 0xffffff, 1.0);
  const thermal = mk(new THREE.SphereGeometry(0.012 * s, 12, 12), 0xff6600, 0.65);
  const shockwave = mk(new THREE.RingGeometry(0.003 * s, 0.01 * s, 28), 0xff9944, 0.7);
  shockwave.material.side = THREE.DoubleSide;
  const shockwave2 = mk(new THREE.RingGeometry(0.002 * s, 0.006 * s, 28), 0xffcc66, 0.45);
  shockwave2.material.side = THREE.DoubleSide;
  const column = mk(new THREE.CylinderGeometry(0.002 * s, 0.004 * s, 0.025 * s, 10), 0xff4400, 0.3);
  column.quaternion.copy(quat);
  column.position.copy(radial).multiplyScalar(0.012 * s);
  const cap = mk(new THREE.SphereGeometry(0.008 * s, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), 0xcc3300, 0.25);
  cap.quaternion.copy(quat);
  cap.position.copy(radial).multiplyScalar(0.024 * s);
  const outerGlow = mk(new THREE.SphereGeometry(0.02 * s, 10, 10), 0xff2200, 0.12);

  group.add(fireball, thermal, shockwave, shockwave2, column, cap, outerGlow);
  return { fireball, thermal, shockwave, shockwave2, column, cap, outerGlow };
}

function buildConventionalExplosion(group, quat, radial) {
  const mk = (geo, color, opacity) => new THREE.Mesh(geo,
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));

  // Sharp bright flash
  const flash = mk(new THREE.SphereGeometry(0.002, 10, 10), 0xffcc44, 1.0);
  // Small debris/smoke cloud (dark)
  const smoke = mk(new THREE.SphereGeometry(0.004, 8, 8), 0x332211, 0.4);
  // Ground scorch ring
  const scorch = mk(new THREE.RingGeometry(0.001, 0.005, 16), 0xff8844, 0.5);
  scorch.material.side = THREE.DoubleSide;

  group.add(flash, smoke, scorch);
  return { flash, smoke, scorch };
}

function buildThermobaricExplosion(group, quat, radial) {
  const mk = (geo, color, opacity) => new THREE.Mesh(geo,
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));

  // Large orange fireball (fuel-air)
  const fireball = mk(new THREE.SphereGeometry(0.006, 12, 12), 0xff7722, 0.8);
  // Overpressure ring expanding horizontally
  const pressureRing = mk(new THREE.RingGeometry(0.004, 0.012, 28), 0xffaa44, 0.6);
  pressureRing.material.side = THREE.DoubleSide;
  // Secondary fireball (delayed fuel ignition)
  const secondary = mk(new THREE.SphereGeometry(0.008, 10, 10), 0xff4400, 0.3);
  // Dark smoke column
  const smoke = mk(new THREE.CylinderGeometry(0.002, 0.005, 0.015, 8), 0x221100, 0.25);
  smoke.quaternion.copy(quat);
  smoke.position.copy(radial).multiplyScalar(0.008);

  group.add(fireball, pressureRing, secondary, smoke);
  return { fireball, pressureRing, secondary, smoke };
}

function buildEmpExplosion(group, quat, radial) {
  const mk = (geo, color, opacity) => new THREE.Mesh(geo,
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));

  // Brief white flash (small nuclear detonation at altitude)
  const flash = mk(new THREE.SphereGeometry(0.003, 10, 10), 0xccddff, 0.8);
  // Expanding electromagnetic pulse ring (blue-white, very large)
  const pulseRing = mk(new THREE.RingGeometry(0.005, 0.015, 36), 0x4488ff, 0.5);
  pulseRing.material.side = THREE.DoubleSide;
  // Secondary pulse ring (wider, fainter)
  const pulseRing2 = mk(new THREE.RingGeometry(0.003, 0.008, 36), 0x6699ff, 0.3);
  pulseRing2.material.side = THREE.DoubleSide;
  // Ionosphere glow
  const glow = mk(new THREE.SphereGeometry(0.01, 10, 10), 0x2244aa, 0.1);

  group.add(flash, pulseRing, pulseRing2, glow);
  return { flash, pulseRing, pulseRing2, glow };
}

function buildClusterImpact(group, position, radial, quat) {
  // Multiple small submunition impacts spread over a footprint
  const mk = (geo, color, opacity) => new THREE.Mesh(geo,
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));

  const submunitions = [];
  const count = 24;
  const spreadRadius = 0.003; // ~3 km footprint

  for (let i = 0; i < count; i++) {
    // Random offset in tangent plane
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * spreadRadius;
    // Compute tangent vectors
    const tangent1 = radial.clone().cross(new THREE.Vector3(0, 1, 0)).normalize();
    const tangent2 = radial.clone().cross(tangent1).normalize();
    const offset = tangent1.clone().multiplyScalar(Math.cos(angle) * dist)
      .add(tangent2.clone().multiplyScalar(Math.sin(angle) * dist));

    const flash = mk(new THREE.SphereGeometry(0.0005 + Math.random() * 0.0003, 6, 6), 0xffaa33, 0);
    flash.position.copy(offset);
    group.add(flash);

    submunitions.push({
      mesh: flash,
      delay: 0.1 + Math.random() * 0.6, // staggered impacts
      offset,
    });
  }

  // Parent casing break-apart flash
  const parentFlash = mk(new THREE.SphereGeometry(0.002, 8, 8), 0xffcc44, 0.6);
  group.add(parentFlash);

  return { submunitions, parentFlash };
}

function buildBunkerBusterExplosion(group, quat, radial) {
  const mk = (geo, color, opacity) => new THREE.Mesh(geo,
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));

  // Minimal surface flash (warhead penetrates before detonating)
  const flash = mk(new THREE.SphereGeometry(0.001, 8, 8), 0xffaa44, 0.4);
  // Ground heave — delayed bulge
  const heave = mk(new THREE.SphereGeometry(0.004, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.4), 0x886644, 0);
  heave.quaternion.copy(quat);
  // Debris ejection column
  const debris = mk(new THREE.CylinderGeometry(0.001, 0.003, 0.012, 8), 0x554433, 0);
  debris.quaternion.copy(quat);
  debris.position.copy(radial).multiplyScalar(0.006);
  // Dust ring
  const dust = mk(new THREE.RingGeometry(0.002, 0.006, 20), 0x998877, 0);
  dust.material.side = THREE.DoubleSide;

  group.add(flash, heave, debris, dust);
  return { flash, heave, debris, dust };
}

// ═══════════════════════════════════════════════════════════════════
// EXPLOSION UPDATE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

function updateNuclearExplosion(exp, t) {
  // Phase 1 (0-0.12): White flash
  // Phase 2 (0.12-0.35): Fireball + thermal pulse + shockwaves
  // Phase 3 (0.35-1.0): Mushroom cloud rises, everything fades
  exp.fireball.scale.setScalar(1 + t * 4);
  exp.fireball.material.opacity = Math.max(0, 1 - t * 5);

  exp.thermal.scale.setScalar(1 + Math.min(t * 2, 1) * 3);
  exp.thermal.material.opacity = Math.max(0, 0.65 * (1 - t * 1.1));

  const shockT = Math.min(t * 3, 1);
  exp.shockwave.scale.setScalar(1 + shockT * 14);
  exp.shockwave.material.opacity = Math.max(0, 0.7 * (1 - shockT));

  const sh2T = Math.max(0, Math.min((t - 0.08) * 2.5, 1));
  exp.shockwave2.scale.setScalar(1 + sh2T * 20);
  exp.shockwave2.material.opacity = Math.max(0, 0.45 * (1 - sh2T));

  const colT = Math.max(0, Math.min((t - 0.06) * 2, 1));
  exp.column.scale.set(1 + colT * 0.5, 1 + colT * 4, 1 + colT * 0.5);
  exp.column.material.opacity = Math.max(0, 0.3 * (1 - Math.max(0, t - 0.5) * 2));

  const capT = Math.max(0, Math.min((t - 0.12) * 1.6, 1));
  exp.cap.scale.setScalar(1 + capT * 3);
  exp.cap.material.opacity = Math.max(0, 0.25 * (1 - Math.max(0, t - 0.4) * 1.7));

  exp.outerGlow.scale.setScalar(1 + t * 5);
  exp.outerGlow.material.opacity = Math.max(0, 0.12 * (1 - t * 0.7));
}

function updateConventionalExplosion(exp, t) {
  // Quick flash, small debris cloud, fast fade
  exp.flash.scale.setScalar(1 + t * 6);
  exp.flash.material.opacity = Math.max(0, 1 - t * 4);

  exp.smoke.scale.setScalar(1 + t * 4);
  exp.smoke.material.opacity = Math.max(0, 0.4 * (1 - t * 0.8));

  const scorchT = Math.min(t * 4, 1);
  exp.scorch.scale.setScalar(1 + scorchT * 3);
  exp.scorch.material.opacity = Math.max(0, 0.5 * (1 - t));
}

function updateThermobaricExplosion(exp, t) {
  // Large expanding fireball, horizontal pressure wave, delayed secondary
  exp.fireball.scale.setScalar(1 + t * 5);
  exp.fireball.material.opacity = Math.max(0, 0.8 * (1 - t * 1.5));

  const ringT = Math.min(t * 2.5, 1);
  exp.pressureRing.scale.setScalar(1 + ringT * 10);
  exp.pressureRing.material.opacity = Math.max(0, 0.6 * (1 - ringT));

  // Secondary ignition delayed 0.2
  const secT = Math.max(0, (t - 0.15) * 2);
  exp.secondary.scale.setScalar(1 + Math.min(secT, 1) * 4);
  exp.secondary.material.opacity = Math.max(0, 0.35 * (1 - secT * 0.7));

  exp.smoke.scale.set(1 + t * 2, 1 + t * 5, 1 + t * 2);
  exp.smoke.material.opacity = Math.max(0, 0.25 * (1 - t * 0.6));
}

function updateEmpExplosion(exp, t, cam) {
  // Brief flash, then rapidly expanding pulse rings
  exp.flash.scale.setScalar(1 + t * 3);
  exp.flash.material.opacity = Math.max(0, 0.8 * (1 - t * 5));

  // Primary EMP ring — expands very quickly and far
  const ringT = Math.min(t * 1.5, 1);
  exp.pulseRing.scale.setScalar(1 + ringT * 60); // very large expansion
  exp.pulseRing.material.opacity = Math.max(0, 0.5 * (1 - ringT * 0.8));
  if (cam) exp.pulseRing.lookAt(cam.position);

  // Secondary ring — slower, wider
  const ring2T = Math.max(0, Math.min((t - 0.1) * 1.2, 1));
  exp.pulseRing2.scale.setScalar(1 + ring2T * 80);
  exp.pulseRing2.material.opacity = Math.max(0, 0.3 * (1 - ring2T * 0.7));
  if (cam) exp.pulseRing2.lookAt(cam.position);

  exp.glow.scale.setScalar(1 + t * 30);
  exp.glow.material.opacity = Math.max(0, 0.1 * (1 - t * 0.5));
}

function updateClusterImpact(exp, t) {
  // Parent casing flash fades quickly
  exp.parentFlash.scale.setScalar(1 + t * 3);
  exp.parentFlash.material.opacity = Math.max(0, 0.6 * (1 - t * 3));

  // Submunitions impact with staggered timing
  for (const sub of exp.submunitions) {
    if (t < sub.delay) {
      sub.mesh.material.opacity = 0;
      continue;
    }
    const subT = (t - sub.delay) / (1 - sub.delay + 0.01);
    sub.mesh.scale.setScalar(1 + subT * 4);
    sub.mesh.material.opacity = subT < 0.1
      ? Math.min(subT / 0.1, 1) * 0.8  // flash on
      : Math.max(0, 0.8 * (1 - (subT - 0.1) * 1.2)); // fade out
  }
}

function updateBunkerBusterExplosion(exp, t) {
  // Small surface flash, then delayed ground heave + debris ejection
  exp.flash.scale.setScalar(1 + t * 3);
  exp.flash.material.opacity = Math.max(0, 0.4 * (1 - t * 4));

  // Ground heave — delayed 0.3s, then rises and settles
  const heaveT = Math.max(0, (t - 0.2) * 2);
  const heaveScale = Math.min(heaveT, 1);
  exp.heave.scale.setScalar(1 + heaveScale * 2);
  exp.heave.material.opacity = Math.max(0, 0.35 * heaveScale * (1 - Math.max(0, heaveT - 0.5) * 1.5));

  // Debris column — delayed 0.3s
  const debrisT = Math.max(0, (t - 0.25) * 1.8);
  exp.debris.scale.set(1 + debrisT * 0.3, 1 + Math.min(debrisT, 1) * 5, 1 + debrisT * 0.3);
  exp.debris.material.opacity = Math.max(0, 0.4 * Math.min(debrisT, 1) * (1 - Math.max(0, debrisT - 0.5) * 1.5));

  // Dust ring — delayed 0.4s
  const dustT = Math.max(0, (t - 0.3) * 1.5);
  exp.dust.scale.setScalar(1 + Math.min(dustT, 1) * 6);
  exp.dust.material.opacity = Math.max(0, 0.3 * Math.min(dustT, 1) * (1 - Math.max(0, dustT - 0.4) * 1.8));
}

function clearGroup(group) {
  while (group.children.length > 0) {
    const child = group.children[0];
    if (child.geometry) child.geometry.dispose();
    group.remove(child);
  }
}
