const CATEGORY_LABELS = {
  all: 'All Sites',
  silo: 'Missile Silos',
  airbase: 'Airbases',
  naval: 'Naval Facilities',
};

export function createChromeController({ document }) {
  const missileButton = document.getElementById('missileToggle');
  const missileLabel = document.getElementById('missileToggleLabel');
  const launchSummaryLabel = document.getElementById('launchSummaryLabel');
  const navalButton = document.getElementById('navalToggle');
  const navalLabel = document.getElementById('navalToggleLabel');
  const navalSummaryLabel = document.getElementById('navalSummaryLabel');
  const radarButton = document.getElementById('radarToggle');
  const radarLabel = document.getElementById('radarToggleLabel');
  const radarSummaryLabel = document.getElementById('radarSummaryLabel');
  const radarModeCycleButton = document.getElementById('radarModeCycle');
  const radarModeCycleLabel = document.getElementById('radarModeCycleLabel');
  const siteFilterButton = document.getElementById('siteFilterToggle');
  const siteFilterLabel = document.getElementById('siteFilterToggleLabel');
  const warheadChip = document.getElementById('warheadCountChip');
  const warheadLabel = document.getElementById('warheadCountLabel');
  const warheadDecreaseButton = document.getElementById('warheadDecreaseButton');
  const warheadIncreaseButton = document.getElementById('warheadIncreaseButton');
  const settingsButton = document.getElementById('settingsToggle');
  const resetButton = document.getElementById('resetViewButton');

  const viewButtons = {
    launch: {
      button: document.getElementById('viewLaunchToggle'),
      label: document.getElementById('viewLaunchLabel'),
      baseLabel: 'Launch View',
    },
    radar: {
      button: document.getElementById('viewRadarToggle'),
      label: document.getElementById('viewRadarLabel'),
      baseLabel: 'Radar View',
    },
    naval: {
      button: document.getElementById('viewNavalToggle'),
      label: document.getElementById('viewNavalLabel'),
      baseLabel: 'Naval View',
    },
    bases: {
      button: document.getElementById('viewBasesToggle'),
      label: document.getElementById('viewBasesLabel'),
      baseLabel: 'Bases',
    },
    context: {
      button: document.getElementById('viewContextToggle'),
      label: document.getElementById('viewContextLabel'),
      baseLabel: 'Borders/Cities',
    },
  };

  updateMissileButton({ mode: 'idle' });
  updateNavalButton({ enabled: false });
  updateRadarButton({ mode: 'off' });
  updateRadarModeCycle({ mode: 'ground' });
  setWarheadCount(1);
  setViewButtonState('launch', true);
  setViewButtonState('radar', true);
  setViewButtonState('naval', true);
  setViewButtonState('bases', false);
  setViewButtonState('context', false);

  return {
    onToggleMissile(handler) {
      missileButton.addEventListener('click', handler);
      return () => missileButton.removeEventListener('click', handler);
    },
    onToggleNaval(handler) {
      navalButton.addEventListener('click', handler);
      return () => navalButton.removeEventListener('click', handler);
    },
    onToggleRadar(handler) {
      radarButton.addEventListener('click', handler);
      return () => radarButton.removeEventListener('click', handler);
    },
    onCycleRadarMode(handler) {
      radarModeCycleButton.addEventListener('click', handler);
      return () => radarModeCycleButton.removeEventListener('click', handler);
    },
    onToggleSiteFilter(handler) {
      siteFilterButton.addEventListener('click', handler);
      return () => siteFilterButton.removeEventListener('click', handler);
    },
    onIncreaseWarheads(handler) {
      warheadIncreaseButton.addEventListener('click', handler);
      return () => warheadIncreaseButton.removeEventListener('click', handler);
    },
    onDecreaseWarheads(handler) {
      warheadDecreaseButton.addEventListener('click', handler);
      return () => warheadDecreaseButton.removeEventListener('click', handler);
    },
    onToggleViewLaunch(handler) {
      return bindViewToggle(viewButtons.launch.button, handler);
    },
    onToggleViewRadar(handler) {
      return bindViewToggle(viewButtons.radar.button, handler);
    },
    onToggleViewNaval(handler) {
      return bindViewToggle(viewButtons.naval.button, handler);
    },
    onToggleViewBases(handler) {
      return bindViewToggle(viewButtons.bases.button, handler);
    },
    onToggleViewContext(handler) {
      return bindViewToggle(viewButtons.context.button, handler);
    },
    onOpenSettings(handler) {
      settingsButton.addEventListener('click', handler);
      return () => settingsButton.removeEventListener('click', handler);
    },
    onResetView(handler) {
      resetButton.addEventListener('click', handler);
      return () => resetButton.removeEventListener('click', handler);
    },
    setMissileState(state) {
      updateMissileButton(state);
    },
    setCitiesState() {},
    setBordersState() {},
    setNavalState(state) {
      updateNavalButton(state);
    },
    setRadarState(state) {
      updateRadarButton(state);
      updateRadarModeCycle(state);
    },
    setSiteFilter(category) {
      siteFilterLabel.textContent = CATEGORY_LABELS[category] ?? 'All Sites';
    },
    setWarheadCount,
    setViewState(viewKey, enabled) {
      setViewButtonState(viewKey, enabled);
    },
  };

  function updateMissileButton({ mode = 'idle', category, warheadCount, targetsPlaced } = {}) {
    const labels = {
      idle: 'Strike Mode',
      strike: 'Planning Strike',
      strikeConfirm: 'Confirm Strike',
      selectLaunch: 'Select Silo',
      selectTarget: 'Select Target',
      confirm: 'Confirm Launch',
    };
    const summaries = {
      idle: 'Strike Off',
      strike: 'Planning',
      strikeConfirm: 'Ready',
      selectLaunch: 'Pick Silo',
      selectTarget: 'Pick Target',
      confirm: 'Awaiting Confirm',
    };

    missileLabel.textContent = labels[mode] ?? labels.idle;
    launchSummaryLabel.textContent = summaries[mode] ?? summaries.idle;
    missileButton.dataset.mode = mode;
    missileButton.setAttribute('aria-pressed', String(mode !== 'idle'));

    const active = mode !== 'idle';
    siteFilterButton.disabled = !active;
    warheadDecreaseButton.disabled = !active;
    warheadIncreaseButton.disabled = !active;
    warheadChip.dataset.enabled = active ? 'true' : 'false';

    if (category) {
      siteFilterLabel.textContent = CATEGORY_LABELS[category] ?? 'All Sites';
    }
    if (warheadCount !== undefined) {
      const placed = targetsPlaced ?? 0;
      warheadLabel.textContent =
        placed > 0 ? `Targets: ${placed}/${warheadCount}` : `Warheads: ${warheadCount}`;
    }
  }

  function updateNavalButton({ enabled }) {
    navalLabel.textContent = enabled ? 'Disable Naval Mode' : 'Naval Mode';
    navalSummaryLabel.textContent = enabled ? 'Active' : 'Off';
    navalButton.dataset.enabled = enabled ? 'true' : 'false';
    navalButton.setAttribute('aria-pressed', String(enabled));
  }

  function updateRadarButton({ mode = 'off' } = {}) {
    const enabled = mode !== 'off';
    radarLabel.textContent = enabled ? 'Disable Radar Mode' : 'Radar Mode';
    radarSummaryLabel.textContent =
      mode === 'ground' ? 'Ground' : mode === 'satellite' ? 'Satellite' : 'Off';
    radarButton.dataset.enabled = enabled ? 'true' : 'false';
    radarButton.setAttribute('aria-pressed', String(enabled));
  }

  function updateRadarModeCycle({ mode = 'off' } = {}) {
    const nextLabel = mode === 'satellite' ? 'Satellite Early Warning' : 'Ground Radar';
    radarModeCycleLabel.textContent = nextLabel;
    radarModeCycleButton.disabled = mode === 'off';
  }

  function setWarheadCount(count) {
    warheadLabel.textContent = `Warheads: ${count}`;
  }

  function setViewButtonState(viewKey, enabled) {
    const entry = viewButtons[viewKey];
    if (!entry) {
      return;
    }
    const text = `${entry.baseLabel} ${enabled ? 'On' : 'Off'}`;
    entry.label.textContent = text;
    entry.button.dataset.tooltip = text;
    entry.button.title = text;
    entry.button.setAttribute('aria-label', text);
    entry.button.dataset.enabled = enabled ? 'true' : 'false';
    entry.button.setAttribute('aria-pressed', String(enabled));
  }
}

function bindViewToggle(button, handler) {
  button.addEventListener('click', handler);
  return () => button.removeEventListener('click', handler);
}
