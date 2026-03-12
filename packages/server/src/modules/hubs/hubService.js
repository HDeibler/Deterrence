import { fetchCountryIdentity } from '../countries/countryService.js';
import { listHubBases, listTransportAssets, listDeployments } from './hubRepository.js';

export async function fetchHubBootstrap(isoCode) {
  const country = await fetchCountryIdentity(isoCode);
  if (!country) {
    const error = new Error(`Country not found for code: ${isoCode}`);
    error.statusCode = 404;
    throw error;
  }

  const [hubs, transportAssets] = await Promise.all([
    listHubBases(country.id),
    listTransportAssets(country.id),
  ]);

  const deploymentsByHub = await Promise.all(
    hubs.map(async (hub) => {
      const deployments = await listDeployments(hub.id);
      return { ...hub, deployments };
    }),
  );

  return {
    country,
    hubs: deploymentsByHub,
    transportAssets,
  };
}
