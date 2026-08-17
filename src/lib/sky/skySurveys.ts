/**
 * All-sky survey catalog — the imagery datasets the Star Gazer can wrap around
 * the solar system.
 *
 * `tycho` is the NASA/SVS Tycho Skymap II panorama (already an equirectangular
 * JPEG). Every other entry is a real telescope survey published as a HiPS at
 * CDS and rendered on demand into an equirectangular (CAR) all-sky image by the
 * `hips2fits` service, so the cube-map projection code stays identical.
 */
export type SkySurveyId =
  | "tycho"
  | "dss2"
  | "twomass"
  | "wise"
  | "iris"
  | "rass"
  | "fermi"
  | "hgps"
  | "haslam"
  | "planck-hfi"
  | "planck-cmb"
  | "wmap";

export type SkyBand = "visible" | "infrared" | "xray" | "gamma" | "radio" | "microwave";

export interface SkySurvey {
  id: SkySurveyId;
  label: string;
  band: SkyBand;
  /** Human wavelength / energy range. */
  spectrum: string;
  instrument: string;
  description: string;
  attribution: string;
  /** HiPS identifier at CDS; absent for the NASA panorama. */
  hips?: string;
}

export const BAND_COLOR: Record<SkyBand, string> = {
  visible: "#e2e8ff",
  infrared: "#fca55d",
  xray: "#7dd3fc",
  gamma: "#c084fc",
  radio: "#4ade80",
  microwave: "#f472b6",
};

export const BAND_LABEL: Record<SkyBand, string> = {
  visible: "Visible",
  infrared: "Infrared",
  xray: "X-ray",
  gamma: "Gamma ray",
  radio: "Radio",
  microwave: "Microwave",
};

export const SKY_SURVEYS: SkySurvey[] = [
  {
    id: "tycho",
    label: "Tycho Skymap II",
    band: "visible",
    spectrum: "390–740 nm",
    instrument: "ESA Hipparcos / Tycho-2 catalogue",
    description: "Full-sky star field built from 99% of stars brighter than V=11, with the Milky Way band rendered in true colour.",
    attribution: "NASA/SVS · Tycho Skymap II",
  },
  {
    id: "dss2",
    label: "DSS2 Colour",
    band: "visible",
    spectrum: "480–690 nm",
    instrument: "Palomar / UK Schmidt photographic plates",
    description: "Deep optical survey — nebulae, dust lanes and galaxies far below naked-eye limits.",
    attribution: "STScI Digitized Sky Survey 2 · CDS/hips2fits",
    hips: "CDS/P/DSS2/color",
  },
  {
    id: "twomass",
    label: "2MASS Near-IR",
    band: "infrared",
    spectrum: "1.2–2.2 µm (J·H·K)",
    instrument: "Two Micron All Sky Survey, 1.3 m twin telescopes",
    description: "Near-infrared sky that sees through dust into the galactic bulge.",
    attribution: "2MASS / IPAC-Caltech / NASA / NSF · CDS/hips2fits",
    hips: "CDS/P/2MASS/color",
  },
  {
    id: "wise",
    label: "AllWISE Mid-IR",
    band: "infrared",
    spectrum: "3.4–22 µm",
    instrument: "NASA Wide-field Infrared Survey Explorer",
    description: "Warm dust, star-forming filaments and the infrared galaxy population.",
    attribution: "NASA/JPL-Caltech/UCLA AllWISE · CDS/hips2fits",
    hips: "CDS/P/allWISE/color",
  },
  {
    id: "iris",
    label: "IRIS Far-IR",
    band: "infrared",
    spectrum: "12–100 µm",
    instrument: "IRAS, reprocessed (IRIS)",
    description: "Thermal emission of interstellar dust across the whole sky — the galactic cirrus.",
    attribution: "IRAS/IRIS (Miville-Deschênes & Lagache) · CDS/hips2fits",
    hips: "CDS/P/IRIS/color",
  },
  {
    id: "rass",
    label: "ROSAT All-Sky X-ray",
    band: "xray",
    spectrum: "0.1–2.4 keV",
    instrument: "ROSAT PSPC",
    description: "Soft X-ray background: hot plasma bubbles, supernova remnants and active galaxies.",
    attribution: "ROSAT All-Sky Survey (MPE) · CDS/hips2fits",
    hips: "CDS/P/RASS",
  },
  {
    id: "fermi",
    label: "Fermi Gamma-ray",
    band: "gamma",
    spectrum: "1–100 GeV",
    instrument: "Fermi Large Area Telescope",
    description: "Highest-energy photon sky — pulsars, blazars and the galactic diffuse glow.",
    attribution: "NASA Fermi-LAT · CDS/hips2fits",
    hips: "CDS/P/Fermi/color",
  },
  {
    id: "hgps",
    label: "H.E.S.S. TeV Plane",
    band: "gamma",
    spectrum: "0.2–100 TeV",
    instrument: "H.E.S.S. Galactic Plane Survey",
    description: "Very-high-energy sources along the galactic plane (plane coverage only).",
    attribution: "H.E.S.S. Collaboration HGPS · CDS/hips2fits",
    hips: "CDS/P/HGPS",
  },
  {
    id: "haslam",
    label: "Haslam 408 MHz Radio",
    band: "radio",
    spectrum: "408 MHz",
    instrument: "Jodrell Bank / Effelsberg / Parkes",
    description: "Synchrotron radio continuum — cosmic-ray electrons spiralling in galactic magnetic fields.",
    attribution: "Haslam et al. 408 MHz all-sky map · CDS/hips2fits",
    hips: "CDS/P/Haslam",
  },
  {
    id: "planck-hfi",
    label: "Planck HFI",
    band: "microwave",
    spectrum: "100–857 GHz",
    instrument: "ESA Planck High Frequency Instrument",
    description: "Microwave sky including thermal dust and the cosmic microwave background foregrounds.",
    attribution: "ESA / Planck Collaboration · CDS/hips2fits",
    hips: "CDS/P/PLANCK/R2/HFI/color",
  },
  {
    id: "planck-cmb",
    label: "Planck CMB",
    band: "microwave",
    spectrum: "2.725 K blackbody anisotropies",
    instrument: "ESA Planck (component-separated CMB)",
    description: "The cosmic microwave background itself: 13.8-billion-year-old light, foregrounds removed.",
    attribution: "ESA / Planck Collaboration R2 CMB · CDS/hips2fits",
    hips: "CDS/P/PLANCK/R2/CMB",
  },
  {
    id: "wmap",
    label: "WMAP W-band",
    band: "microwave",
    spectrum: "94 GHz",
    instrument: "NASA WMAP",
    description: "NASA's microwave background map — the independent measurement that preceded Planck.",
    attribution: "NASA / WMAP Science Team · CDS/hips2fits",
    hips: "CDS/P/WMAP/W",
  },
];

export const SKY_SURVEY_BY_ID: Record<SkySurveyId, SkySurvey> = SKY_SURVEYS.reduce(
  (acc, s) => { acc[s.id] = s; return acc; },
  {} as Record<SkySurveyId, SkySurvey>,
);

export function isSkySurveyId(v: unknown): v is SkySurveyId {
  return typeof v === "string" && v in SKY_SURVEY_BY_ID;
}

/**
 * HiPS pyramid used for tiled deep-zoom trekking. Every survey but the NASA
 * Tycho panorama already ships a HiPS; Tycho is a flat mosaic, so trekking it
 * falls back to the deep optical DSS2 plates that cover the same band.
 */
export function trekHips(id: SkySurveyId): string {
  return SKY_SURVEY_BY_ID[id]?.hips ?? "CDS/P/DSS2/color";
}
