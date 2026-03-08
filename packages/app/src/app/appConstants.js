export const MAX_TRACKED_MISSILES = 48;
export const STRIKE_LAUNCH_STAGGER_MS = 200;
export const GEO_SELECTION_CAMERA_POSITION = Object.freeze({ x: 0, y: 38, z: 68 });

export const DEFAULT_VIEW_STATE = Object.freeze({
  launch: true,
  radar: true,
  naval: true,
  bases: false,
  context: true,
});

export function createInitialRadarSelection() {
  return {
    groundTarget: null,
    satelliteSlot: null,
  };
}

export function createInitialStrikeSelection() {
  return {
    launchSite: null,
    target: null,
    targets: [],
  };
}
