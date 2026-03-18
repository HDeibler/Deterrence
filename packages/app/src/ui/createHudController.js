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

  let trackedType = null; // 'icbm' | 'interceptor'
  let trackedId = null;
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
        idEl.textContent = `Missile #${m.id}`;
        phaseEl.textContent = m.stageLabel ?? m.phase ?? '-';
        speedEl.textContent = `${m.speedKmS.toFixed(1)} km/s`;
        altitudeEl.textContent = `${m.altitudeKm.toFixed(0)} km`;
        flightTimeEl.textContent = formatDuration(m.flightTimeSeconds);
        extra1Label.textContent = 'Range To Target';
        extra1Value.textContent = Number.isFinite(m.rangeToTargetKm)
          ? `${m.rangeToTargetKm.toFixed(0)} km`
          : '-';
        extra2Label.textContent = 'Apogee';
        extra2Value.textContent = `${m.apogeeKm.toFixed(0)} km`;
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
      }
    },
  };

  function clear() {
    trackedType = null;
    trackedId = null;
    card.hidden = true;
  }
}

function formatDuration(totalSeconds) {
  if (!Number.isFinite(totalSeconds)) return '-';
  const rounded = Math.max(Math.round(totalSeconds), 0);
  const minutes = Math.floor(rounded / 60);
  const seconds = rounded % 60;
  return `${minutes}:${`${seconds}`.padStart(2, '0')}`;
}
