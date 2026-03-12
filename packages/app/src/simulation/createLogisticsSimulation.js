import { haversineDistanceKm } from '../world/geo/geoMath.js';

const HOMELAND_COORDS = { lat: 38.9, lon: -77.0 };

const TRANSPORT_SPECS = {
  cargo_plane: { speedKmH: 800, capacityPerUnit: 10 },
  oil_tanker: { speedKmH: 46, capacityPerUnit: 500 },
};

const CAPACITY_SLOT_FOR_ASSET = {
  oil: 'oil_capacity',
  missiles: 'munitions_capacity',
  radar: 'munitions_capacity',
  interceptors: 'munitions_capacity',
  fighters: 'aircraft_capacity',
  cargo_planes: 'aircraft_capacity',
  surface_ships: 'ship_capacity',
  submarines: 'ship_capacity',
};

const TRANSPORT_FOR_ASSET = {
  oil: 'oil_tanker',
  missiles: 'cargo_plane',
  radar: 'cargo_plane',
  interceptors: 'cargo_plane',
  fighters: 'cargo_plane',
  cargo_planes: 'cargo_plane',
  surface_ships: 'oil_tanker',
  submarines: 'oil_tanker',
};

const ASSETS_BY_CAPACITY_SLOT = buildAssetsbyCapacitySlot();

