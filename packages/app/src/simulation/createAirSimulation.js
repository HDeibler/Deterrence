// Mission-based air operations with realistic refueling logistics.
//
// Real-world basis (USAF air bridge model):
// - Fighters have limited ferry range (~2,800 km for F-35A internal fuel)
// - Long-range deployments use KC-135/KC-46 tankers from bases along the route
// - Each tanker has an operational radius (~1,850 km) — fly out, offload, return
// - The 600+ tanker fleet enables global reach by chaining refueling legs
// - Tankers launch from the nearest friendly air base to each rendezvous point
// - After refueling, tankers return to their base; fighters continue to next leg
// - Aircraft always land at a base (forward deployment or return)

const DEG_TO_RAD = Math.PI / 180;
const EARTH_RADIUS_KM = 6371;

const AIRCRAFT_SPECS = {
  f35:   { label: 'F-35 Lightning',   speedKnots: 1060, rangeKm: 2800,  category: 'fighter' },
  b2:    { label: 'B-2 Spirit',       speedKnots: 475,  rangeKm: 11000, category: 'bomber' },
  cargo: { label: 'C-17 Globemaster', speedKnots: 450,  rangeKm: 8700,  category: 'cargo' },
};

const TANKER_SPECS = {
  speedKnots: 460,
  operationalRadiusKm: 1850,  // round-trip back to same base
  totalRangeKm: 4400,         // KC-135 ferry range (~2,400 nmi) — one-way + divert budget
};

// Slower multiplier — aircraft visible but not instant on globe
const GAMEPLAY_SPEED_MULTIPLIER = 12;

const COMBAT_FORMATION = [
  { bearing: 0,   distKm: 0 },
  { bearing: 135, distKm: 4 },
  { bearing: 225, distKm: 4 },
  { bearing: 160, distKm: 8 },
  { bearing: 200, distKm: 8 },
  { bearing: 120, distKm: 12 },
  { bearing: 240, distKm: 12 },
  { bearing: 180, distKm: 16 },
];

const SQUADRON_NAMES = [
  'Phantom', 'Reaper', 'Valkyrie', 'Thunderbolt', 'Nighthawk',
  'Raptor', 'Specter', 'Talon', 'Warhawk', 'Eclipse',
  'Sabre', 'Falcon', 'Phoenix', 'Viper', 'Condor',
  'Havoc', 'Ghost', 'Banshee', 'Striker', 'Shadow',
];

// ── Alliance and airspace data ────────────────────────────────
// Each playable nation has allies (whose bases it can use) and
// a set of hostile airspace zones it must route around.
// Structured so adding a new faction just means adding entries here.

const ALLIED_COUNTRIES = {
  USA: new Set([
    // NATO
    'USA', 'CAN', 'GBR', 'FRA', 'DEU', 'ITA', 'ESP', 'NLD', 'BEL', 'LUX',
    'NOR', 'DNK', 'ISL', 'PRT', 'TUR', 'GRC', 'POL', 'CZE', 'HUN', 'SVK',
    'SVN', 'HRV', 'BGR', 'ROU', 'EST', 'LVA', 'LTU', 'ALB', 'MNE', 'MKD',
    'FIN', 'SWE',
    // Pacific allies
    'JPN', 'KOR', 'AUS', 'NZL', 'PHL', 'SGP', 'THA',
    // Middle East partners
    'ISR', 'QAT', 'ARE', 'BHR', 'KWT', 'SAU', 'JOR',
  ]),
  RUS: new Set([
    'RUS', 'BLR', 'SYR', 'PRK', 'IRN', 'MMR', 'CUB', 'VEN',
    'KAZ', 'UZB', 'TKM', 'TJK', 'KGZ', 'ARM',
  ]),
  CHN: new Set([
    'CHN', 'PRK', 'MMR', 'LAO', 'KHM', 'PAK',
    'RUS', 'IRN', 'CUB', 'VEN',
  ]),
};

// Airspace zones by nation — overlapping circles approximate territory.
// Radii kept tight to avoid bleeding into adjacent international airspace.
const NATION_AIRSPACE = {
  USA: [
    { lat: 39, lon: -98, radiusKm: 2200 },    // CONUS
    { lat: 64, lon: -153, radiusKm: 800 },    // Alaska
    { lat: 21, lon: -157, radiusKm: 300 },    // Hawaii
  ],
  CAN: [
    { lat: 56, lon: -106, radiusKm: 1800 },   // Canada
  ],
  GBR: [
    { lat: 54, lon: -2, radiusKm: 500 },      // UK
  ],
  FRA: [
    { lat: 46, lon: 2, radiusKm: 600 },       // France
  ],
  DEU: [
    { lat: 51, lon: 10, radiusKm: 400 },      // Germany
  ],
  ITA: [
    { lat: 42, lon: 12, radiusKm: 500 },      // Italy
  ],
  ESP: [
    { lat: 40, lon: -4, radiusKm: 500 },      // Spain
  ],
  TUR: [
    { lat: 39, lon: 35, radiusKm: 600 },      // Turkey
  ],
  NOR: [
    { lat: 64, lon: 12, radiusKm: 500 },      // Norway
  ],
  POL: [
    { lat: 52, lon: 20, radiusKm: 350 },      // Poland
  ],
  JPN: [
    { lat: 36, lon: 138, radiusKm: 600 },     // Japan
  ],
  KOR: [
    { lat: 36, lon: 128, radiusKm: 300 },     // South Korea
  ],
  AUS: [
    { lat: -25, lon: 134, radiusKm: 2000 },   // Australia
  ],
  ISR: [
    { lat: 31, lon: 35, radiusKm: 200 },      // Israel
  ],
  SAU: [
    { lat: 24, lon: 45, radiusKm: 800 },      // Saudi Arabia
  ],
  RUS: [
    { lat: 56, lon: 38, radiusKm: 1100 },     // Western Russia / Moscow
    { lat: 58, lon: 68, radiusKm: 1100 },     // Urals
    { lat: 60, lon: 100, radiusKm: 1200 },    // Central Siberia
    { lat: 58, lon: 135, radiusKm: 900 },     // Far East
  ],
  CHN: [
    { lat: 37, lon: 100, radiusKm: 1600 },    // Western China
    { lat: 32, lon: 116, radiusKm: 1000 },    // Eastern China
  ],
  PRK: [
    { lat: 40, lon: 127, radiusKm: 300 },     // North Korea
  ],
  IRN: [
    { lat: 32, lon: 53, radiusKm: 800 },      // Iran
  ],
  IND: [
    { lat: 22, lon: 79, radiusKm: 1400 },     // India
  ],
  BLR: [
    { lat: 53, lon: 28, radiusKm: 300 },      // Belarus
  ],
};

// Build the hostile airspace zones for a given player country.
// Any nation NOT allied with the player whose airspace we've defined = hostile.
function getHostileAirspace(playerCountry) {
  const allies = ALLIED_COUNTRIES[playerCountry];
  if (!allies) {
    return [];
  }
  const zones = [];
  for (const [iso3, airspace] of Object.entries(NATION_AIRSPACE)) {
    if (!allies.has(iso3)) {
      for (const zone of airspace) {
        zones.push(zone);
      }
    }
  }
  return zones;
}

let _nextMissionId = 1;
let _nextAcId = 1;
let _nextTankerId = 1;
let _nextLandedId = 1;

export { AIRCRAFT_SPECS, TANKER_SPECS };

export function filterAlliedBases(allBases, playerCountry) {
  const allies = ALLIED_COUNTRIES[playerCountry];
  if (!allies) {
    return allBases.filter((b) => b.countryIso3 === playerCountry);
  }
  return allBases.filter((b) => allies.has(b.countryIso3));
}

