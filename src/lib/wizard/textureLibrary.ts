/**
 * Tiny procedural texture library for the Level Wizard.
 *
 * Each entry returns an inline `data:image/svg+xml` URL. They are tileable
 * via UV repeat so a small 256×256 SVG covers a large surface cheaply.
 * Using SVG (rather than canvas-rasterized PNGs) keeps the data URLs small
 * and avoids any binary asset footprint in the bundle.
 */

function svgUrl(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** Red brick pattern, ~32 bricks per tile. Mortar = #2a2622. */
export const TEX_BRICK = svgUrl(`
<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256'>
  <rect width='256' height='256' fill='#2a2622'/>
  <g fill='#a4452f'>
    ${Array.from({ length: 8 }, (_, row) => {
      const y = row * 32;
      const offset = row % 2 === 0 ? 0 : 32;
      return Array.from({ length: 5 }, (_, col) => {
        const x = (col * 64 + offset) % 320 - 32;
        return `<rect x='${x + 2}' y='${y + 2}' width='60' height='28' rx='2'/>`;
      }).join("");
    }).join("")}
  </g>
</svg>`);

/** Grey concrete, fine grit. */
export const TEX_CONCRETE = svgUrl(`
<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256'>
  <rect width='256' height='256' fill='#7d7d80'/>
  ${Array.from({ length: 220 }, () => {
    const x = Math.floor(Math.random() * 256);
    const y = Math.floor(Math.random() * 256);
    const r = Math.random() * 1.6 + 0.4;
    const g = 90 + Math.floor(Math.random() * 60);
    return `<circle cx='${x}' cy='${y}' r='${r.toFixed(1)}' fill='rgb(${g},${g},${g + 4})' opacity='0.55'/>`;
  }).join("")}
</svg>`);

/** Cobblestone pavers, hexagonal-ish. */
export const TEX_PAVERS = svgUrl(`
<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256'>
  <rect width='256' height='256' fill='#3b3a37'/>
  <g stroke='#1f1e1c' stroke-width='2' fill='#8a8079'>
    ${Array.from({ length: 8 }, (_, row) =>
      Array.from({ length: 8 }, (_, col) => {
        const x = col * 32 + (row % 2 === 0 ? 0 : 16);
        const y = row * 32;
        const shade = 110 + ((row * 31 + col * 17) % 50);
        return `<rect x='${x + 1}' y='${y + 1}' width='30' height='30' rx='4' fill='rgb(${shade},${shade - 6},${shade - 12})'/>`;
      }).join(""),
    ).join("")}
  </g>
</svg>`);

/** Dark asphalt with subtle speckle. */
export const TEX_ASPHALT = svgUrl(`
<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256'>
  <rect width='256' height='256' fill='#2c2c30'/>
  ${Array.from({ length: 320 }, () => {
    const x = Math.floor(Math.random() * 256);
    const y = Math.floor(Math.random() * 256);
    const g = 40 + Math.floor(Math.random() * 50);
    return `<rect x='${x}' y='${y}' width='1.5' height='1.5' fill='rgb(${g},${g},${g + 2})'/>`;
  }).join("")}
</svg>`);

/** Glass facade with horizontal mullions. */
export const TEX_GLASS_FACADE = svgUrl(`
<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256'>
  <defs>
    <linearGradient id='g' x1='0' x2='0' y1='0' y2='1'>
      <stop offset='0' stop-color='#6ea8c8'/>
      <stop offset='1' stop-color='#1c3548'/>
    </linearGradient>
  </defs>
  <rect width='256' height='256' fill='url(#g)'/>
  <g stroke='#0a1620' stroke-width='1' fill='none'>
    ${Array.from({ length: 16 }, (_, i) => `<line x1='0' x2='256' y1='${i * 16}' y2='${i * 16}'/>`).join("")}
    ${Array.from({ length: 8 }, (_, i) => `<line y1='0' y2='256' x1='${i * 32}' x2='${i * 32}'/>`).join("")}
  </g>
</svg>`);

/** Tan stone tile. */
export const TEX_STONE = svgUrl(`
<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256'>
  <rect width='256' height='256' fill='#c9b489'/>
  <g stroke='#5e4a30' stroke-width='1.5' fill='none'>
    ${Array.from({ length: 4 }, (_, i) => `<line y1='${i * 64}' y2='${i * 64}' x1='0' x2='256'/>`).join("")}
    ${Array.from({ length: 4 }, (_, i) => `<line x1='${i * 64}' x2='${i * 64}' y1='0' y2='256'/>`).join("")}
  </g>
  ${Array.from({ length: 90 }, () => {
    const x = Math.floor(Math.random() * 256);
    const y = Math.floor(Math.random() * 256);
    return `<circle cx='${x}' cy='${y}' r='${(Math.random() * 1.2 + 0.4).toFixed(1)}' fill='rgba(110,90,55,0.4)'/>`;
  }).join("")}
</svg>`);

/** Vertical wood planks. */
export const TEX_WOOD = svgUrl(`
<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256'>
  <rect width='256' height='256' fill='#6b3f1f'/>
  ${Array.from({ length: 8 }, (_, i) => {
    const x = i * 32;
    const shade = 80 + ((i * 23) % 40);
    return `<rect x='${x}' y='0' width='30' height='256' fill='rgb(${shade + 30},${shade - 5},${shade - 30})'/>` +
      `<line x1='${x}' x2='${x}' y1='0' y2='256' stroke='#2c1808' stroke-width='1'/>`;
  }).join("")}
</svg>`);

/** Grass / lawn. */
export const TEX_GRASS = svgUrl(`
<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256'>
  <rect width='256' height='256' fill='#3e7a2e'/>
  ${Array.from({ length: 320 }, () => {
    const x = Math.floor(Math.random() * 256);
    const y = Math.floor(Math.random() * 256);
    const g = 50 + Math.floor(Math.random() * 90);
    return `<rect x='${x}' y='${y}' width='2' height='3' fill='rgb(40,${g + 30},30)' opacity='0.7'/>`;
  }).join("")}
</svg>`);

/** Metal panel (for the train). */
export const TEX_METAL = svgUrl(`
<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256'>
  <defs>
    <linearGradient id='m' x1='0' x2='1' y1='0' y2='0'>
      <stop offset='0' stop-color='#7c8590'/>
      <stop offset='0.5' stop-color='#b8c0c8'/>
      <stop offset='1' stop-color='#5a6470'/>
    </linearGradient>
  </defs>
  <rect width='256' height='256' fill='url(#m)'/>
  <g stroke='#202830' stroke-width='1' fill='none'>
    ${Array.from({ length: 4 }, (_, i) => `<line y1='${i * 64}' y2='${i * 64}' x1='0' x2='256'/>`).join("")}
    <line x1='0' y1='128' x2='256' y2='128' stroke-width='2'/>
  </g>
  ${Array.from({ length: 16 }, (_, i) => `<circle cx='${(i % 4) * 64 + 16}' cy='${Math.floor(i / 4) * 64 + 16}' r='2' fill='#2a3038'/>`).join("")}
</svg>`);