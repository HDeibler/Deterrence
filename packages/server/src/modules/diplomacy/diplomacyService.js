import { fetchCountryIdentity } from '../countries/countryService.js';
import {
  listAccessAgreements,
  listDiplomaticRelations,
  listImposedSanctions,
  listSanctions,
} from './diplomacyRepository.js';

export async function fetchDiplomacyBootstrap(isoCode) {
  const country = await fetchCountryIdentity(isoCode);
  if (!country) {
    const error = new Error(`Country not found for code: ${isoCode}`);
    error.statusCode = 404;
    throw error;
  }

  const [relations, accessAgreements, sanctionsReceived, sanctionsImposed] = await Promise.all([
    listDiplomaticRelations(country.id),
    listAccessAgreements(country.id),
    listSanctions(country.id),
    listImposedSanctions(country.id),
  ]);

  return {
    country,
    relations,
    accessAgreements,
    sanctionsReceived,
    sanctionsImposed,
  };
}