export function createAirSimulation({ onConsumeFuel } = {}) {
  const activeMissions = [];
  const landedSquadrons = [];
  let _carrierPositionResolver = null;
  let _eventHandler = null; // (type, data) => void
  const _consumeFuel = onConsumeFuel || (() => true);

  return {
    setCarrierPositionResolver(resolver) {
      _carrierPositionResolver = resolver;
    },

    // Subscribe to simulation events (crashes, bingo fuel, etc.)
    onEvent(handler) {
      _eventHandler = handler;
      return () => { _eventHandler = null; };
    },
    // ── Route planning (pure function, no side effects) ──────────
    planRoute({ homeLat, homeLon, homeName, destLat, destLon, aircraftTypes, friendlyBases, playerCountry }) {
      // Limiting range = shortest-range aircraft in the group
      const minRange = aircraftTypes.reduce((min, type) => {
        const spec = AIRCRAFT_SPECS[type];
        return spec ? Math.min(min, spec.rangeKm) : min;
      }, Infinity);

      if (minRange === Infinity) {
        return { viable: false, reason: 'No valid aircraft types' };
      }

      // Build hostile zones for this player's perspective
      const hostileZones = playerCountry ? getHostileAirspace(playerCountry) : [];

      // Compute route that avoids hostile airspace
      const routeWaypoints = computeSafeRoute(homeLat, homeLon, destLat, destLon, hostileZones);
      const totalDistKm = pathDistance(routeWaypoints);

      // Safety margin — plan legs at 80% of max range
      const legRange = minRange * 0.8;

      // Direct flight — no tankers needed
      if (totalDistKm <= minRange * 0.9) {
        return {
          viable: true,
          distanceKm: totalDistKm,
          directFlight: true,
          legs: [{ from: routeWaypoints[0], to: routeWaypoints[routeWaypoints.length - 1], distKm: totalDistKm }],
          refuelStops: [],
          refuelDistances: [],
          tankerAssignments: [],
          waypoints: generateDensePathWaypoints(routeWaypoints),
        };
      }

      // Generate dense waypoints along the safe route so fighters follow
      // the curved path (around hostile airspace) instead of cutting straight.
      const denseWaypoints = generateDensePathWaypoints(routeWaypoints);

      // Place refuel stops along the route, snapping each one toward the
      // nearest friendly base so tankers have a short trip. The fighters can
      // fly up to minRange between stops, so we have flexibility in placement.
      const refuelStops = [];
      const refuelDistances = [];
      const tankerAssignments = [];
      const airbases = friendlyBases.filter((b) => b.category === 'airbase');

      let distCovered = 0;
      while (distCovered + legRange < totalDistKm) {
        // Candidate refuel point at the nominal leg range
        const nominalDist = distCovered + legRange;
        const nominalPoint = interpolateAlongPath(routeWaypoints, nominalDist);

        // Find nearest friendly base to this candidate
        let bestBase = null;
        let bestBaseDist = Infinity;
        for (const base of airbases) {
          const d = haversineKm(nominalPoint.lat, nominalPoint.lon, base.lat, base.lon);
          if (d < bestBaseDist) {
            bestBaseDist = d;
            bestBase = base;
          }
        }

        // If the nearest base is within tanker operational radius, use the
        // nominal point. Otherwise, try sliding the refuel point forward/back
        // along the route to get closer to a base, staying within fighter range.
        let finalDist = nominalDist;
        let finalPoint = nominalPoint;

        if (bestBaseDist > TANKER_SPECS.operationalRadiusKm && bestBase) {
          // Search around the nominal point for a better position.
          // Limit shift so the previous leg stays ≤ minRange and next leg isn't too long.
          const maxForward = Math.min(legRange * 0.15, minRange * 0.9 - legRange);
          const maxBackward = legRange * 0.15;
          let bestShiftDist = bestBaseDist;
          for (let offset = -maxBackward; offset <= maxForward; offset += 80) {
            const testDist = nominalDist + offset;
            if (testDist <= distCovered + 500 || testDist >= totalDistKm - 500) {
              continue;
            }
            const testPoint = interpolateAlongPath(routeWaypoints, testDist);
            for (const base of airbases) {
              const d = haversineKm(testPoint.lat, testPoint.lon, base.lat, base.lon);
              if (d < bestShiftDist) {
                bestShiftDist = d;
                finalDist = testDist;
                finalPoint = testPoint;
              }
            }
          }
        }

        distCovered = finalDist;
        refuelStops.push(finalPoint);
        refuelDistances.push(distCovered);

        const remaining = totalDistKm - distCovered;
        if (remaining <= minRange * 0.9) {
          break;
        }
      }

      // Build legs from refuel stops
      const legs = [];
      const legPoints = [
        routeWaypoints[0],
        ...refuelStops,
        routeWaypoints[routeWaypoints.length - 1],
      ];
      for (let i = 0; i < legPoints.length - 1; i++) {
        const from = legPoints[i];
        const to = legPoints[i + 1];
        const fromDist = i === 0 ? 0 : refuelDistances[i - 1];
        const toDist = i < refuelDistances.length ? refuelDistances[i] : totalDistKm;
        legs.push({ from, to, distKm: toDist - fromDist });
      }

      // Verify no leg exceeds aircraft range
      for (const leg of legs) {
        if (leg.distKm > minRange) {
          return {
            viable: false,
            reason: `Leg distance ${Math.round(leg.distKm)} km exceeds aircraft range`,
            distanceKm: totalDistKm,
          };
        }
      }

      // Assign tankers for each refuel stop
      for (let si = 0; si < refuelStops.length; si++) {
        const assignment = assignTankerForRefuelPoint(
          refuelStops[si], si, friendlyBases,
        );
        if (!assignment) {
          return {
            viable: false,
            reason: `No allied tanker base within range of refueling point ${si + 1}`,
            distanceKm: totalDistKm,
            refuelStops,
            failedStopIndex: si,
          };
        }
        for (const ta of assignment) {
          tankerAssignments.push(ta);
        }
      }

      // Safety cap
      if (tankerAssignments.length > 20) {
        return {
          viable: false,
          reason: `Route requires ${tankerAssignments.length} tankers — too complex`,
          distanceKm: totalDistKm,
        };
      }

      return {
        viable: true,
        distanceKm: totalDistKm,
        directFlight: false,
        legs,
        refuelStops,
        refuelDistances,
        tankerAssignments,
        waypoints: denseWaypoints,
      };
    },

    // ── Launch a planned mission ─────────────────────────────────
    launchMission({ homeLat, homeLon, aircraft, routePlan, name, carrierFleetId }) {
      // Consume 10,000 barrels per sortie from national fuel pool
      if (!_consumeFuel(10000)) {
        return { failed: true, reason: 'outOfFuel' };
      }

      const num = _nextMissionId++;
      const missionId = `mission_${num}`;
      const missionName = name || SQUADRON_NAMES[(num - 1) % SQUADRON_NAMES.length];

      // Squadron speed = slowest aircraft
      const slowest = aircraft.reduce((min, a) => {
        const spec = AIRCRAFT_SPECS[a.type];
        return spec && spec.speedKnots < min ? spec.speedKnots : min;
      }, Infinity);
      const speedKnots = slowest === Infinity ? 450 : slowest;

      const minRange = aircraft.reduce((min, a) => {
        const spec = AIRCRAFT_SPECS[a.type];
        return spec ? Math.min(min, spec.rangeKm) : min;
      }, Infinity);

      // Create tanker flights from assignments.
      // Primary tankers with a relay get a two-phase outbound: first to relay point,
      // wait for relay tanker refuel, then continue to fighter rendezvous.
      const tankerFlights = [];
      for (const ta of routePlan.tankerAssignments) {
        const distReturn = haversineKm(ta.refuelPoint.lat, ta.refuelPoint.lon, ta.returnLat, ta.returnLon);
        const tf = {
          id: `tanker_${_nextTankerId++}`,
          missionId,
          baseLat: ta.baseLat,
          baseLon: ta.baseLon,
          baseName: ta.baseName,
          returnLat: ta.returnLat,
          returnLon: ta.returnLon,
          returnName: ta.returnName,
          rendezvousLat: ta.refuelPoint.lat,
          rendezvousLon: ta.refuelPoint.lon,
          lat: ta.baseLat,
          lon: ta.baseLon,
          heading: 0,
          phase: 'outbound',
          speedKnots: TANKER_SPECS.speedKnots,
          fuelRemainingKm: ta.fuelBudgetKm,
          maxFuelKm: ta.fuelBudgetKm,
          tripKm: ta.distToRefuelKm + distReturn,
          refuelStopIndex: ta.refuelStopIndex,
          isRelay: ta.isRelay || false,
          relayTargetId: ta.relayTargetId || null,
          // If this primary tanker needs a relay top-off en route:
          relayPointLat: ta.needsRelayAt ? ta.needsRelayAt.lat : null,
          relayPointLon: ta.needsRelayAt ? ta.needsRelayAt.lon : null,
          waitingForRelay: false,
          positionHistory: [{ lat: ta.baseLat, lon: ta.baseLon }],
          historyTimer: 0,
          launchDelay: 0,
        };
        tankerFlights.push(tf);
      }

      // Wire up relay tanker → primary tanker ID references
      for (let ti = 0; ti < tankerFlights.length; ti++) {
        const tf = tankerFlights[ti];
        if (tf.isRelay) {
          // Find the primary tanker at the same refuel stop that needs a relay
          for (const other of tankerFlights) {
            if (!other.isRelay && other.refuelStopIndex === tf.refuelStopIndex &&
                other.relayPointLat !== null) {
              tf.relayTargetId = other.id;
              break;
            }
          }
        }
      }

      // ── Build the flight path as dense waypoints ──
      // Fighters follow these waypoints sequentially so they trace the
      // safe route around hostile airspace instead of cutting straight lines.
      const flightPath = routePlan.waypoints;

      // Map each refuel stop to the nearest dense waypoint index
      const refuelWaypointIndices = [];
      const refuelDistances = routePlan.refuelDistances || [];
      if (refuelDistances.length > 0) {
        // Walk the dense path to find waypoint indices at each refuel distance
        let wpDist = 0;
        let ri = 0;
        for (let wi = 1; wi < flightPath.length && ri < refuelDistances.length; wi++) {
          wpDist += haversineKm(
            flightPath[wi - 1].lat, flightPath[wi - 1].lon,
            flightPath[wi].lat, flightPath[wi].lon,
          );
          if (wpDist >= refuelDistances[ri]) {
            refuelWaypointIndices.push(wi);
            ri++;
          }
        }
        // If we didn't map all stops, append the last waypoint
        while (refuelWaypointIndices.length < refuelDistances.length) {
          refuelWaypointIndices.push(flightPath.length - 2);
        }
      }

      // ── Temporal scheduling ──
      // Each tanker gets a launch delay so it arrives at its rendezvous
      // just before the fighters do (just-in-time).
      // Relay tankers must arrive at the relay point before the primary tanker does.
      const fighterSpeedKmS = (speedKnots * 1.852 * GAMEPLAY_SPEED_MULTIPLIER) / 3600;
      const tankerSpeedKmS = (TANKER_SPECS.speedKnots * 1.852 * GAMEPLAY_SPEED_MULTIPLIER) / 3600;
      let holdSeconds = 0;

      if (tankerFlights.length > 0 && fighterSpeedKmS > 0 && tankerSpeedKmS > 0) {
        const timingData = tankerFlights.map((tf, ti) => {
          const ta = routePlan.tankerAssignments[ti];

          // For primary tankers that need relay: total time includes flying to
          // relay point + waiting + relay→refuel. But for scheduling we care about
          // when they need to be at the FIGHTER rendezvous.
          const tankerTimeS = ta.distToRefuelKm / tankerSpeedKmS;
          const fighterDistToStop = refuelDistances[ta.refuelStopIndex] || routePlan.distanceKm;
          const fighterTimeS = fighterDistToStop / fighterSpeedKmS;
          return { tankerTimeS, fighterTimeS, isRelay: tf.isRelay };
        });

        // Only non-relay tankers constrain fighter hold time — relay tankers
        // don't directly interact with fighters.
        for (const td of timingData) {
          if (td.isRelay) {
            continue;
          }
          const rawDelta = td.tankerTimeS - td.fighterTimeS;
          if (rawDelta + 5 > holdSeconds) {
            holdSeconds = rawDelta + 5;
          }
        }
        holdSeconds = Math.max(0, holdSeconds);

        for (let ti = 0; ti < tankerFlights.length; ti++) {
          const tf = tankerFlights[ti];
          const td = timingData[ti];

          if (tf.isRelay) {
            // Relay tanker: needs to arrive at relay point before the primary.
            // Find the primary it's supporting and compute when the primary arrives.
            const primary = tankerFlights.find((t) => t.id === tf.relayTargetId);
            if (primary && primary.relayPointLat !== null) {
              const primaryDistToRelay = haversineKm(
                primary.baseLat, primary.baseLon,
                primary.relayPointLat, primary.relayPointLon,
              );
              const primaryTimeToRelay = primaryDistToRelay / tankerSpeedKmS;
              // Relay should arrive 5s before primary reaches relay point
              tf.launchDelay = Math.max(0, primaryTimeToRelay - td.tankerTimeS - 5);
            } else {
              tf.launchDelay = 0;
            }
          } else {
            // Normal tanker: arrive at fighter rendezvous just-in-time
            tf.launchDelay = Math.max(
              0, holdSeconds + td.fighterTimeS - td.tankerTimeS - 5,
            );
          }
        }
      }

      const initialPhase = holdSeconds > 0 ? 'holding' : 'enroute';

      const mission = {
        id: missionId,
        name: missionName,
        homeLat, homeLon,
        destLat: flightPath[flightPath.length - 1].lat,
        destLon: flightPath[flightPath.length - 1].lon,
        lat: homeLat,
        lon: homeLon,
        heading: 0,
        positionHistory: [{ lat: homeLat, lon: homeLon }],
        historyTimer: 0,
        speedKnots,
        fuelRemainingKm: minRange,
        maxFuelKm: minRange,
        // Waypoint-following: fighters follow flightPath sequentially
        flightPath,
        currentWaypointIndex: 1, // start heading toward waypoint 1
        refuelWaypointIndices, // waypoint indices where refueling occurs
        nextRefuelIndex: 0,    // which refuel stop we're approaching next
        // Legacy legs kept for UI/timing
        legs: routePlan.legs,
        holdTimer: holdSeconds,
        phase: initialPhase,
        aircraft: aircraft.map((a) => {
          const spec = AIRCRAFT_SPECS[a.type];
          const acRange = spec ? spec.rangeKm : 5000;
          return {
            id: `ac_${_nextAcId++}`,
            missionId,
            type: a.type,
            health: 100,
            destroyed: false,
            fuelRemainingKm: acRange,
            maxFuelKm: acRange,
          };
        }),
        tankerFlights,
        // Carrier mission — fighters return to carrier after reaching destination
        carrierFleetId: carrierFleetId || null,
        isCarrierMission: Boolean(carrierFleetId),
        returnPhase: false, // true when heading back to carrier
      };

      activeMissions.push(mission);
      return mission;
    },

    // ── Relaunch a landed squadron ───────────────────────────────
    relaunchSquadron(squadronId, routePlan) {
      const idx = landedSquadrons.findIndex((s) => s.id === squadronId);
      if (idx === -1) {
        return null;
      }
      const landed = landedSquadrons[idx];
      landedSquadrons.splice(idx, 1);

      return this.launchMission({
        homeLat: landed.lat,
        homeLon: landed.lon,
        aircraft: landed.aircraft.filter((a) => !a.destroyed).map((a) => ({ type: a.type })),
        routePlan,
        name: landed.name,
      });
    },

    // ── Simulation step ──────────────────────────────────────────
    step(deltaSeconds) {
      for (let mi = activeMissions.length - 1; mi >= 0; mi--) {
        const mission = activeMissions[mi];

        // ── Holding phase: tankers deploy, fighters wait at base ──
        if (mission.phase === 'holding') {
          mission.holdTimer -= deltaSeconds;

          // Carrier missions: fighters stay on the carrier deck as it moves
          if (mission.isCarrierMission && _carrierPositionResolver) {
            const carrierPos = _carrierPositionResolver(mission.carrierFleetId);
            if (carrierPos) {
              mission.lat = carrierPos.lat;
              mission.lon = carrierPos.lon;
              mission.homeLat = carrierPos.lat;
              mission.homeLon = carrierPos.lon;
            }
          }

          // Move tankers while fighters hold
          for (const tf of mission.tankerFlights) {
            stepTankerFlight(tf, deltaSeconds, mission.tankerFlights);
            tf.historyTimer += deltaSeconds;
            if (tf.historyTimer >= 0.5) {
              tf.historyTimer = 0;
              tf.positionHistory.push({ lat: tf.lat, lon: tf.lon });
            }
          }
          if (mission.holdTimer <= 0) {
            mission.holdTimer = 0;
            // Rebuild the flight path from current position to destination
            // so fighters don't fly backward to the stale launch point
            if (mission.isCarrierMission) {
              const dest = mission.flightPath[mission.flightPath.length - 1];
              mission.flightPath = generateDensePathWaypoints([
                { lat: mission.lat, lon: mission.lon },
                { lat: dest.lat, lon: dest.lon },
              ]);
              mission.currentWaypointIndex = 1;
              mission.refuelWaypointIndices = [];
              mission.nextRefuelIndex = 0;
            }
            mission.phase = 'enroute';
          }
          continue;
        }

        // ── Loitering phase (carrier missions): circle at destination ──
        if (mission.phase === 'loitering') {
          const speedKmPerS = (mission.speedKnots * 1.852 * GAMEPLAY_SPEED_MULTIPLIER) / 3600;
          const loiterBurn = speedKmPerS * deltaSeconds * 0.4;
          mission.fuelRemainingKm -= loiterBurn;
          for (const ac of mission.aircraft) {
            if (!ac.destroyed) {
              ac.fuelRemainingKm -= loiterBurn;
            }
          }
          mission.loiterTimer = (mission.loiterTimer || 0) + deltaSeconds;

          // Orbit the destination point — circle with ~30km radius
          const orbitRadiusDeg = 30 / 111;
          const orbitSpeed = 0.15; // radians per game-second
          const angle = mission.loiterTimer * orbitSpeed;
          const cosLat = Math.cos(mission.destLat * DEG_TO_RAD);
          mission.lat = mission.destLat + Math.sin(angle) * orbitRadiusDeg;
          mission.lon = mission.destLon + Math.cos(angle) * orbitRadiusDeg / Math.max(0.1, cosLat);
          // Heading tangent to orbit
          mission.heading = (angle * 180 / Math.PI + 90) % 360;

          // Compute return distance to carrier's CURRENT position
          let returnDistKm = pathDistance(mission.flightPath);
          if (_carrierPositionResolver && mission.carrierFleetId) {
            const carrierPos = _carrierPositionResolver(mission.carrierFleetId);
            if (carrierPos) {
              returnDistKm = haversineKm(mission.lat, mission.lon, carrierPos.lat, carrierPos.lon);
            }
          }
          const fuelNeededForReturn = returnDistKm * 1.15;

          // Return when fuel is just enough to get back, or after 120s loiter
          if (mission.fuelRemainingKm <= fuelNeededForReturn || mission.loiterTimer > 120) {
            mission.returnPhase = true;
            mission.phase = 'enroute';

            // Build return path to carrier's current position
            if (_carrierPositionResolver && mission.carrierFleetId) {
              const carrierPos = _carrierPositionResolver(mission.carrierFleetId);
              if (carrierPos) {
                // Direct great-circle back to the carrier
                const returnWps = generateDensePathWaypoints([
                  { lat: mission.lat, lon: mission.lon },
                  { lat: carrierPos.lat, lon: carrierPos.lon },
                ]);
                mission.flightPath = returnWps;
                mission.homeLat = carrierPos.lat;
                mission.homeLon = carrierPos.lon;
              } else {
                mission.flightPath = mission.flightPath.slice().reverse();
              }
            } else {
              mission.flightPath = mission.flightPath.slice().reverse();
            }
            mission.currentWaypointIndex = 1;
            mission.refuelWaypointIndices = [];
            mission.nextRefuelIndex = 0;
          }

          // Record position + step tankers
          mission.historyTimer += deltaSeconds;
          if (mission.historyTimer >= 0.5) {
            mission.historyTimer = 0;
            mission.positionHistory.push({ lat: mission.lat, lon: mission.lon });
          }
          for (const tf of mission.tankerFlights) {
            if (tf.phase !== 'landed') {
              stepTankerFlight(tf, deltaSeconds, mission.tankerFlights);
              tf.historyTimer += deltaSeconds;
              if (tf.historyTimer >= 0.5) {
                tf.historyTimer = 0;
                tf.positionHistory.push({ lat: tf.lat, lon: tf.lon });
              }
            }
          }
          continue;
        }

        // ── Arrived phase: combat package landed, tankers still flying ──
        if (mission.phase === 'arrived') {
          // Keep stepping tankers until they all land
          let allTankersLanded = true;
          for (const tf of mission.tankerFlights) {
            if (tf.phase !== 'landed') {
              stepTankerFlight(tf, deltaSeconds, mission.tankerFlights);
              tf.historyTimer += deltaSeconds;
              if (tf.historyTimer >= 0.5) {
                tf.historyTimer = 0;
                tf.positionHistory.push({ lat: tf.lat, lon: tf.lon });
              }
              allTankersLanded = false;
            }
          }
          if (allTankersLanded) {
            activeMissions.splice(mi, 1);
          }
          continue;
        }

        if (mission.phase !== 'enroute') {
          continue;
        }

        // ── Carrier fuel bingo check: abort outbound if fuel won't cover return ──
        // Account for carrier moving during return time — carrier speed adds
        // distance the fighters must cover beyond the current snapshot distance.
        if (mission.isCarrierMission && !mission.returnPhase && _carrierPositionResolver) {
          const carrierPos = _carrierPositionResolver(mission.carrierFleetId);
          if (carrierPos) {
            const distToCarrier = haversineKm(mission.lat, mission.lon, carrierPos.lat, carrierPos.lon);
            const fighterSpeedKmS = (mission.speedKnots * 1.852 * GAMEPLAY_SPEED_MULTIPLIER) / 3600;
            const returnTimeS = fighterSpeedKmS > 0 ? distToCarrier / fighterSpeedKmS : 0;
            // Carrier moves during return time (~30 knots * gameplay multiplier)
            const carrierSpeedKmS = (30 * 1.852 * 200) / 3600; // naval uses 200x multiplier
            const carrierDrift = carrierSpeedKmS * returnTimeS;
            // Worst case: carrier is moving directly away
            const fuelNeeded = distToCarrier + carrierDrift + 200; // +200km hard reserve
            if (mission.fuelRemainingKm <= fuelNeeded) {
              mission.returnPhase = true;
              if (_eventHandler) {
                _eventHandler('bingo', { missionName: mission.name, fuelPct: Math.round((mission.fuelRemainingKm / mission.maxFuelKm) * 100) });
              }
              for (const tf of mission.tankerFlights) {
                if (tf.phase === 'loitering' || tf.phase === 'outbound') {
                  tf.phase = 'returning';
                }
              }
            }
          }
        }

        // ── Carrier return: fly directly toward carrier's live position ──
        if (mission.isCarrierMission && mission.returnPhase && _carrierPositionResolver) {
          const carrierPos = _carrierPositionResolver(mission.carrierFleetId);
          if (carrierPos) {
            const speedKmPerS = (mission.speedKnots * 1.852 * GAMEPLAY_SPEED_MULTIPLIER) / 3600;
            const stepKm = speedKmPerS * deltaSeconds;
            const dist = haversineKm(mission.lat, mission.lon, carrierPos.lat, carrierPos.lon);

            if (dist < 10) {
              // Close enough — landed back on carrier
              mission.phase = 'arrived';
              continue;
            }

            const moveRatio = Math.min(stepKm / dist, 1);
            mission.lat += (carrierPos.lat - mission.lat) * moveRatio;
            mission.lon += (carrierPos.lon - mission.lon) * moveRatio;

            // Burn fuel
            mission.fuelRemainingKm -= stepKm;
            for (const ac of mission.aircraft) {
              if (!ac.destroyed) {
                ac.fuelRemainingKm -= stepKm;
              }
            }

            // Crash check during return
            if (mission.fuelRemainingKm <= 0) {
              const liveCount = mission.aircraft.filter((a) => !a.destroyed).length;
              if (liveCount > 0) {
                for (const ac of mission.aircraft) { ac.destroyed = true; }
                if (_eventHandler) {
                  _eventHandler('crash', { missionName: mission.name, aircraftCount: liveCount, lat: mission.lat, lon: mission.lon });
                }
                mission.phase = 'arrived';
                continue;
              }
            }

            // Update heading toward carrier
            const latDiff = carrierPos.lat - mission.lat;
            const lonDiff = carrierPos.lon - mission.lon;
            const cosLat = Math.cos(mission.lat * DEG_TO_RAD);
            const targetHeading = Math.atan2(lonDiff * cosLat, latDiff) * (180 / Math.PI);
            let hDiff = ((targetHeading - mission.heading + 540) % 360) - 180;
            mission.heading += hDiff * Math.min(1, deltaSeconds * 3);
            mission.heading = ((mission.heading + 540) % 360) - 180;

            // Record history + step tankers
            mission.historyTimer += deltaSeconds;
            if (mission.historyTimer >= 0.5) {
              mission.historyTimer = 0;
              mission.positionHistory.push({ lat: mission.lat, lon: mission.lon });
            }
            for (const tf of mission.tankerFlights) {
              if (tf.phase !== 'landed') {
                stepTankerFlight(tf, deltaSeconds, mission.tankerFlights);
                tf.historyTimer += deltaSeconds;
                if (tf.historyTimer >= 0.5) {
                  tf.historyTimer = 0;
                  tf.positionHistory.push({ lat: tf.lat, lon: tf.lon });
                }
              }
            }
            continue;
          }
        }

        // ── Move combat squadron along flight path waypoints ──
        const wp = mission.flightPath[mission.currentWaypointIndex];
        if (!wp) {
          mission.phase = 'arrived';
          continue;
        }

        const distToWp = haversineKm(mission.lat, mission.lon, wp.lat, wp.lon);
        const speedKmPerS = (mission.speedKnots * 1.852 * GAMEPLAY_SPEED_MULTIPLIER) / 3600;
        let stepBudget = speedKmPerS * deltaSeconds;

        // Advance through waypoints, consuming step budget
        while (stepBudget > 0 && mission.currentWaypointIndex < mission.flightPath.length) {
          const target = mission.flightPath[mission.currentWaypointIndex];
          const dist = haversineKm(mission.lat, mission.lon, target.lat, target.lon);

          if (dist <= stepBudget || dist < 2) {
            // Reached this waypoint — snap and advance
            mission.lat = target.lat;
            mission.lon = target.lon;
            stepBudget -= dist;

            // Check if this waypoint is a refuel stop
            if (mission.nextRefuelIndex < mission.refuelWaypointIndices.length &&
                mission.currentWaypointIndex >= mission.refuelWaypointIndices[mission.nextRefuelIndex]) {
              // Refuel — restore fuel
              mission.fuelRemainingKm = mission.maxFuelKm;
              for (const ac of mission.aircraft) {
                if (!ac.destroyed) {
                  ac.fuelRemainingKm = ac.maxFuelKm;
                }
              }
              // Signal tankers at this refuel stop to return
              const refuelIdx = mission.nextRefuelIndex;
              for (const tf of mission.tankerFlights) {
                if (tf.refuelStopIndex === refuelIdx && !tf.isRelay && tf.phase === 'loitering') {
                  tf.phase = 'returning';
                }
              }
              mission.nextRefuelIndex++;
            }

            mission.currentWaypointIndex++;

            // Reached end of flight path
            if (mission.currentWaypointIndex >= mission.flightPath.length) {
              // Carrier mission — loiter at destination, then return
              if (mission.isCarrierMission && !mission.returnPhase) {
                mission.phase = 'loitering';
                mission.loiterTimer = 0;
                // Release outbound tankers
                for (const tf of mission.tankerFlights) {
                  if (tf.phase === 'loitering' || tf.phase === 'outbound') {
                    tf.phase = 'returning';
                  }
                }
                break;
              }

              // Carrier return complete — back on carrier deck
              if (mission.isCarrierMission && mission.returnPhase) {
                mission.phase = 'arrived';
                for (const tf of mission.tankerFlights) {
                  if (tf.phase === 'loitering' || tf.phase === 'outbound') {
                    tf.phase = 'returning';
                  }
                }
                break;
              }

              // Normal mission — squadron landed at destination base
              mission.phase = 'arrived';
              landedSquadrons.push({
                id: `landed_${_nextLandedId++}`,
                name: mission.name,
                lat: mission.destLat,
                lon: mission.destLon,
                aircraft: mission.aircraft,
                baseLat: mission.destLat,
                baseLon: mission.destLon,
              });
              for (const tf of mission.tankerFlights) {
                if (tf.phase === 'loitering' || tf.phase === 'outbound') {
                  tf.phase = 'returning';
                }
              }
              break;
            }
          } else {
            // Move toward this waypoint
            const moveRatio = stepBudget / dist;
            const latDiff = target.lat - mission.lat;
            const lonDiff = target.lon - mission.lon;
            mission.lat += latDiff * moveRatio;
            mission.lon += lonDiff * moveRatio;
            stepBudget = 0;
          }
        }

        if (mission.phase === 'arrived') {
          continue;
        }

        // Burn fuel
        const totalStep = speedKmPerS * deltaSeconds;
        mission.fuelRemainingKm -= totalStep;
        for (const ac of mission.aircraft) {
          if (!ac.destroyed) {
            ac.fuelRemainingKm -= totalStep;
          }
        }

        // Crash check — aircraft at 0 fuel go down
        if (mission.fuelRemainingKm <= 0) {
          const liveCount = mission.aircraft.filter((a) => !a.destroyed).length;
          if (liveCount > 0) {
            for (const ac of mission.aircraft) {
              ac.destroyed = true;
            }
            if (_eventHandler) {
              _eventHandler('crash', {
                missionName: mission.name,
                aircraftCount: liveCount,
                lat: mission.lat,
                lon: mission.lon,
              });
            }
            mission.phase = 'arrived';
            for (const tf of mission.tankerFlights) {
              if (tf.phase === 'loitering' || tf.phase === 'outbound') {
                tf.phase = 'returning';
              }
            }
            continue;
          }
        }

        // Update heading based on next waypoint
        if (mission.currentWaypointIndex < mission.flightPath.length) {
          const nextWp = mission.flightPath[mission.currentWaypointIndex];
          const latDiff = nextWp.lat - mission.lat;
          const lonDiff = nextWp.lon - mission.lon;
          const cosLat = Math.cos(mission.lat * DEG_TO_RAD);
          const targetHeading = Math.atan2(lonDiff * cosLat, latDiff) * (180 / Math.PI);
          let hDiff = ((targetHeading - mission.heading + 540) % 360) - 180;
          mission.heading += hDiff * Math.min(1, deltaSeconds * 3);
          mission.heading = ((mission.heading + 540) % 360) - 180;
        }

        // Record mission position history
        mission.historyTimer += deltaSeconds;
        if (mission.historyTimer >= 0.5) {
          mission.historyTimer = 0;
          mission.positionHistory.push({ lat: mission.lat, lon: mission.lon });
        }

        // ── Move tanker flights ──
        for (const tf of mission.tankerFlights) {
          stepTankerFlight(tf, deltaSeconds, mission.tankerFlights);
          tf.historyTimer += deltaSeconds;
          if (tf.historyTimer >= 0.5) {
            tf.historyTimer = 0;
            tf.positionHistory.push({ lat: tf.lat, lon: tf.lon });
          }
        }

      }
    },

    // ── Queries ──────────────────────────────────────────────────
    getActiveMissions() {
      return activeMissions;
    },

    getLandedSquadrons() {
      return landedSquadrons;
    },

    // All deployable groups (landed squadrons)
    getSquadrons() {
      return landedSquadrons;
    },

    // Aircraft snapshots for 3D/2D rendering
    getSnapshot() {
      const snapshots = [];

      for (const mission of activeMissions) {
        // Combat aircraft — skip if mission already arrived (they're in landedSquadrons now)
        if (mission.phase !== 'arrived') {
          const isLoitering = mission.phase === 'loitering';

          for (let i = 0; i < mission.aircraft.length; i++) {
            const ac = mission.aircraft[i];
            if (ac.destroyed) {
              continue;
            }

            let lat, lon, heading;
            if (isLoitering) {
              // Spread planes in a circular orbit — each at a different phase offset
              const orbitRadiusDeg = 30 / 111;
              const orbitSpeed = 0.15;
              const phaseOffset = (i / Math.max(1, mission.aircraft.length)) * Math.PI * 2;
              const angle = (mission.loiterTimer || 0) * orbitSpeed + phaseOffset;
              const cosDestLat = Math.cos(mission.destLat * DEG_TO_RAD);
              lat = mission.destLat + Math.sin(angle) * orbitRadiusDeg;
              lon = mission.destLon + Math.cos(angle) * orbitRadiusDeg / Math.max(0.1, cosDestLat);
              heading = (angle * 180 / Math.PI + 90) % 360;
            } else {
              const offset = COMBAT_FORMATION[i % COMBAT_FORMATION.length];
              ({ lat, lon } = applyBearingOffset(
                mission.lat, mission.lon, mission.heading, offset.bearing, offset.distKm,
              ));
              heading = mission.heading;
            }

            snapshots.push({
              id: ac.id,
              squadronId: mission.id,
              type: ac.type,
              lat, lon,
              heading,
              isMoving: true,
              role: 'combat',
            });
          }
        }

        // Tanker aircraft
        for (const tf of mission.tankerFlights) {
          if (tf.phase === 'landed') {
            continue;
          }
          snapshots.push({
            id: tf.id,
            squadronId: mission.id,
            type: 'tanker',
            lat: tf.lat,
            lon: tf.lon,
            heading: tf.heading,
            isMoving: tf.phase !== 'loitering',
            role: 'tanker',
          });
        }
      }

      return snapshots;
    },

    // Route data for visual overlays — includes main routes and tanker routes.
    // Returns dense great-circle waypoints so lines follow the globe surface.
    getMissionRoutes() {
      const routes = [];

      for (const mission of activeMissions) {
        if (mission.phase === 'arrived') {
          continue;
        }

        // Carrier return — show direct line to carrier's live position
        if (mission.isCarrierMission && mission.returnPhase && _carrierPositionResolver) {
          const carrierPos = _carrierPositionResolver(mission.carrierFleetId);
          if (carrierPos) {
            routes.push({
              id: mission.id,
              waypoints: [{ lat: carrierPos.lat, lon: carrierPos.lon }],
              squadronLat: mission.lat,
              squadronLon: mission.lon,
              pending: false,
              isTanker: false,
            });
            continue;
          }
        }

        // Loitering carrier mission — no route line (planes are circling)
        if (mission.phase === 'loitering') {
          continue;
        }

        // Standard enroute — remaining waypoints from current position
        if (mission.flightPath && mission.currentWaypointIndex < mission.flightPath.length) {
          const waypoints = mission.flightPath.slice(mission.currentWaypointIndex);

          // Build leg indices for color coding
          const legIndices = [];
          const baseWpIdx = mission.currentWaypointIndex;
          let currentLeg = mission.nextRefuelIndex;
          for (let wi = baseWpIdx; wi < mission.flightPath.length; wi++) {
            if (currentLeg < mission.refuelWaypointIndices.length &&
                wi >= mission.refuelWaypointIndices[currentLeg]) {
              currentLeg++;
            }
            legIndices.push(currentLeg);
          }

          const refuelMarkers = [];
          for (let ri = mission.nextRefuelIndex; ri < mission.refuelWaypointIndices.length; ri++) {
            const wpIdx = mission.refuelWaypointIndices[ri];
            if (wpIdx < mission.flightPath.length) {
              refuelMarkers.push(mission.flightPath[wpIdx]);
            }
          }

          routes.push({
            id: mission.id,
            waypoints,
            legIndices,
            squadronLat: mission.lat,
            squadronLon: mission.lon,
            pending: false,
            isTanker: false,
            refuelStops: refuelMarkers,
          });
        }
      }

      return routes;
    },

    // Get position history trails.
    // Mission ID → returns combat trail + all tanker trails.
    // Tanker ID → returns only that tanker's trail.
    getMissionHistory(id) {
      // Direct mission match — show all trails
      const mission = activeMissions.find((m) => m.id === id);
      if (mission) {
        const trails = [];
        trails.push({ id: mission.id, points: mission.positionHistory, isTanker: false });
        for (const tf of mission.tankerFlights) {
          trails.push({ id: tf.id, points: tf.positionHistory, isTanker: true });
        }
        return trails;
      }

      // Tanker flight match — show only that tanker's trail
      for (const m of activeMissions) {
        const tf = m.tankerFlights.find((t) => t.id === id);
        if (tf) {
          return [{ id: tf.id, points: tf.positionHistory, isTanker: true }];
        }
      }

      return null;
    },

    // Find mission or landed squadron by aircraft ID (for click picking)
    findByAircraftId(aircraftId) {
      for (const mission of activeMissions) {
        if (mission.aircraft.some((a) => a.id === aircraftId)) {
          return { type: 'mission', data: mission };
        }
        if (mission.tankerFlights.some((t) => t.id === aircraftId)) {
          return { type: 'mission', data: mission };
        }
      }
      for (const sq of landedSquadrons) {
        if (sq.aircraft.some((a) => a.id === aircraftId)) {
          return { type: 'landed', data: sq };
        }
      }
      return null;
    },

    getEffectiveRangeKm(aircraftTypes) {
      return aircraftTypes.reduce((min, type) => {
        const spec = AIRCRAFT_SPECS[type];
        return spec ? Math.min(min, spec.rangeKm) : min;
      }, Infinity);
    },
  };
}

