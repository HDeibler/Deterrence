import * as THREE from 'three';
import { latLonToVector3 } from '../world/geo/geoMath.js';

const BASE_AIRCRAFT_TYPES = [
  { type: 'f35',    label: 'F-35 Lightning',       maxPerBase: 8 },
  { type: 'b2',     label: 'B-2 Spirit',           maxPerBase: 4 },
  { type: 'cargo',  label: 'C-17 Globemaster',     maxPerBase: 4 },
];

const CARRIER_AIRCRAFT_TYPES = [
  { type: 'f35',    label: 'F-35C Lightning II',    maxPerBase: 20 },
];

export function createSquadronBuilderController({ document, mountNode }) {
  let baseSite = null;
  let aircraftTypes = [];
  let deployHandler = null;
  let closeHandler = null;
  const counts = { f35: 0, b2: 0, cargo: 0 };
  const tmpVector = new THREE.Vector3();

  const panel = document.createElement('div');
  panel.className = 'squadron-builder';
  panel.hidden = true;
  panel.innerHTML = buildPanelHTML();
  mountNode.appendChild(panel);

  const baseNameEl = panel.querySelector('.squadron-builder-base');
  const aircraftContainer = panel.querySelector('.squadron-builder-aircraft');
  const deployButton = panel.querySelector('.squadron-builder-deploy');
  const closeButton = panel.querySelector('.squadron-builder-close');

  closeButton.addEventListener('click', () => close());
  deployButton.addEventListener('click', () => {
    if (!baseSite || totalAircraft() === 0) {
      return;
    }
    const aircraft = [];
    for (const { type } of aircraftTypes) {
      for (let i = 0; i < counts[type]; i++) {
        aircraft.push({ type });
      }
    }
    deployHandler?.({ baseSite, aircraft });
  });

  return {
    open(site) {
      baseSite = site;
      const isCarrier = site.category === 'carrier';
      if (isCarrier) {
        // Carrier launch — F-35C only, limited by carrier capacity
        const maxF35 = site.maxF35 || 20;
        aircraftTypes = CARRIER_AIRCRAFT_TYPES.map((t) => ({
          ...t,
          max: Math.min(t.maxPerBase, maxF35),
        }));
      } else {
        // Land base — full aircraft selection
        const baseCount = site.clusteredSites ? site.clusteredSites.length : 1;
        aircraftTypes = BASE_AIRCRAFT_TYPES.map((t) => ({
          ...t,
          max: t.maxPerBase * baseCount,
        }));
      }
      counts.f35 = Math.min(2, aircraftTypes[0].max);
      counts.b2 = 0;
      counts.cargo = 0;
      baseNameEl.textContent = site.name ?? (isCarrier ? 'Aircraft Carrier' : 'Air Base');
      buildAircraftRows();
      syncRows();
      panel.hidden = false;
    },
    close,
    isOpen() {
      return !panel.hidden;
    },
    getBaseSite() {
      return baseSite;
    },
    updateScreenPosition({ camera, renderer, earthGroup, worldConfig }) {
      if (panel.hidden || !baseSite) {
        return;
      }
      latLonToVector3({
        lat: baseSite.latitude,
        lon: baseSite.longitude,
        radius: worldConfig.earthRadius * 1.005,
        out: tmpVector,
      });
      earthGroup.localToWorld(tmpVector);
      tmpVector.project(camera);

      const behind = tmpVector.z > 1;
      const canvasWidth = renderer.domElement.clientWidth;
      const canvasHeight = renderer.domElement.clientHeight;
      const screenX = (tmpVector.x * 0.5 + 0.5) * canvasWidth;
      const screenY = (-tmpVector.y * 0.5 + 0.5) * canvasHeight;

      if (behind) {
        panel.style.opacity = '0';
        panel.style.pointerEvents = 'none';
      } else {
        panel.style.opacity = '1';
        panel.style.pointerEvents = 'auto';
        panel.style.left = `${screenX}px`;
        panel.style.top = `${screenY - 16}px`;
      }
    },
    onDeploy(handler) {
      deployHandler = handler;
      return () => { deployHandler = null; };
    },
    onClose(handler) {
      closeHandler = handler;
      return () => { closeHandler = null; };
    },
    dispose() {
      panel.remove();
    },
  };

  function close() {
    panel.hidden = true;
    baseSite = null;
    closeHandler?.();
  }

  function totalAircraft() {
    return counts.f35 + counts.b2 + counts.cargo;
  }

  function buildAircraftRows() {
    aircraftContainer.innerHTML = '';
    for (const { type, label, max } of aircraftTypes) {
      const row = document.createElement('div');
      row.className = 'squadron-ac-row';
      row.dataset.acType = type;

      const nameSpan = document.createElement('span');
      nameSpan.className = 'squadron-ac-name';
      nameSpan.textContent = label;

      const controls = document.createElement('div');
      controls.className = 'squadron-ac-controls';

      const minusBtn = document.createElement('button');
      minusBtn.type = 'button';
      minusBtn.className = 'squadron-ac-btn';
      minusBtn.textContent = '-';
      minusBtn.addEventListener('click', () => {
        counts[type] = Math.max(0, counts[type] - 1);
        syncRows();
      });

      const countSpan = document.createElement('span');
      countSpan.className = 'squadron-ac-count';
      countSpan.dataset.acType = type;
      countSpan.textContent = '0';

      const plusBtn = document.createElement('button');
      plusBtn.type = 'button';
      plusBtn.className = 'squadron-ac-btn';
      plusBtn.textContent = '+';
      plusBtn.addEventListener('click', () => {
        counts[type] = Math.min(max, counts[type] + 1);
        syncRows();
      });

      controls.appendChild(minusBtn);
      controls.appendChild(countSpan);
      controls.appendChild(plusBtn);
      row.appendChild(nameSpan);
      row.appendChild(controls);
      aircraftContainer.appendChild(row);
    }
  }

  function syncRows() {
    for (const { type } of aircraftTypes) {
      const countEl = aircraftContainer.querySelector(
        `.squadron-ac-count[data-ac-type="${type}"]`,
      );
      if (countEl) {
        countEl.textContent = String(counts[type]);
      }
    }
    const total = totalAircraft();
    deployButton.disabled = total === 0;
    deployButton.textContent = total <= 1 ? 'Plan Mission' : `Plan Mission (${total})`;
  }
}

function buildPanelHTML() {
  return `
    <div class="squadron-builder-header">
      <span class="squadron-builder-title">Plan Mission</span>
      <button type="button" class="squadron-builder-close">&times;</button>
    </div>
    <p class="squadron-builder-base">Air Base</p>
    <div class="squadron-builder-aircraft"></div>
    <button type="button" class="squadron-builder-deploy" disabled>Plan Mission</button>
  `;
}
