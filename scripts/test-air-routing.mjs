#!/usr/bin/env node
// End-to-end test for air routing — uses real base data from the API.
// Run: node scripts/test-air-routing.mjs

const API_PORT = process.env.VITE_API_PORT ?? '3000';
const API_URL = `http://localhost:${API_PORT}/military-installations?hasCoordinates=true&limit=20000&types=air_base,military_base,army_base`;

// ── Inline the air simulation logic for testing ──────────────────

const DEG_TO_RAD = Math.PI / 180;
const EARTH_RADIUS_KM = 6371;

const AIRCRAFT_SPECS = {
  f35: { label: 'F-35 Lightning', speedKnots: 1060, rangeKm: 2800, category: 'fighter' },
};

const TANKER_SPECS = {
  speedKnots: 460,
  operationalRadiusKm: 1850,
  totalRangeKm: 4400,
};

const ALLIED_COUNTRIES = {
  USA: new Set([
    'USA', 'CAN', 'GBR', 'FRA', 'DEU', 'ITA', 'ESP', 'NLD', 'BEL', 'LUX',
    'NOR', 'DNK', 'ISL', 'PRT', 'TUR', 'GRC', 'POL', 'CZE', 'HUN', 'SVK',
    'SVN', 'HRV', 'BGR', 'ROU', 'EST', 'LVA', 'LTU', 'ALB', 'MNE', 'MKD',
    'FIN', 'SWE', 'JPN', 'KOR', 'AUS', 'NZL', 'PHL', 'SGP', 'THA',
    'ISR', 'QAT', 'ARE', 'BHR', 'KWT', 'SAU', 'JOR',
  ]),
  RUS: new Set(['RUS', 'BLR', 'SYR', 'PRK', 'IRN', 'MMR', 'CUB', 'VEN', 'KAZ', 'UZB', 'TKM', 'TJK', 'KGZ', 'ARM']),
  CHN: new Set(['CHN', 'PRK', 'MMR', 'LAO', 'KHM', 'PAK', 'RUS', 'IRN', 'CUB', 'VEN']),
};

const NATION_AIRSPACE = {
  USA: [{ lat: 39, lon: -98, radiusKm: 2200 }, { lat: 64, lon: -153, radiusKm: 800 }, { lat: 21, lon: -157, radiusKm: 300 }],
  CAN: [{ lat: 56, lon: -106, radiusKm: 1800 }],
  GBR: [{ lat: 54, lon: -2, radiusKm: 500 }],
  FRA: [{ lat: 46, lon: 2, radiusKm: 600 }],
  DEU: [{ lat: 51, lon: 10, radiusKm: 400 }],
  ITA: [{ lat: 42, lon: 12, radiusKm: 500 }],
  ESP: [{ lat: 40, lon: -4, radiusKm: 500 }],
  TUR: [{ lat: 39, lon: 35, radiusKm: 600 }],
  NOR: [{ lat: 64, lon: 12, radiusKm: 500 }],
  POL: [{ lat: 52, lon: 20, radiusKm: 350 }],
  JPN: [{ lat: 36, lon: 138, radiusKm: 600 }],
  KOR: [{ lat: 36, lon: 128, radiusKm: 300 }],
  AUS: [{ lat: -25, lon: 134, radiusKm: 2000 }],
  ISR: [{ lat: 31, lon: 35, radiusKm: 200 }],
  SAU: [{ lat: 24, lon: 45, radiusKm: 800 }],
  RUS: [{ lat: 56, lon: 38, radiusKm: 1100 }, { lat: 58, lon: 68, radiusKm: 1100 }, { lat: 60, lon: 100, radiusKm: 1200 }, { lat: 58, lon: 135, radiusKm: 900 }],
  CHN: [{ lat: 37, lon: 100, radiusKm: 1600 }, { lat: 32, lon: 116, radiusKm: 1000 }],
  PRK: [{ lat: 40, lon: 127, radiusKm: 300 }],
  IRN: [{ lat: 32, lon: 53, radiusKm: 800 }],
  IND: [{ lat: 22, lon: 79, radiusKm: 1400 }],
  BLR: [{ lat: 53, lon: 28, radiusKm: 300 }],
};

