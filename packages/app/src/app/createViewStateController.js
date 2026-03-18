import { DEFAULT_VIEW_STATE } from './appConstants.js';

export function createViewStateController({
  chrome,
  celestialSystem,
  missileOverlay,
  cityLabels,
  countryBorders,
  radarVisualSystem,
  getRadarMode,
  initialState = DEFAULT_VIEW_STATE,
}) {
  const state = { ...DEFAULT_VIEW_STATE, ...initialState };

  return {
    apply,
    getState() {
      return { ...state };
    },
    isEnabled(viewKey) {
      return Boolean(state[viewKey]);
    },
    toggle(viewKey) {
      if (!(viewKey in state)) {
        return false;
      }
      state[viewKey] = !state[viewKey];
      apply();
      return state[viewKey];
    },
    reset() {
      Object.assign(state, DEFAULT_VIEW_STATE);
      apply();
    },
  };

  function apply() {
    celestialSystem.setTrajectoryVisibility({
      actual: state.launch,
      predicted: state.launch,
    });
    celestialSystem.setNavalVisibility(state.naval);
    missileOverlay.setShowAllBases(state.bases);
    cityLabels.setEnabled(state.context);
    countryBorders.setEnabled(state.context);
    chrome.setViewState('launch', state.launch);
    chrome.setViewState('radar', state.radar);
    chrome.setViewState('naval', state.naval);
    chrome.setViewState('bases', state.bases);
    chrome.setViewState('context', state.context);
    chrome.setViewState('defense', state.defense);

    const radarVisible = state.radar || getRadarMode() !== 'off';
    radarVisualSystem.setAssetsVisible(radarVisible);
    radarVisualSystem.setCoverageVisible(radarVisible);
  }
}
