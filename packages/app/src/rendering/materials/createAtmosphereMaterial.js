import * as THREE from 'three';

export function createAtmosphereMaterial({ color, sunDirection }) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    uniforms: {
      glowColor: { value: new THREE.Color(color) },
      sunDirection: { value: sunDirection.clone().normalize() },
    },
    vertexShader: `
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 glowColor;
      uniform vec3 sunDirection;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;
      void main() {
        vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
        float viewDot = max(dot(vWorldNormal, viewDirection), 0.0);
        float rim = smoothstep(0.18, 0.92, 1.0 - viewDot);
        rim *= rim;
        float daylight = smoothstep(-0.12, 0.28, dot(vWorldNormal, normalize(sunDirection)));
        float alpha = rim * mix(0.018, 0.12, daylight);
        gl_FragColor = vec4(glowColor, alpha);
      }
    `,
  });
}