function getHostileAirspace(playerCountry) {
  const allies = ALLIED_COUNTRIES[playerCountry];
  if (!allies) return [];
  const zones = [];
  for (const [iso3, airspace] of Object.entries(NATION_AIRSPACE)) {
    if (!allies.has(iso3)) {
      for (const z of airspace) zones.push(z);
    }
  }
  return zones;
}

function filterAlliedBases(allBases, playerCountry) {
  const allies = ALLIED_COUNTRIES[playerCountry];
  if (!allies) return allBases.filter(b => b.countryIso3 === playerCountry);
  return allBases.filter(b => allies.has(b.countryIso3));
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * DEG_TO_RAD, dLon = (lon2 - lon1) * DEG_TO_RAD;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * DEG_TO_RAD) * Math.cos(lat2 * DEG_TO_RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function greatCircleInterpolate(lat1, lon1, lat2, lon2, f) {
  const p1 = lat1 * DEG_TO_RAD, l1 = lon1 * DEG_TO_RAD, p2 = lat2 * DEG_TO_RAD, l2 = lon2 * DEG_TO_RAD;
  const d = 2 * Math.asin(Math.sqrt(Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2));
  if (d < 1e-10) return { lat: lat1, lon: lon1 };
  const a = Math.sin((1 - f) * d) / Math.sin(d), b = Math.sin(f * d) / Math.sin(d);
  const x = a * Math.cos(p1) * Math.cos(l1) + b * Math.cos(p2) * Math.cos(l2);
  const y = a * Math.cos(p1) * Math.sin(l1) + b * Math.cos(p2) * Math.sin(l2);
  const z = a * Math.sin(p1) + b * Math.sin(p2);
  return { lat: Math.atan2(z, Math.sqrt(x * x + y * y)) / DEG_TO_RAD, lon: Math.atan2(y, x) / DEG_TO_RAD };
}

const AIRSPACE_BUFFER_KM = 200;

function isInHostileAirspace(lat, lon, zones) {
  for (const z of zones) {
    if (haversineKm(lat, lon, z.lat, z.lon) < z.radiusKm + AIRSPACE_BUFFER_KM) return true;
  }
  return false;
}

function segmentCrossesHostile(aLat, aLon, bLat, bLon, hostileZones) {
  if (hostileZones.length === 0) return false;
  const phi1 = aLat * DEG_TO_RAD, lam1 = aLon * DEG_TO_RAD;
  const phi2 = bLat * DEG_TO_RAD, lam2 = bLon * DEG_TO_RAD;
  const d12 = 2 * Math.asin(Math.sqrt(Math.sin((phi2 - phi1) / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin((lam2 - lam1) / 2) ** 2));
  if (d12 < 1e-10) return false;
  const theta12 = Math.atan2(Math.sin(lam2 - lam1) * Math.cos(phi2), Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(lam2 - lam1));
  for (const zone of hostileZones) {
    const phiP = zone.lat * DEG_TO_RAD, lamP = zone.lon * DEG_TO_RAD;
    const d13 = 2 * Math.asin(Math.sqrt(Math.sin((phiP - phi1) / 2) ** 2 + Math.cos(phi1) * Math.cos(phiP) * Math.sin((lamP - lam1) / 2) ** 2));
    const theta13 = Math.atan2(Math.sin(lamP - lam1) * Math.cos(phiP), Math.cos(phi1) * Math.sin(phiP) - Math.sin(phi1) * Math.cos(phiP) * Math.cos(lamP - lam1));
    const dxt = Math.asin(Math.sin(d13) * Math.sin(theta13 - theta12));
    const dat = Math.acos(Math.cos(d13) / Math.cos(dxt));
    let minDistKm;
    if (dat >= 0 && dat <= d12) {
      minDistKm = Math.abs(dxt) * EARTH_RADIUS_KM;
    } else {
      minDistKm = Math.min(haversineKm(aLat, aLon, zone.lat, zone.lon), haversineKm(bLat, bLon, zone.lat, zone.lon));
    }
    if (minDistKm < zone.radiusKm + AIRSPACE_BUFFER_KM) return true;
  }
  return false;
}

function computeSafeRoute(startLat, startLon, endLat, endLon, hostileZones) {
  if (hostileZones.length === 0) return [{ lat: startLat, lon: startLon }, { lat: endLat, lon: endLon }];
  if (!segmentCrossesHostile(startLat, startLon, endLat, endLon, hostileZones)) {
    return [{ lat: startLat, lon: startLon }, { lat: endLat, lon: endLon }];
  }
  const nodes = [{ lat: startLat, lon: startLon }, { lat: endLat, lon: endLon }];
  for (const zone of hostileZones) {
    const cd = (zone.radiusKm + AIRSPACE_BUFFER_KM + 300) / 111;
    const lc = cd / Math.max(0.1, Math.cos(zone.lat * DEG_TO_RAD));
    const pts = [
      { lat: zone.lat + cd, lon: zone.lon }, { lat: zone.lat - cd, lon: zone.lon },
      { lat: zone.lat, lon: zone.lon + lc }, { lat: zone.lat, lon: zone.lon - lc },
      { lat: zone.lat + cd * 0.7, lon: zone.lon + lc * 0.7 }, { lat: zone.lat + cd * 0.7, lon: zone.lon - lc * 0.7 },
      { lat: zone.lat - cd * 0.7, lon: zone.lon + lc * 0.7 }, { lat: zone.lat - cd * 0.7, lon: zone.lon - lc * 0.7 },
    ];
    for (const p of pts) {
      if (!isInHostileAirspace(p.lat, p.lon, hostileZones)) nodes.push(p);
    }
  }
  const n = nodes.length;
  const edges = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = haversineKm(nodes[i].lat, nodes[i].lon, nodes[j].lat, nodes[j].lon);
      if (d > 8000) continue;
      if (!segmentCrossesHostile(nodes[i].lat, nodes[i].lon, nodes[j].lat, nodes[j].lon, hostileZones)) {
        edges[i].push({ to: j, dist: d }); edges[j].push({ to: i, dist: d });
      }
    }
  }
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const visited = new Uint8Array(n);
  dist[0] = 0;
  for (let step = 0; step < n; step++) {
    let u = -1, uD = Infinity;
    for (let i = 0; i < n; i++) { if (!visited[i] && dist[i] < uD) { uD = dist[i]; u = i; } }
    if (u === -1 || u === 1) break;
    visited[u] = 1;
    for (const e of edges[u]) { const alt = dist[u] + e.dist; if (alt < dist[e.to]) { dist[e.to] = alt; prev[e.to] = u; } }
  }
  if (dist[1] < Infinity) {
    const path = []; let cur = 1; while (cur !== -1) { path.push(nodes[cur]); cur = prev[cur]; } path.reverse();
    return path;
  }
  return [{ lat: startLat, lon: startLon }, { lat: endLat, lon: endLon }];
}

