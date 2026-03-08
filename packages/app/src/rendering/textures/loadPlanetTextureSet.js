import * as THREE from 'three';
import { textureConfig } from '../../config/textureConfig.js';
import { createFallbackTextureSet } from './createFallbackTextureSet.js';

export async function loadPlanetTextureSet({ renderer }) {
  const { earth, moon } = textureConfig;
  const fallback = createFallbackTextureSet({ renderer });
  const [earthSurface, earthNormal, earthNight, earthClouds, moonSurface, moonBump] =
    await Promise.all([
      loadTextureWithFallback({
        renderer,
        url: earth.surface,
        fallbackTexture: fallback.surface,
        label: 'earth surface',
      }),
      loadTextureWithFallback({
        renderer,
        url: earth.normal,
        isColor: false,
        fallbackTexture: fallback.bump,
        label: 'earth normal',
      }),
      loadTextureWithFallback({
        renderer,
        url: earth.night,
        fallbackTexture: fallback.night,
        label: 'earth night',
      }),
      loadTextureWithFallback({
        renderer,
        url: earth.clouds,
        fallbackTexture: fallback.clouds,
        label: 'earth clouds',
      }),
      loadTextureWithFallback({
        renderer,
        url: moon.surface,
        fallbackTexture: fallback.moon,
        label: 'moon surface',
      }),
      loadTextureWithFallback({
        renderer,
        url: moon.bump,
        isColor: false,
        fallbackTexture: fallback.moonBump,
        label: 'moon bump',
      }),
    ]);

  return {
    surface: earthSurface,
    detail: null,
    normal: earthNormal,
    clouds: createCloudAlphaTexture({ renderer, sourceTexture: earthClouds }),
    night: earthNight,
    maxAnisotropy: renderer.capabilities.getMaxAnisotropy(),
    moon: moonSurface,
    moonBump,
  };
}

function loadTexture({ renderer, url, isColor = true }) {
  const loader = new THREE.TextureLoader();

  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (texture) => {
        texture.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        resolve(texture);
      },
      undefined,
      reject,
    );
  });
}

async function loadTextureWithFallback({ renderer, url, isColor = true, fallbackTexture, label }) {
  try {
    return await loadTexture({ renderer, url, isColor });
  } catch (error) {
    console.warn(`Falling back for ${label}: ${url}`, error);
    return fallbackTexture;
  }
}

function createCloudAlphaTexture({ renderer, sourceTexture }) {
  const sourceImage = sourceTexture.image;
  const canvas = document.createElement('canvas');
  canvas.width = sourceImage.width;
  canvas.height = sourceImage.height;

  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(sourceImage, 0, 0);

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let index = 0; index < imageData.data.length; index += 4) {
    const luminance =
      (imageData.data[index] * 0.2126 +
        imageData.data[index + 1] * 0.7152 +
        imageData.data[index + 2] * 0.0722) /
      255;
    const alpha = Math.round(Math.max(luminance - 0.35, 0) * 255);
    imageData.data[index] = 255;
    imageData.data[index + 1] = 255;
    imageData.data[index + 2] = 255;
    imageData.data[index + 3] = alpha;
  }

  context.putImageData(imageData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}
