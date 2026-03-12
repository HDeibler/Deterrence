import { renderPlaceholder } from './renderPlaceholder.js';

export function createLogisticsHudController({ document }) {
  const hubListNode = document.getElementById('logisticsHubList');
  const routeListNode = document.getElementById('logisticsRouteList');
  const transportPoolNode = document.getElementById('logisticsTransportPool');
  const deploymentListNode = document.getElementById('logisticsDeploymentList');
  const summaryNode = document.getElementById('logisticsSummaryLabel');
  let lastSignature = '';

  return {
    onHubAction(handler) {
      const delegate = (event) => {
        const button = event.target.closest('[data-hub-action]');
        if (!button) return;
        handler({
          action: button.dataset.hubAction,
          hubId: button.dataset.hubId,
          assetType: button.dataset.assetType,
        });
      };
      if (hubListNode) hubListNode.addEventListener('click', delegate);
      return () => {
        if (hubListNode) hubListNode.removeEventListener('click', delegate);
      };
    },

    onRouteAction(handler) {
      const delegate = (event) => {
        const button = event.target.closest('[data-route-action]');
        if (!button) return;
        handler({
          action: button.dataset.routeAction,
          routeId: button.dataset.routeId,
        });
      };
      if (routeListNode) routeListNode.addEventListener('click', delegate);
      return () => {
        if (routeListNode) routeListNode.removeEventListener('click', delegate);
      };
    },

    onDeploymentAction(handler) {
      const delegate = (event) => {
        const button = event.target.closest('[data-deployment-action]');
        if (!button) return;
        handler({
          action: button.dataset.deploymentAction,
          deploymentId: button.dataset.deploymentId,
          hubId: button.dataset.hubId,
          baseId: button.dataset.baseId,
        });
      };
      if (deploymentListNode) deploymentListNode.addEventListener('click', delegate);
      return () => {
        if (deploymentListNode) deploymentListNode.removeEventListener('click', delegate);
      };
    },

    render(snapshot) {
      if (!hubListNode) return;
      const signature = JSON.stringify(snapshot);
      if (signature === lastSignature) return;
      lastSignature = signature;

      if (summaryNode) {
        const hubCount = snapshot.hubs?.length ?? 0;
        const activeRoutes = snapshot.routes?.filter((r) => r.status === 'active').length ?? 0;
        summaryNode.textContent =
          hubCount > 0 ? `${hubCount} hub${hubCount !== 1 ? 's' : ''}, ${activeRoutes} active route${activeRoutes !== 1 ? 's' : ''}` : 'No logistics hubs';
      }

      hubListNode.innerHTML =
        snapshot.hubs?.length > 0
          ? snapshot.hubs.map(renderHubRow).join('')
          : renderPlaceholder('No hub bases established');

      if (routeListNode) {
        routeListNode.innerHTML =
          snapshot.routes?.length > 0
            ? snapshot.routes.map(renderRouteRow).join('')
            : renderPlaceholder('No active logistics routes');
      }

      if (transportPoolNode) {
        const pool = snapshot.transportPool ?? {};
        transportPoolNode.innerHTML = Object.entries(pool)
          .map(([type, count]) => `<span>${formatTransportType(type)}: ${count}</span>`)
          .join('');
      }

      if (deploymentListNode) {
        deploymentListNode.innerHTML =
          snapshot.deployments?.length > 0
            ? snapshot.deployments.map(renderDeploymentRow).join('')
            : renderPlaceholder('No active deployments');
      }
    },
  };
}

function renderHubRow(hub) {
  const latDir = hub.lat >= 0 ? 'N' : 'S';
  const lonDir = hub.lon >= 0 ? 'E' : 'W';
  const coords = `${Math.abs(hub.lat).toFixed(1)}\u00B0${latDir} ${Math.abs(hub.lon).toFixed(1)}\u00B0${lonDir}`;
  const utilization = Math.round(hub.utilizationPercent ?? 0);

  return `
    <article class="strategic-row">
      <header>
        <strong>${hub.name}</strong>
        <span>${hub.hubType.replace(/_/g, ' ')}</span>
      </header>
      <p>${utilization}% utilized</p>
      <small>${hub.countryIso3} \u00B7 ${coords}</small>
      <div class="strategic-inline-actions">
        <button class="strategic-inline-button" type="button"
          data-hub-action="create-route" data-hub-id="${hub.id}">New Route</button>
        <button class="strategic-inline-button" type="button"
          data-hub-action="deploy" data-hub-id="${hub.id}">Deploy</button>
      </div>
    </article>
  `;
}

function renderRouteRow(route) {
  const statusLabel = route.status === 'active' ? 'Active' : route.status.replace(/_/g, ' ');
  return `
    <article class="strategic-row">
      <header>
        <strong>${route.originName} \u2192 ${route.destinationName}</strong>
        <span>${statusLabel}</span>
      </header>
      <p>${route.assetType.replace(/_/g, ' ')} \u00B7 ${route.distanceKm?.toFixed(0) ?? '?'} km</p>
      <div class="strategic-inline-actions">
        <button class="strategic-inline-button" type="button"
          data-route-action="suspend" data-route-id="${route.id}">Suspend</button>
        <button class="strategic-inline-button" type="button"
          data-route-action="cancel" data-route-id="${route.id}">Cancel</button>
      </div>
    </article>
  `;
}

function renderDeploymentRow(deployment) {
  const progress = Math.round(deployment.progressPercent ?? 0);
  return `
    <article class="strategic-row">
      <header>
        <strong>${deployment.unitName}</strong>
        <span>${progress}%</span>
      </header>
      <p>${deployment.originHub} \u2192 ${deployment.destinationBase}</p>
      <div class="strategic-inline-actions">
        <button class="strategic-inline-button" type="button"
          data-deployment-action="cancel" data-deployment-id="${deployment.id}"
          data-hub-id="${deployment.hubId}" data-base-id="${deployment.baseId}">Cancel</button>
      </div>
    </article>
  `;
}

function formatTransportType(type) {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