function pathDistance(wps) {
  let t = 0;
  for (let i = 0; i < wps.length - 1; i++) t += haversineKm(wps[i].lat, wps[i].lon, wps[i + 1].lat, wps[i + 1].lon);
  return t;
}

function interpolateAlongPath(wps, targetDist) {
  let acc = 0;
  for (let i = 0; i < wps.length - 1; i++) {
    const seg = haversineKm(wps[i].lat, wps[i].lon, wps[i + 1].lat, wps[i + 1].lon);
    if (acc + seg >= targetDist) {
      const frac = seg > 0 ? (targetDist - acc) / seg : 0;
      return greatCircleInterpolate(wps[i].lat, wps[i].lon, wps[i + 1].lat, wps[i + 1].lon, frac);
    }
    acc += seg;
  }
  return wps[wps.length - 1];
}

function findNearestAlliedBase(point, friendlyBases) {
  const airbases = friendlyBases.filter(b => b.category === 'airbase');
  let best = null, bestDist = Infinity;
  for (const base of airbases) {
    const d = haversineKm(point.lat, point.lon, base.lat, base.lon);
    if (d < bestDist) { bestDist = d; best = base; }
  }
  return best;
}

function assignTankerForRefuelPoint(refuelPoint, refuelStopIndex, friendlyBases) {
  const { operationalRadiusKm, totalRangeKm } = TANKER_SPECS;
  const airbases = friendlyBases.filter(b => b.category === 'airbase');
  if (airbases.length === 0) return null;

  const basesWithDist = airbases.map(b => ({
    base: b, dist: haversineKm(refuelPoint.lat, refuelPoint.lon, b.lat, b.lon),
  })).sort((a, b) => a.dist - b.dist);

  // Mode 1: round-trip
  for (const { base, dist } of basesWithDist) {
    if (dist <= operationalRadiusKm) {
      return [{ refuelPoint, baseLat: base.lat, baseLon: base.lon, baseName: base.name, returnLat: base.lat, returnLon: base.lon, returnName: base.name, distToRefuelKm: dist, fuelBudgetKm: totalRangeKm, refuelStopIndex, isRelay: false }];
    }
  }
  // Mode 2: one-way
  for (const { base, dist } of basesWithDist) {
    if (dist <= totalRangeKm * 0.9) {
      const divert = findNearestAlliedBase(refuelPoint, friendlyBases);
      if (!divert) continue;
      const dd = haversineKm(refuelPoint.lat, refuelPoint.lon, divert.lat, divert.lon);
      if (dist + dd <= totalRangeKm) {
        return [{ refuelPoint, baseLat: base.lat, baseLon: base.lon, baseName: base.name, returnLat: divert.lat, returnLon: divert.lon, returnName: divert.name, distToRefuelKm: dist, fuelBudgetKm: totalRangeKm, refuelStopIndex, isRelay: false }];
      }
    }
  }
  // Mode 3: relay
  const divertBase = findNearestAlliedBase(refuelPoint, friendlyBases);
  const divertDist = divertBase ? haversineKm(refuelPoint.lat, refuelPoint.lon, divertBase.lat, divertBase.lon) : Infinity;
  const maxRelayToRefuel = divertDist < Infinity ? totalRangeKm - divertDist : totalRangeKm * 0.5;
  if (maxRelayToRefuel <= 0) return null;

  for (const { base: primaryBase, dist: primaryDistToRefuel } of basesWithDist) {
    const minRelayFrac = Math.max(0.1, 1 - maxRelayToRefuel / primaryDistToRefuel);
    for (let frac = minRelayFrac; frac <= 0.85; frac += 0.1) {
      const relayPt = greatCircleInterpolate(primaryBase.lat, primaryBase.lon, refuelPoint.lat, refuelPoint.lon, frac);
      const relayToRefuel = haversineKm(relayPt.lat, relayPt.lon, refuelPoint.lat, refuelPoint.lon);
      if (relayToRefuel + divertDist > totalRangeKm) continue;

      const relayBases = airbases.map(b => ({ base: b, dist: haversineKm(relayPt.lat, relayPt.lon, b.lat, b.lon) })).sort((a, b) => a.dist - b.dist);
      let relayOk = false;
      for (const { base: rBase, dist: rDist } of relayBases) {
        if (rDist <= operationalRadiusKm) { relayOk = true; break; }
        if (rDist <= totalRangeKm * 0.9) {
          const rd = findNearestAlliedBase(relayPt, friendlyBases);
          if (rd && rDist + haversineKm(relayPt.lat, relayPt.lon, rd.lat, rd.lon) <= totalRangeKm) { relayOk = true; break; }
        }
      }
      if (relayOk) {
        return [
          { refuelPoint, baseLat: primaryBase.lat, baseLon: primaryBase.lon, baseName: primaryBase.name, returnLat: divertBase.lat, returnLon: divertBase.lon, returnName: divertBase.name, distToRefuelKm: primaryDistToRefuel, fuelBudgetKm: totalRangeKm, refuelStopIndex, isRelay: false, needsRelayAt: relayPt },
          { refuelPoint: relayPt, baseLat: relayBases[0].base.lat, baseLon: relayBases[0].base.lon, baseName: relayBases[0].base.name, returnLat: relayBases[0].base.lat, returnLon: relayBases[0].base.lon, returnName: relayBases[0].base.name, distToRefuelKm: relayBases[0].dist, fuelBudgetKm: totalRangeKm, refuelStopIndex, isRelay: true },
        ];
      }
    }
  }
  return null;
}

