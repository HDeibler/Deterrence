import * as THREE from 'three';
import { latLonToVector3 } from '../geo/geoMath.js';

const HORIZON_CUTOFF = 0.08;
const ROUTE_SEGMENT_COUNT = 24;

const HEALTH_THRESHOLDS = {
  healthy: 0.8,
  strained: 0.5,
};

const ROUTE_COLORS = {
  healthy: 'rgba(112, 220, 187, 0.6)',
  strained: 'rgba(255, 207, 138, 0.6)',
  disrupted: 'rgba(255, 129, 129, 0.7)',
};

const DISRUPTION_PULSE_COLOR = 'rgba(255, 107, 107, 0.6)';

export function createSupplyNetworkOverlaySystem({
  document,
  mountNode,
  renderer,
  camera,
  earthGroup,
  worldConfig,
  requestRender: _requestRender,
}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'supply-network-overlay';
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
    render({ altitudeKm: _altitudeKm, routes = [], supplyShocks = {} }) {
      syncCanvasSize();
      context.clearRect(0, 0, canvasWidth, canvasHeight);

      if (routes.length === 0) {
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
        width,
        height,
      };

      context.save();
      context.scale(dpr, dpr);

      for (const route of routes) {
        drawSupplyRoute({ context, route, supplyShocks, ...projArgs });
      }

      // Draw disruption warnings at shocked nodes
      const shockedNodeIds = Object.keys(supplyShocks);
      for (const nodeId of shockedNodeIds) {
        const shock = supplyShocks[nodeId];
        if (shock && shock.lat != null && shock.lon != null) {
          drawDisruptionWarning({
            context,
            shock,
            ...projArgs,
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

// ─── Route drawing ──────────────────────────────────────────────────────────

function getRouteHealth(route, supplyShocks) {
  // Check explicit health on the route itself
  if (route.health != null) {
    return route.health;
  }

  // Derive from supply shock multiplier at origin or destination
  const originShock = supplyShocks[route.originId];
  const destShock = supplyShocks[route.destId];
  const originMultiplier = originShock?.multiplier ?? 1;
  const destMultiplier = destShock?.multiplier ?? 1;

  return Math.min(originMultiplier, destMultiplier);
}

function getRouteColor(health) {
  if (health >= HEALTH_THRESHOLDS.healthy) {
    return ROUTE_COLORS.healthy;
  }
  if (health >= HEALTH_THRESHOLDS.strained) {
    return ROUTE_COLORS.strained;
  }
  return ROUTE_COLORS.disrupted;
}

function drawSupplyRoute({
  context,
  route,
  supplyShocks,
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
  const health = getRouteHealth(route, supplyShocks);
  const color = getRouteColor(health);
  const isDegraded = health < HEALTH_THRESHOLDS.healthy;

  // Interpolate great-circle segments between origin and destination
  const screenPoints = [];
  for (let i = 0; i <= ROUTE_SEGMENT_COUNT; i += 1) {
    const t = i / ROUTE_SEGMENT_COUNT;
    const point = interpolateGreatCircle(
      route.originLat,
      route.originLon,
      route.destLat,
      route.destLon,
      t,
    );
    const screen = projectToScreen({
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
      width,
      height,
    });
    screenPoints.push(screen);
  }

  // Draw the polyline, breaking at far-side-of-globe gaps
  context.save();
  context.strokeStyle = color;
  context.lineWidth = 1.5;
  if (isDegraded) {
    context.setLineDash([6, 4]);
  }

  let started = false;
  let visibleCount = 0;

  for (const screen of screenPoints) {
    if (!screen) {
      if (started && visibleCount > 1) {
        context.stroke();
      }
      context.beginPath();
      started = false;
      visibleCount = 0;
      continue;
    }

    if (!started) {
      context.beginPath();
      context.moveTo(screen.x, screen.y);
      started = true;
      visibleCount = 1;
    } else {
      context.lineTo(screen.x, screen.y);
      visibleCount += 1;
    }
  }

  if (started && visibleCount > 1) {
    context.stroke();
  }

  context.setLineDash([]);

  // Draw transport icon at the route progress position
  if (route.progress != null) {
    drawTransportIcon({
      context,
      screenPoints,
      progress: route.progress,
      transportType: route.transportType,
      color,
    });
  }

  context.restore();
}

function drawTransportIcon({ context, screenPoints, progress, transportType, color }) {
  const clamped = Math.min(Math.max(progress, 0), 1);
  const floatIndex = clamped * (screenPoints.length - 1);
  const baseIndex = Math.floor(floatIndex);
  const fraction = floatIndex - baseIndex;
  const nextIndex = Math.min(baseIndex + 1, screenPoints.length - 1);

  const pointA = screenPoints[baseIndex];
  const pointB = screenPoints[nextIndex];

  if (!pointA || !pointB) {
    return;
  }

  const x = pointA.x + (pointB.x - pointA.x) * fraction;
  const y = pointA.y + (pointB.y - pointA.y) * fraction;

  if (transportType === 'tanker' || transportType === 'ship') {
    // Circle for sea transport
    context.beginPath();
    context.arc(x, y, 3.5, 0, Math.PI * 2);
    context.fillStyle = color;
    context.fill();
  } else {
    // Triangle for air transport (default)
    const dx = pointB.x - pointA.x;
    const dy = pointB.y - pointA.y;
    const angle = Math.atan2(dy, dx);
    const size = 5;

    context.save();
    context.translate(x, y);
    context.rotate(angle);
    context.beginPath();
    context.moveTo(size, 0);
    context.lineTo(-size * 0.6, -size * 0.5);
    context.lineTo(-size * 0.6, size * 0.5);
    context.closePath();
    context.fillStyle = color;
    context.fill();
    context.restore();
  }
}

// ─── Disruption warnings ────────────────────────────────────────────────────

function drawDisruptionWarning({
  context,
  shock,
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
  const screen = projectToScreen({
    lat: shock.lat,
    lon: shock.lon,
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
  if (!screen) {
    return;
  }

  const severity = 1 - Math.min(Math.max(shock.multiplier ?? 0, 0), 1);
  const baseRadius = 8 + severity * 8;

  // Pulsing effect via timestamp modulus
  const pulsePhase = (Date.now() % 1600) / 1600;
  const pulseRadius = baseRadius + pulsePhase * 10;
  const pulseAlpha = 0.5 * (1 - pulsePhase);

  // Outer pulse ring
  context.beginPath();
  context.arc(screen.x, screen.y, pulseRadius, 0, Math.PI * 2);
  context.strokeStyle = `rgba(255, 107, 107, ${pulseAlpha.toFixed(2)})`;
  context.lineWidth = 2;
  context.stroke();

  // Inner warning ring
  context.beginPath();
  context.arc(screen.x, screen.y, baseRadius, 0, Math.PI * 2);
  context.strokeStyle = DISRUPTION_PULSE_COLOR;
  context.lineWidth = 1.5;
  context.stroke();

  // Center dot
  context.beginPath();
  context.arc(screen.x, screen.y, 2.5, 0, Math.PI * 2);
  context.fillStyle = 'rgba(255, 107, 107, 0.9)';
  context.fill();
}

// ─── Great-circle interpolation ─────────────────────────────────────────────

function interpolateGreatCircle(lat1, lon1, lat2, lon2, t) {
  const phi1 = lat1 * (Math.PI / 180);
  const lambda1 = lon1 * (Math.PI / 180);
  const phi2 = lat2 * (Math.PI / 180);
  const lambda2 = lon2 * (Math.PI / 180);

  const dLambda = lambda2 - lambda1;
  const cosP1 = Math.cos(phi1);
  const cosP2 = Math.cos(phi2);
  const sinP1 = Math.sin(phi1);
  const sinP2 = Math.sin(phi2);

  const d = Math.acos(
    Math.min(1, Math.max(-1, sinP1 * sinP2 + cosP1 * cosP2 * Math.cos(dLambda))),
  );

  // For very short arcs, linear interpolation is sufficient
  if (d < 1e-6) {
    return {
      lat: lat1 + (lat2 - lat1) * t,
      lon: lon1 + (lon2 - lon1) * t,
    };
  }

  const sinD = Math.sin(d);
  const a = Math.sin((1 - t) * d) / sinD;
  const b = Math.sin(t * d) / sinD;

  const x = a * cosP1 * Math.cos(lambda1) + b * cosP2 * Math.cos(lambda2);
  const y = a * cosP1 * Math.sin(lambda1) + b * cosP2 * Math.sin(lambda2);
  const z = a * sinP1 + b * sinP2;

  return {
    lat: Math.atan2(z, Math.sqrt(x * x + y * y)) * (180 / Math.PI),
    lon: Math.atan2(y, x) * (180 / Math.PI),
  };
}
