/**
 * Backwards-compat shim. The real widget now lives at
 * `src/components/mesh-controller/MeshController.tsx` and is rebranded
 * as the "Mesh Controller". Existing imports keep working unchanged.
 */
export { default, type TransformData, type CropBaseUI } from "./mesh-controller/MeshController";