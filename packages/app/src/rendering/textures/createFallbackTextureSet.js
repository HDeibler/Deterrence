import * as THREE from 'three';

const TWO_PI = Math.PI * 2;

export function createFallbackTextureSet({ renderer }) {
  const surfaceCanvas = document.createElement('canvas');
  const detailCanvas = document.createElement('canvas');
  const bumpCanvas = document.createElement('canvas');
  const roughnessCanvas = document.createElement('canvas');
  const cloudCanvas = document.createElement('canvas');
  const nightCanvas = document.createElement('canvas');
  const moonCanvas = document.createElement('canvas');
  const moonBumpCanvas = document.createElement('canvas');
  const width = 2048;
  const height = 1024;

  [
    surfaceCanvas,
    detailCanvas,
    bumpCanvas,
    roughnessCanvas,
    cloudCanvas,
    nightCanvas,
    moonCanvas,
    moonBumpCanvas,
  ].forEach((canvas) => {
    canvas.width = width;
    canvas.height = height;
  });

  paintEarth(surfaceCanvas, detailCanvas, bumpCanvas, roughnessCanvas, cloudCanvas, nightCanvas);
  paintMoon(moonCanvas, moonBumpCanvas);

  return {
    surface: toTexture({ renderer, canvas: surfaceCanvas }),
    detail: toTexture({ renderer, canvas: detailCanvas }),
    bump: toTexture({ renderer, canvas: bumpCanvas, isColor: false }),
    roughness: toTexture({ renderer, canvas: roughnessCanvas, isColor: false }),
    clouds: toTexture({ renderer, canvas: cloudCanvas, isColor: false }),
    night: toTexture({ renderer, canvas: nightCanvas }),
    moon: toTexture({ renderer, canvas: moonCanvas }),
    moonBump: toTexture({ renderer, canvas: moonBumpCanvas, isColor: false }),
  };
}

