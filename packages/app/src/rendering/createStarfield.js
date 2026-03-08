import * as THREE from 'three';

const TWO_PI = Math.PI * 2;

export function createStarfield({ count, radius, size, opacity }) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const color = new THREE.Color();

  for (let index = 0; index < count; index += 1) {
    const distance = radius * (0.35 + Math.random() * 0.65);
    const theta = Math.random() * TWO_PI;
    const phi = Math.acos(2 * Math.random() - 1);

    positions[index * 3] = distance * Math.sin(phi) * Math.cos(theta);
    positions[index * 3 + 1] = distance * Math.cos(phi);
    positions[index * 3 + 2] = distance * Math.sin(phi) * Math.sin(theta);

    color.setHSL(0.56 + Math.random() * 0.08, 0.45, 0.7 + Math.random() * 0.25);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      size,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity,
      depthWrite: false,
    }),
  );
}
