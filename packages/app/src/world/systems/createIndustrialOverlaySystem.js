import * as THREE from 'three';
import { latLonToVector3 } from '../geo/geoMath.js';

const ICON_PATHS = {
  chip_factory: '/assets/manufactoring/asset-chip-factory.svg',
  military_factory: '/assets/manufactoring/asset-factory.svg',
};

const PROJECT_COLORS = {
  chip_factory: '#6ee7ff',
  military_factory: '#ffb36b',
};

const MARKER_PROFILES = [
  { altitudeMaxKm: 450, iconSize: 28, label: true, ringRadius: 22 },
  { altitudeMaxKm: 1200, iconSize: 24, label: true, ringRadius: 19 },
  { altitudeMaxKm: 3200, iconSize: 20, label: false, ringRadius: 15 },
  { altitudeMaxKm: Infinity, iconSize: 16, label: false, ringRadius: 12 },
];

export function createIndustrialOverlaySystem({
  document,
  mountNode,
  renderer,
  camera,
  earthGroup,
  worldConfig,
  requestRender,
}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'industrial-overlay';
  canvas.setAttribute('aria-hidden', 'true');
  mountNode.parentElement.appendChild(canvas);

  const context = canvas.getContext('2d');
  const localVector = new THREE.Vector3();
  const worldPosition = new THREE.Vector3();
  const worldNormal = new THREE.Vector3();
  const toCamera = new THREE.Vector3();
  const projected = new THREE.Vector3();
  const icons = loadIcons(requestRender);
  const hitRegions = [];

  let canvasWidth = 0;
  let canvasHeight = 0;

  return {
    pickProject(clientX, clientY) {
      const size = renderer.getSize(new THREE.Vector2());
      const rect = renderer.domElement.getBoundingClientRect();
      const canvasX = clientX - rect.left;
      const canvasY = clientY - rect.top;
      if (canvasX < 0 || canvasY < 0 || canvasX > size.x || canvasY > size.y) {
        return null;
      }

      for (let index = hitRegions.length - 1; index >= 0; index -= 1) {
        const region = hitRegions[index];
        const dx = canvasX - region.x;
        const dy = canvasY - region.y;
        if (dx * dx + dy * dy <= region.radius * region.radius) {
          return region.project;
        }
      }
      return null;
    },
    render({
      altitudeKm,
      projects = [],
      placementMode = null,
      placementPreview = null,
      hoveredProjectId = null,
      selectedProjectId = null,
    }) {
      syncCanvasSize();
      context.clearRect(0, 0, canvasWidth, canvasHeight);
      hitRegions.length = 0;
      if (!Array.isArray(projects) || projects.length === 0) {
        if (placementPreview) {
          drawPlacementPreview({
            context,
            placementPreview,
            camera,
            earthGroup,
            worldConfig,
            localVector,
            worldPosition,
            worldNormal,
            toCamera,
            projected,
            canvasWidth,
            canvasHeight,
          });
        }
        return;
      }

      const profile =
        MARKER_PROFILES.find((entry) => altitudeKm <= entry.altitudeMaxKm) ??
        MARKER_PROFILES[MARKER_PROFILES.length - 1];
      const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);

      context.save();
      context.scale(dpr, dpr);

      const viewportWidth = canvasWidth / dpr;
      const viewportHeight = canvasHeight / dpr;

      for (const project of projects) {
        if (
          !projectPoint({
            lat: project.lat,
            lon: project.lon,
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
          continue;
        }

        const x = (projected.x + 1) * 0.5 * viewportWidth;
        const y = (1 - projected.y) * 0.5 * viewportHeight;
        drawProjectMarker({
          context,
          project,
          x,
          y,
          icon: icons[project.key] ?? null,
          profile,
          highlighted:
            placementMode === project.key ||
            hoveredProjectId === project.id ||
            selectedProjectId === project.id,
          selected: selectedProjectId === project.id,
        });
        hitRegions.push({
          x,
          y,
          radius: Math.max(profile.ringRadius, 18),
          project,
        });
      }

      if (placementPreview) {
        drawPlacementPreview({
          context,
          placementPreview,
          camera,
          earthGroup,
          worldConfig,
          localVector,
          worldPosition,
          worldNormal,
          toCamera,
          projected,
          canvasWidth,
          canvasHeight,
        });
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
}

function drawProjectMarker({ context, project, x, y, icon, profile, highlighted, selected }) {
  const color = PROJECT_COLORS[project.key] ?? '#f4f7fb';
  const ringRadius = profile.ringRadius;
  const iconSize = profile.iconSize;

  context.beginPath();
  context.arc(x, y, ringRadius, 0, Math.PI * 2);
  context.fillStyle = selected
    ? 'rgba(98, 208, 255, 0.18)'
    : highlighted
      ? 'rgba(255, 183, 107, 0.15)'
      : 'rgba(4, 12, 24, 0.62)';
  context.fill();
  context.lineWidth = selected ? 2.3 : highlighted ? 2.1 : 1.3;
  context.strokeStyle = selected ? '#62d0ff' : highlighted ? '#ffb36b' : color;
  context.stroke();

  if (icon?.complete && icon.naturalWidth > 0) {
    context.drawImage(icon, x - iconSize * 0.5, y - iconSize * 0.5, iconSize, iconSize);
  } else {
    context.beginPath();
    context.arc(x, y, iconSize * 0.26, 0, Math.PI * 2);
    context.fillStyle = color;
    context.fill();
  }

  context.beginPath();
  context.arc(x + ringRadius * 0.55, y - ringRadius * 0.55, 6.5, 0, Math.PI * 2);
  context.fillStyle = 'rgba(4, 12, 24, 0.92)';
  context.fill();
  context.lineWidth = 1;
  context.strokeStyle = color;
  context.stroke();

  context.fillStyle = color;
  context.font = '600 9px "Space Grotesk", "Avenir Next", sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(`+${project.throughputPercent ?? 0}`, x + ringRadius * 0.55, y - ringRadius * 0.55);

  if (!profile.label) {
    return;
  }

  const title = project.label;
  const subtitle = `${formatLatitude(project.lat)} ${formatLongitude(project.lon)}`;
  const labelX = x + ringRadius + 10;
  const labelY = y - 9;
  const titleWidth = context.measureText(title).width;

  context.fillStyle = 'rgba(4, 12, 24, 0.8)';
  context.fillRect(labelX - 6, labelY - 7, titleWidth + 12, 16);
  context.fillStyle = '#f4f7fb';
  context.textAlign = 'left';
  context.fillText(title, labelX, labelY);

  context.fillStyle = 'rgba(244, 247, 251, 0.68)';
  context.font = '500 9px "Space Grotesk", "Avenir Next", sans-serif';
  context.fillText(subtitle, labelX, labelY + 12);
}

function drawPlacementPreview({
  context,
  placementPreview,
  camera,
  earthGroup,
  worldConfig,
  localVector,
  worldPosition,
  worldNormal,
  toCamera,
  projected,
  canvasWidth,
  canvasHeight,
}) {
  if (
    !projectPoint({
      lat: placementPreview.lat,
      lon: placementPreview.lon,
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
    return;
  }

  const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
  const x = (projected.x + 1) * 0.5 * (canvasWidth / dpr);
  const y = (1 - projected.y) * 0.5 * (canvasHeight / dpr);
  const color = placementPreview.valid ? '#62d0ff' : '#ff6b6b';

  context.save();
  context.strokeStyle = color;
  context.fillStyle = placementPreview.valid ? 'rgba(98, 208, 255, 0.12)' : 'rgba(255, 107, 107, 0.14)';
  context.lineWidth = 1.8;
  context.beginPath();
  context.arc(x, y, 20, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.beginPath();
  context.moveTo(x - 10, y);
  context.lineTo(x + 10, y);
  context.moveTo(x, y - 10);
  context.lineTo(x, y + 10);
  context.stroke();
  context.font = '600 10px "Space Grotesk", "Avenir Next", sans-serif';
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.fillStyle = '#f4f7fb';
  context.fillText(placementPreview.label, x + 26, y - 4);
  context.fillStyle = placementPreview.valid ? 'rgba(244, 247, 251, 0.72)' : '#ffb6b6';
  context.fillText(placementPreview.valid ? 'Valid domestic placement' : 'Outside domestic territory', x + 26, y + 10);
  context.restore();
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
    radius: worldConfig.earthRadius * 1.0035,
    out: localVector,
  });
  worldPosition.copy(localVector).applyQuaternion(earthGroup.quaternion);
  worldNormal.copy(localVector).normalize().applyQuaternion(earthGroup.quaternion).normalize();
  toCamera.copy(camera.position).sub(worldPosition).normalize();

  if (worldNormal.dot(toCamera) < 0.08) {
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
    Object.entries(ICON_PATHS).map(([projectKey, path]) => {
      const image = new Image();
      image.onload = () => requestRender?.();
      image.src = path;
      return [projectKey, image];
    }),
  );
}

function formatLatitude(value) {
  return `${Math.abs(value).toFixed(1)}°${value >= 0 ? 'N' : 'S'}`;
}

function formatLongitude(value) {
  return `${Math.abs(value).toFixed(1)}°${value >= 0 ? 'E' : 'W'}`;
}
