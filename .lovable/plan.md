# World Model Engine — a dreaming counterpart to Imagine Engine

Add a new page family that mirrors `/levels`, but where each entry is a **world model**: a neural network that learns a 3D world from experience and can then *dream* it — run the simulation forward with no renderer at all, exactly as described in Ha & Schmidhuber's "World Models" (worldmodels.github.io).

## The three-part architecture from the paper

```text
   3D scene frames ──► V (VAE)      ──► z   (compressed 32-D latent "what I see")
   z + action       ──► M (MDN-RNN) ──► h, p(z')  ("what happens next")
   z + h            ──► C (linear)  ──► action     ("what I should do")
```

All three run in the browser with TensorFlow.js (WebGL backend). Nothing is faked: V trains on real pixels captured from the live R3F scene, M trains on real recorded rollouts, C is evolved against reward from either the real scene or the dream.

## Pages

- `/worlds` — a list page copied from the Levels list: cards, thumbnails, public/private badge, context menu (open / share / delete), local-draft fallback, plus a "New World Model" action and an "Import from Experience" action that seeds a world from any existing Level scene.
- `/world/:id` — the engine page: 3D viewport on the left, world-model console on the right.

## The engine page

Four modes, switchable at any time:

1. **Explore** — you drive an agent through the real 3D scene (reuses the existing level scene renderer and play input). Every frame is captured at 64x64 and logged with its action.
2. **Train** — trains V, then M, on the collected rollouts. Live loss curves, epoch progress, and a reconstruction strip (original frame vs VAE decode) so the compression is visible.
3. **Dream** — the renderer is switched off. Starting from a single latent, M predicts the next latent each tick and the VAE decoder paints it to a canvas. You steer the dream with the same controls, and temperature τ controls how uncertain/hallucinatory the dream is (the paper's key trick for keeping a learned controller honest).
4. **Agent** — trains the tiny controller C with CMA-ES inside the dream, then plays it back in the real scene to show transfer.

Console panels: latent vector visualizer (32 bars, live), RNN hidden-state heatmap, MDN mixture weights, temperature slider, rollout inventory, and a model card (parameter counts, training steps, dataset size).

## Data and persistence

- New `world_models` table (mirrors `levels`: owner, name, description, thumbnail, is_public, updated_at) holding config + training metadata JSON, with RLS and grants, plus a local-draft fallback for signed-out users identical to the existing local-levels path.
- Trained weights are large, so they save to IndexedDB via TF.js `indexeddb://` and optionally export/import as a `.world` bundle; the row stores only the pointer and metrics.
- Rollout frames stay in memory / IndexedDB — no synthetic data, no invented metrics anywhere in the UI.

## Technical notes

- Add `@tensorflow/tfjs` (WebGL backend). Convolutional VAE: 4 conv layers → 32-D latent, mirror deconv decoder, trained with reparameterized KL + MSE. M: single LSTM (256 units) → MDN head with 5 mixtures per latent dimension, sampled with temperature. C: single dense layer, weights evolved with a small in-house CMA-ES (a few hundred parameters, no library needed).
- Training runs in a `requestIdleCallback`-paced loop with `tf.tidy` per step so the UI never blocks; the page is lazy-loaded in `App.tsx` like the other heavy 3D routes.
- Frame capture reads the existing WebGL canvas into a 64x64 offscreen canvas — no second renderer.
- Styling follows the existing dark glass aesthetic, CSS animations only, semantic tokens, tabular "001" numerics; mobile gets a bottom sheet for the console.
- Routes registered in `App.tsx`; the Imagine Engine list page gets a link across to `/worlds`.

## Build order

1. `/worlds` list page + table/migration + local fallback + routes.
2. Engine page shell with Explore mode and frame/action recording.
3. VAE training + reconstruction view.
4. MDN-RNN training + Dream mode with temperature.
5. Controller evolution + transfer playback.