function planRoute(homeLat, homeLon, destLat, destLon, playerCountry, friendlyBases) {
  const minRange = AIRCRAFT_SPECS.f35.rangeKm;
  const hostileZones = getHostileAirspace(playerCountry);
  const routeWaypoints = computeSafeRoute(homeLat, homeLon, destLat, destLon, hostileZones);
  const totalDistKm = pathDistance(routeWaypoints);
  const legRange = minRange * 0.8;

  if (totalDistKm <= minRange * 0.9) {
    return { viable: true, directFlight: true, distanceKm: totalDistKm, legs: 1, tankers: 0, refuelStops: [] };
  }

  const refuelStops = [];
  const refuelDistances = [];
  const airbases = friendlyBases.filter(b => b.category === 'airbase');
  let distCovered = 0;
  while (distCovered + legRange < totalDistKm) {
    const nominalDist = distCovered + legRange;
    const nominalPoint = interpolateAlongPath(routeWaypoints, nominalDist);
    let bestBaseDist = Infinity;
    for (const base of airbases) {
      const d = haversineKm(nominalPoint.lat, nominalPoint.lon, base.lat, base.lon);
      if (d < bestBaseDist) bestBaseDist = d;
    }
    let finalDist = nominalDist, finalPoint = nominalPoint;
    if (bestBaseDist > TANKER_SPECS.operationalRadiusKm) {
      const maxF = Math.min(legRange * 0.15, minRange * 0.9 - legRange);
      const maxB = legRange * 0.15;
      let bestSD = bestBaseDist;
      for (let off = -maxB; off <= maxF; off += 80) {
        const td = nominalDist + off;
        if (td <= distCovered + 500 || td >= totalDistKm - 500) continue;
        const tp = interpolateAlongPath(routeWaypoints, td);
        for (const base of airbases) {
          const d = haversineKm(tp.lat, tp.lon, base.lat, base.lon);
          if (d < bestSD) { bestSD = d; finalDist = td; finalPoint = tp; }
        }
      }
    }
    distCovered = finalDist;
    refuelStops.push(finalPoint);
    refuelDistances.push(distCovered);
    if (totalDistKm - distCovered <= minRange * 0.9) break;
  }

  // Check legs
  const legPoints = [routeWaypoints[0], ...refuelStops, routeWaypoints[routeWaypoints.length - 1]];
  const legDists = [];
  for (let i = 0; i < legPoints.length - 1; i++) {
    const fd = i === 0 ? 0 : refuelDistances[i - 1];
    const td = i < refuelDistances.length ? refuelDistances[i] : totalDistKm;
    legDists.push(td - fd);
  }
  for (const ld of legDists) {
    if (ld > minRange) return { viable: false, reason: `Leg ${Math.round(ld)} km exceeds range ${minRange} km` };
  }

  // Assign tankers
  const tankerAssignments = [];
  const failedStops = [];
  for (let si = 0; si < refuelStops.length; si++) {
    const assignment = assignTankerForRefuelPoint(refuelStops[si], si, friendlyBases);
    if (!assignment) {
      const nearest = findNearestAlliedBase(refuelStops[si], friendlyBases);
      const nearestDist = nearest ? haversineKm(refuelStops[si].lat, refuelStops[si].lon, nearest.lat, nearest.lon) : Infinity;
      failedStops.push({ stopIndex: si, point: refuelStops[si], nearestBaseDist: Math.round(nearestDist), nearestBase: nearest?.name });
    } else {
      for (const ta of assignment) tankerAssignments.push(ta);
    }
  }

  if (failedStops.length > 0) {
    return { viable: false, reason: 'Tanker coverage gap', failedStops, distanceKm: totalDistKm, refuelStops };
  }

  // Verify no route through hostile airspace
  const routeClear = routeWaypoints.length > 2;
  return {
    viable: true,
    directFlight: false,
    distanceKm: totalDistKm,
    legs: legPoints.length - 1,
    tankers: tankerAssignments.length,
    relays: tankerAssignments.filter(t => t.isRelay).length,
    refuelStops,
    routeWaypoints: routeWaypoints.length,
    routeDetoured: routeClear,
    legDistances: legDists.map(d => Math.round(d)),
  };
}

