import * as THREE from 'three';
import { latLonToVector3 } from '../geo/geoMath.js';

const FLEET_ICON_COLOR = 'rgba(255, 179, 71, 0.92)';
const FLEET_RING_COLOR = '255, 179, 71';
const ICON_SIZE_BASE = 16;
const PULSE_SPEED = 2.4;
const PULSE_AMPLITUDE = 0.15;

// Altitude (km) above which we show icons instead of 3D models
export const FLEET_ICON_ALTITUDE_KM = 800;

export function createFleetOverlaySystem({
  document,
  mountNode,
  renderer,
  camera,
  earthGroup,
  worldConfig,
}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'fleet-overlay';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText =
    'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:3;';
  mountNode.parentElement.appendChild(canvas);

  const context = canvas.getContext('2d');
  const localVector = new THREE.Vector3();
  const worldPosition = new THREE.Vector3();
  const worldNormal = new THREE.Vector3();
  const toCamera = new THREE.Vector3();
  const projected = new THREE.Vector3();

  let canvasWidth = 0;
  let canvasHeight = 0;

  // Pre-render tinted SVG icon to offscreen canvas
  let tintedIcon = null;
  const iconImage = new Image();
  iconImage.onload = () => {
    const size = 64;
    const offscreen = document.createElement('canvas');
    offscreen.width = size;
    offscreen.height = size;
    const ctx = offscreen.getContext('2d');
    // Draw the black SVG
    ctx.drawImage(iconImage, 0, 0, size, size);
    // Tint: replace all non-transparent pixels with the fleet color
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = FLEET_ICON_COLOR;
    ctx.fillRect(0, 0, size, size);
    tintedIcon = offscreen;
  };
  iconImage.src = '/assets/military/bases/navy-port.svg';

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

  function projectFleet(lat, lon) {
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

  return {
    pickFleet(clientX, clientY, fleets) {
      if (!fleets || fleets.length === 0) {
        return null;
      }
      const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
      const px = clientX * dpr;
      const py = clientY * dpr;
      const hitRadius = (ICON_SIZE_BASE + 6) * dpr;
      const hitRadiusSq = hitRadius * hitRadius;

      let closest = null;
      let closestDistSq = hitRadiusSq;

      for (const fleet of fleets) {
        const pos = projectFleet(fleet.lat, fleet.lon);
        if (!pos) {
          continue;
        }
        const dx = pos.x - px;
        const dy = pos.y - py;
        const distSq = dx * dx + dy * dy;
        if (distSq < closestDistSq) {
          closestDistSq = distSq;
          closest = fleet;
        }
      }

      return closest;
    },
    render({ fleets, elapsedTime }) {
      syncCanvasSize();
      context.clearRect(0, 0, canvasWidth, canvasHeight);

      if (!fleets || fleets.length === 0) {
        return;
      }

      const pulse = 1 + Math.sin(elapsedTime * PULSE_SPEED) * PULSE_AMPLITUDE;
      const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);

      for (const fleet of fleets) {
        const pos = projectFleet(fleet.lat, fleet.lon);
        if (!pos) {
          continue;
        }

        const iconSize = ICON_SIZE_BASE * dpr;
        const halfSize = iconSize / 2;

        // Outer pulse ring
        const ringRadius = (halfSize + 5 * dpr) * pulse;
        const ringAlpha = 0.12 + 0.08 * Math.sin(elapsedTime * PULSE_SPEED);
        context.beginPath();
        context.arc(pos.x, pos.y, ringRadius, 0, Math.PI * 2);
        context.strokeStyle = `rgba(${FLEET_RING_COLOR}, ${ringAlpha})`;
        context.lineWidth = 1.2 * dpr;
        context.stroke();

        // Dark background circle
        const bgRadius = halfSize + 3 * dpr;
        context.beginPath();
        context.arc(pos.x, pos.y, bgRadius, 0, Math.PI * 2);
        context.fillStyle = 'rgba(9, 18, 33, 0.88)';
        context.fill();

        // Border ring
        context.beginPath();
        context.arc(pos.x, pos.y, bgRadius + 1.4 * dpr, 0, Math.PI * 2);
        context.strokeStyle = `rgba(${FLEET_RING_COLOR}, 0.38)`;
        context.lineWidth = 1.1 * dpr;
        context.stroke();

        // Draw tinted SVG icon
        if (tintedIcon) {
          context.drawImage(
            tintedIcon,
            pos.x - halfSize,
            pos.y - halfSize,
            iconSize,
            iconSize,
          );
        }

        // Fleet name label below icon
        const name = fleet.name || '';
        if (name) {
          context.font = `${10 * dpr}px "Space Grotesk", "Avenir Next", sans-serif`;
          context.textAlign = 'center';
          context.textBaseline = 'top';
          context.fillStyle = `rgba(${FLEET_RING_COLOR}, 0.6)`;
          context.fillText(
            name,
            pos.x,
            pos.y + bgRadius + 2 * dpr,
          );
        }
      }
    },
    dispose() {
      canvas.remove();
    },
  };
}
