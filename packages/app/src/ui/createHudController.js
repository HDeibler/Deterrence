export function createHudController({ document }) {
  const card = document.getElementById('infoCard');
  const typeEl = document.getElementById('infoCardType');
  const idEl = document.getElementById('infoCardId');
  const closeBtn = document.getElementById('infoCardClose');
  const phaseEl = document.getElementById('infoPhase');
  const speedEl = document.getElementById('infoSpeed');
  const altitudeEl = document.getElementById('infoAltitude');
  const flightTimeEl = document.getElementById('infoFlightTime');
  const extra1Label = document.getElementById('infoExtra1Label');
  const extra1Value = document.getElementById('infoExtra1Value');
  const extra2Label = document.getElementById('infoExtra2Label');
  const extra2Value = document.getElementById('infoExtra2Value');

  let trackedType = null; // 'icbm' | 'interceptor' | 'fleet' | 'squadron' | 'oilfield' | 'reserve' | 'port'
  let trackedId = null;
  let trackedExtra = null;
  let needsInitialZoom = false;
  let onCloseCallback = null;

  closeBtn.addEventListener('click', () => {
    clear();
    if (onCloseCallback) onCloseCallback();
  });

  return {
    trackIcbm(missileId) {
      trackedType = 'icbm';
      trackedId = missileId;
      needsInitialZoom = true;
      card.hidden = false;
      typeEl.textContent = 'ICBM';
      typeEl.className = 'info-card-type';
    },
    trackInterceptor(interceptorId) {
      trackedType = 'interceptor';
      trackedId = interceptorId;
      needsInitialZoom = true;
      card.hidden = false;
      typeEl.textContent = 'NGI';
      typeEl.className = 'info-card-type interceptor';
    },
    trackFleet(fleetId, fleetName) {
      trackedType = 'fleet';
      trackedId = fleetId;
      needsInitialZoom = true;
      card.hidden = false;
      typeEl.textContent = 'FLEET';
      typeEl.className = 'info-card-type interceptor';
      idEl.textContent = fleetName ?? `Fleet ${fleetId}`;
    },
    trackSquadron(squadronId, squadronName) {
      trackedType = 'squadron';
      trackedId = squadronId;
      needsInitialZoom = true;
      card.hidden = false;
      typeEl.textContent = 'AIR';
      typeEl.className = 'info-card-type';
      idEl.textContent = squadronName ?? `Squadron`;
    },
    trackOilField(fieldName, fieldData) {
      trackedType = 'oilfield';
      trackedId = fieldName;
      trackedExtra = fieldData;
      needsInitialZoom = true;
      card.hidden = false;
      typeEl.textContent = 'OIL FIELD';
      typeEl.className = 'info-card-type';
      idEl.textContent = fieldName;
    },
    trackPort(portId, tradeSim) {
      trackedType = 'port';
      trackedId = portId;
      trackedExtra = tradeSim;
      needsInitialZoom = true;
      card.hidden = false;
      typeEl.textContent = 'PORT';
      typeEl.className = 'info-card-type interceptor';
      const port = tradeSim.getPortById(portId);
      idEl.textContent = port ? port.name : 'Oil Port';
    },
    trackReserve(facilityId, oilSim) {
      trackedType = 'reserve';
      trackedId = facilityId;
      trackedExtra = oilSim;
      needsInitialZoom = true;
      card.hidden = false;
      typeEl.textContent = 'RESERVE';
      typeEl.className = 'info-card-type interceptor';
      idEl.textContent = 'Strategic Petroleum Reserve';
    },
    clear() {
      clear();
    },
    getTracked() {
      return trackedType ? { type: trackedType, id: trackedId } : null;
    },
    consumeInitialZoom() {
      if (needsInitialZoom) {
        needsInitialZoom = false;
        return true;
      }
      return false;
    },
    onClose(cb) {
      onCloseCallback = cb;
    },
    render({ missileSnapshots, defenseSnapshot, fleets, squadrons }) {
      if (!trackedType || !trackedId) {
        card.hidden = true;
        return;
      }

      if (trackedType === 'icbm') {
        const m = missileSnapshots?.find((s) => s.id === trackedId);
        if (!m || !m.active) {
          clear();
          return;
        }
        const typeLabels = {
          icbm: 'ICBM',
          rv: 'MIRV RV',
          cruise_subsonic: 'LACM',
          cruise_supersonic: 'ASCM',
          hypersonic_glide: 'HGV',
          hypersonic_cruise: 'HCM',
        };
        typeEl.textContent = typeLabels[m.missileType] ?? 'ICBM';
        if (m.isDecoy) typeEl.textContent += ' (Decoy)';
        if (m.isRV) typeEl.textContent = 'MIRV RV';
        idEl.textContent = m.isRV ? `RV #${m.id}` : `Missile #${m.id}`;
        phaseEl.textContent = m.stageLabel ?? m.phase ?? '-';
        const isCruise = m.missileType?.startsWith('cruise');
        const isHypersonic = m.missileType?.startsWith('hypersonic');
        // Speed: Mach for cruise/hypersonic, km/s for ICBM
        if (isCruise || isHypersonic) {
          const mach = m.machNumber ?? (m.speedKmS * 1000 / 343);
          speedEl.textContent = `Mach ${mach.toFixed(2)}`;
        } else {
          speedEl.textContent = `${m.speedKmS.toFixed(1)} km/s`;
        }
        // Altitude: meters for low-alt, km for high-alt
        altitudeEl.textContent = m.altitudeKm < 1
          ? `${(m.altitudeKm * 1000).toFixed(0)} m`
          : `${m.altitudeKm.toFixed(0)} km`;
        flightTimeEl.textContent = formatDuration(m.flightTimeSeconds);
        // Extra fields: fuel for cruise, range for all
        if (isCruise && m.fuelFraction !== undefined) {
          extra1Label.textContent = 'Fuel';
          const pct = Math.round(m.fuelFraction * 100);
          extra1Value.textContent = `${pct}% (${Math.round(m.fuelRemainingKg ?? 0)} kg)`;
        } else {
          extra1Label.textContent = 'Range To Target';
          extra1Value.textContent = Number.isFinite(m.rangeToTargetKm)
            ? `${m.rangeToTargetKm.toFixed(0)} km`
            : '-';
        }
        if (isCruise) {
          extra2Label.textContent = 'Distance Flown';
          extra2Value.textContent = `${Math.round(m.distFlownKm ?? 0)} km`;
        } else if (isHypersonic) {
          const skips = m.skipCount ?? 0;
          const gammaD = ((m.flightPathAngle ?? 0) * 180 / Math.PI).toFixed(1);
          extra2Label.textContent = m.isScramjet ? 'Scramjet Fuel' : 'Skips';
          extra2Value.textContent = m.isScramjet
            ? `${Math.round(m.scramjetFuelKg ?? 0)} kg`
            : `${skips} (γ ${gammaD}°)`;
        } else {
          extra2Label.textContent = 'Apogee';
          extra2Value.textContent = `${m.apogeeKm.toFixed(0)} km`;
        }
      } else if (trackedType === 'interceptor') {
        const intc = defenseSnapshot?.interceptors?.find(
          (i) => i.id === trackedId && i.phase !== 'complete',
        );
        if (!intc) {
          // Try KVs with matching parent ID prefix
          const kv = defenseSnapshot?.interceptors?.find(
            (i) => i.id.startsWith(trackedId) && i.phase !== 'complete',
          );
          if (!kv) {
            clear();
            return;
          }
          // Switch to tracking the first live KV
          trackedId = kv.id;
        }
        const i = defenseSnapshot.interceptors.find(
          (x) => x.id === trackedId && x.phase !== 'complete',
        );
        if (!i) {
          clear();
          return;
        }

        const altKm = i.position
          ? (i.position.length() - 6.371) * 1000
          : 0;
        const speedKmS = i.velocity ? i.velocity.length() * 1000 : 0;
        const distToTargetKm = i.distToTargetKm ?? null;

        idEl.textContent = i.isKV ? `KV ${i.id}` : `Interceptor ${i.id}`;
        phaseEl.textContent = i.isKV ? 'Kill Vehicle' : i.phase ?? '-';
        speedEl.textContent = `${speedKmS.toFixed(1)} km/s`;
        altitudeEl.textContent = `${altKm.toFixed(0)} km`;
        flightTimeEl.textContent = formatDuration(i.flightTimeSeconds);
        extra1Label.textContent = 'Dist To ICBM';
        extra1Value.textContent = distToTargetKm !== null
          ? `${distToTargetKm.toFixed(0)} km`
          : '-';
        extra2Label.textContent = i.isKV ? 'Delta-V Left' : 'Type';
        extra2Value.textContent = i.isKV
          ? `${((i.kvDeltaVRemaining ?? 0) * 1e6 / 1000).toFixed(0)} m/s`
          : i.type?.toUpperCase() ?? 'NGI';
      } else if (trackedType === 'fleet') {
        const f = fleets?.find((fl) => fl.id === trackedId);
        if (!f) { clear(); return; }
        const activeShips = f.ships.filter((s) => !s.sunk).length;
        phaseEl.textContent = f.moving ? 'Underway' : 'Station';
        speedEl.textContent = f.moving ? `${(f.speedKnots ?? 30).toFixed(0)} kts` : 'Idle';
        altitudeEl.textContent = '-';
        flightTimeEl.textContent = '-';
        extra1Label.textContent = 'Ships';
        extra1Value.textContent = `${activeShips}/${f.ships.length}`;
        extra2Label.textContent = 'Position';
        extra2Value.textContent = `${Math.abs(f.lat).toFixed(1)}${f.lat >= 0 ? 'N' : 'S'} ${Math.abs(f.lon).toFixed(1)}${f.lon >= 0 ? 'E' : 'W'}`;
      } else if (trackedType === 'squadron') {
        // Could be a mission or a tanker flight
        let sq = squadrons?.find((s) => s.id === trackedId);
        let isTanker = false;
        if (!sq) {
          // Search tanker flights
          for (const m of (squadrons ?? [])) {
            const tf = m.tankerFlights?.find((t) => t.id === trackedId);
            if (tf) { sq = tf; isTanker = true; break; }
          }
        }
        if (!sq) { clear(); return; }
        if (isTanker) {
          idEl.textContent = sq.baseName ? `KC-135 (${sq.baseName})` : 'KC-135 Tanker';
          typeEl.textContent = 'TANKER';
          phaseEl.textContent = sq.phase ?? 'En Route';
          const pct = sq.maxFuelKm > 0 ? Math.round((sq.fuelRemainingKm / sq.maxFuelKm) * 100) : 0;
          speedEl.textContent = `${(sq.speedKmH ?? 900).toFixed(0)} km/h`;
          altitudeEl.textContent = '-';
          flightTimeEl.textContent = '-';
          extra1Label.textContent = 'Fuel';
          extra1Value.textContent = `${Math.round(sq.fuelRemainingKm ?? 0).toLocaleString()} km (${pct}%)`;
          extra2Label.textContent = 'Position';
          extra2Value.textContent = `${Math.abs(sq.lat).toFixed(1)}${sq.lat >= 0 ? 'N' : 'S'} ${Math.abs(sq.lon).toFixed(1)}${sq.lon >= 0 ? 'E' : 'W'}`;
        } else {
          const ac = sq.aircraft?.filter((a) => !a.destroyed).length ?? 0;
          phaseEl.textContent = sq.phase ?? sq.leg ?? 'En Route';
          speedEl.textContent = sq.speedKnots ? `${sq.speedKnots.toFixed(0)} kts` : `${(sq.speedKmH ?? 900).toFixed(0)} km/h`;
          altitudeEl.textContent = sq.altitudeFt ? `${(sq.altitudeFt / 1000).toFixed(0)}k ft` : '-';
          flightTimeEl.textContent = formatDuration(sq.flightTimeSeconds ?? 0);
          extra1Label.textContent = 'Aircraft';
          extra1Value.textContent = `${ac}`;
          extra2Label.textContent = 'Position';
          extra2Value.textContent = `${Math.abs(sq.lat).toFixed(1)}${sq.lat >= 0 ? 'N' : 'S'} ${Math.abs(sq.lon).toFixed(1)}${sq.lon >= 0 ? 'E' : 'W'}`;
        }
      } else if (trackedType === 'oilfield') {
        const f = trackedExtra;
        if (!f) { clear(); return; }
        const bpd = f.currentBpd ?? 0;
        const peakBpd = f.peakBpd ?? 0;
        const prodLabel = bpd >= 1e6 ? `${(bpd / 1e6).toFixed(1)}M bpd` : `${Math.round(bpd / 1000).toLocaleString()}K bpd`;
        const peakLabel = peakBpd >= 1e6 ? `${(peakBpd / 1e6).toFixed(1)}M bpd` : `${Math.round(peakBpd / 1000).toLocaleString()}K bpd`;
        phaseEl.textContent = f.type === 'offshore' ? 'Offshore' : 'Onshore';
        speedEl.textContent = prodLabel;
        extra1Label.textContent = 'Peak Output';
        speedEl.parentElement.querySelector('.label').textContent = 'Production';
        altitudeEl.textContent = `${(f.reserves ?? 0).toFixed(1)}B bbl`;
        altitudeEl.parentElement.querySelector('.label').textContent = 'Reserves';
        flightTimeEl.textContent = f.discoveryYear ? String(f.discoveryYear) : '-';
        flightTimeEl.parentElement.querySelector('.label').textContent = 'Discovered';
        extra1Value.textContent = peakLabel;
        extra2Label.textContent = 'Country';
        extra2Value.textContent = f.country ?? '-';
      } else if (trackedType === 'reserve') {
        const oilSim = trackedExtra;
        if (!oilSim) { clear(); return; }
        const fac = oilSim.getReserveFacilities().find((f) => f.id === trackedId);
        if (!fac) { clear(); return; }
        const cs = oilSim.getCountryState(fac.countryIso3);
        if (!cs) { clear(); return; }

        const OIL_PRICE = 78; // $/barrel approximate
        const fmtBbl = (v) => v >= 1e9 ? `${(v/1e9).toFixed(1)}B` : v >= 1e6 ? `${(v/1e6).toFixed(1)}M` : `${Math.round(v/1000)}K`;
        const fmtBpd = (v) => v >= 1e6 ? `${(v/1e6).toFixed(1)}M bpd` : `${Math.round(v/1000)}K bpd`;
        const milPct = cs.militaryCapacity > 0 ? Math.round((cs.militaryFuel / cs.militaryCapacity) * 100) : 0;
        const sprPct = cs.nationalCapacity > 0 ? Math.round((cs.nationalReserves / cs.nationalCapacity) * 100) : 0;
        const reserveValue = Math.round(cs.nationalReserves * OIL_PRICE);
        const fmtUsd = (v) => v >= 1e12 ? `$${(v/1e12).toFixed(1)}T` : v >= 1e9 ? `$${(v/1e9).toFixed(1)}B` : `$${(v/1e6).toFixed(0)}M`;

        const fillRate = cs.sprFillRateBpd ?? 0;
        const fillSign = fillRate >= 0 ? '+' : '';
        const fillLabel = fillRate === 0
          ? 'FULL'
          : `${fillSign}${fmtBpd(Math.abs(fillRate))}`;

        phaseEl.textContent = 'Active';
        speedEl.parentElement.querySelector('.label').textContent = 'Mil. Fuel';
        speedEl.textContent = `${fmtBbl(cs.militaryFuel)} bbl (${milPct}%)`;
        altitudeEl.parentElement.querySelector('.label').textContent = 'Nat. SPR';
        altitudeEl.textContent = `${fmtBbl(cs.nationalReserves)} bbl (${sprPct}%)`;
        flightTimeEl.parentElement.querySelector('.label').textContent = 'SPR Value';
        flightTimeEl.textContent = fmtUsd(reserveValue);
        extra1Label.textContent = 'Production';
        extra1Value.textContent = fmtBpd(cs.dailyProductionBpd);
        extra2Label.textContent = 'Fill Rate';
        extra2Value.textContent = fillLabel;
      } else if (trackedType === 'port') {
        const tradeSim = trackedExtra;
        if (!tradeSim) { clear(); return; }
        const port = tradeSim.getPortById(trackedId);
        if (!port) { clear(); return; }

        const fmtBpd = (v) => v >= 1e6 ? `${(v/1e6).toFixed(1)}M bpd` : `${Math.round(v/1000).toLocaleString()}K bpd`;
        const routes = tradeSim.getRoutes().filter(
          (r) => r.exportPort.id === port.id || r.importPort.id === port.id,
        );
        const disrupted = routes.some((r) => r.disrupted);
        const totalVolume = routes.reduce((sum, r) => sum + r.volumeBpd, 0);

        phaseEl.textContent = disrupted ? 'Disrupted' : 'Active';
        speedEl.parentElement.querySelector('.label').textContent = 'Throughput';
        speedEl.textContent = fmtBpd(port.throughputBpd);
        altitudeEl.parentElement.querySelector('.label').textContent = 'Current Load';
        altitudeEl.textContent = fmtBpd(totalVolume);
        flightTimeEl.parentElement.querySelector('.label').textContent = 'Routes';
        flightTimeEl.textContent = `${routes.length}`;
        extra1Label.textContent = 'Country';
        extra1Value.textContent = port.countryIso3;
        extra2Label.textContent = 'Status';
        extra2Value.textContent = disrupted ? 'BLOCKADED' : 'Operational';
      }
    },
  };

  function clear() {
    trackedType = null;
    trackedId = null;
    trackedExtra = null;
    card.hidden = true;
    // Reset any labels we may have changed
    const labels = { Speed: 'Speed', Altitude: 'Altitude', 'Flight Time': 'Flight Time' };
    for (const [id, defaultLabel] of [['infoSpeed', 'Speed'], ['infoAltitude', 'Altitude'], ['infoFlightTime', 'Flight Time']]) {
      const el = document.getElementById(id);
      if (el?.parentElement) {
        const lbl = el.parentElement.querySelector('.label');
        if (lbl) lbl.textContent = defaultLabel;
      }
    }
  }
}

function formatDuration(totalSeconds) {
  if (!Number.isFinite(totalSeconds)) return '-';
  const rounded = Math.max(Math.round(totalSeconds), 0);
  const minutes = Math.floor(rounded / 60);
  const seconds = rounded % 60;
  return `${minutes}:${`${seconds}`.padStart(2, '0')}`;
}
