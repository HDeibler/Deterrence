import * as THREE from 'three';

const BORDER_DATA_URL = '/data/borders/country-borders-50m.json';
const COUNTRY_POLYGON_DATA_URL = '/data/countries/playable-country-polygons.json';
const BORDER_PROFILES = [
  { altitudeMaxKm: 500, alpha: 0.78, lineWidth: 1.25, maxMinZoom: 6.5, lodLevel: 0 },
  { altitudeMaxKm: 1200, alpha: 0.66, lineWidth: 1.1, maxMinZoom: 5.2, lodLevel: 1 },
  { altitudeMaxKm: 3000, alpha: 0.5, lineWidth: 0.95, maxMinZoom: 4.2, lodLevel: 1 },
  { altitudeMaxKm: 7000, alpha: 0.36, lineWidth: 0.85, maxMinZoom: 3.0, lodLevel: 2 },
  { altitudeMaxKm: Infinity, alpha: 0.22, lineWidth: 0.8, maxMinZoom: 2.0, lodLevel: 2 },
];
const BORDER_HORIZON_CUTOFF = 0.08;
const COUNTRY_FILL_HORIZON_CUTOFF = 0.02;
const COUNTRY_PALETTES = {
  default: {
    fill: 'rgba(116, 193, 255, 0.08)',
    stroke: 'rgba(116, 193, 255, 0.92)',
  },
  USA: {
    fill: 'rgba(86, 164, 255, 0.1)',
    stroke: 'rgba(116, 193, 255, 0.92)',
  },
  CHN: {
    fill: 'rgba(255, 96, 96, 0.09)',
    stroke: 'rgba(255, 108, 108, 0.96)',
  },
  RUS: {
    fill: 'rgba(255, 96, 96, 0.09)',
    stroke: 'rgba(255, 108, 108, 0.96)',
  },
};

export function createCountryBorderSystem({
  document,
  mountNode,
  renderer,
  camera,
  earthGroup,
  worldConfig,
  onStateChange,
  requestRender,
  countryDirectory,
}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'border-overlay';
  canvas.setAttribute('aria-hidden', 'true');
  mountNode.parentElement.appendChild(canvas);

  const context = canvas.getContext('2d');
  const localVector = new THREE.Vector3();
  const worldPosition = new THREE.Vector3();
  const inverseQuaternion = new THREE.Quaternion();
  const localCameraDirection = new THREE.Vector3();
  const projected = new THREE.Vector3();

  let enabled = false;
  let status = 'idle';
  let segments = [];
  let countryPolygons = new Map();
  let loadPromise = null;
  let canvasWidth = 0;
  let canvasHeight = 0;
  let previewCountryIso3 = null;
  let activeCountryIso3 = null;

  ensureLoaded();

  return {
    render({ altitudeKm }) {
      syncCanvasSize();
      context.clearRect(0, 0, canvasWidth, canvasHeight);
      const focusedCountryIso3 = previewCountryIso3 ?? (enabled ? activeCountryIso3 : null);
      if ((!enabled && !focusedCountryIso3) || status !== 'ready') {
        return;
      }

      const profile = getBorderProfile(altitudeKm);
      const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
      inverseQuaternion.copy(earthGroup.quaternion).invert();
      localCameraDirection.copy(camera.position).applyQuaternion(inverseQuaternion).normalize();
      context.save();
      context.scale(dpr, dpr);

      const width = canvasWidth / dpr;
      const height = canvasHeight / dpr;

      if (focusedCountryIso3) {
        drawCountryOverlay({
          context,
          country: countryPolygons.get(focusedCountryIso3),
          profile,
          camera,
          earthGroup,
          localVector,
          localCameraDirection,
          worldPosition,
          projected,
          width,
          height,
          palette: getCountryPalette(focusedCountryIso3),
        });
      }

      for (const segment of segments) {
        if (segment.minZoom > profile.maxMinZoom) {
          continue;
        }
        if (segment.maxVisibilityDot(localCameraDirection) < BORDER_HORIZON_CUTOFF) {
          continue;
        }
        if (!enabled && focusedCountryIso3 && segment.iso3 !== focusedCountryIso3) {
          continue;
        }
        context.strokeStyle =
          segment.iso3 === focusedCountryIso3
            ? getCountryPalette(focusedCountryIso3).stroke
            : `rgba(244, 226, 178, ${profile.alpha})`;
        context.lineWidth =
          segment.iso3 === focusedCountryIso3 ? profile.lineWidth * 2 : profile.lineWidth;
        drawSegment({
          context,
          points: segment.lodPoints[profile.lodLevel],
          camera,
          earthGroup,
          localVector,
          localCameraDirection,
          worldPosition,
          projected,
          width,
          height,
        });
      }

      context.restore();
    },
    toggleEnabled() {
      enabled = !enabled;
      if (enabled) {
        ensureLoaded();
      }
      emitState();
      requestRender();
      return enabled;
    },
    setEnabled(nextEnabled) {
      enabled = Boolean(nextEnabled);
      if (enabled) {
        ensureLoaded();
      }
      emitState();
      requestRender();
    },
    setPreviewCountry(iso3) {
      previewCountryIso3 = iso3;
      requestRender();
    },
    setActiveCountry(iso3) {
      activeCountryIso3 = iso3;
      requestRender();
    },
    dispose() {
      canvas.remove();
    },
  };

  function ensureLoaded() {
    if (loadPromise) {
      return loadPromise;
    }
    status = 'loading';
    emitState();
    loadPromise = Promise.all([
      fetch(BORDER_DATA_URL).then((response) => {
        if (!response.ok) {
          throw new Error(`Country border dataset load failed: ${response.status}`);
        }
        return response.json();
      }),
      fetch(COUNTRY_POLYGON_DATA_URL).then((response) => {
        if (!response.ok) {
          throw new Error(`Country polygon dataset load failed: ${response.status}`);
        }
        return response.json();
      }),
      countryDirectory?.ensureLoaded?.() ?? Promise.resolve(),
    ])
      .then(([payload, polygonPayload]) => {
        segments = payload.segments.map((segment) => {
          const country = segment[1] ? (countryDirectory?.getByIso3?.(segment[1]) ?? null) : null;
          return {
            name: segment[0],
            iso3: segment[1],
            countryId: country?.id ?? null,
            countryName: country?.name ?? null,
            minZoom: segment[2],
            ...precomputeSegment(segment[3], worldConfig.earthRadius * 1.0012),
          };
        });
        countryPolygons = new Map(
          (polygonPayload.countries ?? []).map((country) => [
            country.iso3,
            precomputeCountryPolygons(country.geometry, worldConfig.earthRadius * 1.0011),
          ]),
        );
        status = 'ready';
        emitState();
        requestRender();
      })
      .catch((error) => {
        console.error(error);
        status = 'error';
        emitState();
      });
    return loadPromise;
  }

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

  function emitState() {
    onStateChange?.({ enabled, status });
  }
}

