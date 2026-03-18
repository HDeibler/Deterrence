import * as THREE from 'three';
import { latLonToVector3 } from '../world/geo/geoMath.js';

const SHIP_TYPES = [
  { type: 'carrier', label: 'Aircraft Carrier', max: 2 },
  { type: 'cruiser', label: 'Cruiser', max: 4 },
  { type: 'submarine', label: 'Submarine', max: 4 },
];

export function createFleetBuilderController({ document, mountNode }) {
  let baseSite = null;
  let deployHandler = null;
  let closeHandler = null;
  const counts = { carrier: 0, cruiser: 0, submarine: 0 };
  const tmpVector = new THREE.Vector3();

  const panel = document.createElement('div');
  panel.className = 'fleet-builder';
  panel.hidden = true;
  panel.innerHTML = buildPanelHTML();
  mountNode.appendChild(panel);

  const baseNameEl = panel.querySelector('.fleet-builder-base');
  const shipsContainer = panel.querySelector('.fleet-builder-ships');
  const deployButton = panel.querySelector('.fleet-builder-deploy');
  const closeButton = panel.querySelector('.fleet-builder-close');

  closeButton.addEventListener('click', () => close());
  deployButton.addEventListener('click', () => {
    if (!baseSite || totalShips() === 0) {
      return;
    }
    const ships = [];
    for (const { type } of SHIP_TYPES) {
      for (let i = 0; i < counts[type]; i++) {
        ships.push({ type });
      }
    }
    deployHandler?.({ baseSite, ships });
    close();
  });

  buildShipRows();

  return {
    open(site) {
      baseSite = site;
      counts.carrier = 1;
      counts.cruiser = 1;
      counts.submarine = 0;
      baseNameEl.textContent = site.name ?? 'Naval Base';
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
      return () => {
        deployHandler = null;
      };
    },
    onClose(handler) {
      closeHandler = handler;
      return () => {
        closeHandler = null;
      };
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

  function totalShips() {
    return counts.carrier + counts.cruiser + counts.submarine;
  }

  function buildShipRows() {
    shipsContainer.innerHTML = '';
    for (const { type, label, max } of SHIP_TYPES) {
      const row = document.createElement('div');
      row.className = 'fleet-ship-row';
      row.dataset.shipType = type;

      const nameSpan = document.createElement('span');
      nameSpan.className = 'fleet-ship-name';
      nameSpan.textContent = label;

      const controls = document.createElement('div');
      controls.className = 'fleet-ship-controls';

      const minusBtn = document.createElement('button');
      minusBtn.type = 'button';
      minusBtn.className = 'fleet-ship-btn';
      minusBtn.textContent = '-';
      minusBtn.addEventListener('click', () => {
        counts[type] = Math.max(0, counts[type] - 1);
        syncRows();
      });

      const countSpan = document.createElement('span');
      countSpan.className = 'fleet-ship-count';
      countSpan.dataset.shipType = type;
      countSpan.textContent = '0';

      const plusBtn = document.createElement('button');
      plusBtn.type = 'button';
      plusBtn.className = 'fleet-ship-btn';
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
      shipsContainer.appendChild(row);
    }
  }

  function syncRows() {
    for (const { type } of SHIP_TYPES) {
      const countEl = shipsContainer.querySelector(`.fleet-ship-count[data-ship-type="${type}"]`);
      if (countEl) {
        countEl.textContent = String(counts[type]);
      }
    }
    deployButton.disabled = totalShips() === 0;
    deployButton.textContent = totalShips() === 1 ? 'Deploy Ship' : `Deploy Fleet (${totalShips()})`;
  }
}

function buildPanelHTML() {
  return `
    <div class="fleet-builder-header">
      <span class="fleet-builder-title">Deploy Fleet</span>
      <button type="button" class="fleet-builder-close">&times;</button>
    </div>
    <p class="fleet-builder-base">Naval Base</p>
    <div class="fleet-builder-ships"></div>
    <button type="button" class="fleet-builder-deploy" disabled>Deploy Fleet</button>
  `;
}
