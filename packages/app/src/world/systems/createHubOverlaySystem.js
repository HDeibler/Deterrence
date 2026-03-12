import * as THREE from 'three';
import { latLonToVector3 } from '../geo/geoMath.js';

const HORIZON_CUTOFF = 0.08;
const LABEL_ALTITUDE_THRESHOLD_KM = 6000;

const HUB_TYPE_COLORS = {
  forward_hub: 'rgba(98, 208, 255, 0.8)',
  logistics_hub: 'rgba(255, 184, 107, 0.8)',
  naval_hub: 'rgba(107, 255, 212, 0.8)',
};

const HUB_TYPE_STROKES = {
  forward_hub: 'rgba(98, 208, 255, 0.5)',
  logistics_hub: 'rgba(255, 184, 107, 0.5)',
  naval_hub: 'rgba(107, 255, 212, 0.5)',
};

const DEPLOYMENT_COLORS = {
  deploying: 'rgba(98, 208, 255, 0.7)',
  withdrawing: 'rgba(255, 184, 107, 0.7)',
};

export function createHubOverlaySystem({
  document,
  mountNode,
  renderer,
  camera,
  earthGroup,
  worldConfig,
  requestRender: _requestRender,
}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'hub-overlay';
  canvas.setAttribute('aria-hidden', 'true');
  mountNode.parentElement.appendChild(canvas);

  const context = canvas.getContext('2d');
  const localVector = new THREE.Vector3();
  const worldPosition = new THREE.Vector3();
  const worldNormal = new THREE.Vector3();
  const toCamera = new THREE.Vector3();
  const projected = new THREE.Vector3();
  const sizeVector = new THREE.Vector2();

  let canvasWidth = 0;
  let canvasHeight = 0;

  return {
    render({ altitudeKm, hubs = [], deployments = [], selectedHubId = null }) {
      syncCanvasSize();
      context.clearRect(0, 0, canvasWidth, canvasHeight);

      if (hubs.length === 0 && deployments.length === 0) {
        return;
      }

      const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
      const width = canvasWidth / dpr;
      const height = canvasHeight / dpr;
      const projArgs = {
        camera,
        earthGroup,
        worldConfig,
        localVector,
        worldPosition,
        worldNormal,
        toCamera,
        projected,
      };

      context.save();
      context.scale(dpr, dpr);

      // Build a lookup of hub screen positions for deployment line drawing
      const hubScreenPositions = new Map();

      for (const hub of hubs) {
        const screen = projectToScreen({
          lat: hub.lat,
          lon: hub.lon,
          width,
          height,
          ...projArgs,
        });
        if (!screen) {
          continue;
        }

        hubScreenPositions.set(hub.id, screen);
        const isSelected = hub.id === selectedHubId;
        const markerRadius = isSelected ? 12 : 9;
        const fillColor = HUB_TYPE_COLORS[hub.type] ?? 'rgba(180, 180, 220, 0.7)';
        const strokeColor = isSelected
          ? 'rgba(244, 247, 251, 0.9)'
          : (HUB_TYPE_STROKES[hub.type] ?? 'rgba(180, 180, 220, 0.4)');

        drawHexagon(context, screen.x, screen.y, markerRadius, fillColor, strokeColor);

        if (hub.utilization != null) {
          drawUtilizationArc(context, screen.x, screen.y, markerRadius + 5, hub.utilization);
        }

        if (hub.throughputIn != null || hub.throughputOut != null) {
          drawThroughputBar(context, screen.x, screen.y, markerRadius, hub.throughputIn ?? 0, hub.throughputOut ?? 0);
        }

        if (altitudeKm < LABEL_ALTITUDE_THRESHOLD_KM && hub.name) {
          drawHubLabel(context, screen.x, screen.y, markerRadius, hub.name, hub.type);
        }
      }

      // Draw active deployment lines from hub to destination
      for (const deployment of deployments) {
        drawDeploymentLine({
          context,
          deployment,
          hubScreenPositions,
          width,
          height,
          ...projArgs,
        });
      }

      context.restore();
    },
    dispose() {
      canvas.remove();
    },
  };

  function syncCanvasSize() {
    const size = renderer.getSize(sizeVector);
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    const nextWidth = Math.round(size.x * dpr);
    const nextHeight = Math.round(size.y * dpr);
    if (canvasWidth === nextWidth && canvasHeight === nextHeight) {
      return;
    }
    canvasWidth = nextWidth;
    canvasHeight = nextHeight;
    canvas.width = nextWidth;
    canvas.height = nextHeight;
    canvas.style.width = `${size.x}px`;
    canvas.style.height = `${size.y}px`;
  }
}

// ─── Projection ─────────────────────────────────────────────────────────────

function projectToScreen({
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
  width,
  height,
}) {
  latLonToVector3({
    lat,
    lon,
    radius: worldConfig.earthRadius * 1.002,
    out: localVector,
  });
  worldPosition.copy(localVector).applyQuaternion(earthGroup.quaternion);
  worldNormal.copy(localVector).normalize().applyQuaternion(earthGroup.quaternion).normalize();
  toCamera.copy(camera.position).sub(worldPosition).normalize();

  if (worldNormal.dot(toCamera) < HORIZON_CUTOFF) {
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
    x: (projected.x + 1) * 0.5 * width,
    y: (1 - projected.y) * 0.5 * height,
  };
}

