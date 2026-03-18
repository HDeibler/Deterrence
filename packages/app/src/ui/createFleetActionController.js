import * as THREE from 'three';
import { latLonToVector3 } from '../world/geo/geoMath.js';

export function createFleetActionController({ document, mountNode }) {
  let fleet = null;
  let setRouteHandler = null;
  let confirmRouteHandler = null;
  let launchAircraftHandler = null;
  let closeHandler = null;
  const tmpVector = new THREE.Vector3();

  const panel = document.createElement('div');
  panel.className = 'fleet-action';
  panel.hidden = true;
  panel.innerHTML = buildHTML();
  mountNode.appendChild(panel);

  const titleEl = panel.querySelector('.fleet-action-title');
  const infoEl = panel.querySelector('.fleet-action-info');
  const routeBtn = panel.querySelector('.fleet-action-route');
  const launchBtn = panel.querySelector('.fleet-action-launch');
  const confirmBtn = panel.querySelector('.fleet-action-confirm');
  const closeBtn = panel.querySelector('.fleet-action-close');

  closeBtn.addEventListener('click', () => close());
  routeBtn.addEventListener('click', () => setRouteHandler?.());
  launchBtn.addEventListener('click', () => launchAircraftHandler?.());
  confirmBtn.addEventListener('click', () => confirmRouteHandler?.());

  return {
    open(fleetData) {
      fleet = fleetData;
      titleEl.textContent = fleet.name || `Fleet ${fleet.id.replace('fleet_', '#')}`;
      infoEl.textContent = summarizeFleet(fleet);
      routeBtn.hidden = false;
      confirmBtn.hidden = true;
      const hasCarrier = fleet.ships.some((s) => s.type === 'carrier' && !s.sunk);
      launchBtn.hidden = !hasCarrier;
      panel.hidden = false;
    },
    close,
    isOpen() {
      return !panel.hidden;
    },
    getFleet() {
      return fleet;
    },
    showConfirm() {
      routeBtn.hidden = true;
      confirmBtn.hidden = false;
    },
    updateScreenPosition({ camera, renderer, earthGroup, worldConfig }) {
      if (panel.hidden || !fleet) {
        return;
      }
      latLonToVector3({
        lat: fleet.lat,
        lon: fleet.lon,
        radius: worldConfig.earthRadius * 1.005,
        out: tmpVector,
      });
      earthGroup.localToWorld(tmpVector);
      tmpVector.project(camera);

      const behind = tmpVector.z > 1;
      const w = renderer.domElement.clientWidth;
      const h = renderer.domElement.clientHeight;
      const sx = (tmpVector.x * 0.5 + 0.5) * w;
      const sy = (-tmpVector.y * 0.5 + 0.5) * h;

      if (behind) {
        panel.style.opacity = '0';
        panel.style.pointerEvents = 'none';
      } else {
        panel.style.opacity = '1';
        panel.style.pointerEvents = 'auto';
        panel.style.left = `${sx}px`;
        panel.style.top = `${sy - 16}px`;
      }
    },
    onSetRoute(handler) {
      setRouteHandler = handler;
      return () => { setRouteHandler = null; };
    },
    onConfirmRoute(handler) {
      confirmRouteHandler = handler;
      return () => { confirmRouteHandler = null; };
    },
    onLaunchAircraft(handler) {
      launchAircraftHandler = handler;
      return () => { launchAircraftHandler = null; };
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
    fleet = null;
    closeHandler?.();
  }

  function summarizeFleet(f) {
    const counts = {};
    for (const ship of f.ships) {
      if (!ship.sunk) {
        counts[ship.type] = (counts[ship.type] || 0) + 1;
      }
    }
    return Object.entries(counts)
      .map(([type, count]) => `${count} ${type}${count > 1 ? 's' : ''}`)
      .join(', ');
  }
}

function buildHTML() {
  return `
    <div class="fleet-action-header">
      <span class="fleet-action-title">Fleet</span>
      <button type="button" class="fleet-action-close">&times;</button>
    </div>
    <p class="fleet-action-info"></p>
    <div class="fleet-action-buttons">
      <button type="button" class="fleet-action-route">Set Route</button>
      <button type="button" class="fleet-action-launch" hidden>Launch Aircraft</button>
    </div>
    <button type="button" class="fleet-action-confirm" hidden>Confirm Route</button>
  `;
}
