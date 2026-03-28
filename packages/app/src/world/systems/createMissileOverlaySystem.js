import * as THREE from 'three';
import { latLonToVector3, vector3ToLatLon } from '../geo/geoMath.js';

const CATEGORY_COLORS = {
  silo: '#ff6b6b',
  airbase: '#6ba3ff',
  naval: '#6bffd4',
};

const CATEGORY_LABELS = {
  all: 'All Sites',
  silo: 'Missile Silos',
  airbase: 'Airbases',
  naval: 'Naval Facilities',
};

const BASE_CLUSTER_ALTITUDE_KM = 3200;

const SITE_LIMITS = [
  { altitudeMaxKm: 200, radius: 10.5 },
  { altitudeMaxKm: 600, radius: 9.2 },
  { altitudeMaxKm: 1500, radius: 8.1 },
  { altitudeMaxKm: 4000, radius: 6.8 },
  { altitudeMaxKm: Infinity, radius: 5.6 },
];

const ACTIVE_MODES = new Set([
  'strike',
  'strikeConfirm',
  'selectLaunch',
  'selectTarget',
  'confirm',
]);

export function createMissileOverlaySystem({
  document,
  mountNode,
  renderer,
  camera,
  earthGroup,
  worldConfig,
  requestRender,
  installationStore,
}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'missile-overlay';
  canvas.setAttribute('aria-hidden', 'true');
  mountNode.parentElement.appendChild(canvas);

  const context = canvas.getContext('2d');
  const localVector = new THREE.Vector3();
  const worldPosition = new THREE.Vector3();
  const worldNormal = new THREE.Vector3();
  const toCamera = new THREE.Vector3();
  const projected = new THREE.Vector3();
  const hitRegions = [];

  let canvasWidth = 0;
  let canvasHeight = 0;
  let mode = 'idle';
  let strikeCount = 1;
  let godView = false;
  let previewCountryIso3 = null;
  let showAllBases = false;
  let selectedBase = null;
  let showOilFields = false;
  let oilFields = [];
  let oilIconOwn = null;    // blue-green for own fields
  let oilIconEnemy = null;  // orange for enemy/neutral fields
  let oilReserveIcon = null;
  let oilSimulation = null;
  const oilHitRegions = [];

  installationStore.ensureLoaded();

  // Load oil field data and icons
  fetch('/data/oil-production.json')
    .then((r) => r.json())
    .then((data) => { oilFields = data.oilFields ?? []; })
    .catch(() => {});

  function loadTintedSvg(src, color, cb) {
    const img = new Image();
    img.onload = () => {
      const s = 64;
      const off = document.createElement('canvas');
      off.width = s; off.height = s;
      const c = off.getContext('2d');
      c.drawImage(img, 0, 0, s, s);
      c.globalCompositeOperation = 'source-in';
      c.fillStyle = color;
      c.fillRect(0, 0, s, s);
      cb(off);
    };
    img.src = src;
  }
  loadTintedSvg('/assets/manufactoring/raw-resources/oil-producer.svg', 'rgba(100, 210, 160, 0.92)', (i) => { oilIconOwn = i; });
  loadTintedSvg('/assets/manufactoring/raw-resources/oil-producer.svg', 'rgba(255, 179, 71, 0.92)', (i) => { oilIconEnemy = i; });
  loadTintedSvg('/assets/manufactoring/raw-resources/oil-reserve.svg', 'rgba(100, 180, 255, 0.92)', (i) => { oilReserveIcon = i; });

  return {
    setMode(nextMode) {
      mode = nextMode;
      requestRender();
    },
    getMode() {
      return mode;
    },
    setGodView(enabled) {
      godView = Boolean(enabled);
      requestRender();
    },
    setPreviewCountry(iso3) {
      previewCountryIso3 = iso3;
      requestRender();
    },
    setShowAllBases(enabled) {
      showAllBases = Boolean(enabled);
      if (!showAllBases) {
        selectedBase = null;
      }
      requestRender();
    },
    setSelectedBase(site) {
      selectedBase = site ?? null;
      requestRender();
    },
    setOilFieldsVisible(enabled) {
      showOilFields = Boolean(enabled);
      requestRender();
    },
    setOilSimulation(sim) {
      oilSimulation = sim;
    },
    pickOilFieldByName(name) {
      return oilFields.find((f) => f.name === name) ?? null;
    },
    pickOilField(clientX, clientY) {
      if (!showOilFields) return null;
      const rect = renderer.domElement.getBoundingClientRect();
      const cx = clientX - rect.left;
      const cy = clientY - rect.top;
      for (let i = oilHitRegions.length - 1; i >= 0; i--) {
        const r = oilHitRegions[i];
        const dx = cx - r.x;
        const dy = cy - r.y;
        if (dx * dx + dy * dy <= r.radius * r.radius) {
          if (r.facility) return { type: 'facility', data: r.facility };
          if (r.field) return { type: 'field', data: r.field };
        }
      }
      return null;
    },
    getStrikeCount() {
      return strikeCount;
    },
    setStrikeCount(count) {
      const maxAvailable = installationStore.getAvailableSiloCount(
        installationStore.getActiveCountry(),
      );
      strikeCount = Math.max(1, Math.min(count, Math.max(maxAvailable, 1)));
      requestRender();
    },
    adjustStrikeCount(delta) {
      this.setStrikeCount(strikeCount + delta);
    },
    pickLaunchSite(clientX, clientY) {
      const size = renderer.getSize(new THREE.Vector2());
      const rect = renderer.domElement.getBoundingClientRect();
      const canvasX = clientX - rect.left;
      const canvasY = clientY - rect.top;
      if (canvasX < 0 || canvasY < 0 || canvasX > size.x || canvasY > size.y) {
        return null;
      }

      for (let index = hitRegions.length - 1; index >= 0; index -= 1) {
        const region = hitRegions[index];
        const dx = canvasX - region.x;
        const dy = canvasY - region.y;
        if (dx * dx + dy * dy <= region.radius * region.radius) {
          return region.site;
        }
      }
      return null;
    },
    getTargetFromPoint(point) {
      const localPoint = point.clone().applyQuaternion(earthGroup.quaternion.clone().invert());
      return vector3ToLatLon(localPoint);
    },
    render({
      altitudeKm,
      selection,
      flights = [],
      radar = { mode: 'off' },
      showFlightMarkers = true,
      playerCountry = null,
      pendingReserve = null,
      missileTypeLabel = null,
      warheadLabel = null,
    }) {
      syncCanvasSize({
        canvas,
        renderer,
        state: { canvasWidth, canvasHeight },
        update: (nextWidth, nextHeight) => {
          canvasWidth = nextWidth;
          canvasHeight = nextHeight;
        },
      });
      context.clearRect(0, 0, canvasWidth, canvasHeight);
      hitRegions.length = 0;

      const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
      context.save();
      context.scale(dpr, dpr);

      const projArgs = {
        camera,
        earthGroup,
        worldConfig,
        projected,
        localVector,
        worldPosition,
        worldNormal,
        toCamera,
      };

      // Draw installations when in any active mode
      if (
        (ACTIVE_MODES.has(mode) || previewCountryIso3 || showAllBases) &&
        installationStore.getStatus() === 'ready'
      ) {
        drawInstallations({
          context,
          altitudeKm,
          ...projArgs,
          sites: showAllBases
            ? godView
              ? installationStore.getSites()
              : installationStore.getCountrySites(installationStore.getActiveCountry())
            : previewCountryIso3
              ? installationStore.getCountrySites(previewCountryIso3)
              : installationStore.getFilteredSites(),
          spentCheck: (site) => installationStore.isSiloSpent(site.id),
          activeCountry: previewCountryIso3 ?? installationStore.getActiveCountry(),
          godView,
          previewMode: Boolean(previewCountryIso3),
          selectedSite: selectedBase,
          hitRegions,
          size: { width: canvasWidth / dpr, height: canvasHeight / dpr },
        });
      }

      // Selected launch site marker (manual mode)
      drawSelectionMarker({
        context,
        ...projArgs,
        point: selection.launchSite
          ? {
              lat: selection.launchSite.latitude,
              lon: selection.launchSite.longitude,
              label: `LAUNCH: ${selection.launchSite.name}`,
            }
          : null,
        color: '#ffd182',
        size: 8,
      });

      // Strike mode: draw all placed targets with numbers
      const targets = selection.targets ?? [];
      if (targets.length > 0) {
        const isConfirm = mode === 'strikeConfirm';
        for (let i = 0; i < targets.length; i += 1) {
          drawNumberedTarget({
            context,
            ...projArgs,
            point: targets[i],
            index: i,
            total: strikeCount,
            isConfirmPending: isConfirm,
          });
        }
      }

      // Manual mode single target (non-strike)
      if (
        targets.length === 0 &&
        selection.target &&
        (mode === 'selectTarget' || mode === 'confirm')
      ) {
        drawNumberedTarget({
          context,
          ...projArgs,
          point: selection.target,
          index: 0,
          total: 1,
          isConfirmPending: mode === 'confirm',
        });
      }

      // Impact points from active flights
      if (showFlightMarkers) {
        const latestImpact =
          [...flights].reverse().find((f) => f?.impactPoint)?.impactPoint ?? null;
        drawSelectionMarker({
          context,
          ...projArgs,
          point: latestImpact
            ? { lat: latestImpact.lat, lon: latestImpact.lon, label: 'Impact' }
            : null,
          color: '#ff7b7b',
          size: 10,
        });

        for (const flight of flights) {
          if (flight?.active && flight?.target) {
            drawSelectionMarker({
              context,
              ...projArgs,
              point: {
                lat: flight.target.lat,
                lon: flight.target.lon,
                label: '',
              },
              color: 'rgba(255, 68, 68, 0.4)',
              size: 7,
            });
          }
        }
      }

      drawSelectionMarker({
        context,
        ...projArgs,
        point: selectedBase
          ? {
              lat: selectedBase.latitude,
              lon: selectedBase.longitude,
              label: selectedBase.name,
            }
          : null,
        color: '#f4f7fb',
        size: 11,
      });

      drawSelectionMarker({
        context,
        ...projArgs,
        point: radar.pendingGroundTarget
          ? {
              lat: radar.pendingGroundTarget.lat,
              lon: radar.pendingGroundTarget.lon,
              label: 'RADAR SITE',
            }
          : null,
        color: '#7de4ff',
        size: 9,
      });

      // Oil field icons — own fields green, others orange
      oilHitRegions.length = 0;
      if (showOilFields && oilFields.length > 0) {
        const vw = canvasWidth / dpr;
        const vh = canvasHeight / dpr;
        const showLabels = altitudeKm < 3000;
        const iconSize = altitudeKm > 6000 ? 8 : altitudeKm > 3000 ? 12 : 16;

        for (const field of oilFields) {
          if (!projectPoint({ lat: field.lat, lon: field.lon, ...projArgs })) continue;
          const x = (projected.x + 1) * 0.5 * vw;
          const y = (1 - projected.y) * 0.5 * vh;
          const half = iconSize / 2;
          const isOwn = playerCountry && field.country === playerCountry;
          const icon = isOwn ? oilIconOwn : oilIconEnemy;
          if (icon) {
            context.drawImage(icon, x - half, y - half, iconSize, iconSize);
          }
          oilHitRegions.push({ x, y, radius: Math.max(half + 4, 10), field });
          if (showLabels) {
            const textColor = isOwn ? 'rgba(100, 210, 160, 0.7)' : 'rgba(255, 179, 71, 0.7)';
            const subColor = isOwn ? 'rgba(100, 210, 160, 0.45)' : 'rgba(255, 179, 71, 0.45)';
            context.fillStyle = textColor;
            context.font = '7px "Space Grotesk", monospace';
            context.textAlign = 'center';
            context.fillText(field.name, x, y + iconSize / 2 + 10);
            const bpd = field.currentBpd;
            const label = bpd >= 1e6 ? `${(bpd / 1e6).toFixed(1)}M bpd` : `${Math.round(bpd / 1000)}K bpd`;
            context.font = '6px "Space Grotesk", monospace';
            context.fillStyle = subColor;
            context.fillText(label, x, y + iconSize / 2 + 19);
            context.textAlign = 'left';
          }
        }

        // Oil reserve facilities
        if (oilSimulation && oilReserveIcon) {
          const facilities = oilSimulation.getReserveFacilities();
          for (const fac of facilities) {
            if (!projectPoint({ lat: fac.lat, lon: fac.lon, ...projArgs })) continue;
            const x = (projected.x + 1) * 0.5 * vw;
            const y = (1 - projected.y) * 0.5 * vh;
            const rs = iconSize + 2;
            const rh = rs / 2;
            context.drawImage(oilReserveIcon, x - rh, y - rh, rs, rs);
            oilHitRegions.push({ x, y, radius: Math.max(rh + 4, 12), facility: fac });
            if (showLabels) {
              context.fillStyle = 'rgba(100, 180, 255, 0.7)';
              context.font = '7px "Space Grotesk", monospace';
              context.textAlign = 'center';
              context.fillText('Strategic Reserve', x, y + rs / 2 + 10);
              context.textAlign = 'left';
            }
          }
        }
      }

      // Pending reserve placement marker
      if (pendingReserve && oilReserveIcon) {
        const vw = canvasWidth / dpr;
        const vh = canvasHeight / dpr;
        if (projectPoint({ lat: pendingReserve.lat, lon: pendingReserve.lon, ...projArgs })) {
          const x = (projected.x + 1) * 0.5 * vw;
          const y = (1 - projected.y) * 0.5 * vh;
          const s = 22;
          const h = s / 2;
          // Pulsing ring
          context.beginPath();
          context.arc(x, y, h + 4, 0, Math.PI * 2);
          context.strokeStyle = 'rgba(100, 180, 255, 0.6)';
          context.lineWidth = 1.5;
          context.stroke();
          // Icon
          context.drawImage(oilReserveIcon, x - h, y - h, s, s);
          // Label
          context.fillStyle = 'rgba(100, 180, 255, 0.85)';
          context.font = '9px "Space Grotesk", monospace';
          context.textAlign = 'center';
          context.fillText('STRATEGIC RESERVE', x, y + h + 14);
          context.fillStyle = 'rgba(100, 180, 255, 0.55)';
          context.font = '7px "Space Grotesk", monospace';
          context.fillText('Enter to confirm | Esc to cancel', x, y + h + 24);
          context.textAlign = 'left';
        }
      }

      drawStatusBar({
        context,
        viewportWidth: canvasWidth / dpr,
        viewportHeight: canvasHeight / dpr,
        mode,
        selection,
        installationStore,
        strikeCount,
        targetsPlaced: targets.length,
        activeFlightCount: flights.filter((f) => f?.active).length,
        godView,
        radar,
        selectedBase,
        showAllBases,
        missileTypeLabel,
        warheadLabel,
      });
      context.restore();
    },
    dispose() {
      canvas.remove();
    },
  };
}