// ── Tanker flight state machine ────────────────────────────────

function stepTankerFlight(tf, deltaSeconds, allTankerFlights) {
  // Per-tanker launch delay — tanker stays at base until delay expires
  if (tf.launchDelay > 0) {
    tf.launchDelay -= deltaSeconds;
    return;
  }

  const speedKmPerS = (tf.speedKnots * 1.852 * GAMEPLAY_SPEED_MULTIPLIER) / 3600;
  const stepKm = speedKmPerS * deltaSeconds;

  if (tf.phase === 'outbound') {
    // Primary tankers with a relay point stop there first to get topped off
    if (tf.relayPointLat !== null && !tf.waitingForRelay) {
      const distToRelay = haversineKm(tf.lat, tf.lon, tf.relayPointLat, tf.relayPointLon);
      if (distToRelay < 5) {
        // Arrived at relay point — wait for relay tanker
        tf.lat = tf.relayPointLat;
        tf.lon = tf.relayPointLon;
        tf.waitingForRelay = true;
        tf.loiterTimer = 0;
        return;
      }
      moveToward(tf, tf.relayPointLat, tf.relayPointLon, stepKm, distToRelay, deltaSeconds);
      tf.fuelRemainingKm -= stepKm;
      return;
    }

    // Waiting at relay point for refuel from relay tanker
    if (tf.waitingForRelay) {
      tf.fuelRemainingKm -= stepKm * 0.3;
      tf.loiterTimer = (tf.loiterTimer || 0) + deltaSeconds;
      // Auto-continue after 90s even without relay (safety valve)
      if (tf.loiterTimer > 90) {
        tf.waitingForRelay = false;
      }
      return;
    }

    // Normal outbound — heading to fighter rendezvous
    const dist = haversineKm(tf.lat, tf.lon, tf.rendezvousLat, tf.rendezvousLon);
    if (dist < 5) {
      tf.lat = tf.rendezvousLat;
      tf.lon = tf.rendezvousLon;
      tf.phase = 'loitering';
      tf.loiterTimer = 0;
      return;
    }
    moveToward(tf, tf.rendezvousLat, tf.rendezvousLon, stepKm, dist, deltaSeconds);
    tf.fuelRemainingKm -= stepKm;

  } else if (tf.phase === 'loitering') {
    tf.fuelRemainingKm -= stepKm * 0.3;
    tf.loiterTimer = (tf.loiterTimer || 0) + deltaSeconds;

    // Relay tankers: check if our target primary tanker is nearby and waiting
    if (tf.isRelay && tf.relayTargetId && allTankerFlights) {
      const primary = allTankerFlights.find((t) => t.id === tf.relayTargetId);
      if (primary && primary.waitingForRelay) {
        const distToPrimary = haversineKm(tf.lat, tf.lon, primary.lat, primary.lon);
        if (distToPrimary < 50) {
          // Refuel the primary tanker — restore its fuel
          primary.fuelRemainingKm = primary.maxFuelKm;
          primary.waitingForRelay = false;
          // Relay's job is done — head home
          tf.phase = 'returning';
          return;
        }
      }
    }

    // Auto-return if loitering too long or running low on fuel
    const returnDist = haversineKm(tf.lat, tf.lon, tf.returnLat, tf.returnLon);
    if (tf.loiterTimer > 60 || tf.fuelRemainingKm < returnDist * 1.2) {
      tf.phase = 'returning';
    }

  } else if (tf.phase === 'returning') {
    const rLat = tf.returnLat;
    const rLon = tf.returnLon;
    const dist = haversineKm(tf.lat, tf.lon, rLat, rLon);
    if (dist < 5) {
      tf.lat = rLat;
      tf.lon = rLon;
      tf.phase = 'landed';
      return;
    }
    moveToward(tf, rLat, rLon, stepKm, dist, deltaSeconds);
    tf.fuelRemainingKm -= stepKm;
  }
  // landed — no movement
}

