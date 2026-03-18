import * as THREE from 'three';
import { latLonToVector3 } from '../geo/geoMath.js';

const SQUADRON_RING_COLOR = '107, 163, 255';
const TANKER_RING_COLOR = '96, 211, 148';

// Individual plane icon size (zoomed in)
const PLANE_ICON_SIZE = 22;
// Package icon size (zoomed out)
const PACKAGE_ICON_SIZE = 24;

export const SQUADRON_ICON_ALTITUDE_KM = 800;

const SVG_PATHS = {
  f35: '/assets/military/assets/airforce-plane-35.svg',
  b2: '/assets/military/assets/airforce-plane-b2.svg',
  tanker: '/assets/military/assets/airforce-plane-kc135.svg',
  cargo: '/assets/military/assets/airforce-plane-c17.svg',
  package: '/assets/military/assets/airforce-plane-package.svg',
};

export function createSquadronOverlaySystem({
  document,
  mountNode,
  renderer,
  camera,
  earthGroup,
  worldConfig,
}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'squadron-overlay';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText =
    'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:3;';
  mountNode.parentElement.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  const localVector = new THREE.Vector3();
  const worldPosition = new THREE.Vector3();
  const worldNormal = new THREE.Vector3();
  const toCamera = new THREE.Vector3();
  const projected = new THREE.Vector3();

  let canvasWidth = 0;
  let canvasHeight = 0;
  const sunDir = new THREE.Vector3();

  // Load all SVG icons
  const icons = {};
  for (const [key, path] of Object.entries(SVG_PATHS)) {
    const img = new Image();
    img.src = path;
    img.onload = () => { icons[key] = img; };
  }

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

  function projectPoint(lat, lon) {
    latLonToVector3({
      lat,
      lon,
      radius: worldConfig.earthRadius * 1.0015,
      out: localVector,
    });
    worldPosition.copy(localVector).applyQuaternion(earthGroup.quaternion);
    worldNormal
      .copy(localVector)
      .normalize()
      .applyQuaternion(earthGroup.quaternion)
      .normalize();
    toCamera.copy(camera.position).sub(worldPosition).normalize();

    if (worldNormal.dot(toCamera) < 0.08) {
      return null;
    }

    projected.copy(worldPosition).project(camera);
    if (
      projected.z < -1 ||
      projected.z > 1 ||
      Math.abs(projected.x) > 1.08 ||
      Math.abs(projected.y) > 1.08
    ) {
      return null;
    }

    return {
      x: (projected.x + 1) * 0.5 * canvasWidth,
      y: (1 - projected.y) * 0.5 * canvasHeight,
    };
  }

  function isNightSide(lat, lon) {
    latLonToVector3({
      lat,
      lon,
      radius: 1,
      out: localVector,
    });
    // Surface normal in world space
    localVector.applyQuaternion(earthGroup.quaternion);
    return localVector.dot(sunDir) < 0;
  }

  function applyNightBrightness(isNight) {
    if (isNight) {
      // Brighten icons on the dark side so they stand out
      ctx.filter = 'brightness(1.8) saturate(1.3)';
    } else {
      ctx.filter = 'none';
    }
  }

  function drawRotatedIcon(icon, x, y, size, headingDeg) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(headingDeg * Math.PI / 180);
    const half = size / 2;
    ctx.drawImage(icon, -half, -half, size, size);
    ctx.restore();
  }

  function drawUprightIcon(icon, x, y, size) {
    const half = size / 2;
    ctx.drawImage(icon, x - half, y - half, size, size);
  }

  function drawCatmullRomSegment(p0, p1, p2, p3, tension) {
    const steps = 8;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const t2 = t * t;
      const t3 = t2 * t;

      const x =
        tension * (2 * p1.x + (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);

      const y =
        tension * (2 * p1.y + (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);

      ctx.lineTo(x, y);
    }
  }

  function drawTrails(trails, dpr) {
    if (!trails || trails.length === 0) {
      return;
    }

    for (const trail of trails) {
      if (trail.points.length < 2) {
        continue;
      }

      const color = trail.isTanker
        ? `rgba(${TANKER_RING_COLOR}, 0.5)`
        : `rgba(${SQUADRON_RING_COLOR}, 0.5)`;

      // Project all points, splitting into visible segments
      const projected = [];
      for (const pt of trail.points) {
        const pos = projectPoint(pt.lat, pt.lon);
        projected.push(pos); // null if occluded
      }

      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5 * dpr;
      ctx.setLineDash([4 * dpr, 3 * dpr]);

      // Build continuous visible segments
      let segment = [];
      const segments = [];
      for (let i = 0; i < projected.length; i++) {
        if (projected[i]) {
          segment.push(projected[i]);
        } else {
          if (segment.length >= 2) {
            segments.push(segment);
          }
          segment = [];
        }
      }
      if (segment.length >= 2) {
        segments.push(segment);
      }

      // Draw each segment with Catmull-Rom spline
      const tension = 0.5;
      for (const seg of segments) {
        ctx.beginPath();
        ctx.moveTo(seg[0].x, seg[0].y);

        if (seg.length === 2) {
          ctx.lineTo(seg[1].x, seg[1].y);
        } else {
          for (let i = 0; i < seg.length - 1; i++) {
            const p0 = seg[Math.max(i - 1, 0)];
            const p1 = seg[i];
            const p2 = seg[i + 1];
            const p3 = seg[Math.min(i + 2, seg.length - 1)];
            drawCatmullRomSegment(p0, p1, p2, p3, tension);
          }
        }

        ctx.stroke();
      }

      ctx.setLineDash([]);
    }
  }

  return {
    pickSquadron(clientX, clientY, squadrons) {
      if (!squadrons || squadrons.length === 0) {
        return null;
      }
      const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
      const px = clientX * dpr;
      const py = clientY * dpr;
      const hitRadius = (PACKAGE_ICON_SIZE + 6) * dpr;
      const hitRadiusSq = hitRadius * hitRadius;

      let closest = null;
      let closestDistSq = hitRadiusSq;

      for (const sq of squadrons) {
        const pos = projectPoint(sq.lat, sq.lon);
        if (!pos) {
          continue;
        }
        const dx = pos.x - px;
        const dy = pos.y - py;
        const distSq = dx * dx + dy * dy;
        if (distSq < closestDistSq) {
          closestDistSq = distSq;
          closest = sq;
        }
      }

      return closest;
    },

    pickAircraft(clientX, clientY, aircraftSnapshots) {
      if (!aircraftSnapshots || aircraftSnapshots.length === 0) {
        return null;
      }
      const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
      const px = clientX * dpr;
      const py = clientY * dpr;
      const hitRadius = (PLANE_ICON_SIZE + 4) * dpr;
      const hitRadiusSq = hitRadius * hitRadius;

      let closest = null;
      let closestDistSq = hitRadiusSq;

      for (const ac of aircraftSnapshots) {
        const pos = projectPoint(ac.lat, ac.lon);
        if (!pos) {
          continue;
        }
        const dx = pos.x - px;
        const dy = pos.y - py;
        const distSq = dx * dx + dy * dy;
        if (distSq < closestDistSq) {
          closestDistSq = distSq;
          closest = ac;
        }
      }

      return closest;
    },

    // Zoomed-in mode: render individual aircraft with heading-rotated SVGs
    renderAircraft({ aircraftSnapshots, elapsedTime, trails, sunLightPosition }) {
      syncCanvasSize();
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);

      if (sunLightPosition) {
        sunDir.copy(sunLightPosition).normalize();
      }

      if (!aircraftSnapshots || aircraftSnapshots.length === 0) {
        return;
      }

      const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);

      // Draw trail lines first (behind icons)
      drawTrails(trails, dpr);

      const iconSize = PLANE_ICON_SIZE * dpr;

      for (const ac of aircraftSnapshots) {
        const pos = projectPoint(ac.lat, ac.lon);
        if (!pos) {
          continue;
        }

        const icon = icons[ac.type];
        if (icon) {
          applyNightBrightness(isNightSide(ac.lat, ac.lon));
          drawRotatedIcon(icon, pos.x, pos.y, iconSize, ac.heading || 0);
          ctx.filter = 'none';
        }
      }
    },

    // Zoomed-out mode: render package icons for squadrons
    render({ squadrons, elapsedTime, trails, sunLightPosition }) {
      syncCanvasSize();
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);

      if (sunLightPosition) {
        sunDir.copy(sunLightPosition).normalize();
      }

      if (!squadrons || squadrons.length === 0) {
        return;
      }

      const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);

      // Draw trail lines first (behind icons)
      drawTrails(trails, dpr);

      for (const sq of squadrons) {
        const pos = projectPoint(sq.lat, sq.lon);
        if (!pos) {
          continue;
        }

        const isTanker = sq.isTanker || false;
        const ringColor = isTanker ? TANKER_RING_COLOR : SQUADRON_RING_COLOR;
        const iconSize = (isTanker ? PACKAGE_ICON_SIZE * 0.7 : PACKAGE_ICON_SIZE) * dpr;
        const halfSize = iconSize / 2;

        const iconKey = isTanker ? 'tanker' : 'package';
        const icon = icons[iconKey];
        if (icon) {
          applyNightBrightness(isNightSide(sq.lat, sq.lon));
          if (isTanker) {
            // Tanker rotates to face heading
            drawRotatedIcon(icon, pos.x, pos.y, iconSize, sq.heading || 0);
          } else {
            // Package icon always upright
            drawUprightIcon(icon, pos.x, pos.y, iconSize);
          }
          ctx.filter = 'none';
        }

        // Name label
        const name = sq.name || '';
        if (name) {
          ctx.font = `${(isTanker ? 8 : 10) * dpr}px "Space Grotesk", "Avenir Next", sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillStyle = `rgba(${ringColor}, 0.6)`;
          ctx.fillText(name, pos.x, pos.y + halfSize + 2 * dpr);
        }
      }
    },
    dispose() {
      canvas.remove();
    },
  };
}