export function createLogisticsSimulation() {
  let state = createInitialState();
  let nextRouteId = 1;

  return {
    step(deltaSeconds) {
      for (const route of state.routes) {
        if (route.status !== 'active') {
          continue;
        }

        const hub = findHub(state.hubs, route.hubId);
        if (!hub) {
          continue;
        }

        const spec = TRANSPORT_SPECS[route.transportType];
        if (!spec) {
          continue;
        }

        const throughputUnitsPerSecond =
          (route.transportCount * spec.capacityPerUnit * spec.speedKmH) /
          (route.routeDistanceKm * 3600);

        const delivered = throughputUnitsPerSecond * deltaSeconds;
        route.pendingDelivery += delivered;

        const wholeUnits = Math.floor(route.pendingDelivery);
        if (wholeUnits >= 1) {
          const capacitySlot = CAPACITY_SLOT_FOR_ASSET[route.assetType];
          const maxCapacity = hub.capacities[capacitySlot] ?? 0;
          const currentInventory = hub.inventory[route.assetType] ?? 0;
          const room = Math.max(maxCapacity - currentInventory, 0);

          if (room <= 0) {
            console.warn(
              `Hub "${hub.name}" (${hub.id}): inventory full for ${route.assetType}, ` +
                `${wholeUnits} units lost`,
            );
            route.pendingDelivery -= wholeUnits;
            continue;
          }

          const accepted = Math.min(wholeUnits, room);
          hub.inventory[route.assetType] = currentInventory + accepted;
          route.deliveredTotal = (route.deliveredTotal ?? 0) + accepted;
          route.pendingDelivery -= accepted;

          if (accepted < wholeUnits) {
            const lost = wholeUnits - accepted;
            console.warn(
              `Hub "${hub.name}" (${hub.id}): capacity reached for ${route.assetType}, ` +
                `${lost} excess units lost`,
            );
            route.pendingDelivery -= lost;
          }
        }
      }
    },

    getSnapshot() {
      return {
        ready: state.ready,
        hubs: state.hubs.map((hub) => ({
          ...hub,
          inventory: { ...hub.inventory },
          capacities: { ...hub.capacities },
          utilizationPercent: calculateUtilization(hub),
        })),
        routes: state.routes.map((route) => ({
          ...route,
          tripProgressPercent: calculateTripProgress(route),
          deliveredTotal: route.deliveredTotal ?? 0,
          throughputPerHour: calculateRouteThroughput(route),
        })),
        transportPool: { ...state.transportPool },
        assignedTransport: { ...state.assignedTransport },
      };
    },

    serializeState() {
      return {
        ready: state.ready,
        hubs: state.hubs.map((hub) => ({
          ...hub,
          inventory: { ...hub.inventory },
          capacities: { ...hub.capacities },
        })),
        routes: state.routes.map((route) => ({ ...route })),
        transportPool: { ...state.transportPool },
        assignedTransport: { ...state.assignedTransport },
        nextRouteId,
      };
    },

    loadState(serialized) {
      state = {
        ready: serialized.ready ?? false,
        hubs: (serialized.hubs ?? []).map(normalizeHub),
        routes: (serialized.routes ?? []).map((route) => ({
          id: route.id,
          hubId: route.hubId,
          assetType: route.assetType,
          quantity: route.quantity ?? 0,
          transportType: route.transportType ?? null,
          transportCount: route.transportCount ?? 0,
          routeDistanceKm: route.routeDistanceKm ?? 0,
          pendingDelivery: route.pendingDelivery ?? 0,
          deliveredTotal: route.deliveredTotal ?? 0,
          status: route.status ?? 'pending',
        })),
        transportPool: {
          cargo_plane: serialized.transportPool?.cargo_plane ?? 0,
          oil_tanker: serialized.transportPool?.oil_tanker ?? 0,
        },
        assignedTransport: {
          cargo_plane: serialized.assignedTransport?.cargo_plane ?? 0,
          oil_tanker: serialized.assignedTransport?.oil_tanker ?? 0,
        },
      };
      nextRouteId = serialized.nextRouteId ?? state.routes.length + 1;
    },

    reset() {
      state = createInitialState();
      nextRouteId = 1;
    },

    setBootstrap(hubData) {
      if (!Array.isArray(hubData?.hubs)) {
        return;
      }

      state.hubs = hubData.hubs.map(normalizeHub);

      if (hubData.transportPool) {
        state.transportPool.cargo_plane =
          Number.isFinite(hubData.transportPool.cargo_plane)
            ? hubData.transportPool.cargo_plane
            : state.transportPool.cargo_plane;
        state.transportPool.oil_tanker =
          Number.isFinite(hubData.transportPool.oil_tanker)
            ? hubData.transportPool.oil_tanker
            : state.transportPool.oil_tanker;
      }

      state.ready = true;
    },

    createHubRoute(hubId, assetType, quantity) {
      const hub = findHub(state.hubs, hubId);
      if (!hub) {
        return { ok: false, reason: `Hub "${hubId}" not found` };
      }

      const capacitySlot = CAPACITY_SLOT_FOR_ASSET[assetType];
      if (!capacitySlot) {
        return { ok: false, reason: `Unknown asset type "${assetType}"` };
      }

      const maxCapacity = hub.capacities[capacitySlot] ?? 0;
      if (maxCapacity <= 0) {
        return {
          ok: false,
          reason: `Hub "${hub.name}" has no ${capacitySlot} capacity for ${assetType}`,
        };
      }

      if (!Number.isFinite(quantity) || quantity <= 0) {
        return { ok: false, reason: 'Quantity must be a positive number' };
      }

      const routeDistanceKm = haversineDistanceKm(
        HOMELAND_COORDS,
        { lat: hub.lat, lon: hub.lon },
      );

      const defaultTransportType = TRANSPORT_FOR_ASSET[assetType] ?? 'cargo_plane';

      const route = {
        id: `route-${nextRouteId}`,
        hubId,
        assetType,
        quantity,
        transportType: defaultTransportType,
        transportCount: 0,
        routeDistanceKm,
        pendingDelivery: 0,
        deliveredTotal: 0,
        status: 'pending',
      };

      nextRouteId += 1;
      state.routes.push(route);
      return { ok: true, route: { ...route } };
    },

    assignTransport(routeId, transportType, count) {
      const route = findRoute(state.routes, routeId);
      if (!route) {
        return { ok: false, reason: `Route "${routeId}" not found` };
      }

      if (!TRANSPORT_SPECS[transportType]) {
        return { ok: false, reason: `Unknown transport type "${transportType}"` };
      }

      if (!Number.isFinite(count) || count <= 0) {
        return { ok: false, reason: 'Count must be a positive number' };
      }

      const intCount = Math.floor(count);
      const available = state.transportPool[transportType] ?? 0;
      if (intCount > available) {
        return {
          ok: false,
          reason: `Not enough ${transportType} available (requested ${intCount}, have ${available})`,
        };
      }

      state.transportPool[transportType] -= intCount;
      state.assignedTransport[transportType] =
        (state.assignedTransport[transportType] ?? 0) + intCount;

      route.transportType = transportType;
      route.transportCount += intCount;

      if (route.transportCount > 0) {
        route.status = 'active';
      }

      return { ok: true, route: { ...route } };
    },

    cancelRoute(routeId) {
      const index = state.routes.findIndex((r) => r.id === routeId);
      if (index === -1) {
        return { ok: false, reason: `Route "${routeId}" not found` };
      }

      const route = state.routes[index];

      if (route.transportCount > 0) {
        state.transportPool[route.transportType] =
          (state.transportPool[route.transportType] ?? 0) + route.transportCount;
        state.assignedTransport[route.transportType] = Math.max(
          (state.assignedTransport[route.transportType] ?? 0) - route.transportCount,
          0,
        );
      }

      state.routes.splice(index, 1);
      return { ok: true };
    },

    getHubInventory(hubId, assetKey) {
      const hub = findHub(state.hubs, hubId);
      if (!hub) {
        return 0;
      }
      return hub.inventory[assetKey] ?? 0;
    },
  };
}

