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
  const radarSummaryLabel = document.getElementById('radarSummaryLabel');
  const radarModeButtons = {
    ground: document.getElementById('radarModeGround'),
    satellite: document.getElementById('radarModeSatellite'),
    interceptor: document.getElementById('radarModeInterceptor'),
    off: document.getElementById('radarModeOff'),
  };
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
    defense: {
      button: document.getElementById('viewDefenseToggle'),
      label: document.getElementById('viewDefenseLabel'),
      baseLabel: 'Defense',
    },
    economy: {
      button: document.getElementById('viewEconomyToggle'),
      label: document.getElementById('viewEconomyLabel'),
      baseLabel: 'Economy',
    },
    trade: {
      button: document.getElementById('viewTradeToggle'),
      label: document.getElementById('viewTradeLabel'),
      baseLabel: 'Trade',
    },
  };

  updateMissileButton({ mode: 'idle' });
  updateNavalButton({ enabled: false });
  updateRadarButton({ mode: 'off' });
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
    onSelectRadarMode(handler) {
      const listeners = [];
      for (const [mode, btn] of Object.entries(radarModeButtons)) {
        const listener = () => handler(mode);
        btn.addEventListener('click', listener);
        listeners.push(() => btn.removeEventListener('click', listener));
      }
      return () => listeners.forEach((fn) => fn());
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
    onSelectMissileType(handler) {
      const selector = document.getElementById('missileTypeSelector');
      if (!selector) return () => {};
      const listener = (e) => {
        const btn = e.target.closest('[data-type]');
        if (!btn) return;
        const typeId = btn.dataset.type;
        // Update selected state
        for (const b of selector.querySelectorAll('.missile-type-btn')) {
          b.classList.toggle('selected', b.dataset.type === typeId);
        }
        handler(typeId);
      };
      selector.addEventListener('click', listener);
      return () => selector.removeEventListener('click', listener);
    },
    onCycleWarhead(handler) {
      const btn = document.getElementById('warheadCycleBtn');
      if (!btn) return () => {};
      btn.addEventListener('click', handler);
      return () => btn.removeEventListener('click', handler);
    },
    setWarheadLabel(label) {
      const el = document.getElementById('warheadSelectorLabel');
      if (el) el.textContent = label;
    },
    setSelectedMissileType(typeId) {
      const selector = document.getElementById('missileTypeSelector');
      if (!selector) return;
      for (const btn of selector.querySelectorAll('.missile-type-btn')) {
        btn.classList.toggle('selected', btn.dataset.type === typeId);
      }
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
    onToggleViewDefense(handler) {
      return bindViewToggle(viewButtons.defense.button, handler);
    },
    onToggleViewEconomy(handler) {
      return bindViewToggle(viewButtons.economy.button, handler);
    },
    onToggleViewTrade(handler) {
      return bindViewToggle(viewButtons.trade.button, handler);
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
      updateRadarModeButtons(state);
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
    const summaryLabels = { ground: 'Ground', satellite: 'Satellite', interceptor: 'Interceptor' };
    radarSummaryLabel.textContent = summaryLabels[mode] ?? 'Off';
  }

  function updateRadarModeButtons({ mode = 'off' } = {}) {
    for (const [btnMode, btn] of Object.entries(radarModeButtons)) {
      btn.dataset.active = String(btnMode === mode && mode !== 'off');
    }
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
