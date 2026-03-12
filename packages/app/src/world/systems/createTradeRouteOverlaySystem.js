import * as THREE from 'three';
import { latLonToVector3 } from '../geo/geoMath.js';

const ICON_PATHS = {
  producer: '/assets/manufactoring/raw-resources/oil-producer.svg',
  port: '/assets/military/bases/navy-port.svg',
  tanker: '/assets/military/assets/navy-cruiser.svg',
};

export function createTradeRouteOverlaySystem({
  document,
  mountNode,
  renderer,
  camera,
  earthGroup,
  worldConfig,
  requestRender,
}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'trade-route-overlay';
  canvas.setAttribute('aria-hidden', 'true');
  mountNode.parentElement.appendChild(canvas);

  const context = canvas.getContext('2d');
  const localVector = new THREE.Vector3();
  const worldPosition = new THREE.Vector3();
  const worldNormal = new THREE.Vector3();
  const toCamera = new THREE.Vector3();
  const projected = new THREE.Vector3();
  const icons = loadIcons(requestRender);

  let canvasWidth = 0;
  let canvasHeight = 0;

  return {
    render({ contracts = [] }) {
      syncCanvasSize();
      context.clearRect(0, 0, canvasWidth, canvasHeight);
      if (!Array.isArray(contracts) || contracts.length === 0) {
        return;
      }

      const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
      const viewportWidth = canvasWidth / dpr;
      const viewportHeight = canvasHeight / dpr;

      context.save();
      context.scale(dpr, dpr);

      for (const contract of contracts) {
        const origin = projectGeoPoint(contract.originPort);
        const destination = projectGeoPoint(contract.destinationPort);
        const tanker = projectGeoPoint({ lat: contract.tankerLat, lon: contract.tankerLon });
        if (!origin || !destination) {
          continue;
        }

        drawRouteLine({
          context,
          origin,
          destination,
          disrupted: contract.disrupted,
          congested: contract.throttledPercent < 100,
          width: viewportWidth,
          height: viewportHeight,
        });
        drawNode(
          context,
          origin,
          icons.producer,
          contract.disrupted ? '#ff5a5a' : contract.throttledPercent < 100 ? '#ffcf8a' : '#ffb36b',
        );
        drawNode(
          context,
          destination,
          icons.port,
          contract.disrupted ? '#ff5a5a' : contract.throttledPercent < 100 ? '#ff6b6b' : '#62d0ff',
        );
        if (tanker) {
          drawTanker(context, tanker, icons.tanker, {
            congested: contract.throttledPercent < 100,
            disrupted: contract.disrupted,
          });
        }
      }

      context.restore();
    },
    dispose() {
      canvas.remove();
    },
  };

  function syncCanvasSize() {
    const size = renderer.getSize(new THREE.Vector2());
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    const width = Math.round(size.x * dpr);
    const height = Math.round(size.y * dpr);
    if (canvasWidth === width && canvasHeight === height) {
      return;
    }
    canvasWidth = width;
    canvasHeight = height;
    canvas.width = width;
    canvas.height = height;
    canvas.style.width = `${size.x}px`;
    canvas.style.height = `${size.y}px`;
  }

  function projectGeoPoint(point) {
    if (!point) {
      return null;
    }
    if (
      !projectPoint({
        lat: point.lat,
        lon: point.lon,
        camera,
        earthGroup,
        worldConfig,
        localVector,
        worldPosition,
        worldNormal,
        toCamera,
        projected,
      })
    ) {
      return null;
    }
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    return {
      x: (projected.x + 1) * 0.5 * (canvasWidth / dpr),
      y: (1 - projected.y) * 0.5 * (canvasHeight / dpr),
      label: point.name ?? '',
    };
  }
}

function drawRouteLine({ context, origin, destination, congested, disrupted }) {
  context.beginPath();
  context.moveTo(origin.x, origin.y);
  context.lineTo(destination.x, destination.y);
  context.strokeStyle = disrupted
    ? 'rgba(255, 90, 90, 0.6)'
    : congested
      ? 'rgba(255, 107, 107, 0.42)'
      : 'rgba(98, 208, 255, 0.32)';
  context.lineWidth = disrupted ? 1.9 : 1.4;
  context.setLineDash(disrupted ? [4, 4] : [8, 6]);
  context.stroke();
  context.setLineDash([]);
}

function drawNode(context, point, icon, color) {
  context.beginPath();
  context.arc(point.x, point.y, 10, 0, Math.PI * 2);
  context.fillStyle = 'rgba(4, 12, 24, 0.86)';
  context.fill();
  context.lineWidth = 1.2;
  context.strokeStyle = color;
  context.stroke();
  if (icon?.complete && icon.naturalWidth > 0) {
    context.drawImage(icon, point.x - 7, point.y - 7, 14, 14);
  }
}

function drawTanker(context, point, icon, { congested, disrupted }) {
  context.beginPath();
  context.arc(point.x, point.y, 9, 0, Math.PI * 2);
  context.fillStyle = disrupted
    ? 'rgba(255, 90, 90, 0.22)'
    : congested
      ? 'rgba(255, 107, 107, 0.18)'
      : 'rgba(255, 179, 107, 0.16)';
  context.fill();
  context.lineWidth = 1.2;
  context.strokeStyle = disrupted ? '#ff5a5a' : congested ? '#ff6b6b' : '#ffb36b';
  context.stroke();
  if (icon?.complete && icon.naturalWidth > 0) {
    context.drawImage(icon, point.x - 8, point.y - 8, 16, 16);
  }
}

function projectPoint({
  lat,
  lon,
  camera,
  earthGroup,
  worldConfig,
  localVector,
  worldPosition,
  worldNormal,
  toCamera,
  projected,
}) {
  latLonToVector3({
    lat,
    lon,
    radius: worldConfig.earthRadius * 1.0045,
    out: localVector,
  });
  worldPosition.copy(localVector).applyQuaternion(earthGroup.quaternion);
  worldNormal.copy(localVector).normalize().applyQuaternion(earthGroup.quaternion).normalize();
  toCamera.copy(camera.position).sub(worldPosition).normalize();
  if (worldNormal.dot(toCamera) < 0.05) {
    return false;
  }
  projected.copy(worldPosition).project(camera);
  if (
    projected.z < -1 ||
    projected.z > 1 ||
    Math.abs(projected.x) > 1.08 ||
    Math.abs(projected.y) > 1.08
  ) {
    return false;
  }
  return true;
}

function loadIcons(requestRender) {
  return Object.fromEntries(
    Object.entries(ICON_PATHS).map(([key, path]) => {
      const image = new Image();
      image.onload = () => requestRender?.();
      image.src = path;
      return [key, image];
    }),
  );
}
