import {
  ORBIT_PRESETS,
  ORBIT_ALTITUDE_RANGE,
  computeFootprintRadiusKm,
  computeOrbitalPeriodSeconds,
  computeOrbitsPerHour,
  computeOrbitalSpeedKmS,
  describeOrbit,
  EARLY_WARNING_SATELLITE_PRESET,
} from '../game/data/radarCatalog.js';

export function createOrbitPlannerController({ document, mountNode }) {
  let changeHandler = null;
  let launchHandler = null;
  let closeHandler = null;

  const state = {
    altitudeKm: EARLY_WARNING_SATELLITE_PRESET.defaultAltitudeKm,
    inclinationDeg: EARLY_WARNING_SATELLITE_PRESET.defaultInclinationDeg,
    raanDeg: EARLY_WARNING_SATELLITE_PRESET.defaultRaanDeg,
  };

  const panel = document.createElement('div');
  panel.className = 'orbit-planner';
  panel.hidden = true;
  panel.innerHTML = buildPanelHTML();
  mountNode.appendChild(panel);

  // Elements
  const closeButton = panel.querySelector('.orbit-planner-close');
  const altSlider = panel.querySelector('#orbitAltSlider');
  const altValue = panel.querySelector('#orbitAltValue');
  const incSlider = panel.querySelector('#orbitIncSlider');
  const incValue = panel.querySelector('#orbitIncValue');
  const raanSlider = panel.querySelector('#orbitRaanSlider');
  const raanValue = panel.querySelector('#orbitRaanValue');
  const periodReadout = panel.querySelector('#orbitPeriod');
  const orbitsHrReadout = panel.querySelector('#orbitOrbitsHr');
  const speedReadout = panel.querySelector('#orbitSpeed');
  const coverageReadout = panel.querySelector('#orbitCoverage');
  const typeReadout = panel.querySelector('#orbitType');
  const presetButtons = panel.querySelectorAll('.orbit-preset-btn');
  const launchButton = panel.querySelector('.orbit-planner-launch');

  // Bind events
  closeButton.addEventListener('click', () => close());
  altSlider.addEventListener('input', () => {
    state.altitudeKm = Number(altSlider.value);
    syncUI();
    emitChange();
  });
  incSlider.addEventListener('input', () => {
    state.inclinationDeg = Number(incSlider.value);
    syncUI();
    emitChange();
  });
  raanSlider.addEventListener('input', () => {
    state.raanDeg = Number(raanSlider.value);
    syncUI();
    emitChange();
  });
  for (const btn of presetButtons) {
    btn.addEventListener('click', () => {
      const preset = ORBIT_PRESETS.find((p) => p.id === btn.dataset.preset);
      if (!preset) return;
      state.altitudeKm = preset.altitudeKm;
      state.inclinationDeg = preset.inclinationDeg;
      state.raanDeg = preset.raanDeg;
      altSlider.value = String(state.altitudeKm);
      incSlider.value = String(state.inclinationDeg);
      raanSlider.value = String(state.raanDeg);
      syncUI();
      emitChange();
    });
  }
  launchButton.addEventListener('click', () => {
    launchHandler?.({ ...state });
  });

  syncUI();

  return {
    open() {
      panel.hidden = false;
      syncUI();
      emitChange();
    },
    close,
    isOpen() {
      return !panel.hidden;
    },
    getState() {
      return { ...state };
    },
    isGeostationary() {
      return state.altitudeKm >= 35000 && state.inclinationDeg < 2;
    },
    setLaunchEnabled(enabled) {
      launchButton.disabled = !enabled;
      launchButton.textContent = enabled ? 'Launch Satellite' : 'Select a GEO slot first';
    },
    onChange(handler) {
      changeHandler = handler;
      return () => { changeHandler = null; };
    },
    onLaunch(handler) {
      launchHandler = handler;
      return () => { launchHandler = null; };
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
    closeHandler?.();
  }

  function emitChange() {
    changeHandler?.({ ...state });
  }

  function syncUI() {
    const alt = state.altitudeKm;
    altValue.textContent = `${alt.toLocaleString()} km`;
    incValue.textContent = `${state.inclinationDeg}\u00B0`;
    raanValue.textContent = `${state.raanDeg}\u00B0`;

    const periodSec = computeOrbitalPeriodSeconds(alt);
    const periodMin = periodSec / 60;
    periodReadout.textContent = periodMin < 120
      ? `${periodMin.toFixed(1)} min`
      : `${(periodMin / 60).toFixed(1)} hr`;

    const orbitsHr = computeOrbitsPerHour(alt);
    orbitsHrReadout.textContent = orbitsHr.toFixed(2);

    const speedKmS = computeOrbitalSpeedKmS(alt);
    speedReadout.textContent = `${speedKmS.toFixed(1)} km/s`;

    const coverageKm = computeFootprintRadiusKm(alt);
    coverageReadout.textContent = `${Math.round(coverageKm).toLocaleString()} km`;

    typeReadout.textContent = describeOrbit(alt);

    // For non-GEO, launch is always available (no slot needed)
    // For GEO, the Application wires setLaunchEnabled when a slot is picked
    const isGeo = state.altitudeKm >= 35000 && state.inclinationDeg < 2;
    if (!isGeo) {
      launchButton.disabled = false;
      launchButton.textContent = 'Launch Satellite';
    }

    // Highlight active preset
    for (const btn of presetButtons) {
      const preset = ORBIT_PRESETS.find((p) => p.id === btn.dataset.preset);
      const active = preset
        && Math.abs(preset.altitudeKm - state.altitudeKm) < 50
        && Math.abs(preset.inclinationDeg - state.inclinationDeg) < 2
        && Math.abs(preset.raanDeg - state.raanDeg) < 5;
      btn.classList.toggle('active', Boolean(active));
    }
  }
}

function buildPanelHTML() {
  const presetBtns = ORBIT_PRESETS.map(
    (p) => `<button type="button" class="orbit-preset-btn" data-preset="${p.id}">${p.label}</button>`,
  ).join('');

  return `
    <div class="orbit-planner-header">
      <span class="orbit-planner-title">Orbit Planner</span>
      <button type="button" class="orbit-planner-close">&times;</button>
    </div>

    <div class="orbit-planner-presets">${presetBtns}</div>

    <div class="orbit-planner-sliders">
      <label class="orbit-slider-row">
        <span class="orbit-slider-label">Altitude</span>
        <input id="orbitAltSlider" type="range" min="${ORBIT_ALTITUDE_RANGE.minKm}" max="${ORBIT_ALTITUDE_RANGE.maxKm}" step="100" value="2000" />
        <span id="orbitAltValue" class="orbit-slider-value">2,000 km</span>
      </label>
      <label class="orbit-slider-row">
        <span class="orbit-slider-label">Inclination</span>
        <input id="orbitIncSlider" type="range" min="0" max="90" step="1" value="28" />
        <span id="orbitIncValue" class="orbit-slider-value">28\u00B0</span>
      </label>
      <label class="orbit-slider-row">
        <span class="orbit-slider-label">RAAN</span>
        <input id="orbitRaanSlider" type="range" min="0" max="360" step="1" value="0" />
        <span id="orbitRaanValue" class="orbit-slider-value">0\u00B0</span>
      </label>
    </div>

    <div class="orbit-planner-readouts">
      <div class="orbit-readout">
        <span class="orbit-readout-label">Period</span>
        <strong id="orbitPeriod">-</strong>
      </div>
      <div class="orbit-readout">
        <span class="orbit-readout-label">Orbits/hr</span>
        <strong id="orbitOrbitsHr">-</strong>
      </div>
      <div class="orbit-readout">
        <span class="orbit-readout-label">Speed</span>
        <strong id="orbitSpeed">-</strong>
      </div>
      <div class="orbit-readout">
        <span class="orbit-readout-label">Coverage</span>
        <strong id="orbitCoverage">-</strong>
      </div>
    </div>

    <p id="orbitType" class="orbit-planner-type">-</p>

    <button type="button" class="orbit-planner-launch" disabled>Select orbit slot first</button>
  `;
}