function moveToward(entity, targetLat, targetLon, stepKm, distKm, deltaSeconds) {
  const moveRatio = Math.min(stepKm / distKm, 1);
  const latDiff = targetLat - entity.lat;
  const lonDiff = targetLon - entity.lon;
  entity.lat += latDiff * moveRatio;
  entity.lon += lonDiff * moveRatio;

  const cosLat = Math.cos(entity.lat * DEG_TO_RAD);
  const heading = Math.atan2(lonDiff * cosLat, latDiff) * (180 / Math.PI);
  let hDiff = ((heading - entity.heading + 540) % 360) - 180;
  entity.heading += hDiff * Math.min(1, deltaSeconds * 3);
  entity.heading = ((entity.heading + 540) % 360) - 180;
}

// ── Route planning helpers ─────────────────────────────────────

// Find the nearest allied airbase to a point (for tanker divert after refueling)
function findNearestAlliedBase(point, friendlyBases) {
  const airbases = friendlyBases.filter((b) => b.category === 'airbase');
  let best = null;
  let bestDist = Infinity;
  for (const base of airbases) {
    const dist = haversineKm(point.lat, point.lon, base.lat, base.lon);
    if (dist < bestDist) {
      bestDist = dist;
      best = base;
    }
  }
  return best;
}

