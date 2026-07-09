import type { PanelSpec, InverterSpec } from "./types";

// Curated real-world panel database — spec sheets from manufacturer PDFs.
export const PANEL_CATALOG: PanelSpec[] = [
  { id: "tesla-425", brand: "Tesla",   model: "T425H (425 W)",           wattage: 425, areaM2: 1.945, efficiency: 0.218, warrantyYears: 25, pricePerWatt: 0.55 },
  { id: "rec-430",   brand: "REC",     model: "Alpha Pure-R 430",        wattage: 430, areaM2: 1.804, efficiency: 0.220, warrantyYears: 25, pricePerWatt: 0.60 },
  { id: "qcells-410",brand: "Q.CELLS", model: "Q.PEAK DUO BLK ML-G10+",  wattage: 410, areaM2: 1.879, efficiency: 0.213, warrantyYears: 25, pricePerWatt: 0.42 },
  { id: "silfab-440",brand: "Silfab",  model: "Prime SIL-440 BG",        wattage: 440, areaM2: 1.968, efficiency: 0.223, warrantyYears: 30, pricePerWatt: 0.52 },
  { id: "longi-425", brand: "LONGi",   model: "Hi-MO 6 Explorer 425",    wattage: 425, areaM2: 1.879, efficiency: 0.226, warrantyYears: 25, pricePerWatt: 0.38 },
  { id: "jinko-440", brand: "JinkoSolar", model: "Tiger NEO N-Type 440", wattage: 440, areaM2: 1.919, efficiency: 0.229, warrantyYears: 25, pricePerWatt: 0.40 },
];

// Curated inverter catalog.
export const INVERTER_CATALOG: InverterSpec[] = [
  { id: "enphase-iq8m", brand: "Enphase",   model: "IQ8M Micro",          kind: "micro",  ratedKw: 0.330, efficiency: 0.970, warrantyYears: 25, pricePerWatt: 0.28 },
  { id: "enphase-iq8p", brand: "Enphase",   model: "IQ8+ Micro",          kind: "micro",  ratedKw: 0.290, efficiency: 0.970, warrantyYears: 25, pricePerWatt: 0.26 },
  { id: "solaredge-hd", brand: "SolarEdge", model: "HD-Wave SE7600H",     kind: "string", ratedKw: 7.6,   efficiency: 0.990, warrantyYears: 12, pricePerWatt: 0.18 },
  { id: "tesla-inv",    brand: "Tesla",     model: "Tesla Solar Inverter 7.6", kind: "string", ratedKw: 7.6, efficiency: 0.978, warrantyYears: 12, pricePerWatt: 0.14 },
  { id: "fronius-primo",brand: "Fronius",   model: "Primo GEN24 8.2",     kind: "hybrid", ratedKw: 8.2,   efficiency: 0.980, warrantyYears: 10, pricePerWatt: 0.20 },
];

export function panelById(id: string): PanelSpec {
  return PANEL_CATALOG.find((p) => p.id === id) ?? PANEL_CATALOG[0];
}
export function inverterById(id: string): InverterSpec {
  return INVERTER_CATALOG.find((p) => p.id === id) ?? INVERTER_CATALOG[0];
}