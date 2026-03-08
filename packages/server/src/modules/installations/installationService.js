import { listMilitaryInstallations } from './installationRepository.js';

export async function fetchMilitaryInstallations(options) {
  return listMilitaryInstallations(options);
}