// Assign tanker(s) to service a single refuel point.
// Returns an array of tanker assignments, or null if impossible.
//
// Three modes, tried in order:
//   1. Round-trip — base within operationalRadiusKm: fly out, refuel fighters, return same base
//   2. One-way  — base within totalRangeKm * 0.9: fly out, refuel fighters, divert to nearest base
//   3. Relay chain — primary tanker can't reach alone, so a relay tanker meets it
//      at an intermediate point, tops it off, then primary continues to the fighters.
//      The relay tanker returns to its own base after the handoff.
function assignTankerForRefuelPoint(refuelPoint, refuelStopIndex, friendlyBases) {
  const { operationalRadiusKm, totalRangeKm } = TANKER_SPECS;

  const airbases = friendlyBases.filter((b) => b.category === 'airbase');
  if (airbases.length === 0) {
    return null;
  }

  // Find all bases sorted by distance to refuel point
  const basesWithDist = airbases.map((b) => ({
    base: b,
    dist: haversineKm(refuelPoint.lat, refuelPoint.lon, b.lat, b.lon),
  })).sort((a, b) => a.dist - b.dist);

  // ── Mode 1: Round-trip ──
  for (const { base, dist } of basesWithDist) {
    if (dist <= operationalRadiusKm) {
      return [{
        refuelPoint,
        baseLat: base.lat, baseLon: base.lon, baseName: base.name,
        returnLat: base.lat, returnLon: base.lon, returnName: base.name,
        distToRefuelKm: dist,
        fuelBudgetKm: totalRangeKm,
        refuelStopIndex,
        isRelay: false,
      }];
    }
  }

  // ── Mode 2: One-way with divert ──
  for (const { base, dist } of basesWithDist) {
    if (dist <= totalRangeKm * 0.9) {
      const divertBase = findNearestAlliedBase(refuelPoint, friendlyBases);
      if (!divertBase) {
        continue;
      }
      const divertDist = haversineKm(refuelPoint.lat, refuelPoint.lon, divertBase.lat, divertBase.lon);
      if (dist + divertDist <= totalRangeKm) {
        return [{
          refuelPoint,
          baseLat: base.lat, baseLon: base.lon, baseName: base.name,
          returnLat: divertBase.lat, returnLon: divertBase.lon, returnName: divertBase.name,
          distToRefuelKm: dist,
          fuelBudgetKm: totalRangeKm,
          refuelStopIndex,
          isRelay: false,
        }];
      }
    }
  }

  // ── Mode 3: Relay chain ──
  // The primary tanker launches from a base, flies toward the refuel point,
  // but can't make the full trip alone. A relay tanker meets it en route,
  // tops it off, and the primary continues with a full tank to the fighters.
  //
  // Geometry: primary base → relay point → refuel point → divert base
  // After refuel at relay point, primary has full totalRangeKm.
  // So relay point must satisfy: dist(relay→refuel) + dist(refuel→divert) ≤ totalRangeKm
  //
  // We try multiple candidate relay positions along the base→refuel great circle.
  // For each, check if any base can service that relay point (modes 1/2).
  const divertBase = findNearestAlliedBase(refuelPoint, friendlyBases);
  const divertDist = divertBase
    ? haversineKm(refuelPoint.lat, refuelPoint.lon, divertBase.lat, divertBase.lon)
    : Infinity;

  // Max distance from relay point to refuel point — primary gets full fuel at relay
  const maxRelayToRefuel = divertDist < Infinity ? totalRangeKm - divertDist : totalRangeKm * 0.5;
  if (maxRelayToRefuel <= 0) {
    return null;
  }

  // Try each base as the primary's origin
  for (const { base: primaryBase, dist: primaryDistToRefuel } of basesWithDist) {
    // Slide the relay point along the base→refuel arc.
    // The relay must be close enough to some base AND leave enough range for primary.
    const minRelayFrac = Math.max(0.1, 1 - maxRelayToRefuel / primaryDistToRefuel);
    const maxRelayFrac = 0.85; // don't place relay too close to refuel

    for (let frac = minRelayFrac; frac <= maxRelayFrac; frac += 0.1) {
      const relayPoint = greatCircleInterpolate(
        primaryBase.lat, primaryBase.lon,
        refuelPoint.lat, refuelPoint.lon,
        frac,
      );

      const relayToRefuel = haversineKm(relayPoint.lat, relayPoint.lon, refuelPoint.lat, refuelPoint.lon);
      if (relayToRefuel + divertDist > totalRangeKm) {
        continue; // primary can't make it from here
      }

      // Can any base service this relay point? (round-trip or one-way)
      const relayBasesWithDist = airbases.map((b) => ({
        base: b,
        dist: haversineKm(relayPoint.lat, relayPoint.lon, b.lat, b.lon),
      })).sort((a, b) => a.dist - b.dist);

      let relayAssignment = null;
      for (const { base: rBase, dist: rDist } of relayBasesWithDist) {
        if (rDist <= operationalRadiusKm) {
          relayAssignment = {
            refuelPoint: relayPoint,
            baseLat: rBase.lat, baseLon: rBase.lon, baseName: rBase.name,
            returnLat: rBase.lat, returnLon: rBase.lon, returnName: rBase.name,
            distToRefuelKm: rDist,
            fuelBudgetKm: totalRangeKm,
            refuelStopIndex,
            isRelay: true,
            relayTargetId: null,
          };
          break;
        }
        if (rDist <= totalRangeKm * 0.9) {
          const relayDivert = findNearestAlliedBase(relayPoint, friendlyBases);
          if (!relayDivert) {
            continue;
          }
          const relayDivertDist = haversineKm(relayPoint.lat, relayPoint.lon, relayDivert.lat, relayDivert.lon);
          if (rDist + relayDivertDist <= totalRangeKm) {
            relayAssignment = {
              refuelPoint: relayPoint,
              baseLat: rBase.lat, baseLon: rBase.lon, baseName: rBase.name,
              returnLat: relayDivert.lat, returnLon: relayDivert.lon, returnName: relayDivert.name,
              distToRefuelKm: rDist,
              fuelBudgetKm: totalRangeKm,
              refuelStopIndex,
              isRelay: true,
              relayTargetId: null,
            };
            break;
          }
        }
      }

      if (relayAssignment) {
        const primaryAssignment = {
          refuelPoint,
          baseLat: primaryBase.lat, baseLon: primaryBase.lon, baseName: primaryBase.name,
          returnLat: divertBase.lat, returnLon: divertBase.lon, returnName: divertBase.name,
          distToRefuelKm: primaryDistToRefuel,
          fuelBudgetKm: totalRangeKm,
          refuelStopIndex,
          isRelay: false,
          needsRelayAt: relayPoint,
        };
        return [primaryAssignment, relayAssignment];
      }
    }
  }

  return null;
}