function getBorderProfile(altitudeKm) {
  return (
    BORDER_PROFILES.find((profile) => altitudeKm <= profile.altitudeMaxKm) ??
    BORDER_PROFILES[BORDER_PROFILES.length - 1]
  );
}

function getCountryPalette(iso3) {
  return COUNTRY_PALETTES[iso3] ?? COUNTRY_PALETTES.default;
}

function drawCountryOverlay({
  context,
  country,
  profile,
  camera,
  earthGroup,
  localVector,
  localCameraDirection,
  worldPosition,
  projected,
  width,
  height,
  palette,
}) {
  if (!country) {
    return;
  }

  const outlineWidth = Math.max(profile.lineWidth * 2.2, 1.4);

  for (const polygon of country.polygons) {
    if (polygon.maxVisibilityDot(localCameraDirection) < COUNTRY_FILL_HORIZON_CUTOFF) {
      continue;
    }

    const projectedRings = [];
    let fullyVisible = true;

    for (const ring of polygon.rings) {
      const projectedRing = projectCountryRing({
        ring,
        camera,
        earthGroup,
        localVector,
        localCameraDirection,
        worldPosition,
        projected,
        width,
        height,
      });
      if (!projectedRing) {
        fullyVisible = false;
        break;
      }
      projectedRings.push(projectedRing);
    }

    if (!fullyVisible || projectedRings.length === 0) {
      continue;
    }

    context.beginPath();
    for (const ring of projectedRings) {
      context.moveTo(ring[0][0], ring[0][1]);
      for (let index = 1; index < ring.length; index += 1) {
        context.lineTo(ring[index][0], ring[index][1]);
      }
      context.closePath();
    }
    context.fillStyle = palette.fill;
    context.fill('evenodd');

    const outline = projectedRings[0];
    context.beginPath();
    context.moveTo(outline[0][0], outline[0][1]);
    for (let index = 1; index < outline.length; index += 1) {
      context.lineTo(outline[index][0], outline[index][1]);
    }
    context.closePath();
    context.strokeStyle = palette.stroke;
    context.lineWidth = outlineWidth;
    context.stroke();
  }
}

