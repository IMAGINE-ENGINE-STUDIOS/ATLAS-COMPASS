/**
 * Imagine Engine theme — the aesthetic chosen from the Design Lab.
 * Persists to localStorage and broadcasts changes so any component can
 * read the active theme id and restyle accordingly.
 */
import { useEffect, useState } from "react";

export type ImagineThemeId =
  | "glass-fuchsia"
  | "editorial-mono"
  | "brutalist-block"
  | "neon-cyber"
  | "aurora-glow"
  | "paper-serif"
  | "obsidian-gold"
  | "candy-pop";

const STORAGE_KEY = "imagine.theme";
const EVENT = "imagine-theme-change";

export function getImagineTheme(): ImagineThemeId {
  if (typeof localStorage === "undefined") return "glass-fuchsia";
  return (localStorage.getItem(STORAGE_KEY) as ImagineThemeId) || "glass-fuchsia";
}

export function setImagineTheme(id: ImagineThemeId) {
  localStorage.setItem(STORAGE_KEY, id);
  document.documentElement.dataset.imagineTheme = id;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: id }));
}

export function useImagineTheme(): [ImagineThemeId, (id: ImagineThemeId) => void] {
  const [theme, setTheme] = useState<ImagineThemeId>(() => getImagineTheme());
  useEffect(() => {
    const on = (e: Event) => setTheme((e as CustomEvent).detail);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return [theme, setImagineTheme];
}