// ── Great circle utilities ─────────────────────────────────────

function greatCircleInterpolate(lat1, lon1, lat2, lon2, fraction) {
  const phi1 = lat1 * DEG_TO_RAD;
  const lam1 = lon1 * DEG_TO_RAD;
  const phi2 = lat2 * DEG_TO_RAD;
  const lam2 = lon2 * DEG_TO_RAD;

  const d = 2 * Math.asin(Math.sqrt(
    Math.sin((phi2 - phi1) / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin((lam2 - lam1) / 2) ** 2,
  ));

  if (d < 1e-10) {
    return { lat: lat1, lon: lon1 };
  }

  const a = Math.sin((1 - fraction) * d) / Math.sin(d);
  const b = Math.sin(fraction * d) / Math.sin(d);
  const x = a * Math.cos(phi1) * Math.cos(lam1) + b * Math.cos(phi2) * Math.cos(lam2);
  const y = a * Math.cos(phi1) * Math.sin(lam1) + b * Math.cos(phi2) * Math.sin(lam2);
  const z = a * Math.sin(phi1) + b * Math.sin(phi2);

  return {
    lat: Math.atan2(z, Math.sqrt(x * x + y * y)) / DEG_TO_RAD,
    lon: Math.atan2(y, x) / DEG_TO_RAD,
  };
}

export function generateGreatCircleWaypoints(startLat, startLon, endLat, endLon) {
  const distKm = haversineKm(startLat, startLon, endLat, endLon);
  const numSegments = Math.max(2, Math.ceil(distKm / 200));
  const waypoints = [];
  for (let i = 0; i <= numSegments; i++) {
    waypoints.push(greatCircleInterpolate(startLat, startLon, endLat, endLon, i / numSegments));
  }
  waypoints[0] = { lat: startLat, lon: startLon };
  waypoints[waypoints.length - 1] = { lat: endLat, lon: endLon };
  return waypoints;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * DEG_TO_RAD;
  const dLon = (lon2 - lon1) * DEG_TO_RAD;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG_TO_RAD) * Math.cos(lat2 * DEG_TO_RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function applyBearingOffset(lat, lon, heading, bearingOffset, distKm) {
  if (distKm === 0) {
    return { lat, lon };
  }
  const KM_PER_DEG = 111.32;
  const absB = (heading + bearingOffset) * DEG_TO_RAD;
  const dLat = (Math.cos(absB) * distKm) / KM_PER_DEG;
  const cosLat = Math.cos(lat * DEG_TO_RAD);
  const dLon = cosLat > 0.01 ? (Math.sin(absB) * distKm) / (KM_PER_DEG * cosLat) : 0;
  return { lat: lat + dLat, lon: lon + dLon };
}

// ── Hostile airspace avoidance ────────────────────────────────

const AIRSPACE_BUFFER_KM = 200; // clearance from zone edges

// Check if a point is inside any hostile airspace (with buffer)
function isInHostileAirspace(lat, lon, hostileZones) {
  for (const zone of hostileZones) {
    if (haversineKm(lat, lon, zone.lat, zone.lon) < zone.radiusKm + AIRSPACE_BUFFER_KM) {
      return true;
    }
  }
  return false;
}

// Check if a great-circle segment between two points crosses hostile airspace.
// Uses exact cross-track distance (no sampling) — computes the minimum distance
// from each zone center to the great-circle arc AB. If any zone's closest
// approach is less than its radius + buffer, the segment is blocked.
function segmentCrossesHostile(aLat, aLon, bLat, bLon, hostileZones) {
  if (hostileZones.length === 0) {
    return false;
  }

  const phi1 = aLat * DEG_TO_RAD;
  const lam1 = aLon * DEG_TO_RAD;
  const phi2 = bLat * DEG_TO_RAD;
  const lam2 = bLon * DEG_TO_RAD;

  // Angular distance A→B
  const d12 = 2 * Math.asin(Math.sqrt(
    Math.sin((phi2 - phi1) / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin((lam2 - lam1) / 2) ** 2,
  ));
  if (d12 < 1e-10) {
    return false; // A and B are the same point
  }

  // Bearing from A to B
  const theta12 = Math.atan2(
    Math.sin(lam2 - lam1) * Math.cos(phi2),
    Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(lam2 - lam1),
  );

  const clearance = AIRSPACE_BUFFER_KM;

  for (const zone of hostileZones) {
    const phiP = zone.lat * DEG_TO_RAD;
    const lamP = zone.lon * DEG_TO_RAD;
    const thresholdKm = zone.radiusKm + clearance;

    // Angular distance A→P
    const d13 = 2 * Math.asin(Math.sqrt(
      Math.sin((phiP - phi1) / 2) ** 2 +
      Math.cos(phi1) * Math.cos(phiP) * Math.sin((lamP - lam1) / 2) ** 2,
    ));

    // Bearing from A to P
    const theta13 = Math.atan2(
      Math.sin(lamP - lam1) * Math.cos(phiP),
      Math.cos(phi1) * Math.sin(phiP) - Math.sin(phi1) * Math.cos(phiP) * Math.cos(lamP - lam1),
    );

    // Cross-track angular distance (signed)
    const dxt = Math.asin(Math.sin(d13) * Math.sin(theta13 - theta12));
    // Along-track distance from A to closest point on great circle
    const dat = Math.acos(Math.cos(d13) / Math.cos(dxt));

    let minDistKm;
    if (dat >= 0 && dat <= d12) {
      // Closest point is on the arc — use cross-track distance
      minDistKm = Math.abs(dxt) * EARTH_RADIUS_KM;
    } else {
      // Closest point is beyond the arc — use distance to nearest endpoint
      const dAP = haversineKm(aLat, aLon, zone.lat, zone.lon);
      const dBP = haversineKm(bLat, bLon, zone.lat, zone.lon);
      minDistKm = Math.min(dAP, dBP);
    }

    if (minDistKm < thresholdKm) {
      return true;
    }
  }
  return false;
}

// Produce a safe route from start to end that avoids hostile airspace.
//
// Algorithm: if the direct great circle is clear, use it. Otherwise, try
// routing via a small set of candidate waypoints placed at the edges of
// the hostile zones (north and south flanks). Pick the shortest 1- or
// 2-waypoint detour that clears all zones. This produces clean arcs
// instead of jagged nudged paths.
function computeSafeRoute(startLat, startLon, endLat, endLon, hostileZones) {
  // No hostile zones — direct route always safe
  if (hostileZones.length === 0) {
    return [{ lat: startLat, lon: startLon }, { lat: endLat, lon: endLon }];
  }

  // Quick check: is the direct route clear?
  if (!segmentCrossesHostile(startLat, startLon, endLat, endLon, hostileZones)) {
    return [{ lat: startLat, lon: startLon }, { lat: endLat, lon: endLon }];
  }

  // Generate candidate waypoints on the flanks of each hostile zone.
  // These form a visibility graph — we run Dijkstra to find the shortest
  // clear path through them from start to end. Handles any number of hops.
  const nodes = [
    { lat: startLat, lon: startLon },  // index 0 = start
    { lat: endLat, lon: endLon },      // index 1 = end
  ];

  for (const zone of hostileZones) {
    const clearDeg = (zone.radiusKm + AIRSPACE_BUFFER_KM + 300) / 111;
    const lonClear = clearDeg / Math.max(0.1, Math.cos(zone.lat * DEG_TO_RAD));
    const flankPoints = [
      { lat: zone.lat + clearDeg, lon: zone.lon },         // N
      { lat: zone.lat - clearDeg, lon: zone.lon },         // S
      { lat: zone.lat, lon: zone.lon + lonClear },         // E
      { lat: zone.lat, lon: zone.lon - lonClear },         // W
      { lat: zone.lat + clearDeg * 0.7, lon: zone.lon + lonClear * 0.7 }, // NE
      { lat: zone.lat + clearDeg * 0.7, lon: zone.lon - lonClear * 0.7 }, // NW
      { lat: zone.lat - clearDeg * 0.7, lon: zone.lon + lonClear * 0.7 }, // SE
      { lat: zone.lat - clearDeg * 0.7, lon: zone.lon - lonClear * 0.7 }, // SW
    ];
    for (const p of flankPoints) {
      if (!isInHostileAirspace(p.lat, p.lon, hostileZones)) {
        nodes.push(p);
      }
    }
  }

  // Pre-compute edges: clear segments between nodes within reasonable range.
  // Only check pairs within 8000 km to keep the search fast.
  const n = nodes.length;
  const edges = new Array(n).fill(null).map(() => []);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = haversineKm(nodes[i].lat, nodes[i].lon, nodes[j].lat, nodes[j].lon);
      if (d > 8000) {
        continue;
      }
      if (!segmentCrossesHostile(nodes[i].lat, nodes[i].lon, nodes[j].lat, nodes[j].lon, hostileZones)) {
        edges[i].push({ to: j, dist: d });
        edges[j].push({ to: i, dist: d });
      }
    }
  }

  // Dijkstra from node 0 (start) to node 1 (end)
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const visited = new Uint8Array(n);
  dist[0] = 0;

  for (let step = 0; step < n; step++) {
    // Find unvisited node with smallest dist
    let u = -1;
    let uDist = Infinity;
    for (let i = 0; i < n; i++) {
      if (!visited[i] && dist[i] < uDist) {
        uDist = dist[i];
        u = i;
      }
    }
    if (u === -1 || u === 1) {
      break; // reached end or no path
    }
    visited[u] = 1;
    for (const edge of edges[u]) {
      const alt = dist[u] + edge.dist;
      if (alt < dist[edge.to]) {
        dist[edge.to] = alt;
        prev[edge.to] = u;
      }
    }
  }

  // Reconstruct path
  if (dist[1] < Infinity) {
    const path = [];
    let cur = 1;
    while (cur !== -1) {
      path.push({ lat: nodes[cur].lat, lon: nodes[cur].lon });
      cur = prev[cur];
    }
    path.reverse();
    return path;
  }

  // Fallback: no clear path found — return direct route
  // (can happen if zones completely encircle the destination)
  return [{ lat: startLat, lon: startLon }, { lat: endLat, lon: endLon }];
}

// ── Multi-waypoint path utilities ─────────────────────────────

// Total distance along a waypoint path
function pathDistance(waypoints) {
  let total = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    total += haversineKm(waypoints[i].lat, waypoints[i].lon, waypoints[i + 1].lat, waypoints[i + 1].lon);
  }
  return total;
}

