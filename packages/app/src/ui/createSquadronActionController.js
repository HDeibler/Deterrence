import * as THREE from 'three';
import { latLonToVector3 } from '../world/geo/geoMath.js';

export function createSquadronActionController({ document, mountNode }) {
  let anchorLat = null;
  let anchorLon = null;
  let confirmRouteHandler = null;
  let closeHandler = null;
  const tmpVector = new THREE.Vector3();

  const panel = document.createElement('div');
  panel.className = 'squadron-action';
  panel.hidden = true;
  panel.innerHTML = buildHTML();
  mountNode.appendChild(panel);

  const titleEl = panel.querySelector('.squadron-action-title');
  const infoEl = panel.querySelector('.squadron-action-info');
  const routeDetailEl = panel.querySelector('.squadron-action-route-detail');
  const confirmBtn = panel.querySelector('.squadron-action-confirm');
  const outOfRangeEl = panel.querySelector('.squadron-action-oor');
  const closeBtn = panel.querySelector('.squadron-action-close');

  closeBtn.addEventListener('click', () => close());
  confirmBtn.addEventListener('click', () => confirmRouteHandler?.());

  return {
    openRoutePlan({ baseName, destName, routePlan }) {
      anchorLat = routePlan.legs[0].from.lat;
      anchorLon = routePlan.legs[0].from.lon;
      titleEl.textContent = `${baseName} → ${destName}`;

      const distStr = Math.round(routePlan.distanceKm).toLocaleString();
      const legCount = routePlan.legs.length;
      const tankerCount = routePlan.tankerAssignments.length;

      let detail = `${distStr} km`;
      if (routePlan.directFlight) {
        detail += ' — direct flight';
      } else {
        detail += ` — ${legCount} legs`;
        if (tankerCount > 0) {
          detail += `, ${tankerCount} tanker${tankerCount > 1 ? 's' : ''}`;
          const baseNames = [...new Set(routePlan.tankerAssignments.map((ta) => ta.baseName))];
          detail += ` from ${baseNames.join(', ')}`;
          const divertNames = routePlan.tankerAssignments
            .filter((ta) => ta.returnName !== ta.baseName)
            .map((ta) => ta.returnName);
          if (divertNames.length > 0) {
            const uniqueDiverts = [...new Set(divertNames)];
            detail += ` (divert → ${uniqueDiverts.join(', ')})`;
          }
        }
      }
      routeDetailEl.textContent = detail;
      infoEl.textContent = '';
      confirmBtn.hidden = false;
      outOfRangeEl.hidden = true;
      panel.hidden = false;
    },
    openSquadronInfo(sqData) {
      anchorLat = sqData.lat;
      anchorLon = sqData.lon;
      const phase = sqData.phase === 'holding' ? ' (holding for tankers)' : '';
      titleEl.textContent = (sqData.name || 'Squadron') + phase;
      infoEl.innerHTML = buildFuelDisplay(sqData);
      routeDetailEl.textContent = '';
      confirmBtn.hidden = true;
      outOfRangeEl.hidden = true;
      panel.hidden = false;
    },
    close,
    isOpen() {
      return !panel.hidden;
    },
    showConfirm() {
      confirmBtn.hidden = false;
      outOfRangeEl.hidden = true;
    },
    showOutOfRange(msg) {
      outOfRangeEl.textContent = msg;
      outOfRangeEl.hidden = false;
    },
    hideOutOfRange() {
      outOfRangeEl.hidden = true;
    },
    showNotViable(reason) {
      routeDetailEl.textContent = '';
      infoEl.textContent = reason;
      confirmBtn.hidden = true;
      outOfRangeEl.hidden = true;
    },
    updateScreenPosition({ camera, renderer, earthGroup, worldConfig }) {
      if (panel.hidden || anchorLat === null) {
        return;
      }
      latLonToVector3({
        lat: anchorLat,
        lon: anchorLon,
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
    onConfirmRoute(handler) {
      confirmRouteHandler = handler;
      return () => { confirmRouteHandler = null; };
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
    anchorLat = null;
    anchorLon = null;
    closeHandler?.();
  }

  function buildFuelDisplay(sqData) {
    const labels = { f35: 'F-35', b2: 'B-2', tanker: 'KC-135', cargo: 'C-17' };
    const lines = [];

    // Combat aircraft
    const aircraft = sqData.aircraft || [];
    for (const ac of aircraft) {
      if (ac.destroyed) {
        continue;
      }
      const name = labels[ac.type] || ac.type;
      const pct = ac.maxFuelKm > 0 ? Math.round((ac.fuelRemainingKm / ac.maxFuelKm) * 100) : 0;
      const remaining = Math.round(ac.fuelRemainingKm);
      const color = pct > 50 ? '#60d394' : pct > 20 ? '#ffd166' : '#ef476f';
      lines.push(
        `<span style="color:${color}">${name}</span> ` +
        `<span style="color:var(--muted)">${remaining.toLocaleString()} km (${pct}%)</span>`,
      );
    }

    // Tanker flights
    const tankers = sqData.tankerFlights || [];
    for (const tf of tankers) {
      if (tf.phase === 'landed') {
        continue;
      }
      const pct = tf.maxFuelKm > 0 ? Math.round((tf.fuelRemainingKm / tf.maxFuelKm) * 100) : 0;
      const remaining = Math.round(tf.fuelRemainingKm);
      const color = pct > 50 ? '#60d394' : pct > 20 ? '#ffd166' : '#ef476f';
      let phaseLabel = tf.phase === 'outbound' ? 'en route'
        : tf.phase === 'loitering' ? 'waiting'
        : `returning → ${tf.returnName || 'base'}`;
      if (tf.waitingForRelay) {
        phaseLabel = 'waiting for relay';
      }
      const roleLabel = tf.isRelay ? 'KC-135 (relay)' : 'KC-135';
      lines.push(
        `<span style="color:${color}">${roleLabel}</span> ` +
        `<span style="color:var(--muted)">${remaining.toLocaleString()} km (${pct}%) — ${phaseLabel}</span>`,
      );
    }

    return lines.join('<br>');
  }
}

function buildHTML() {
  return `
    <div class="squadron-action-header">
      <span class="squadron-action-title">Mission</span>
      <button type="button" class="squadron-action-close">&times;</button>
    </div>
    <p class="squadron-action-info"></p>
    <p class="squadron-action-route-detail"></p>
    <p class="squadron-action-oor" hidden></p>
    <button type="button" class="squadron-action-confirm" hidden>Confirm Mission</button>
  `;
}