function paintEarth(
  surfaceCanvas,
  detailCanvas,
  bumpCanvas,
  roughnessCanvas,
  cloudCanvas,
  nightCanvas,
) {
  const surfaceCtx = surfaceCanvas.getContext('2d');
  const detailCtx = detailCanvas.getContext('2d');
  const bumpCtx = bumpCanvas.getContext('2d');
  const roughnessCtx = roughnessCanvas.getContext('2d');
  const cloudCtx = cloudCanvas.getContext('2d');
  const nightCtx = nightCanvas.getContext('2d');
  const { width, height } = surfaceCanvas;

  const surfaceImage = surfaceCtx.createImageData(width, height);
  const detailImage = detailCtx.createImageData(width, height);
  const bumpImage = bumpCtx.createImageData(width, height);
  const roughnessImage = roughnessCtx.createImageData(width, height);
  const cloudImage = cloudCtx.createImageData(width, height);
  const nightImage = nightCtx.createImageData(width, height);

  const citySeeds = [
    [-74.0, 40.7, 1.0],
    [-118.2, 34.0, 0.8],
    [-87.6, 41.8, 0.72],
    [-46.6, -23.5, 0.82],
    [-0.1, 51.5, 0.95],
    [2.35, 48.86, 0.82],
    [28.97, 41.0, 0.78],
    [31.2, 30.0, 0.76],
    [72.8, 19.0, 0.92],
    [77.1, 28.7, 0.95],
    [116.4, 39.9, 0.96],
    [121.5, 31.2, 1.0],
    [139.7, 35.6, 1.0],
    [151.2, -33.8, 0.7],
    [18.4, -33.9, 0.55],
  ];

  for (let y = 0; y < height; y += 1) {
    const v = y / (height - 1);
    const lat = (0.5 - v) * Math.PI;
    for (let x = 0; x < width; x += 1) {
      const u = x / (width - 1);
      const lon = (u - 0.5) * TWO_PI;
      const idx = (y * width + x) * 4;
      const land = continentMask(lon, lat);
      const ridges = fbm(lon * 1.7, lat * 2.1, 5, 0.56, 2.15);
      const mountainNoise = fbm(lon * 5.2 + 4.1, lat * 5.0 - 1.7, 4, 0.52, 2.4);
      const oceanNoise = fbm(lon * 3.4, lat * 3.4, 4, 0.6, 2.1);
      const elevation = THREE.MathUtils.clamp(
        land * 0.9 + ridges * 0.32 + mountainNoise * 0.18,
        0,
        1,
      );
      const moisture = fbm(lon * 2.3 - 3, lat * 2.8 + 5, 4, 0.55, 2.02);
      const coast = smoothstep(0.35, 0.52, land) - smoothstep(0.52, 0.7, land);
      const ice = smoothstep(0.74, 0.94, Math.abs(Math.sin(lat)));

      const oceanColor = mixColor(
        [7, 32, 84],
        [32, 108, 170],
        THREE.MathUtils.clamp(0.2 + oceanNoise * 0.8 + Math.abs(lat) / 2.5, 0, 1),
      );

      let color = oceanColor;
      if (land > 0.34) {
        const tropical = 1 - Math.min(Math.abs(lat) / 1.25, 1);
        const arid = THREE.MathUtils.clamp(1 - moisture * 1.15, 0, 1) * tropical;
        const vegetation = THREE.MathUtils.clamp(
          moisture * 0.9 + tropical * 0.3 - elevation * 0.18,
          0,
          1,
        );
        const rock = THREE.MathUtils.clamp(elevation * 1.1 + mountainNoise * 0.25, 0, 1);

        color = blendColors([95, 128, 72], [48, 100, 56], vegetation);
        color = blendColors(color, [161, 140, 92], arid * 0.7);
        color = blendColors(color, [120, 115, 108], rock * 0.58);
        color = blendColors(
          color,
          [244, 246, 250],
          ice * 0.9 + smoothstep(0.78, 0.95, elevation) * 0.45,
        );
        color = blendColors(color, [161, 213, 180], coast * 0.35);
      }

      writePixel(surfaceImage.data, idx, [...color, 255]);

      const detailStrength = THREE.MathUtils.clamp(
        land * 0.75 + ridges * 0.55 + coast * 0.95,
        0,
        1,
      );
      writePixel(detailImage.data, idx, [
        Math.round(80 + detailStrength * 130),
        Math.round(110 + detailStrength * 110),
        Math.round(90 + detailStrength * 100),
        Math.round(detailStrength * 255),
      ]);

      const bump = Math.round(20 + elevation * 180 + ice * 35);
      writePixel(bumpImage.data, idx, [bump, bump, bump, 255]);

      const roughness = Math.round(120 + land * 40 + ice * 30 - oceanNoise * 20);
      writePixel(roughnessImage.data, idx, [roughness, roughness, roughness, 255]);

      const cloudNoise = fbm(lon * 4.1 + 10, lat * 8.2 - 3, 5, 0.56, 2.12);
      const cyclonic = Math.sin((lon + lat * 0.6) * 6 + cloudNoise * 6) * 0.5 + 0.5;
      const cloudAlpha = Math.round(
        255 *
          THREE.MathUtils.clamp(
            smoothstep(0.58, 0.82, cloudNoise) * 0.85 + cyclonic * 0.12,
            0,
            0.92,
          ),
      );
      writePixel(cloudImage.data, idx, [255, 255, 255, cloudAlpha]);

      const cityIntensity = citySeeds.reduce((max, [cityLon, cityLat, power]) => {
        const dLon = shortestAngle(lon - THREE.MathUtils.degToRad(cityLon));
        const dLat = lat - THREE.MathUtils.degToRad(cityLat);
        const spread = Math.exp(-(dLon * dLon * 24 + dLat * dLat * 34));
        return Math.max(max, spread * power);
      }, 0);
      const nightAlpha = Math.round(
        255 * THREE.MathUtils.clamp(cityIntensity * smoothstep(0.42, 0.75, land), 0, 1),
      );
      writePixel(nightImage.data, idx, [
        255,
        180 + Math.round(cityIntensity * 55),
        90 + Math.round(cityIntensity * 40),
        nightAlpha,
      ]);
    }
  }

  surfaceCtx.putImageData(surfaceImage, 0, 0);
  detailCtx.putImageData(detailImage, 0, 0);
  bumpCtx.putImageData(bumpImage, 0, 0);
  roughnessCtx.putImageData(roughnessImage, 0, 0);
  cloudCtx.putImageData(cloudImage, 0, 0);
  nightCtx.putImageData(nightImage, 0, 0);
}

function paintMoon(surfaceCanvas, bumpCanvas) {
  const surfaceCtx = surfaceCanvas.getContext('2d');
  const bumpCtx = bumpCanvas.getContext('2d');
  const { width, height } = surfaceCanvas;
  const surfaceImage = surfaceCtx.createImageData(width, height);
  const bumpImage = bumpCtx.createImageData(width, height);

  for (let y = 0; y < height; y += 1) {
    const v = y / (height - 1);
    const lat = (0.5 - v) * Math.PI;
    for (let x = 0; x < width; x += 1) {
      const u = x / (width - 1);
      const lon = (u - 0.5) * TWO_PI;
      const idx = (y * width + x) * 4;
      const base = fbm(lon * 6.2, lat * 6.2, 5, 0.58, 2.14);
      const craters = craterField(lon, lat);
      const shade = Math.round(145 + base * 48 - craters * 40);
      writePixel(surfaceImage.data, idx, [shade, shade, shade + 6, 255]);

      const bump = Math.round(110 + base * 60 + craters * 90);
      writePixel(bumpImage.data, idx, [bump, bump, bump, 255]);
    }
  }

  surfaceCtx.putImageData(surfaceImage, 0, 0);
  bumpCtx.putImageData(bumpImage, 0, 0);
}