// Interpolate a point at a given distance along a waypoint path
function interpolateAlongPath(waypoints, targetDistKm) {
  let accumulated = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const segDist = haversineKm(
      waypoints[i].lat, waypoints[i].lon,
      waypoints[i + 1].lat, waypoints[i + 1].lon,
    );
    if (accumulated + segDist >= targetDistKm) {
      const frac = segDist > 0 ? (targetDistKm - accumulated) / segDist : 0;
      return greatCircleInterpolate(
        waypoints[i].lat, waypoints[i].lon,
        waypoints[i + 1].lat, waypoints[i + 1].lon,
        frac,
      );
    }
    accumulated += segDist;
  }
  return waypoints[waypoints.length - 1];
}

// Generate dense visual waypoints along a multi-segment path
function generateDensePathWaypoints(routeWaypoints) {
  if (routeWaypoints.length <= 1) {
    return routeWaypoints;
  }
  const allWaypoints = [];
  for (let i = 0; i < routeWaypoints.length - 1; i++) {
    const segWps = generateGreatCircleWaypoints(
      routeWaypoints[i].lat, routeWaypoints[i].lon,
      routeWaypoints[i + 1].lat, routeWaypoints[i + 1].lon,
    );
    for (let j = (i === 0 ? 0 : 1); j < segWps.length; j++) {
      allWaypoints.push(segWps[j]);
    }
  }
  return allWaypoints;
}