// ─── Installation markers ───────────────────────────────────────────────────

function drawInstallations({
  context,
  altitudeKm,
  camera,
  earthGroup,
  worldConfig,
  projected,
  localVector,
  worldPosition,
  worldNormal,
  toCamera,
  sites,
  spentCheck,
  activeCountry,
  godView,
  previewMode,
  selectedSite,
  hitRegions,
  size,
}) {
  const profile =
    SITE_LIMITS.find((entry) => altitudeKm <= entry.altitudeMaxKm) ??
    SITE_LIMITS[SITE_LIMITS.length - 1];
  const projectedSites = [];

  for (let index = 0; index < sites.length; index += 1) {
    const site = sites[index];
    const isOwn = site.countryIso3 === activeCountry;
    if (!godView && !isOwn) {
      continue;
    }
    if (
      !projectPoint({
        lat: site.latitude,
        lon: site.longitude,
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

    const x = (projected.x + 1) * 0.5 * size.width;
    const y = (1 - projected.y) * 0.5 * size.height;
    projectedSites.push({
      site,
      x,
      y,
      isOwn,
      isSpent: spentCheck(site),
      baseColor: CATEGORY_COLORS[site.category] ?? '#ffd182',
      isSelected: selectedSite?.id === site.id,
    });
  }

  if (altitudeKm > BASE_CLUSTER_ALTITUDE_KM && !previewMode) {
    drawClusteredInstallations({
      context,
      entries: projectedSites,
      hitRegions,
    });
    return;
  }

  for (const entry of projectedSites) {
    drawIndividualInstallation({
      context,
      entry,
      radius: profile.radius,
    });

    if (!previewMode && entry.isOwn && !entry.isSpent) {
      hitRegions.push({
        x: entry.x,
        y: entry.y,
        radius: Math.max(profile.radius + 6, 11),
        site: entry.site,
      });
    }
  }
}

// ─── Shape helpers ──────────────────────────────────────────────────────────

function adjustAlpha(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function drawClusteredInstallations({ context, entries, hitRegions }) {
  const clusters = new Map();
  const clusterSize = 34;

  for (const entry of entries) {
    const cellX = Math.floor(entry.x / clusterSize);
    const cellY = Math.floor(entry.y / clusterSize);
    const key = `${cellX}:${cellY}`;
    let cluster = clusters.get(key);
    if (!cluster) {
      cluster = {
        entries: [],
        x: 0,
        y: 0,
        categoryCounts: { silo: 0, airbase: 0, naval: 0 },
      };
      clusters.set(key, cluster);
    }
    cluster.entries.push(entry);
    cluster.x += entry.x;
    cluster.y += entry.y;
    cluster.categoryCounts[entry.site.category] += 1;
  }

  for (const cluster of clusters.values()) {
    if (cluster.entries.length === 1) {
      const entry = cluster.entries[0];
      const singletonRadius = 10.5;
      drawIndividualInstallation({
        context,
        entry,
        radius: singletonRadius,
        emphasis: true,
      });
      if (entry.isOwn && !entry.isSpent) {
        hitRegions.push({
          x: entry.x,
          y: entry.y,
          radius: 24,
          site: entry.site,
        });
      }
      continue;
    }

    if (cluster.entries.length <= 3) {
      drawSpreadCluster({
        context,
        entries: cluster.entries,
        hitRegions,
      });
      continue;
    }

    const x = cluster.x / cluster.entries.length;
    const y = cluster.y / cluster.entries.length;
    const category = getDominantCategory(cluster.categoryCounts);
    const color = CATEGORY_COLORS[category] ?? '#ffd182';

    context.beginPath();
    context.arc(x, y, 12, 0, Math.PI * 2);
    context.fillStyle = 'rgba(9, 18, 33, 0.9)';
    context.fill();
    context.lineWidth = 1.4;
    context.strokeStyle = color;
    context.stroke();

    drawBaseIcon({
      context,
      category,
      x,
      y: y - 1,
      size: 6.6,
      color,
      alpha: 0.94,
    });

    context.fillStyle = 'rgba(244, 247, 251, 0.92)';
    context.font = 'bold 10px "Space Grotesk", "Avenir Next", sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(String(cluster.entries.length), x, y + 16);
    context.textAlign = 'left';

    // Register hit region with a synthetic cluster site
    const ownEntries = cluster.entries.filter((e) => e.isOwn && !e.isSpent);
    if (ownEntries.length > 0) {
      const clusterSite = buildClusterSite(ownEntries);
      hitRegions.push({
        x,
        y,
        radius: 24,
        site: clusterSite,
      });
    }
  }
}

function drawSpreadCluster({ context, entries, hitRegions }) {
  const centerX = entries.reduce((sum, entry) => sum + entry.x, 0) / entries.length;
  const centerY = entries.reduce((sum, entry) => sum + entry.y, 0) / entries.length;
  const spreadRadius = entries.length === 2 ? 11 : 13;

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const angle = -Math.PI * 0.5 + (Math.PI * 2 * index) / entries.length;
    const spreadEntry = {
      ...entry,
      x: centerX + Math.cos(angle) * spreadRadius,
      y: centerY + Math.sin(angle) * spreadRadius,
    };

    drawIndividualInstallation({
      context,
      entry: spreadEntry,
      radius: 8.8,
      emphasis: true,
    });
  }

  // Register one cluster hit region covering all entries
  const ownEntries = entries.filter((e) => e.isOwn && !e.isSpent);
  if (ownEntries.length > 0) {
    const clusterSite = buildClusterSite(ownEntries);
    hitRegions.push({
      x: centerX,
      y: centerY,
      radius: spreadRadius + 18,
      site: clusterSite,
    });
  }
}

function drawIndividualInstallation({ context, entry, radius, emphasis = false }) {
  const alpha = entry.isSpent ? 0.32 : entry.isOwn ? 0.96 : 0.44;
  const iconColor = entry.isSpent
    ? 'rgba(140, 146, 160, 0.72)'
    : adjustAlpha(entry.baseColor, alpha);
  const shellRadius = radius + 2.8;

  context.beginPath();
  context.arc(entry.x, entry.y, shellRadius, 0, Math.PI * 2);
  context.fillStyle = 'rgba(9, 18, 33, 0.88)';
  context.fill();

  context.beginPath();
  context.arc(entry.x, entry.y, shellRadius + 1.8, 0, Math.PI * 2);
  context.strokeStyle = adjustAlpha(entry.baseColor, entry.isOwn ? (emphasis ? 0.5 : 0.34) : 0.18);
  context.lineWidth = emphasis ? 1.5 : 1.2;
  context.stroke();

  if (entry.isSelected) {
    context.beginPath();
    context.arc(entry.x, entry.y, radius + 6.2, 0, Math.PI * 2);
    context.strokeStyle = 'rgba(244, 247, 251, 0.9)';
    context.lineWidth = 1.4;
    context.stroke();
  }

  drawBaseIcon({
    context,
    category: entry.site.category,
    x: entry.x,
    y: entry.y,
    size: radius + 0.5,
    color: iconColor,
    alpha,
  });
}

function drawBaseIcon({ context, category, x, y, size, color, alpha }) {
  context.save();
  context.translate(x, y);
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = 1.4;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.globalAlpha = alpha;

  if (category === 'silo') {
    context.beginPath();
    context.moveTo(0, -size * 0.95);
    context.lineTo(size * 0.26, -size * 0.32);
    context.lineTo(size * 0.14, size * 0.78);
    context.lineTo(-size * 0.14, size * 0.78);
    context.lineTo(-size * 0.26, -size * 0.32);
    context.closePath();
    context.stroke();
  } else if (category === 'naval') {
    context.beginPath();
    context.moveTo(-size * 0.9, size * 0.42);
    context.lineTo(size * 0.82, size * 0.42);
    context.lineTo(size * 0.5, size * 0.88);
    context.lineTo(-size * 0.7, size * 0.88);
    context.closePath();
    context.stroke();
    context.beginPath();
    context.moveTo(-size * 0.18, size * 0.38);
    context.lineTo(-size * 0.02, -size * 0.6);
    context.lineTo(size * 0.28, -size * 0.22);
    context.stroke();
  } else {
    context.beginPath();
    context.moveTo(-size, 0);
    context.lineTo(size, 0);
    context.moveTo(0, -size * 0.88);
    context.lineTo(0, size * 0.88);
    context.moveTo(-size * 0.32, -size * 0.12);
    context.lineTo(size * 0.32, -size * 0.12);
    context.moveTo(-size * 0.55, size * 0.4);
    context.lineTo(size * 0.55, size * 0.4);
    context.stroke();
  }

  context.restore();
}

function buildClusterSite(ownEntries) {
  const sites = ownEntries.map((e) => e.site);
  const avgLat = sites.reduce((sum, s) => sum + s.latitude, 0) / sites.length;
  const avgLon = sites.reduce((sum, s) => sum + s.longitude, 0) / sites.length;
  const dominant = getDominantCategory(
    sites.reduce((acc, s) => { acc[s.category] = (acc[s.category] || 0) + 1; return acc; }, {}),
  );
  const primary = sites[0];
  const extra = sites.length - 1;
  const name = extra > 0 ? `${primary.name} + ${extra} base${extra > 1 ? 's' : ''}` : primary.name;
  return {
    id: `cluster_${primary.id}`,
    name,
    latitude: avgLat,
    longitude: avgLon,
    category: dominant,
    countryIso3: primary.countryIso3,
    countryIso2: primary.countryIso2,
    countryName: primary.countryName,
    installationType: primary.installationType,
    clusteredSites: sites,
  };
}

function getDominantCategory(categoryCounts) {
  let winner = 'silo';
  let best = -Infinity;
  for (const [category, count] of Object.entries(categoryCounts)) {
    if (count > best) {
      winner = category;
      best = count;
    }
  }
  return winner;
}

// ─── Selection marker (generic) ─────────────────────────────────────────────

function drawSelectionMarker({
  context,
  camera,
  earthGroup,
  worldConfig,
  point,
  color,
  size,
  projected,
  localVector,
  worldPosition,
  worldNormal,
  toCamera,
}) {
  if (!point) {
    return;
  }
  if (
    !projectPoint({
      lat: point.lat,
      lon: point.lon,
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
    return;
  }

  const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
  const x = (projected.x + 1) * 0.5 * (context.canvas.width / dpr);
  const y = (1 - projected.y) * 0.5 * (context.canvas.height / dpr);

  context.beginPath();
  context.arc(x, y, size, 0, Math.PI * 2);
  context.strokeStyle = color;
  context.lineWidth = 1.4;
  context.stroke();
  context.beginPath();
  context.arc(x, y, Math.max(size * 0.35, 2.4), 0, Math.PI * 2);
  context.fillStyle = color;
  context.fill();
  if (point.label) {
    context.fillStyle = color;
    context.font = '12px "Space Grotesk", "Avenir Next", sans-serif';
    context.fillText(point.label, x + size + 6, y);
  }
}

// ─── Numbered target marker with crosshair ──────────────────────────────────

function drawNumberedTarget({
  context,
  camera,
  earthGroup,
  worldConfig,
  point,
  index,
  total,
  isConfirmPending,
  projected,
  localVector,
  worldPosition,
  worldNormal,
  toCamera,
}) {
  if (!point) {
    return;
  }
  if (
    !projectPoint({
      lat: point.lat,
      lon: point.lon,
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
    return;
  }

  const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
  const x = (projected.x + 1) * 0.5 * (context.canvas.width / dpr);
  const y = (1 - projected.y) * 0.5 * (context.canvas.height / dpr);

  const color = isConfirmPending ? '#ff4444' : '#ff8844';
  const outerRadius = isConfirmPending ? 15 : 12;

  // Outer ring
  context.beginPath();
  context.arc(x, y, outerRadius, 0, Math.PI * 2);
  context.strokeStyle = color;
  context.lineWidth = isConfirmPending ? 2 : 1.4;
  context.stroke();

  // Crosshair lines
  const crossLen = outerRadius + 5;
  context.beginPath();
  context.moveTo(x - crossLen, y);
  context.lineTo(x - outerRadius - 2, y);
  context.moveTo(x + outerRadius + 2, y);
  context.lineTo(x + crossLen, y);
  context.moveTo(x, y - crossLen);
  context.lineTo(x, y - outerRadius - 2);
  context.moveTo(x, y + outerRadius + 2);
  context.lineTo(x, y + crossLen);
  context.strokeStyle = color;
  context.lineWidth = 1;
  context.stroke();

  // Number inside circle
  context.fillStyle = color;
  context.font = 'bold 11px "Space Grotesk", "Avenir Next", sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(String(index + 1), x, y);
  context.textAlign = 'left';

  // Label to the right
  context.font = '11px "Space Grotesk", "Avenir Next", sans-serif';
  const label = point.label ?? '';
  context.fillText(total > 1 ? `#${index + 1} ${label}` : label, x + crossLen + 4, y);
}

// ─── Status bar ─────────────────────────────────────────────────────────────

function drawStatusBar({
  context,
  viewportWidth,
  viewportHeight,
  mode,
  selection,
  installationStore,
  strikeCount,
  targetsPlaced,
  activeFlightCount,
  godView,
  radar,
  selectedBase,
  showAllBases,
  missileTypeLabel,
  warheadLabel,
}) {
  const activeCountry = installationStore.getActiveCountry();
  const activeCategory = installationStore.getActiveCategory();
  const availableSilos = installationStore.getAvailableSiloCount(activeCountry);
  const categoryLabel = CATEGORY_LABELS[activeCategory] ?? 'All';

  const lines = [];

  if (radar?.mode === 'ground') {
    lines.push(`RADAR SETUP | Ground Radar | ${activeCountry}`);
    if (radar.pendingGroundTarget) {
      lines.push(
        `Pending site: ${radar.pendingGroundTarget.label} | Enter confirms placement | Click elsewhere to reposition`,
      );
    } else {
      lines.push(
        `Click globe to stage radar site | Coverage radius: ${radar.coverageKm ?? '?'} km | Tab switches mode | R exits`,
      );
    }
    if ((radar.groundCount ?? 0) > 0) {
      lines.push(`Ground radars deployed: ${radar.groundCount}`);
    }
  } else if (radar?.mode === 'satellite') {
    const altKm = radar.orbitAltitudeKm ?? 2000;
    const coverageKmSat = radar.footprintRadiusKm ?? 0;
    const isGeo = altKm >= 35000;
    const orbitLabel = isGeo ? 'GEO' : altKm >= 5000 ? 'MEO' : 'LEO';
    lines.push(`RADAR SETUP | Early Warning Satellite | ${activeCountry} | ${orbitLabel} ${altKm.toLocaleString()} km`);
    lines.push(`Coverage radius: ${Math.round(coverageKmSat).toLocaleString()} km | ${isGeo ? 'Geostationary' : 'Moving orbit'} | +/- adjust altitude`);
    if (radar.pendingSatelliteSlot) {
      lines.push(
        `Pending slot: ${radar.pendingSatelliteSlot.label} (${radar.pendingSatelliteSlot.longitude.toFixed(0)}°) | Enter launches from ${radar.spaceportName ?? 'your spaceport'}`,
      );
    } else {
      lines.push(
        `Click a slot to stage launch from ${radar.spaceportName ?? 'your spaceport'} | Tab switches mode | R exits`,
      );
    }
    if (radar.selectedSatellite) {
      const sat = radar.selectedSatellite;
      const targetAlt = sat.altitudeKm?.toLocaleString() ?? '?';
      const currentAlt = sat.currentAltitudeKm?.toLocaleString() ?? '?';
      const speed = sat.currentSpeedKmS ?? '?';
      const flightMin = sat.flightTimeSeconds ? Math.floor(sat.flightTimeSeconds / 60) : 0;
      lines.push(`SELECTED: ${sat.id} | ${sat.operational ? 'OPERATIONAL' : sat.stageLabel ?? sat.phase}`);
      lines.push(`Altitude: ${currentAlt} km (target: ${targetAlt} km) | Speed: ${speed} km/s | Flight: ${flightMin}m`);
      lines.push(`Coverage: ${Math.round(sat.footprintRadiusKm).toLocaleString()} km radius | ${sat.isGeostationary ? 'Geostationary' : 'Free orbit'}`);
    }
    if ((radar.satelliteCount ?? 0) > 0 || (radar.launchCount ?? 0) > 0) {
      lines.push(
        `Satellites deployed: ${radar.satelliteCount ?? 0} | Launches in progress: ${radar.launchCount ?? 0}`,
      );
    }
  } else if (radar?.mode === 'interceptor') {
    const intType = 'NGI';
    lines.push(`DEFENSE SETUP | ${intType} Interceptor | ${activeCountry}`);
    if (radar.pendingGroundTarget) {
      lines.push(
        `Pending site: ${radar.pendingGroundTarget.label} | Enter confirms | Click to reposition | Tab to cycle type`,
      );
    } else {
      lines.push(
        `Click globe to place ${intType} battery | R exits`,
      );
    }
    if ((radar.interceptorSiteCount ?? 0) > 0) {
      lines.push(`Interceptor sites deployed: ${radar.interceptorSiteCount}`);
    }
  } else if (mode === 'idle') {
    // Show defense status + selected satellite info
    const defense = radar?.defenseSnapshot;
    const activeThreats = defense?.threats?.filter((t) => t.status !== 'undetected') ?? [];
    const activeInterceptors = defense?.interceptors?.filter((i) => i.phase !== 'complete') ?? [];

    if (activeThreats.length > 0 || activeInterceptors.length > 0) {
      const tracked = activeThreats.filter((t) => t.status === 'radar-tracked').length;
      const boostDet = activeThreats.filter((t) => t.status === 'boost-detected').length;
      const intercepted = activeThreats.filter((t) => t.status === 'intercepted').length;
      lines.push(`DEFENSE | Tracked: ${tracked} | Boost-detected: ${boostDet} | Intercepted: ${intercepted} | Interceptors active: ${activeInterceptors.length}`);
    }

    if (radar?.selectedSatellite) {
      const sat = radar.selectedSatellite;
      const targetAlt = sat.altitudeKm?.toLocaleString() ?? '?';
      const currentAlt = sat.currentAltitudeKm?.toLocaleString() ?? '?';
      const speed = sat.currentSpeedKmS ?? '?';
      lines.push(`SATELLITE: ${sat.id} | ${sat.operational ? 'OPERATIONAL' : sat.stageLabel ?? sat.phase}`);
      lines.push(`Alt: ${currentAlt}/${targetAlt} km | Speed: ${speed} km/s | Coverage: ${Math.round(sat.footprintRadiusKm).toLocaleString()} km`);
    } else if (activeThreats.length === 0) {
      lines.push('Press M for strikes, N for naval, or R for radar setup.');
    }
  } else if (mode === 'strike') {
    const typeStr = missileTypeLabel ? ` | ${missileTypeLabel}` : '';
    const whStr = warheadLabel ? ` [${warheadLabel}]` : '';
    lines.push(`STRIKE PLANNING | ${activeCountry}${typeStr}${whStr}`);
    if (targetsPlaced > 0) {
      lines.push(
        `Targets: ${targetsPlaced}/${strikeCount} placed | Click to add more | Enter to launch | Backspace to undo`,
      );
    } else {
      lines.push(`Warheads: ${strikeCount} | Click globe to place targets | W cycles warhead`);
    }
  } else if (mode === 'strikeConfirm') {
    lines.push(
      `ALL TARGETS SET | ${targetsPlaced}/${strikeCount} warheads assigned | ${activeCountry}`,
    );
    lines.push('Press Enter to confirm launch | Backspace to undo last | Esc to clear all');
  } else if (mode === 'selectLaunch') {
    lines.push(`Select a missile silo (silos only) | ${activeCountry}`);
  } else if (mode === 'selectTarget') {
    lines.push(
      selection.launchSite
        ? `Silo: ${selection.launchSite.name} | Click globe to set target`
        : 'Select a silo first.',
    );
  } else if (mode === 'confirm') {
    lines.push(
      `Silo: ${selection.launchSite?.name ?? '?'} | Target: ${selection.target?.label ?? '?'}`,
    );
    lines.push('Press Enter to confirm launch | Click to change target | Esc to cancel');
  }

  if (activeFlightCount > 0) {
    lines.push(`Active missiles: ${activeFlightCount}`);
  }
  if (showAllBases && selectedBase) {
    lines.push(
      `Base: ${selectedBase.name} | ${CATEGORY_LABELS[selectedBase.category] ?? selectedBase.category} | ${selectedBase.countryIso3}`,
    );
    lines.push(
      `Coords: ${Math.abs(selectedBase.latitude).toFixed(2)}°${selectedBase.latitude >= 0 ? 'N' : 'S'} ${Math.abs(selectedBase.longitude).toFixed(2)}°${selectedBase.longitude >= 0 ? 'E' : 'W'}`,
    );
  }
  lines.push(`Radar radius: ${radar.coverageVisible === false ? 'Hidden' : 'Visible'}`);
  lines.push(godView ? 'View: God' : `View: ${activeCountry}`);

  context.font = '13px "Space Grotesk", "Avenir Next", sans-serif';
  context.textBaseline = 'top';
  context.textAlign = 'left';
  context.fillStyle = 'rgba(244, 247, 251, 0.84)';
  const startY = viewportWidth > 640 ? 110 : Math.min(viewportHeight - 140, 164);
  for (let i = 0; i < lines.length; i += 1) {
    context.fillText(lines[i], 20, startY + i * 20);
  }
}

// ─── Projection ─────────────────────────────────────────────────────────────

function projectPoint({
  lat,
  lon,
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
    lat,
    lon,
    radius: worldConfig.earthRadius * 1.0015,
    out: localVector,
  });
  worldPosition.copy(localVector).applyQuaternion(earthGroup.quaternion);
  worldNormal.copy(localVector).normalize().applyQuaternion(earthGroup.quaternion).normalize();
  toCamera.copy(camera.position).sub(worldPosition).normalize();

  if (worldNormal.dot(toCamera) < 0.08) {
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

function syncCanvasSize({ canvas, renderer, state, update }) {
  const size = renderer.getSize(new THREE.Vector2());
  const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
  const width = Math.round(size.x * dpr);
  const height = Math.round(size.y * dpr);
  if (state.canvasWidth === width && state.canvasHeight === height) {
    return;
  }
  update(width, height);
  canvas.width = width;
  canvas.height = height;
  canvas.style.width = `${size.x}px`;
  canvas.style.height = `${size.y}px`;
}
