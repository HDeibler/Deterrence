import * as THREE from 'three';
import { haversineDistanceKm, latLonToVector3, applyEarthRotation, vector3ToLatLon } from '../world/geo/geoMath.js';
import { BOOST_PHASE_MAX_SECONDS, EARTH_RADIUS_KM } from '../game/data/radarCatalog.js';
import { getMissileType } from '../game/data/munitionCatalog.js';
import { solveLambert } from './orbitalMath.js';

// Radar detection range scales with target RCS per the radar equation:
//   R_detect = R_base × (RCS / RCS_ref)^(1/4)
// where RCS_ref = 1.0 m² (calibration target — ICBM booster stack)
const RCS_REFERENCE_M2 = 1.0;

function computeEffectiveRadarRange(baseCoverageKm, rcsM2) {
  if (rcsM2 <= 0) return 0;
  return baseCoverageKm * Math.pow(rcsM2 / RCS_REFERENCE_M2, 0.25);
}

// Radar horizon distance from radar to target at altitude (km)
// Both the radar (at ground level ~30m antenna height) and the target
// contribute to the line-of-sight distance.
function computeRadarHorizonKm(targetAltKm, radarHeightKm = 0.03) {
  return Math.sqrt(2 * EARTH_RADIUS_KM * radarHeightKm)
       + Math.sqrt(2 * EARTH_RADIUS_KM * Math.max(targetAltKm, 0));
}