function drawSegment({
  context,
  points,
  camera,
  earthGroup,
  localVector,
  localCameraDirection,
  worldPosition,
  projected,
  width,
  height,
}) {
  let started = false;
  let visiblePoints = 0;

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    if (
      !projectBorderPoint({
        point,
        camera,
        earthGroup,
        localVector,
        localCameraDirection,
        worldPosition,
        projected,
      })
    ) {
      if (started && visiblePoints > 1) {
        context.stroke();
      }
      context.beginPath();
      started = false;
      visiblePoints = 0;
      continue;
    }

    const screenX = (projected.x + 1) * 0.5 * width;
    const screenY = (1 - projected.y) * 0.5 * height;
    if (!started) {
      context.beginPath();
      context.moveTo(screenX, screenY);
      started = true;
      visiblePoints = 1;
    } else {
      context.lineTo(screenX, screenY);
      visiblePoints += 1;
    }
  }

  if (started && visiblePoints > 1) {
    context.stroke();
  }
}

function projectBorderPoint({
  point,
  camera,
  earthGroup,
  localVector,
  localCameraDirection,
  worldPosition,
  projected,
}) {
  localVector.fromArray(point);
  if (localVector.dot(localCameraDirection) < BORDER_HORIZON_CUTOFF * localVector.length()) {
    return false;
  }
  worldPosition.copy(localVector).applyQuaternion(earthGroup.quaternion);
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

function projectCountryRing({
  ring,
  camera,
  earthGroup,
  localVector,
  localCameraDirection,
  worldPosition,
  projected,
  width,
  height,
}) {
  const projectedRing = [];

  for (const point of ring) {
    localVector.fromArray(point);
    if (
      localVector.dot(localCameraDirection) <
      COUNTRY_FILL_HORIZON_CUTOFF * localVector.length()
    ) {
      return null;
    }
    worldPosition.copy(localVector).applyQuaternion(earthGroup.quaternion);
    projected.copy(worldPosition).project(camera);
    if (
      projected.z < -1 ||
      projected.z > 1 ||
      Math.abs(projected.x) > 1.2 ||
      Math.abs(projected.y) > 1.2
    ) {
      return null;
    }

    const screenX = (projected.x + 1) * 0.5 * width;
    const screenY = (1 - projected.y) * 0.5 * height;
    projectedRing.push([screenX, screenY]);
  }

  return projectedRing.length >= 3 ? projectedRing : null;
}

function latLonToVector3({ lat, lon, radius, out }) {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon + 180);
  out.set(
    -(radius * Math.sin(phi) * Math.cos(theta)),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
  return out;
}

function precomputeSegment(points, radius) {
  const rawPoints = [];
  const directionSamples = [];

  for (const point of points) {
    const vector = latLonToVector3({
      lat: point[1],
      lon: point[0],
      radius,
      out: new THREE.Vector3(),
    });
    rawPoints.push([vector.x, vector.y, vector.z]);
    directionSamples.push(vector.clone().normalize());
  }
  const lodPoints = [rawPoints, decimatePoints(rawPoints, 2), decimatePoints(rawPoints, 4)];

  return {
    lodPoints,
    maxVisibilityDot(direction) {
      let maxDot = -Infinity;
      for (const sample of directionSamples) {
        const dot = sample.dot(direction);
        if (dot > maxDot) {
          maxDot = dot;
        }
      }
      return maxDot;
    },
  };
}

function precomputeCountryPolygons(geometry, radius) {
  const polygonCoordinates =
    geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;

  return {
    polygons: polygonCoordinates
      .map((polygon) => precomputeCountryPolygon(polygon, radius))
      .filter(Boolean),
  };
}

function precomputeCountryPolygon(rings, radius) {
  const normalizedRings = [];
  const directionSamples = [];

  for (const ring of rings) {
    const points = [];
    for (const point of ring) {
      const vector = latLonToVector3({
        lat: point[1],
        lon: point[0],
        radius,
        out: new THREE.Vector3(),
      });
      points.push([vector.x, vector.y, vector.z]);
      directionSamples.push(vector.clone().normalize());
    }
    if (points.length >= 3) {
      normalizedRings.push(points);
    }
  }

  if (normalizedRings.length === 0) {
    return null;
  }

  return {
    rings: normalizedRings,
    maxVisibilityDot(direction) {
      let maxDot = -Infinity;
      for (const sample of directionSamples) {
        const dot = sample.dot(direction);
        if (dot > maxDot) {
          maxDot = dot;
        }
      }
      return maxDot;
    },
  };
}

function decimatePoints(points, step) {
  if (points.length <= 2 || step <= 1) {
    return points;
  }

  const reduced = [];
  for (let index = 0; index < points.length; index += step) {
    reduced.push(points[index]);
  }
  const lastPoint = points[points.length - 1];
  const reducedLastPoint = reduced[reduced.length - 1];
  if (reducedLastPoint !== lastPoint) {
    reduced.push(lastPoint);
  }
  return reduced;
}
