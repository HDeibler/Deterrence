import * as THREE from 'three';
import { createStarfield } from '../../rendering/createStarfield.js';

export function createSpaceEnvironment({ scene, renderConfig }) {
  const ambientLight = new THREE.AmbientLight(
    renderConfig.lighting.ambientColor,
    renderConfig.lighting.ambientIntensity,
  );
  scene.add(ambientLight);

  const hemisphereLight = new THREE.HemisphereLight(
    renderConfig.lighting.hemisphereSkyColor,
    renderConfig.lighting.hemisphereGroundColor,
    renderConfig.lighting.hemisphereIntensity,
  );
  scene.add(hemisphereLight);

  const sunLight = new THREE.DirectionalLight(
    renderConfig.lighting.sunColor,
    renderConfig.lighting.sunIntensity,
  );
  sunLight.position.fromArray(renderConfig.lighting.sunPosition);
  scene.add(sunLight);

  const nightFillLight = new THREE.DirectionalLight(
    renderConfig.lighting.nightFillColor,
    renderConfig.lighting.nightFillIntensity,
  );
  nightFillLight.position.copy(sunLight.position).multiplyScalar(-0.35);
  scene.add(nightFillLight);

  const sunGlow = new THREE.Mesh(
    new THREE.SphereGeometry(renderConfig.lighting.sunGlowRadius, 32, 32),
    new THREE.MeshBasicMaterial({
      color: renderConfig.lighting.sunGlowColor,
      transparent: true,
      opacity: renderConfig.lighting.sunGlowOpacity,
    }),
  );
  sunGlow.position.copy(sunLight.position);
  scene.add(sunGlow);

  const stars = createStarfield(renderConfig.stars);
  scene.add(stars);

  return { ambientLight, hemisphereLight, sunLight, nightFillLight, sunGlow, stars };
}
