import { fetchCountryIdentity } from '../countries/countryService.js';
import {
  getStrategicEconomyByCountryId,
  listStrategicInventoriesByCountryId,
  listStrategicProductionQueuesByCountryId,
  listStrategicResourceProducers,
  listStrategicResourceBaselinesByCountryId,
  listStrategicStockpilesByCountryId,
} from './strategicRepository.js';

export async function fetchStrategicBootstrap(isoCode) {
  const country = await fetchCountryIdentity(isoCode);
  if (!country) {
    const error = new Error('Country not found');
    error.statusCode = 404;
    throw error;
  }

  const [economy, stockpiles, resourceBaselines, inventories, productionQueues, oilProducers] =
    await Promise.all([
      getStrategicEconomyByCountryId(country.id),
      listStrategicStockpilesByCountryId(country.id),
      listStrategicResourceBaselinesByCountryId(country.id),
      listStrategicInventoriesByCountryId(country.id),
      listStrategicProductionQueuesByCountryId(country.id),
      listStrategicResourceProducers('oil'),
    ]);

  if (!economy) {
    const error = new Error(`Strategic bootstrap not configured for ${country.iso3}`);
    error.statusCode = 404;
    throw error;
  }

  return {
    country,
    economy,
    stockpiles,
    resourceBaselines,
    inventories,
    productionQueues,
    foreignProducers: {
      oil: oilProducers.filter((producer) => producer.countryIso3 !== country.iso3),
    },
  };
}