function createInitialState() {
  return {
    ready: false,
    hubs: [],
    routes: [],
    transportPool: {
      cargo_plane: 0,
      oil_tanker: 0,
    },
    assignedTransport: {
      cargo_plane: 0,
      oil_tanker: 0,
    },
  };
}

function findHub(hubs, hubId) {
  return hubs.find((h) => h.id === hubId) ?? null;
}

function findRoute(routes, routeId) {
  return routes.find((r) => r.id === routeId) ?? null;
}

function calculateUtilization(hub) {
  const slots = Object.keys(hub.capacities);
  if (slots.length === 0) {
    return 0;
  }

  let totalCapacity = 0;
  let totalUsed = 0;

  for (const slot of slots) {
    const capacity = hub.capacities[slot] ?? 0;
    if (capacity <= 0) {
      continue;
    }
    totalCapacity += capacity;
    for (const assetKey of ASSETS_BY_CAPACITY_SLOT[slot] ?? []) {
      totalUsed += hub.inventory[assetKey] ?? 0;
    }
  }

  if (totalCapacity === 0) {
    return 0;
  }

  return Math.round((totalUsed / totalCapacity) * 100);
}

function normalizeHub(hub) {
  return {
    id: hub.id,
    name: hub.name ?? '',
    countryIso3: hub.countryIso3 ?? '',
    hubType: hub.hubType ?? 'forward',
    lat: hub.lat ?? 0,
    lon: hub.lon ?? 0,
    capacities: hub.capacities ?? {},
    inventory: hub.inventory ?? {},
  };
}

function buildAssetsbyCapacitySlot() {
  const map = {};
  for (const [asset, slot] of Object.entries(CAPACITY_SLOT_FOR_ASSET)) {
    if (!map[slot]) {
      map[slot] = [];
    }
    map[slot].push(asset);
  }
  return map;
}

function calculateTripProgress(route) {
  if (route.status !== 'active' || route.routeDistanceKm <= 0) {
    return 0;
  }

  const spec = TRANSPORT_SPECS[route.transportType];
  if (!spec || route.transportCount <= 0) {
    return 0;
  }

  const roundTripKm = route.routeDistanceKm * 2;
  const roundTripHours = roundTripKm / spec.speedKmH;
  const deliveredPerTrip = route.transportCount * spec.capacityPerUnit;

  if (deliveredPerTrip <= 0) {
    return 0;
  }

  const totalTrips = (route.deliveredTotal ?? 0) / deliveredPerTrip;
  const fractionalTrip = totalTrips - Math.floor(totalTrips);
  const tripPhaseHours = fractionalTrip * roundTripHours;
  const oneWayHours = roundTripHours / 2;

  if (tripPhaseHours <= oneWayHours) {
    return Math.round((tripPhaseHours / oneWayHours) * 100);
  }

  return Math.round(((roundTripHours - tripPhaseHours) / oneWayHours) * 100);
}

function calculateRouteThroughput(route) {
  if (route.status !== 'active') {
    return 0;
  }

  const spec = TRANSPORT_SPECS[route.transportType];
  if (!spec || route.transportCount <= 0 || route.routeDistanceKm <= 0) {
    return 0;
  }

  const roundTripHours = (route.routeDistanceKm * 2) / spec.speedKmH;
  if (roundTripHours <= 0) {
    return 0;
  }

  return (route.transportCount * spec.capacityPerUnit) / roundTripHours;
}
