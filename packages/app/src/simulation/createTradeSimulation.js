// Global oil trade simulation — driven by real bilateral trade data.
//
// Instead of a generic gravity model, routes are built from actual 2024
// trade flows (e.g. "SAU→CHN 1.6 mbpd", "RUS→IND 1.8 mbpd"). This makes
// the shipping lanes mirror real-world patterns: Middle East → Asia dominates,
// Norway supplies Europe, Canada supplies the US, etc.
//
// Player-placed ports tap into this system by attracting a share of existing
// import flows for their country, plus creating new import demand from the
// nearest exporters that have spare capacity.

const DEG_TO_RAD = Math.PI / 180;
const KM_PER_DEGREE = 111.32;

const VLCC_CAPACITY_BBL = 2_000_000;
const CARGO_SPEED_KNOTS = 14;
const GAMEPLAY_SPEED_MULTIPLIER = 200;
const BLOCKADE_RADIUS_KM = 150;
const DEFAULT_PORT_THROUGHPUT_BPD = 2_000_000;

const MAX_SHIPS_PER_ROUTE = 4;
const ROUTES_PER_FRAME = 3;

let _nextPortId = 1;
let _nextCargoId = 1;

export function createTradeSimulation({ oilSimulation, oceanNavGrid, navalSimulation }) {
  const ports = [];
  const routes = [];
  const routeMap = new Map();
  const cargoShips = [];

  let tradeFlows = []; // real bilateral flows from data
  let portDataLoaded = false;
  let routesDirty = false;
  let routeWorkQueue = [];
  let activeCountryIso3 = null;

  fetch('/data/major-ports.json')
    .then((r) => r.json())
    .then((data) => {
      for (const p of data.ports) {
        ports.push({
          id: `port-${_nextPortId++}`,
          countryIso3: p.iso3,
          lat: p.lat,
          lon: p.lon,
          name: p.name,
          throughputBpd: p.throughputBpd,
          currentLoadBpd: 0,
          isPlayerPlaced: false,
          role: p.role,
        });
      }
      tradeFlows = (data.tradeFlows || []).map((f) => ({
        from: f.from,
        to: f.to,
        volumeBpd: Math.round((f.mbpd || 0) * 1_000_000),
        note: f.note || '',
      }));
      portDataLoaded = true;
      routesDirty = true;
    })
    .catch(() => {});

  function setActiveCountry(iso3) {
    activeCountryIso3 = iso3;
  }

  function placePort({ countryIso3, lat, lon, name }) {
    const id = `port-${_nextPortId++}`;
    ports.push({
      id,
      countryIso3,
      lat,
      lon,
      name: name || `Port ${id.split('-')[1]}`,
      throughputBpd: DEFAULT_PORT_THROUGHPUT_BPD,
      currentLoadBpd: 0,
      isPlayerPlaced: true,
      role: 'both',
    });
    routesDirty = true;
    return id;
  }

  // --- Route building from real trade data ---

  function buildRoutes() {
    if (!oilSimulation.isLoaded() || !portDataLoaded || !oceanNavGrid) return;

    routes.length = 0;
    routeMap.clear();
    cargoShips.length = 0;
    for (const p of ports) p.currentLoadBpd = 0;

    const routeSpecs = [];

    // Phase 1: Create a route for every real bilateral trade flow
    for (const flow of tradeFlows) {
      if (flow.volumeBpd < 50_000) continue;

      const expPort = pickBestPort(flow.from, 'export');
      const impPort = pickBestPort(flow.to, 'import');
      if (!expPort || !impPort) continue;

      routeSpecs.push({
        id: `route-${flow.from}-${flow.to}-${routeSpecs.length}`,
        exporterIso3: flow.from,
        importerIso3: flow.to,
        exportPort: expPort,
        importPort: impPort,
        volumeBpd: flow.volumeBpd,
        note: flow.note,
      });
    }

    // Phase 2: Player-placed ports get routes
    // For each player port, find exporters that have spare capacity
    // and create import flows even if no bilateral data exists
    const playerPorts = ports.filter((p) => p.isPlayerPlaced);
    for (const pp of playerPorts) {
      // Check if any routes already serve this port's country
      const existingVolume = routeSpecs
        .filter((r) => r.importerIso3 === pp.countryIso3)
        .reduce((s, r) => s + r.volumeBpd, 0);

      // Player port adds demand: throughput minus existing
      const newDemand = Math.max(0, pp.throughputBpd - existingVolume);
      if (newDemand < 100_000) continue;

      // Find closest exporters with capacity
      const exportPorts = ports
        .filter((p) => (p.role === 'export' || p.role === 'both') && p.countryIso3 !== pp.countryIso3)
        .map((ep) => ({
          port: ep,
          dist: approxDistanceKm(ep.lat, ep.lon, pp.lat, pp.lon),
          iso3: ep.countryIso3,
        }))
        .sort((a, b) => a.dist - b.dist);

      // Pick up to 4 distinct exporter countries
      const usedCountries = new Set();
      let remaining = newDemand;
      for (const candidate of exportPorts) {
        if (remaining <= 0 || usedCountries.size >= 4) break;
        if (usedCountries.has(candidate.iso3)) continue;
        usedCountries.add(candidate.iso3);

        const cs = oilSimulation.getCountryState(candidate.iso3);
        if (!cs || cs.exportsBpd <= 0) continue;

        const volume = Math.min(remaining, cs.exportsBpd / 3, pp.throughputBpd / 3);
        if (volume < 50_000) continue;

        routeSpecs.push({
          id: `route-${candidate.iso3}-${pp.countryIso3}-player-${routeSpecs.length}`,
          exporterIso3: candidate.iso3,
          importerIso3: pp.countryIso3,
          exportPort: candidate.port,
          importPort: pp,
          volumeBpd: Math.round(volume),
          note: 'player port demand',
        });
        remaining -= volume;
      }
    }

    routeWorkQueue = routeSpecs;
    routesDirty = false;
  }

  // Pick the best port for a country given a role preference.
  // Prefers the port with least current load (spread traffic).
  function pickBestPort(iso3, rolePreference) {
    const candidates = ports.filter((p) => {
      if (p.countryIso3 !== iso3) return false;
      if (rolePreference === 'export') return p.role === 'export' || p.role === 'both';
      return p.role === 'import' || p.role === 'both';
    });
    if (candidates.length === 0) return null;

    // Distribute across ports: pick the one with most remaining capacity
    candidates.sort((a, b) =>
      (a.currentLoadBpd / a.throughputBpd) - (b.currentLoadBpd / b.throughputBpd),
    );
    const picked = candidates[0];
    picked.currentLoadBpd += 500_000; // rough increment to spread load
    return picked;
  }

  function processRouteWorkQueue() {
    if (routeWorkQueue.length === 0) return;

    const batch = routeWorkQueue.splice(0, ROUTES_PER_FRAME);
    for (const work of batch) {
      const expPort = work.exportPort;
      const impPort = work.importPort;

      const findFn = oceanNavGrid.findPathCoastal || oceanNavGrid.findPath;
      const waypoints = findFn(
        expPort.lat, expPort.lon,
        impPort.lat, impPort.lon,
      );
      if (waypoints.length < 2) continue;

      const distanceKm = computeRouteDistance(waypoints);
      const transitDays = distanceKm / (CARGO_SPEED_KNOTS * 1.852 * 24);

      const route = {
        id: work.id,
        exporterIso3: work.exporterIso3,
        importerIso3: work.importerIso3,
        exportPort: { id: expPort.id, lat: expPort.lat, lon: expPort.lon, name: expPort.name },
        importPort: { id: impPort.id, lat: impPort.lat, lon: impPort.lon, name: impPort.name },
        waypoints,
        distanceKm,
        transitDays,
        volumeBpd: work.volumeBpd,
        note: work.note || '',
        disrupted: false,
      };

      routes.push(route);
      routeMap.set(route.id, route);

      // Ship count: 1-4, proportional to volume and distance
      const roundTrip = Math.max(transitDays * 2, 1);
      const idealShips = Math.ceil(route.volumeBpd * roundTrip / VLCC_CAPACITY_BBL);
      const shipCount = Math.max(1, Math.min(MAX_SHIPS_PER_ROUTE, idealShips));

      const totalWp = waypoints.length;
      for (let i = 0; i < shipCount; i++) {
        const t = shipCount > 1 ? i / shipCount : 0;
        const isLaden = i % 2 === 0;
        const wpIdx = Math.floor(t * (totalWp - 1));
        const startIdx = isLaden ? wpIdx : totalWp - 1 - wpIdx;
        const wp = waypoints[startIdx];

        cargoShips.push({
          id: `cargo-${_nextCargoId++}`,
          routeId: route.id,
          lat: wp.lat,
          lon: wp.lon,
          heading: 0,
          waypointIndex: startIdx,
          phase: isLaden ? 'laden' : 'ballast',
          cargoBarrels: isLaden ? VLCC_CAPACITY_BBL : 0,
          blockaded: false,
        });
      }
    }
  }

  // --- Cargo ship movement ---

  function stepCargoShips(deltaSeconds) {
    const speedKmPerS = (CARGO_SPEED_KNOTS * 1.852 * GAMEPLAY_SPEED_MULTIPLIER) / 3600;

    for (const ship of cargoShips) {
      const route = routeMap.get(ship.routeId);
      if (!route) continue;

      ship.blockaded = checkBlockade(ship);
      if (ship.blockaded) continue;

      const waypoints = route.waypoints;
      const isForward = ship.phase === 'laden';
      const nextIdx = isForward ? ship.waypointIndex + 1 : ship.waypointIndex - 1;

      if (nextIdx < 0 || nextIdx >= waypoints.length) {
        handleArrival(ship, route);
        continue;
      }

      const target = waypoints[nextIdx];
      const latDiff = target.lat - ship.lat;
      const lonDiff = target.lon - ship.lon;
      const cosLat = Math.cos(ship.lat * DEG_TO_RAD);
      const distKm = Math.sqrt(
        (latDiff * KM_PER_DEGREE) ** 2 + (lonDiff * KM_PER_DEGREE * cosLat) ** 2,
      );

      if (distKm < 2) {
        ship.lat = target.lat;
        ship.lon = target.lon;
        ship.waypointIndex = nextIdx;
        continue;
      }

      const targetHeading = Math.atan2(lonDiff * cosLat, latDiff) * (180 / Math.PI);
      const hDiff = ((targetHeading - ship.heading + 540) % 360) - 180;
      ship.heading += hDiff * Math.min(1, deltaSeconds * 2);
      ship.heading = ((ship.heading + 540) % 360) - 180;

      const stepKm = speedKmPerS * deltaSeconds;
      const ratio = Math.min(stepKm / distKm, 1);
      ship.lat += latDiff * ratio;
      ship.lon += lonDiff * ratio;
    }
  }

  function handleArrival(ship, route) {
    if (ship.phase === 'laden') {
      oilSimulation.deliverCargo(route.importerIso3, ship.cargoBarrels);
      ship.cargoBarrels = 0;
      ship.phase = 'ballast';
      ship.waypointIndex = route.waypoints.length - 1;
    } else {
      ship.cargoBarrels = oilSimulation.loadCargo(route.exporterIso3, VLCC_CAPACITY_BBL);
      ship.phase = 'laden';
      ship.waypointIndex = 0;
    }
  }

  function checkBlockade(ship) {
    if (!navalSimulation || !activeCountryIso3) return false;
    const fleets = navalSimulation.getFleets();
    for (const fleet of fleets) {
      if (fleet.countryIso3 === activeCountryIso3) continue;
      const dist = approxDistanceKm(ship.lat, ship.lon, fleet.lat, fleet.lon);
      if (dist < BLOCKADE_RADIUS_KM) return true;
    }
    return false;
  }

  function step(deltaSeconds) {
    if (!portDataLoaded || !oilSimulation.isLoaded()) return;
    if (routesDirty) buildRoutes();
    processRouteWorkQueue();
    stepCargoShips(deltaSeconds);
    for (const route of routes) {
      route.disrupted = cargoShips.some((s) => s.routeId === route.id && s.blockaded);
    }
  }

  return {
    step,
    setActiveCountry,
    placePort,
    getPorts() { return ports; },
    getRoutes() { return routes; },
    getCargoShipSnapshots() {
      return cargoShips.map((s) => ({
        id: s.id, lat: s.lat, lon: s.lon, heading: s.heading,
        phase: s.phase, routeId: s.routeId, blockaded: s.blockaded,
        cargoBarrels: s.cargoBarrels,
      }));
    },
    getPortById(id) { return ports.find((p) => p.id === id) || null; },
    isLoaded() { return portDataLoaded && oilSimulation.isLoaded(); },
    isCoastal(lat, lon) {
      if (!oceanNavGrid) return false;
      const offsets = [
        [0, 0], [0.25, 0], [-0.25, 0], [0, 0.25], [0, -0.25],
        [0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5],
        [1, 0], [-1, 0], [0, 1], [0, -1],
      ];
      for (const [dlat, dlon] of offsets) {
        if (oceanNavGrid.isNavigable(lat + dlat, lon + dlon)) return true;
      }
      return false;
    },
  };
}

function approxDistanceKm(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * KM_PER_DEGREE;
  const dLon = (lon2 - lon1) * KM_PER_DEGREE * Math.cos(((lat1 + lat2) / 2) * DEG_TO_RAD);
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

function computeRouteDistance(waypoints) {
  let total = 0;
  for (let i = 1; i < waypoints.length; i++) {
    total += approxDistanceKm(
      waypoints[i - 1].lat, waypoints[i - 1].lon,
      waypoints[i].lat, waypoints[i].lon,
    );
  }
  return total;
}
