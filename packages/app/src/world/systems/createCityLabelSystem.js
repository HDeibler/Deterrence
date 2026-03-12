import * as THREE from 'three';

const CITY_DATA_URL = '/data/cities/world-cities-5000.json';
const LABEL_PROFILES = [
  {
    altitudeMaxKm: 300,
    minPopulation: 350000,
    minCapitalRank: 2,
    maxLabels: 70,
    fontSize: 15,
    cellHeight: 24,
  },
  {
    altitudeMaxKm: 700,
    minPopulation: 600000,
    minCapitalRank: 2,
    maxLabels: 58,
    fontSize: 14.5,
    cellHeight: 23,
  },
  {
    altitudeMaxKm: 1400,
    minPopulation: 900000,
    minCapitalRank: 2,
    maxLabels: 46,
    fontSize: 14,
    cellHeight: 22,
  },
  {
    altitudeMaxKm: 3000,
    minPopulation: 1800000,
    minCapitalRank: 3,
    maxLabels: 34,
    fontSize: 13,
    cellHeight: 21,
  },
  {
    altitudeMaxKm: 7000,
    minPopulation: 4000000,
    minCapitalRank: 3,
    maxLabels: 24,
    fontSize: 12.5,
    cellHeight: 20,
  },
  {
    altitudeMaxKm: Infinity,
    minPopulation: 9000000,
    minCapitalRank: 4,
    maxLabels: 14,
    fontSize: 12,
    cellHeight: 18,
  },
];

export function createCityLabelSystem({
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
  canvas.className = 'city-overlay';
  canvas.setAttribute('aria-hidden', 'true');
  mountNode.parentElement.appendChild(canvas);

  const context = canvas.getContext('2d');
  const localVector = new THREE.Vector3();
  const worldPosition = new THREE.Vector3();
  const worldNormal = new THREE.Vector3();
  const toCamera = new THREE.Vector3();
  const projected = new THREE.Vector3();

  let enabled = false;
  let status = 'idle';
  let cities = [];
  let loadPromise = null;
  let canvasWidth = 0;
  let canvasHeight = 0;

  ensureLoaded();

  return {
    render({ altitudeKm }) {
      syncCanvasSize();
      context.clearRect(0, 0, canvasWidth, canvasHeight);
      if (!enabled || status !== 'ready') {
        return;
      }

      const profile = getProfile(altitudeKm);
      const occupied = new Set();
      const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
      context.save();
      context.scale(dpr, dpr);
      context.font = `${profile.fontSize}px "Space Grotesk", "Avenir Next", sans-serif`;
      context.textBaseline = 'middle';
      context.lineJoin = 'round';
      context.lineWidth = 3;

      let drawn = 0;
      for (let index = 0; index < cities.length && drawn < profile.maxLabels; index += 1) {
        const city = cities[index];
        if (city.population < profile.minPopulation && city.capitalRank < profile.minCapitalRank) {
          continue;
        }

        if (
          !projectCity({
            city,
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

        const screenX = (projected.x + 1) * 0.5 * (canvasWidth / dpr);
        const screenY = (1 - projected.y) * 0.5 * (canvasHeight / dpr);
        const text = city.name;
        const textWidth = context.measureText(text).width;
        const labelLeft = screenX + 8;
        const labelTop = screenY - profile.cellHeight * 0.5;
        if (
          isOccupied({
            occupied,
            labelLeft,
            labelTop,
            width: textWidth + 10,
            height: profile.cellHeight,
            cellHeight: profile.cellHeight,
          })
        ) {
          continue;
        }

        markOccupied({
          occupied,
          labelLeft,
          labelTop,
          width: textWidth + 10,
          height: profile.cellHeight,
          cellHeight: profile.cellHeight,
        });
        drawLabel({ context, x: screenX, y: screenY, text, capitalRank: city.capitalRank });
        drawn += 1;
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
    isEnabled() {
      return enabled;
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
      fetch(CITY_DATA_URL).then((response) => {
        if (!response.ok) {
          throw new Error(`City dataset load failed: ${response.status}`);
        }
        return response.json();
      }),
      countryDirectory?.ensureLoaded?.() ?? Promise.resolve(),
    ])
      .then(([payload]) => {
        cities = payload.cities.map((city) => {
          const country = countryDirectory?.getByIso2?.(city[1]) ?? null;
          return {
            name: city[0],
            countryCode: city[1],
            countryId: country?.id ?? null,
            countryIso3: country?.iso3 ?? null,
            countryName: country?.name ?? null,
            lat: city[2],
            lon: city[3],
            population: city[4],
            capitalRank: city[5],
            score: city[6],
          };
        });
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

function getProfile(altitudeKm) {
  return (
    LABEL_PROFILES.find((profile) => altitudeKm <= profile.altitudeMaxKm) ??
    LABEL_PROFILES[LABEL_PROFILES.length - 1]
  );
}

function projectCity({
  city,
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
    lat: city.lat,
    lon: city.lon,
    radius: worldConfig.earthRadius * 1.002,
    out: localVector,
  });
  worldPosition.copy(localVector).applyQuaternion(earthGroup.quaternion);
  worldNormal.copy(localVector).normalize().applyQuaternion(earthGroup.quaternion).normalize();
  toCamera.copy(camera.position).sub(worldPosition).normalize();

  if (worldNormal.dot(toCamera) < 0.12) {
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

function isOccupied({ occupied, labelLeft, labelTop, width, height, cellHeight }) {
  const cellWidth = 110;
  const minX = Math.floor(labelLeft / cellWidth);
  const maxX = Math.floor((labelLeft + width) / cellWidth);
  const minY = Math.floor(labelTop / cellHeight);
  const maxY = Math.floor((labelTop + height) / cellHeight);
  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      if (occupied.has(`${x}:${y}`)) {
        return true;
      }
    }
  }
  return false;
}

function markOccupied({ occupied, labelLeft, labelTop, width, height, cellHeight }) {
  const cellWidth = 110;
  const minX = Math.floor(labelLeft / cellWidth);
  const maxX = Math.floor((labelLeft + width) / cellWidth);
  const minY = Math.floor(labelTop / cellHeight);
  const maxY = Math.floor((labelTop + height) / cellHeight);
  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      occupied.add(`${x}:${y}`);
    }
  }
}

function drawLabel({ context, x, y, text, capitalRank }) {
  const accent = capitalRank >= 4 ? '#f7f3da' : capitalRank >= 2 ? '#dff4ff' : '#b8d0df';
  context.beginPath();
  context.arc(x, y, capitalRank >= 4 ? 2.8 : 2.1, 0, Math.PI * 2);
  context.fillStyle = accent;
  context.shadowColor = 'rgba(0, 0, 0, 0.36)';
  context.shadowBlur = 12;
  context.fill();
  context.shadowBlur = 0;
  context.strokeStyle = 'rgba(4, 9, 19, 0.82)';
  context.strokeText(text, x + 8, y);
  context.fillStyle = accent;
  context.fillText(text, x + 8, y);
}
