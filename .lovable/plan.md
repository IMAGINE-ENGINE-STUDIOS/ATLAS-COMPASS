

## 3D Model Transform Widget (Double-Click to Edit)

### What it does
When a user double-clicks on a placed 3D model in the Atlas, a transform widget appears allowing them to adjust position (XYZ), rotation (heading/pitch/roll), and scale, plus a snap-to-ground button. Currently, single-click-drag moves models, but there is no way to rotate, scale, or precisely position them after placement.

### Current behavior
- **LEFT_DOWN** on a model starts drag mode (repositioning only)
- **LEFT_DOUBLE_CLICK** dispatches `cesium-dblclick` which either creates a POI or opens model placement dialog -- it does NOT detect if a model was double-clicked
- `PlacedModel` stores: id, name, fileName, lat, lng, alt, heading, scale, createdAt
- Models are placed with `heightReference: CLAMP_TO_GROUND` and orientation via `HeadingPitchRollQuaternion`

### Plan

#### 1. Add state for selected model editing
- New state: `editingModel: PlacedModel | null` -- when set, shows the transform widget
- New state: `editRotation: {heading, pitch, roll}`, `editScale: number`, `editPosition: {lat, lng, alt}`

#### 2. Detect double-click on model entities
In the existing `LEFT_DOUBLE_CLICK` handler (line ~970), before dispatching `cesium-dblclick`, check if the clicked entity is a model (id starts with `model-`). If so, populate `editingModel` state with that model's data and skip the POI/brush flow.

#### 3. Build the Transform Widget UI
A glassmorphic floating panel (anchored bottom-center on mobile, side panel on desktop) with:

- **Position (XYZ)**: Three number inputs for lat, lng, altitude with +/- step buttons (0.0001 for lat/lng, 1m for altitude)
- **Rotation**: Three sliders for heading (0-360), pitch (-90 to 90), roll (-180 to 180) with degree readouts
- **Scale**: Slider from 0.01 to 100 with logarithmic feel (fine control at small values)
- **Snap to Ground**: Button that sets altitude to 0 and re-applies `CLAMP_TO_GROUND`, ensuring the model sits flush on the surface
- **Apply / Close** buttons

#### 4. Live preview of changes
As the user adjusts sliders/inputs, update the Cesium entity in real-time:
- Recompute `Cartesian3.fromDegrees(lng, lat, alt)` for position
- Recompute `HeadingPitchRollQuaternion` for orientation
- Update `entity.model.scale` for scale

#### 5. Persist on apply
When "Apply" is clicked, update the `placedModels` array and save to localStorage with the new heading, pitch, roll, and scale values. The `PlacedModel` type gets two new optional fields: `pitch` and `roll` (both default to 0).

### Files to modify
- **`src/pages/SpaceshipPage.tsx`**
  - Extend `PlacedModel` interface with `pitch?: number`, `roll?: number`
  - Add double-click-on-model detection in the event handler
  - Add editing state variables
  - Add transform widget UI (glassmorphic panel with sliders/inputs)
  - Add live entity update logic
  - Update `placeModelOnGlobe` to use pitch/roll