function craterField(lon, lat) {
  const craterSeeds = [
    [0.4, 0.2, 0.11],
    [-1.2, -0.4, 0.08],
    [1.6, 0.8, 0.1],
    [-2.0, 0.5, 0.06],
    [2.4, -0.7, 0.09],
    [-0.5, 1.0, 0.07],
  ];

  return craterSeeds.reduce((sum, [seedLon, seedLat, radius]) => {
    const dLon = shortestAngle(lon - seedLon);
    const dLat = lat - seedLat;
    const dist = Math.sqrt(dLon * dLon + dLat * dLat);
    return sum + Math.exp(-Math.pow(dist / radius, 2)) * 0.9;
  }, 0);
}

function continentMask(lon, lat) {
  const blobs = [
    [-1.75, 0.12, 0.95, 0.55, 1.0],
    [-1.25, -0.38, 0.7, 0.62, 0.95],
    [0.18, 0.44, 0.6, 0.3, 0.78],
    [0.28, 0.12, 0.48, 0.55, 0.82],
    [1.3, 0.52, 1.18, 0.54, 1.0],
    [1.8, 0.22, 0.8, 0.4, 0.92],
    [2.35, -0.42, 0.46, 0.25, 0.88],
    [0.95, -0.82, 0.33, 0.13, 0.4],
  ];

  let total = 0;
  for (const [blobLon, blobLat, lonRadius, latRadius, weight] of blobs) {
    const dx = shortestAngle(lon - blobLon) / lonRadius;
    const dy = (lat - blobLat) / latRadius;
    total += Math.exp(-(dx * dx + dy * dy) * 2.1) * weight;
  }

  const breakup = fbm(lon * 2.1 + 4.4, lat * 2.1 - 1.3, 4, 0.57, 2.08);
  return THREE.MathUtils.clamp(total * 0.7 + breakup * 0.35, 0, 1);
}

function fbm(x, y, octaves, persistence, lacunarity) {
  let amplitude = 1;
  let frequency = 1;
  let sum = 0;
  let normalizer = 0;

  for (let octave = 0; octave < octaves; octave += 1) {
    sum += amplitude * valueNoise(x * frequency, y * frequency);
    normalizer += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }

  return sum / normalizer;
}

function valueNoise(x, y) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = x - x0;
  const ty = y - y0;
  const a = hash2D(x0, y0);
  const b = hash2D(x0 + 1, y0);
  const c = hash2D(x0, y0 + 1);
  const d = hash2D(x0 + 1, y0 + 1);
  const ux = tx * tx * (3 - 2 * tx);
  const uy = ty * ty * (3 - 2 * ty);

  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a, b, ux), THREE.MathUtils.lerp(c, d, ux), uy);
}

function hash2D(x, y) {
  const sample = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return sample - Math.floor(sample);
}

function toTexture({ renderer, canvas, isColor = true }) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

function mixColor(a, b, amount) {
  return [
    Math.round(THREE.MathUtils.lerp(a[0], b[0], amount)),
    Math.round(THREE.MathUtils.lerp(a[1], b[1], amount)),
    Math.round(THREE.MathUtils.lerp(a[2], b[2], amount)),
  ];
}

function blendColors(base, overlay, amount) {
  return [
    Math.round(THREE.MathUtils.lerp(base[0], overlay[0], amount)),
    Math.round(THREE.MathUtils.lerp(base[1], overlay[1], amount)),
    Math.round(THREE.MathUtils.lerp(base[2], overlay[2], amount)),
  ];
}

function smoothstep(min, max, value) {
  const x = THREE.MathUtils.clamp((value - min) / (max - min), 0, 1);
  return x * x * (3 - 2 * x);
}

function shortestAngle(angle) {
  let wrapped = angle % TWO_PI;
  if (wrapped > Math.PI) wrapped -= TWO_PI;
  if (wrapped < -Math.PI) wrapped += TWO_PI;
  return wrapped;
}

function writePixel(target, index, [r, g, b, a]) {
  target[index] = r;
  target[index + 1] = g;
  target[index + 2] = b;
  target[index + 3] = a;
}