// ─── Drawing helpers ────────────────────────────────────────────────────────

function drawHexagon(ctx, x, y, radius, fillColor, strokeColor) {
  ctx.beginPath();
  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    const px = x + radius * Math.cos(angle);
    const py = y + radius * Math.sin(angle);
    if (i === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.closePath();
  ctx.fillStyle = fillColor;
  ctx.fill();
  if (strokeColor) {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

function drawUtilizationArc(ctx, x, y, radius, utilization) {
  const clamped = Math.min(Math.max(utilization, 0), 1);
  const startAngle = -Math.PI / 2;
  const endAngle = startAngle + Math.PI * 2 * clamped;

  ctx.beginPath();
  ctx.arc(x, y, radius, startAngle, endAngle);

  if (clamped > 0.9) {
    ctx.strokeStyle = 'rgba(255, 107, 107, 0.8)';
  } else if (clamped > 0.7) {
    ctx.strokeStyle = 'rgba(255, 207, 138, 0.8)';
  } else {
    ctx.strokeStyle = 'rgba(112, 220, 187, 0.8)';
  }

  ctx.lineWidth = 3;
  ctx.stroke();
}

function drawThroughputBar(ctx, x, y, markerRadius, throughputIn, throughputOut) {
  const barWidth = markerRadius * 1.6;
  const barHeight = 3;
  const barY = y + markerRadius + 8;
  const maxThroughput = Math.max(throughputIn + throughputOut, 1);
  const inFraction = throughputIn / maxThroughput;

  // Background
  ctx.fillStyle = 'rgba(9, 18, 33, 0.7)';
  ctx.fillRect(x - barWidth / 2 - 1, barY - 1, barWidth + 2, barHeight + 2);

  // Inbound (left portion, green)
  ctx.fillStyle = 'rgba(112, 220, 187, 0.7)';
  ctx.fillRect(x - barWidth / 2, barY, barWidth * inFraction, barHeight);

  // Outbound (right portion, orange)
  ctx.fillStyle = 'rgba(255, 184, 107, 0.7)';
  ctx.fillRect(x - barWidth / 2 + barWidth * inFraction, barY, barWidth * (1 - inFraction), barHeight);
}

function drawHubLabel(ctx, x, y, markerRadius, name, type) {
  const labelY = y + markerRadius + 16;
  const typeLabel = formatHubType(type);

  ctx.font = '11px "Space Grotesk", "Avenir Next", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  // Hub name
  ctx.fillStyle = 'rgba(244, 247, 251, 0.84)';
  ctx.fillText(name, x, labelY);

  // Hub type (smaller, muted)
  if (typeLabel) {
    ctx.font = '9px "Space Grotesk", "Avenir Next", sans-serif';
    ctx.fillStyle = 'rgba(244, 247, 251, 0.5)';
    ctx.fillText(typeLabel, x, labelY + 14);
  }

  ctx.textAlign = 'left';
}

function formatHubType(type) {
  if (!type) {
    return '';
  }
  return type.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

// ─── Deployment lines ───────────────────────────────────────────────────────

function drawDeploymentLine({
  context,
  deployment,
  hubScreenPositions,
  camera,
  earthGroup,
  worldConfig,
  localVector,
  worldPosition,
  worldNormal,
  toCamera,
  projected,
  width,
  height,
}) {
  const hubScreen = hubScreenPositions.get(deployment.hubId);
  if (!hubScreen) {
    return;
  }

  const destScreen = projectToScreen({
    lat: deployment.destLat,
    lon: deployment.destLon,
    camera,
    earthGroup,
    worldConfig,
    localVector,
    worldPosition,
    worldNormal,
    toCamera,
    projected,
    width,
    height,
  });
  if (!destScreen) {
    return;
  }

  const color = deployment.withdrawing
    ? DEPLOYMENT_COLORS.withdrawing
    : DEPLOYMENT_COLORS.deploying;
  const progress = Math.min(Math.max(deployment.progress ?? 0, 0), 1);

  // Dashed line from hub to destination
  context.save();
  context.setLineDash([6, 4]);
  context.beginPath();
  context.moveTo(hubScreen.x, hubScreen.y);
  context.lineTo(destScreen.x, destScreen.y);
  context.strokeStyle = color;
  context.lineWidth = 1.2;
  context.stroke();
  context.setLineDash([]);

  // Progress indicator: small filled circle along the line
  const progressX = hubScreen.x + (destScreen.x - hubScreen.x) * progress;
  const progressY = hubScreen.y + (destScreen.y - hubScreen.y) * progress;

  context.beginPath();
  context.arc(progressX, progressY, 3, 0, Math.PI * 2);
  context.fillStyle = color;
  context.fill();
  context.restore();
}
