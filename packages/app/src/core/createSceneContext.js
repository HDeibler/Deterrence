import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export function createSceneContext({ mountNode, window, worldConfig, renderConfig }) {
  const initialPosition = new THREE.Vector3().fromArray(renderConfig.camera.initialPosition);
  const initialTarget = new THREE.Vector3(0, 0, 0);
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  mountNode.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(renderConfig.scene.fogColor, renderConfig.scene.fogDensity);

  const camera = new THREE.PerspectiveCamera(
    renderConfig.camera.fov,
    window.innerWidth / window.innerHeight,
    renderConfig.camera.near,
    renderConfig.camera.far,
  );
  camera.position.fromArray(renderConfig.camera.initialPosition);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = renderConfig.controls.enableDamping;
  controls.dampingFactor = renderConfig.controls.dampingFactor;
  controls.minDistance = worldConfig.earthRadius * renderConfig.controls.minDistanceMultiplier;
  controls.maxDistance = renderConfig.controls.maxDistance;
  controls.zoomSpeed = renderConfig.controls.zoomSpeed;
  controls.rotateSpeed = renderConfig.controls.rotateSpeed;
  controls.panSpeed = renderConfig.controls.panSpeed;
  controls.target.copy(initialTarget);

  return {
    scene,
    camera,
    controls,
    renderer,
    resize(width, height) {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    },
    resetView() {
      camera.position.copy(initialPosition);
      controls.target.copy(initialTarget);
      controls.update();
    },
  };
}
