import { createContext, useContext } from "react";

/** Shared state for the "Paint Faces" mode. The page owns this state and
 * provides it via context so deep mesh components can read selected faces
 * and so a single canvas-level click handler can mutate it. */
export interface FacePaintState {
  /** Currently in face-paint mode (toggle from the inspector). */
  active: boolean;
  /** Object id being painted (only one at a time). */
  objectId: string | null;
  /** Selected face keys (e.g. "top", "side_2", "px", "mesh:Cube.001"). */
  selected: Set<string>;
  /** Toggle a face in the selection; `add=true` keeps existing (Shift). */
  toggle: (key: string, add: boolean) => void;
  /** Clear all selected faces. */
  clear: () => void;
}

export const FacePaintContext = createContext<FacePaintState>({
  active: false,
  objectId: null,
  selected: new Set(),
  toggle: () => {},
  clear: () => {},
});

export const useFacePaint = () => useContext(FacePaintContext);