// ── Main ────────────────────────────────────────────────────────

async function main() {
  console.log('Fetching base data...');
  const resp = await fetch(API_URL);
  const payload = await resp.json();
  const sites = (payload.data || []).map(s => ({
    name: s.name, countryIso3: s.countryIso3, category: s.installationType === 'air_base' || s.installationType === 'military_base' || s.installationType === 'army_base' ? 'airbase' : 'other',
    lat: Number(s.latitude), lon: Number(s.longitude),
  }));

  const playerCountry = 'USA';
  const allBases = sites.filter(s => s.category === 'airbase');
  const friendlyBases = filterAlliedBases(allBases, playerCountry);

  console.log(`\nTotal airbases: ${allBases.length}, Allied: ${friendlyBases.length}`);
  console.log('Allied bases by country:');
  const byCountry = {};
  for (const b of friendlyBases) byCountry[b.countryIso3] = (byCountry[b.countryIso3] || 0) + 1;
  for (const [k, v] of Object.entries(byCountry).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);

  const testRoutes = [
    { name: 'CA → UK (Mildenhall)', from: [34.7, -120.6], to: [52.4, -1.7] },
    { name: 'CA → Italy', from: [34.7, -120.6], to: [42.4, 12.6] },
    { name: 'CA → Turkey', from: [34.7, -120.6], to: [39.0, 35.0] },
    { name: 'CA → UAE', from: [34.7, -120.6], to: [24.4, 54.7] },
    { name: 'TX → Saudi', from: [32.4, -99.9], to: [24.1, 47.6] },
    { name: 'Offutt → UK', from: [41.1, -95.9], to: [52.4, -1.7] },
    { name: 'Offutt → UAE', from: [41.1, -95.9], to: [24.4, 54.7] },
    { name: 'CA → Japan (Misawa)', from: [34.7, -120.6], to: [40.7, 141.4] },
    { name: 'CA → Guam', from: [34.7, -120.6], to: [13.6, 144.9] },
    { name: 'UK → Israel', from: [52.4, -1.7], to: [31.2, 34.9] },
    { name: 'UK → UAE', from: [52.4, -1.7], to: [24.4, 54.7] },
  ];

  console.log('\n' + '='.repeat(80));
  console.log('ROUTE TEST RESULTS');
  console.log('='.repeat(80));

  for (const route of testRoutes) {
    const result = planRoute(route.from[0], route.from[1], route.to[0], route.to[1], playerCountry, friendlyBases);
    console.log(`\n${route.name}:`);
    if (result.viable) {
      console.log(`  OK — ${Math.round(result.distanceKm)} km, ${result.legs} legs, ${result.tankers} tankers (${result.relays} relays)`);
      console.log(`  Route waypoints: ${result.routeWaypoints} (detoured: ${result.routeDetoured})`);
      console.log(`  Leg distances: ${result.legDistances.join(', ')} km`);
    } else {
      console.log(`  FAILED — ${result.reason}`);
      if (result.failedStops) {
        for (const fs of result.failedStops) {
          console.log(`  Stop ${fs.stopIndex + 1} at ${fs.point.lat.toFixed(1)}, ${fs.point.lon.toFixed(1)} — nearest base: ${fs.nearestBase} (${fs.nearestBaseDist} km)`);
        }
      }
    }
  }
}

main().catch(console.error);
