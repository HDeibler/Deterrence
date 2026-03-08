import * as THREE from 'three';

export function createPointerController({
  renderer,
  camera,
  earthMesh,
  radarVisualSystem,
  missileOverlay,
}) {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  return {
    getTargetFromPointer(event) {
      syncPointer(event);
      const intersections = raycaster.intersectObject(earthMesh, false);
      const hit = intersections[0];
      if (!hit?.point) {
        return null;
      }
      return missileOverlay.getTargetFromPoint(hit.point);
    },
    pickGeoSlotFromPointer(event) {
      syncPointer(event);
      const intersections = raycaster.intersectObjects(
        radarVisualSystem.getGeoSlotPickers(),
        false,
      );
      const hit = intersections[0];
      return hit?.object?.userData?.geoSlot ?? null;
    },
  };

  function syncPointer(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    raycaster.setFromCamera(pointer, camera);
  }
}