export function createMissileDefenseSimulation({ worldConfig, simulationConfig, getEarthRotationRadians, radarSimulation }) {
  const earthRadiusKm = EARTH_RADIUS_KM;
  const earthRadiusUnits = worldConfig.earthRadius;
  const scaleMeters = simulationConfig.scaleMeters;
  const earthRotationRate = (Math.PI * 2) / simulationConfig.earthRotationPeriodSeconds;
  const mu = simulationConfig.gravitationalConstant * worldConfig.earthMass;

  const threats = new Map();
  const interceptors = [];
  let nextInterceptorId = 1;
  return {
    step({ missileSnapshots, radarSnapshot, deltaSeconds }) {
      // 1. Update detection for all active missiles
      for (const missile of missileSnapshots) {
        if (!missile.active || missile.phase === 'impact') {
          threats.delete(missile.id);
          continue;
        }
        updateDetection({ missile, radarSnapshot, deltaSeconds });
      }

      // Clean stale threats
      for (const [missileId] of threats) {
        if (!missileSnapshots.find((m) => m.id === missileId && m.active)) {
          threats.delete(missileId);
        }
      }

      // 2. Evaluate engagements — find best site for each tracked threat
      for (const [missileId, threat] of threats) {
        // NGI requires fire-control quality track from ground radar.
        // Satellite-only detection gives early warning but NOT enough
        // precision for an intercept solution.
        if (threat.status !== 'radar-tracked') continue;
        const missile = missileSnapshots.find((m) => m.id === missileId);
        if (!missile) continue;

        // Count active interceptors already targeting this threat
        const activeCount = interceptors.filter(
          (i) => i.targetMissileId === missileId && i.phase !== 'complete',
        ).length;

        // Shoot-look-shoot: allow up to 2 simultaneous interceptors per threat
        if (activeCount >= 2) continue;

        tryEngageFromBestSite({ threat, missile, radarSnapshot });
      }

      // 3. Remove interceptors that reported results last frame (gives Application
      //    one frame to read the result and spawn explosions / destroy ICBMs)
      for (let i = interceptors.length - 1; i >= 0; i--) {
        if (interceptors[i].resultReported) {
          interceptors.splice(i, 1);
        }
      }

      // 4. Step interceptor flights
      for (let i = interceptors.length - 1; i >= 0; i--) {
        stepInterceptor({ interceptor: interceptors[i], deltaSeconds, missileSnapshots });
        // Mark completed interceptors for removal NEXT frame
        if (interceptors[i].phase === 'complete') {
          interceptors[i].resultReported = true;
        }
      }
    },

    getSnapshot() {
      return {
        threats: [...threats.entries()].map(([id, t]) => ({
          missileId: id,
          status: t.status,
          detectedByIds: [...t.detectedByIds],
          trackQuality: t.trackQuality,
          predictedImpactLat: t.predictedImpactLat,
          predictedImpactLon: t.predictedImpactLon,
          firstDetectedTime: t.firstDetectedTime,
          nearestRadarLat: t.nearestRadarLat ?? null,
          nearestRadarLon: t.nearestRadarLon ?? null,
          ghostPath: t.ghostPath ?? null,
          ghostAge: t.ghostAge ?? 0,
        })),
        interceptors: interceptors.map((intc) => ({
          id: intc.id,
          siteId: intc.siteId,
          siteLat: intc.siteLat,
          siteLon: intc.siteLon,
          targetMissileId: intc.targetMissileId,
          type: intc.type,
          phase: intc.phase,
          isKV: !!intc.isKV,
          position: intc.position.clone(),
          velocity: intc.velocity.clone(),
          predictedInterceptPos: intc.predictedInterceptPos?.clone() ?? null,
          flightTimeSeconds: intc.flightTimeSeconds,
          distToTargetKm: intc.lastDistToTargetKm ?? null,
          kvDeltaVRemaining: intc.kvDeltaVRemaining ?? null,
          result: intc.result,
        })),
      };
    },
  };

  // ── Detection ──────────────────────────────────────────────────────

  function updateDetection({ missile, radarSnapshot, deltaSeconds }) {
    let threat = threats.get(missile.id);
    if (!threat) {
      threat = {
        status: 'undetected',
        detectedByIds: new Set(),
        trackQuality: 0,
        predictedImpactLat: null,
        predictedImpactLon: null,
        // Radar-observed track: position history for velocity estimation
        lastObservedPos: null,
        observedVelocity: null,
        firstDetectedTime: null,
        nearestRadarLat: null,
        // Ghost track: last known predicted path persists after detection lost
        ghostPath: null,
        ghostAge: 0,
        nearestRadarLon: null,
      };
      threats.set(missile.id, threat);
    }

    const missileGroundTrack = computeGroundTrack(missile.position);
    const missileAltKm = missile.altitudeKm;
    let satelliteDetected = false;
    let radarTracked = false;
    let nearestRadarDist = Infinity;

    // SBIRS satellite detection: IR sensors detect the bright rocket plume.
    // - ICBMs: visible during entire boost phase (60-180s of bright exhaust)
    // - Cruise missiles: visible only during brief booster burn (4-6s), then
    //   the small turbofan/ramjet plume is too dim for space-based IR sensors
    // - Hypersonics: visible during boost (30-90s)
    // After booster burnout, SBIRS loses the target — ground radar must
    // independently acquire for fire-control quality tracking.
    const hasVisiblePlume = missile.phase === 'boost'
      || (missile.phase === 'booster' && missile.missileType?.startsWith('cruise'));
    if (hasVisiblePlume) {
      for (const satellite of radarSnapshot.satellites) {
        if (!satellite.operational) continue;
        const satGT = computeGroundTrack(satellite.position);
        const distToSat = haversineDistanceKm(missileGroundTrack, satGT);
        if (distToSat < satellite.footprintRadiusKm) {
          satelliteDetected = true;
          threat.detectedByIds.add(satellite.id);

          // SBIRS computes a rough trajectory from the observed boost plume.
          // IR sensors give position but velocity is derived from frame-to-frame
          // position changes — inherently noisy, especially in early boost when
          // the missile is still accelerating and changing direction.
          if (missile.position) {
            if (threat.lastObservedPos) {
              const delta = missile.position.clone().sub(threat.lastObservedPos);
              const newVel = delta.divideScalar(Math.max(deltaSeconds, 0.001));

              // Add sensor noise — SBIRS IR position accuracy is ~1-5 km,
              // which translates to significant velocity estimation error.
              // Noise is larger during early boost (missile is accelerating,
              // changing direction rapidly — harder to extrapolate).
              const boostProgress = Math.min(missile.flightTimeSeconds / 120, 1);
              const noiseMagnitude = newVel.length() * (0.15 - 0.12 * boostProgress);
              if (noiseMagnitude > 0) {
                newVel.x += (Math.random() - 0.5) * 2 * noiseMagnitude;
                newVel.y += (Math.random() - 0.5) * 2 * noiseMagnitude;
                newVel.z += (Math.random() - 0.5) * 2 * noiseMagnitude;
              }

              if (!threat.observedVelocity) {
                threat.observedVelocity = newVel;
              } else {
                // Slow smoothing — noisy estimate takes time to converge
                threat.observedVelocity.lerp(newVel, 0.1);
              }
            }
            threat.lastObservedPos = missile.position.clone();

            // Rough impact prediction — only attempt after enough observation
            // time for the velocity estimate to partially converge.
            // Early boost predictions are wildly inaccurate (missile is still
            // pitching over, hasn't established its ballistic arc yet).
            if (threat.observedVelocity && missile.flightTimeSeconds > 30) {
              const predicted = predictImpactFromObservation(missile.position, threat.observedVelocity);
              if (predicted) {
                threat.predictedImpactLat = predicted.lat;
                threat.predictedImpactLon = predicted.lon;
              }
            }
          }
          break;
        }
      }
    }

    // Ground radar detection — factors in RCS and radar horizon
    // Smaller RCS = shorter effective detection range (radar equation)
    // Lower altitude = closer radar horizon (Earth curvature)
    const missileRCS = getMissileRCS(missile);
    const horizonKm = computeRadarHorizonKm(missileAltKm);

    for (const radar of radarSnapshot.groundRadars) {
      const radarPos = { lat: radar.latitude, lon: radar.longitude };
      const distKm = haversineDistanceKm(missileGroundTrack, radarPos);

      // Effective detection range: scaled by RCS
      const effectiveRange = computeEffectiveRadarRange(radar.coverageKm, missileRCS);
      if (distKm > effectiveRange) continue;

      // Line-of-sight check: must be above radar horizon
      if (distKm > horizonKm) continue;

      radarTracked = true;
      threat.detectedByIds.add(radar.id);
      if (distKm < nearestRadarDist) {
        nearestRadarDist = distKm;
        threat.nearestRadarLat = radar.latitude;
        threat.nearestRadarLon = radar.longitude;
      }
    }

    // Compute observed velocity from position changes (what radar actually sees)
    if (radarTracked && missile.position) {
      if (threat.lastObservedPos) {
        const delta = missile.position.clone().sub(threat.lastObservedPos);
        const newVel = delta.divideScalar(Math.max(deltaSeconds, 0.001));
        if (!threat.observedVelocity) {
          threat.observedVelocity = newVel;
        } else {
          // Smooth the velocity estimate
          threat.observedVelocity.lerp(newVel, 0.3);
        }
      }
      threat.lastObservedPos = missile.position.clone();
    }

    if (radarTracked) {
      threat.status = 'radar-tracked';
      threat.trackQuality = 1.0;

      // Predict impact from observed trajectory — NOT from missile's internal target
      if (threat.observedVelocity && missile.position) {
        const predicted = predictImpactFromObservation(missile.position, threat.observedVelocity);
        if (predicted) {
          threat.predictedImpactLat = predicted.lat;
          threat.predictedImpactLon = predicted.lon;
        }
      }
    } else if (satelliteDetected) {
      // SBIRS boost detection — rough track, not fire-control quality
      if (threat.status !== 'radar-tracked') {
        threat.status = 'satellite-tracked';
        // Track quality caps at 0.5 — satellite alone isn't precise enough for NGI
        threat.trackQuality = Math.min(threat.trackQuality + 0.03, 0.5);
      }
    }

    // Degrade track quality when no sensor is currently observing
    if (!radarTracked && !satelliteDetected) {
      if (threat.status === 'radar-tracked') {
        // Radar lost contact — degrades slowly (the track was high quality)
        threat.trackQuality = Math.max(0, threat.trackQuality - 0.008);
        if (threat.trackQuality < 0.3) threat.status = 'satellite-tracked';
      } else if (threat.status === 'satellite-tracked') {
        // SBIRS lost the plume (boost ended) — track degrades FAST.
        // This is the "tracking gap" — the missile is coasting in space
        // with no IR signature, and no radar has acquired it yet.
        // The predicted impact persists but uncertainty grows rapidly.
        threat.trackQuality = Math.max(0, threat.trackQuality - 0.02);
        if (threat.trackQuality < 0.05) {
          // Track completely lost — missile disappears from the display.
          // Ground radar must independently re-acquire it.
          threat.status = 'undetected';
          threat.observedVelocity = null;
          threat.lastObservedPos = null;
        }
      }
    }

    if (threat.firstDetectedTime === null && threat.status !== 'undetected') {
      threat.firstDetectedTime = missile.flightTimeSeconds;
    }

    // Ghost track: compute predicted ballistic path from last observation.
    // Updated while any sensor has contact. Persists after detection lost.
    if ((radarTracked || satelliteDetected) && threat.observedVelocity && missile.position) {
      threat.ghostPath = predictBallisticPathFromObservation(
        missile.position, threat.observedVelocity, 2400,
      ).map((pt) => pt.position);
      threat.ghostAge = 0;
    } else if (threat.ghostPath) {
      threat.ghostAge += deltaSeconds;
      // Ghost fades over ~10 minutes (600s), then clears
      if (threat.ghostAge > 600) {
        threat.ghostPath = null;
      }
    }
  }

  // ── Engagement Selection ───────────────────────────────────────────

  function tryEngageFromBestSite({ threat, missile, radarSnapshot }) {
    const sites = radarSimulation.getInterceptorSites();
    const missileGT = computeGroundTrack(missile.position);
    const missileAltKm = missile.altitudeKm;

    // Predict where the ICBM will be — use predicted impact point or trajectory extrapolation
    let predictedPathGT = missileGT;
    if (threat.predictedImpactLat !== null) {
      predictedPathGT = { lat: threat.predictedImpactLat, lon: threat.predictedImpactLon };
    }

    // Score each site — lower is better. Key insight: favor sites that are
    // close to where the ICBM is GOING, not where it currently is.
    let bestSite = null;
    let bestScore = Infinity;

    for (const site of sites) {
      if (site.interceptorsRemaining <= 0) continue;

      const sitePos = { lat: site.latitude, lon: site.longitude };
      const distToMissileKm = haversineDistanceKm(sitePos, missileGT);
      const distToImpactKm = haversineDistanceKm(sitePos, predictedPathGT);

      // The intercept table is keyed by CURRENT distance to the missile.
      // We MUST wait until the missile is within max range before launching.
      // If we launch early, we will fall short.
      if (distToMissileKm > site.maxRangeKm) continue;

      // Range check — must also be defending a point within range
      if (distToImpactKm > site.maxRangeKm) continue;

      const effectiveDistKm = Math.min(distToMissileKm, distToImpactKm);

      

      // NGI: exoatmospheric midcourse intercept ONLY.
      // The KV's IR seeker cannot see through reentry plasma, and its
      // 9-14 kg of propellant cannot maneuver in atmosphere.
      // Must engage while the ICBM is coasting in space above ~150 km.
      if (site.type === 'ngi') {
        if (missile.phase !== 'midcourse') continue;
        if (missileAltKm < 150) continue;
        // Must fire early enough — NGI needs time to fly out and reach intercept altitude.
        // If the ICBM will impact before the interceptor can reach it, don't launch.
        if (missile.timeToImpactSeconds !== null && missile.timeToImpactSeconds < site.burnTimeSeconds * 1.5) continue;
      }

      // Score: strongly favor proximity to predicted impact path
      // distToImpact is most important — a site near the impact is ideal
      const proximityScore = distToImpactKm / site.maxRangeKm;
      const timeToReachSeconds = effectiveDistKm / (site.maxSpeedKmS * 0.65);
      const fuelMargin = 1 - (timeToReachSeconds / (site.burnTimeSeconds * 1.2));
      const ammoRatio = site.interceptorsRemaining / site.interceptorsTotal;

      // Lower score = better. Proximity dominates, fuel margin and ammo are secondary.
      const score = proximityScore * 2 - fuelMargin * 0.5 - ammoRatio * 0.3;

      if (score < bestScore) {
        bestScore = score;
        bestSite = site;
      }
    }

    if (bestSite) {
      launchInterceptor({ site: bestSite, missile, threat });
    }
  }

  // ── Interceptor Launch ─────────────────────────────────────────────

  function launchInterceptor({ site, missile, threat }) {
    if (!radarSimulation.consumeInterceptor(site.id)) return;

    const id = `interceptor-${nextInterceptorId}`;
    nextInterceptorId += 1;

    const earthRotationRadians = getEarthRotationRadians();
    const localPos = latLonToVector3({
      lat: site.latitude,
      lon: site.longitude,
      radius: earthRadiusUnits,
    });
    const position = applyEarthRotation(localPos, earthRotationRadians);

    // Surface velocity from Earth rotation
    const radialDir = position.clone().normalize();
    const surfaceVelocity = new THREE.Vector3(0, earthRotationRate, 0).cross(position.clone());
    const velocity = surfaceVelocity.clone();

    // Compute the horizontal direction toward the ICBM (for pitch program)
    const toIcbm = missile.position.clone().sub(position);
    const horizontalToIcbm = toIcbm.clone().sub(radialDir.clone().multiplyScalar(toIcbm.dot(radialDir)));
    const horizontalDir = horizontalToIcbm.lengthSq() > 1e-12
      ? horizontalToIcbm.normalize()
      : new THREE.Vector3(radialDir.y, -radialDir.x, 0).normalize();

    // Scenario parameters for table lookup
    // Compute predicted intercept point for visual display
    let predictedInterceptPos;
    try {
      predictedInterceptPos = computeInterceptPoint(position, site, missile, threats.get(missile.id));
    } catch (e) {
      predictedInterceptPos = missile.position.clone();
    }

    interceptors.push({
      id,
      siteId: site.id,
      siteLat: site.latitude,
      siteLon: site.longitude,
      targetMissileId: missile.id,
      type: site.type,
      phase: 'boost',
      position,
      velocity,
      flightTimeSeconds: 0,
      burnTimeSeconds: site.burnTimeSeconds,
      thrustMps2: site.thrustMps2,
      maxSpeedKmS: site.maxSpeedKmS,
      killProbability: site.killProbability,
      launchRadial: radialDir.clone(),
      launchHorizontal: horizontalDir.clone(),
      predictedInterceptPos,
      minDistKm: Infinity,
      distSampleTimer: 0,
      distGrowingCount: 0,
      result: null,
    });
  }

  // Predict the ICBM's future trajectory from radar observations.
  // Uses the observed position + velocity (NOT the missile's internal state).
  // Forward-integrates under gravity — same physics, but from observed data only.
  function predictBallisticPathFromObservation(position, observedVelocity, maxSeconds) {
    if (!position || !observedVelocity) {
      return [{ position: position ? position.clone() : new THREE.Vector3(), timeOffset: 0 }];
    }

    const pos = position.clone();
    const vel = observedVelocity.clone();
    const points = [{ position: pos.clone(), timeOffset: 0 }];
    const step = 4;
    const steps = Math.ceil(maxSeconds / step);

    for (let i = 0; i < steps; i++) {
      const r = pos.length();
      const rMeters = r * scaleMeters;
      const gravMag = mu / (rMeters * rMeters);
      const gravDir = pos.clone().normalize().multiplyScalar(-1);
      vel.addScaledVector(gravDir, (gravMag / scaleMeters) * step);
      pos.addScaledVector(vel, step);

      if (pos.length() < earthRadiusUnits) break;

      points.push({ position: pos.clone(), timeOffset: (i + 1) * step });
    }
    return points;
  }

  // Predict where the ICBM will impact from radar observations only.
  function predictImpactFromObservation(position, observedVelocity) {
    const path = predictBallisticPathFromObservation(position, observedVelocity, 3000);
    // The last point before hitting the ground is the predicted impact
    const lastPoint = path[path.length - 1];
    if (lastPoint) {
      return computeGroundTrack(lastPoint.position);
    }
    return null;
  }

  // Find the best intercept point on the predicted ballistic path.
  // Walk the path and find where the interceptor could reach in time.
  function computeInterceptPoint(launchPos, site, missile, threat) {
    const obsVel = threat?.observedVelocity ?? null;
    const path = obsVel
      ? predictBallisticPathFromObservation(missile.position, obsVel, 600)
      : [{ position: missile.position.clone(), timeOffset: 0 }];

    const interceptorAvgSpeed = (site.maxSpeedKmS * 0.65 * 1000) / scaleMeters;

    // Find closest approach point on the predicted path
    let bestPoint = path[0].position;
    let bestDist = Infinity;
    for (const pt of path) {
      const d = launchPos.distanceTo(pt.position);
      if (d < bestDist) {
        bestDist = d;
        bestPoint = pt.position;
      }
    }

    // Then check if any point satisfies the rendez-vous timing
    for (const pt of path) {
      const d = launchPos.distanceTo(pt.position);
      const tReach = d / Math.max(interceptorAvgSpeed, 0.0001);
      if (tReach <= pt.timeOffset + 30) {
        return pt.position.clone();
      }
    }
    return bestPoint.clone();
  }


  // ── Interceptor Flight (fixed pitch program — no in-flight guidance) ──

  function stepInterceptor({ interceptor, deltaSeconds, missileSnapshots }) {
    interceptor.flightTimeSeconds += deltaSeconds;

    const targetMissile = missileSnapshots.find(
      (m) => m.id === interceptor.targetMissileId && m.active,
    );

    if (!targetMissile) {
      selfDestruct(interceptor, 'no-target');
      return;
    }

    // Distance to target
    const toTarget = targetMissile.position.clone().sub(interceptor.position);
    const distUnits = toTarget.length();
    const distKm = distUnits * scaleMeters / 1000;
    interceptor.lastDistToTargetKm = distKm;

    const radialDir = interceptor.position.clone().normalize();

    // ── Update aim point (NGI Real-time Guidance) ──
    // The NGI dynamically predicts the intercept point by projecting the ICBM's
    // trajectory and finding where it can rendezvous based on its own speed profile.
    {
      const threat = threats.get(interceptor.targetMissileId);
      const obsVel = threat?.observedVelocity;
      const interceptorAvgSpeed = (interceptor.maxSpeedKmS * 0.7 * 1000) / scaleMeters;

      if (obsVel && obsVel.lengthSq() > 1e-12) {
        const predPos = targetMissile.position.clone();
        const predVel = obsVel.clone();
        const predStep = 2;

        let bestPoint = targetMissile.position.clone();

        // If we are extremely close (less than 20km)
        // just aim directly at the target and let Proportional Navigation do the rest.
        if (distKm < 20) {
            interceptor.predictedInterceptPos = targetMissile.position.clone();
            interceptor.requiredVelocity = null;
        } else {
            // Optimization: Only run the heavy prediction loop every 1 simulation second
            if (interceptor.flightTimeSeconds - (interceptor.lastLambertSolveTime || 0) > 1.0) {
                interceptor.lastLambertSolveTime = interceptor.flightTimeSeconds;
                
                let bestVReq = null;
                let minDeltaV = Infinity;
                let bestPoint = targetMissile.position.clone();

                // Increase predStep to 10s to drastically reduce iterations (100 instead of 500)
                const predStepLarge = 10;
                for (let pt = 0; pt < 1000; pt += predStepLarge) {
                  const r = predPos.length();
                  const rm = r * scaleMeters;
                  const g = mu / (rm * rm);
                  predVel.addScaledVector(predPos.clone().normalize().multiplyScalar(-1), (g / scaleMeters) * predStepLarge);
                  predPos.addScaledVector(predVel, predStepLarge);
                  if (predPos.length() < earthRadiusUnits) break;
                  
                  // Calculate heuristic time-to-reach for fallback aim point prediction
                  // KVs use this exclusively to set their APN aim point.
                  if (!bestVReq || interceptor.isKV) {
                      const distToPoint = interceptor.position.distanceTo(predPos);
                      const remainingBurnTime = Math.max(interceptor.burnTimeSeconds - interceptor.flightTimeSeconds, 0);
                      const maxSpeed = (interceptor.maxSpeedKmS * 1000) / scaleMeters;
                      
                      let tReach = 0;
                      if (remainingBurnTime > 0 && !interceptor.isKV) {
                         const avgSpeed = Math.max((interceptor.velocity.length() + maxSpeed) / 2, 0.0001);
                         tReach = distToPoint / avgSpeed;
                      } else {
                         tReach = distToPoint / Math.max(interceptor.velocity.length(), 0.0001);
                      }
                      
                      // Save this as our fallback aim point if we can reach it
                      if (tReach <= pt) {
                          bestPoint = predPos.clone();
                          if (interceptor.isKV) break; // KVs don't need Lambert, we have our lead point
                      }
                  }

                  // Don't try to solve Lambert for very short times of flight or for KVs
                  if (pt < 10 || interceptor.isKV) continue;

                  const muSim = mu / Math.pow(scaleMeters, 3);
                  const vReq = solveLambert({ r1Vec: interceptor.position, r2Vec: predPos, tof: pt, mu: muSim });
                  
                  if (vReq) {
                      // Can the interceptor reach this velocity?
                      const maxSpeedUnits = (interceptor.maxSpeedKmS * 1000) / scaleMeters;
                      
                      if (vReq.length() <= maxSpeedUnits) {
                          const deltaV = vReq.clone().sub(interceptor.velocity).length();
                          const remainingBurnTime = Math.max(interceptor.burnTimeSeconds - interceptor.flightTimeSeconds, 0);
                          const maxDeltaVUnits = (interceptor.thrustMps2 / scaleMeters) * remainingBurnTime;
                          
                          // Check if we have enough delta-V remaining to execute this trajectory,
                          // leaving a 5% margin for endgame maneuvers.
                          if (deltaV <= maxDeltaVUnits * 0.95) {
                              // Since we iterate forward in time, the FIRST valid solution is the 
                              // EARLIEST possible intercept. We lock onto this to kill the ICBM ASAP.
                              bestPoint = predPos.clone();
                              bestVReq = vReq.clone();
                              break;
                          }
                      }
                  }
                }
                interceptor.predictedInterceptPos = bestPoint;
                interceptor.requiredVelocity = bestVReq;
            }
        }
      } else {
        // No observed velocity — aim at current ICBM position
        interceptor.predictedInterceptPos = targetMissile.position.clone();
        interceptor.requiredVelocity = null;
      }
    }

    if (interceptor.isKV) {
      // ── Kill Vehicle: True Proportional Navigation ──
      // PN zeros out line-of-sight rotation rate, converging on a collision
      // course. The KV has limited delta-V (~1200 m/s) from its DACS.
      const kvDv = interceptor.kvDeltaVRemaining ?? 0;
      if (kvDv > 0) {
        const threat = threats.get(interceptor.targetMissileId);
        const targetVel = threat?.observedVelocity ?? targetMissile.velocity ?? new THREE.Vector3();

        const los = targetMissile.position.clone().sub(interceptor.position);
        const range = los.length();
        const losDir = los.clone().normalize();

        const relVel = targetVel.clone().sub(interceptor.velocity);
        const closingSpeed = Math.max(-relVel.dot(losDir), 0.001);

        // LOS rotation rate: perpendicular relative velocity / range
        const vPerp = relVel.clone().sub(losDir.clone().multiplyScalar(relVel.dot(losDir)));
        const losRate = vPerp.divideScalar(Math.max(range, 1e-10));

        // PN acceleration command: a = N * Vc * dλ/dt
        const N_PN = 4;
        const pnAccel = losRate.multiplyScalar(N_PN * closingSpeed);

        // Add gravity compensation so PN works in the inertial frame
        const rMetersKV = interceptor.position.length() * scaleMeters;
        const gravCompensation = radialDir.clone().multiplyScalar(mu / (rMetersKV * rMetersKV) / scaleMeters);
        pnAccel.add(gravCompensation);

        // Cap at DACS thrust authority (20 m/s²)
        const dacsMax = 20.0 / scaleMeters;
        if (pnAccel.lengthSq() > dacsMax * dacsMax) {
          pnAccel.normalize().multiplyScalar(dacsMax);
        }

        // Apply thrust and consume delta-V
        const dvUsed = pnAccel.length() * deltaSeconds;
        interceptor.kvDeltaVRemaining = Math.max(0, kvDv - dvUsed);
        interceptor.velocity.addScaledVector(pnAccel, deltaSeconds);
      }
      // When propellant is exhausted, KV coasts ballistically (no more corrections)

    } else if (interceptor.flightTimeSeconds < interceptor.burnTimeSeconds) {
      // ── Booster: Lambert midcourse guidance ──
      const thrustAccelUnits = interceptor.thrustMps2 / scaleMeters;
      const maxSpeedUnits = (interceptor.maxSpeedKmS * 1000) / scaleMeters;

      const toPredicted = interceptor.predictedInterceptPos.clone().sub(interceptor.position);
      const targetDir = toPredicted.lengthSq() > 1e-12 ? toPredicted.normalize() : radialDir.clone();

      let thrustDir;
      if (interceptor.flightTimeSeconds < 25) {
        // Initial ascent: pitch over from vertical toward intercept point
        const pitchFraction = Math.min(interceptor.flightTimeSeconds / 25, 1.0);
        thrustDir = interceptor.launchRadial.clone().lerp(targetDir, pitchFraction).normalize();
      } else if (interceptor.requiredVelocity) {
        // Lambert velocity matching: steer to eliminate velocity error
        const vError = interceptor.requiredVelocity.clone().sub(interceptor.velocity);
        thrustDir = vError.lengthSq() > 1e-12 ? vError.normalize() : interceptor.velocity.clone().normalize();
      } else {
        // Fallback: aim at predicted intercept point
        thrustDir = targetDir;
      }

      interceptor.velocity.addScaledVector(thrustDir, thrustAccelUnits * deltaSeconds);
      if (interceptor.velocity.length() > maxSpeedUnits) {
        interceptor.velocity.normalize().multiplyScalar(maxSpeedUnits);
      }
    }

    // Gravity (always)
    const r = interceptor.position.length();
    const rMeters = r * scaleMeters;
    const gravAccel = -mu / (rMeters * rMeters);
    interceptor.velocity.addScaledVector(radialDir, (gravAccel / scaleMeters) * deltaSeconds);

    // Integrate position
    interceptor.position.addScaledVector(interceptor.velocity, deltaSeconds);

    // Collision guard
    const minRadius = earthRadiusUnits + 0.02;
    if (interceptor.position.length() < minRadius) {
      interceptor.position.copy(interceptor.position.clone().normalize().multiplyScalar(minRadius));
      const radVel = interceptor.velocity.dot(interceptor.position.clone().normalize());
      if (radVel < 0) {
        interceptor.velocity.sub(interceptor.position.clone().normalize().multiplyScalar(radVel));
      }
    }

    // Phase tracking
    if (interceptor.flightTimeSeconds > interceptor.burnTimeSeconds * 0.35) {
      interceptor.phase = 'midcourse';
    }
    if (interceptor.flightTimeSeconds > interceptor.burnTimeSeconds) {
      interceptor.phase = 'coast';
      
      // MKV Deployment: After booster burnout, the NGI releases its clustered Kill Vehicles.
      // We simulate this by splitting the single interceptor into 3 smaller, independent KVs.
      if (!interceptor.isKV && !interceptor.deployedMKV) {
          interceptor.deployedMKV = true;
          console.log(`[BMD] ${interceptor.id} booster burnout. Deploying MKV cluster (3 vehicles)...`);
          
          const fwd = interceptor.velocity.clone().normalize();
          const right = new THREE.Vector3(0, 1, 0).cross(fwd).normalize();
          if (right.lengthSq() < 0.1) right.set(1, 0, 0).cross(fwd).normalize();
          const up = fwd.clone().cross(right).normalize();
          
          for (let i = 0; i < 3; i++) {
              const kvId = `${interceptor.id}-kv${i+1}`;
              
              // Spread them in a distinct triangle pattern so they fan out clearly on screen.
              // We use 300 m/s (0.3 km/s) lateral separation. It's exaggerated for visual clarity.
              const angle = (i / 3) * Math.PI * 2;
              const lateralDir = right.clone().multiplyScalar(Math.cos(angle)).add(up.clone().multiplyScalar(Math.sin(angle))).normalize();
              const sepVel = lateralDir.multiplyScalar(0.3 / scaleMeters); 
              
              interceptors.push({
                  ...interceptor,
                  id: kvId,
                  isKV: true,
                  position: interceptor.position.clone(),
                  velocity: interceptor.velocity.clone().add(sepVel),
                  burnTimeSeconds: 0,
                  killProbability: 0.70,
                  kvDeltaVRemaining: 1200 / scaleMeters, // ~1200 m/s from 9-14 kg MMH/NTO propellant
                  minDistKm: Infinity,
                  distSampleTimer: 0,
                  distGrowingCount: 0,
                  deployedMKV: true,
              });
          }
          
          // Original booster is now inert debris
          selfDestruct(interceptor, 'burnout');
          return;
      }
    }

    // Distance tracking for miss detection (sample every 0.5s sim time)
    interceptor.distSampleTimer += deltaSeconds;
    if (interceptor.distSampleTimer > 0.5) {
      interceptor.distSampleTimer = 0;
      if (distKm < interceptor.minDistKm) {
        interceptor.minDistKm = distKm;
        interceptor.distGrowingCount = 0;
      } else {
        interceptor.distGrowingCount += 1;
      }
    }

    // Kill check — hit-to-kill kinetic impact
    // At 10+ km/s closing speed and 0.067s steps, the KV moves ~670m per step.
    // 1 km radius is tight but realistic for a kinetic hit-to-kill system.
    if (distKm < 1.0) {
      if (Math.random() < interceptor.killProbability) {
        interceptor.phase = 'complete';
        interceptor.result = 'kill';
        const threat = threats.get(interceptor.targetMissileId);
        if (threat) threat.status = 'intercepted';
        console.log(`[BMD] Intercept SUCCESS! ${interceptor.id} destroyed target at dist=${distKm.toFixed(2)}km`);
      } else {
        console.log(`[BMD] Intercept MISS! ${interceptor.id} passed within ${distKm.toFixed(2)}km but failed to kill.`);
        selfDestruct(interceptor, 'miss');
      }
      return;
    }
    
    // Self-destruct: genuinely passed closest approach and drifting away
    // Need to allow enough time for wobbles, so we check distance is growing over a longer span
    if (interceptor.distGrowingCount > 10 && distKm > interceptor.minDistKm + 200) {
      console.log(`[BMD] Intercept ABORT: ${interceptor.id} passed closest approach. Min dist was ${interceptor.minDistKm.toFixed(1)}km, now ${distKm.toFixed(1)}km`);
      selfDestruct(interceptor, 'miss');
      return;
    }

    // Hard timeout (NGI intercepts can take 800+ seconds)
    if (interceptor.flightTimeSeconds > 1500) {
      console.log(`[BMD] Intercept ABORT: ${interceptor.id} flight timeout after ${interceptor.flightTimeSeconds.toFixed(1)}s`);
      selfDestruct(interceptor, 'timeout');
    }
  }

  function selfDestruct(interceptor, result) {
    interceptor.phase = 'complete';
    interceptor.result = result;
  }

  function computeGroundTrack(position) {
    return vector3ToLatLon(position.clone().normalize());
  }

  // Get the radar cross section for a missile based on its type.
  // During boost phase, the entire booster stack is visible (much larger RCS).
  // After burnout, only the warhead/glider is visible (smaller RCS).
  function getMissileRCS(missile) {
    const phase = missile.phase;
    const typeId = missile.missileType;

    // During boost, the entire rocket stack is visible — large RCS
    if (phase === 'boost' || phase === 'booster') {
      return 5.0; // multi-meter booster stack
    }

    // Look up the catalog RCS for this missile type
    const typeData = typeId ? getMissileType(typeId) : null;
    if (typeData?.radarCrossSectionM2) {
      return typeData.radarCrossSectionM2;
    }

    // RV (MIRV reentry vehicle) — very small
    if (typeId === 'rv') return 0.01;

    // Default: ICBM RV
    return 0.05;
  }
}
