import * as THREE from 'three';
import { createAtmosphereMaterial } from '../../rendering/materials/createAtmosphereMaterial.js';

export function createEarthSystem({ textures, worldConfig, renderConfig, sunDirection }) {
  const group = new THREE.Group();
  const earthMaterialOptions = {
    map: textures.surface,
    roughness: 0.96,
    metalness: 0.01,
    emissiveMap: textures.night,
    emissive: new THREE.Color(0xf6b766),
    emissiveIntensity: 0.24,
  };

  if (textures.normal) {
    earthMaterialOptions.normalMap = textures.normal;
    earthMaterialOptions.normalScale = new THREE.Vector2(0.45, 0.45);
  } else if (textures.bump) {
    earthMaterialOptions.bumpMap = textures.bump;
    earthMaterialOptions.bumpScale = 0.028;
  }

  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(worldConfig.earthRadius, 288, 288),
    new THREE.MeshStandardMaterial(earthMaterialOptions),
  );

  const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(worldConfig.earthRadius * 1.014, 192, 192),
    new THREE.MeshStandardMaterial({
      map: textures.clouds,
      alphaMap: textures.clouds,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
      roughness: 0.95,
    }),
  );

  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(
      worldConfig.earthRadius * renderConfig.atmosphere.radiusMultiplier,
      160,
      160,
    ),
    createAtmosphereMaterial({ color: renderConfig.atmosphere.color, sunDirection }),
  );

  group.add(earth, clouds, atmosphere);
  return { group, earth, clouds, atmosphere };
}
