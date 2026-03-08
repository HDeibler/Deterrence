import {
  getCountryByIsoCode,
  getCountryIdentityByIsoCode,
  listCountries,
  listCountryDirectory,
} from './countryRepository.js';

export async function fetchCountries({ limit, offset }) {
  return listCountries({ limit, offset });
}

export async function fetchCountryDirectory() {
  return listCountryDirectory();
}

export async function fetchCountry(isoCode) {
  return getCountryByIsoCode(isoCode);
}

export async function fetchCountryIdentity(isoCode) {
  return getCountryIdentityByIsoCode(isoCode);
}
