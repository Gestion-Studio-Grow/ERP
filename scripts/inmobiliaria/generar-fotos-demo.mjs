// ============================================================================
// FOTOS DE EJEMPLO de la demo de inmobiliaria — ilustraciones, no fotos de nadie.
// ============================================================================
//
// La demo no puede usar fotos de un cliente (hace falta su autorización registrada) ni de un
// banco de imágenes (sería una dependencia externa). Este script dibuja 18 ilustraciones
// propias (6 escenas × 3 luces) en public/demo-inmo/. Son archivos del repo: no cuestan nada
// y la demo anda sin conexión. Cada una lleva la leyenda "Imagen de ejemplo".
//
//   node scripts/inmobiliaria/generar-fotos-demo.mjs

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DESTINO = path.join(ROOT, "public", "demo-inmo");

const LUCES = [
  { id: 1, cielo: ["#f6e7d3", "#e9c9a6"], sol: "#f4b860", pared: "#f3ece2", muro: "#d9c7b1", acento: "#b5533c", verde: "#6f8f6a", piso: "#c9a27c", sombra: "#3b2f2a", vidrio: "#cfe3ea" },
  { id: 2, cielo: ["#dfe9f1", "#b9cfe0"], sol: "#fff3d6", pared: "#eef1f0", muro: "#c8d1d3", acento: "#2c5d73", verde: "#5e8a73", piso: "#b7a48d", sombra: "#22323c", vidrio: "#d9ecf5" },
  { id: 3, cielo: ["#f3dcd2", "#d7a9a0"], sol: "#ffd9a8", pared: "#f5ede8", muro: "#dbc3bb", acento: "#7b2d3b", verde: "#7a8c5f", piso: "#b98f72", sombra: "#33222a", vidrio: "#f0e2dc" },
];

const marco = (l, cuerpo) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800" role="img" aria-label="Imagen de ejemplo">` +
  `<defs><linearGradient id="c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${l.cielo[0]}"/><stop offset="1" stop-color="${l.cielo[1]}"/></linearGradient></defs>` +
  cuerpo +
  `<text x="1176" y="776" text-anchor="end" font-family="system-ui,sans-serif" font-size="20" fill="${l.sombra}" opacity=".45">Imagen de ejemplo</text></svg>\n`;

const ventana = (l, x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="${l.vidrio}" stroke="${l.sombra}" stroke-opacity=".25" stroke-width="4"/><path d="M${x + w / 2} ${y}v${h}M${x} ${y + h / 2}h${w}" stroke="${l.sombra}" stroke-opacity=".2" stroke-width="3"/>`;
const arbol = (l, x, y, r) => `<rect x="${x - 7}" y="${y}" width="14" height="${r * 1.5}" fill="${l.sombra}" opacity=".5"/><circle cx="${x}" cy="${y}" r="${r}" fill="${l.verde}"/><circle cx="${x + r * 0.5}" cy="${y + r * 0.3}" r="${r * 0.7}" fill="${l.verde}" opacity=".85"/>`;

const ESCENAS = {
  casa: (l) =>
    `<rect width="1200" height="800" fill="url(#c)"/><circle cx="960" cy="170" r="74" fill="${l.sol}" opacity=".9"/>` +
    arbol(l, 150, 430, 95) + arbol(l, 1060, 470, 70) +
    `<path d="M270 400L600 200L930 400Z" fill="${l.acento}"/><rect x="310" y="400" width="580" height="270" fill="${l.pared}"/>` +
    `<rect x="310" y="400" width="580" height="18" fill="${l.sombra}" opacity=".12"/>` +
    ventana(l, 370, 460, 130, 110) + ventana(l, 700, 460, 130, 110) +
    `<rect x="555" y="500" width="90" height="170" rx="4" fill="${l.sombra}" opacity=".78"/><circle cx="628" cy="590" r="6" fill="${l.sol}"/>` +
    `<rect y="670" width="1200" height="130" fill="${l.verde}"/><path d="M560 670h80l70 130H490z" fill="${l.muro}"/>` +
    `<rect x="250" y="640" width="700" height="34" rx="17" fill="${l.verde}" opacity=".8"/>`,
  edificio: (l) =>
    `<rect width="1200" height="800" fill="url(#c)"/><circle cx="220" cy="150" r="60" fill="${l.sol}" opacity=".85"/>` +
    `<rect x="120" y="330" width="230" height="380" fill="${l.muro}" opacity=".7"/><rect x="880" y="280" width="220" height="430" fill="${l.muro}" opacity=".6"/>` +
    `<rect x="400" y="110" width="400" height="600" fill="${l.pared}"/><rect x="400" y="110" width="400" height="22" fill="${l.acento}"/>` +
    Array.from({ length: 6 }, (_, f) => [0, 1, 2].map((c) => `<rect x="${440 + c * 120}" y="${165 + f * 88}" width="80" height="52" rx="3" fill="${l.vidrio}" stroke="${l.sombra}" stroke-opacity=".2" stroke-width="3"/><rect x="${432 + c * 120}" y="${217 + f * 88}" width="96" height="9" fill="${l.sombra}" opacity=".3"/>`).join("")).join("") +
    `<rect y="710" width="1200" height="90" fill="${l.sombra}" opacity=".7"/>` + arbol(l, 330, 640, 46) + arbol(l, 870, 650, 40) +
    `<rect x="560" y="640" width="80" height="70" fill="${l.sombra}" opacity=".8"/>`,
  living: (l) =>
    `<rect width="1200" height="800" fill="${l.pared}"/><rect y="560" width="1200" height="240" fill="${l.piso}"/><rect y="552" width="1200" height="10" fill="${l.sombra}" opacity=".15"/>` +
    `<rect x="90" y="110" width="330" height="330" fill="url(#c)" stroke="${l.sombra}" stroke-opacity=".3" stroke-width="8"/><path d="M255 110v330M90 275h330" stroke="${l.sombra}" stroke-opacity=".25" stroke-width="6"/>` +
    `<path d="M420 560L560 800H0V640z" fill="${l.sol}" opacity=".18"/>` +
    `<rect x="760" y="150" width="210" height="150" fill="${l.muro}" stroke="${l.sombra}" stroke-opacity=".35" stroke-width="6"/><circle cx="830" cy="215" r="34" fill="${l.acento}" opacity=".8"/><path d="M780 290l70-70 50 40 50-30v60z" fill="${l.verde}" opacity=".8"/>` +
    `<rect x="470" y="430" width="560" height="130" rx="22" fill="${l.acento}"/><rect x="450" y="490" width="600" height="110" rx="20" fill="${l.acento}"/><rect x="450" y="490" width="600" height="26" rx="13" fill="${l.sombra}" opacity=".12"/>` +
    `<rect x="520" y="455" width="130" height="80" rx="14" fill="${l.pared}"/><rect x="850" y="455" width="130" height="80" rx="14" fill="${l.muro}"/>` +
    `<rect x="600" y="650" width="300" height="24" rx="6" fill="${l.sombra}" opacity=".7"/><rect x="630" y="674" width="12" height="60" fill="${l.sombra}" opacity=".7"/><rect x="858" y="674" width="12" height="60" fill="${l.sombra}" opacity=".7"/>` +
    `<rect x="1090" y="250" width="8" height="330" fill="${l.sombra}" opacity=".6"/><path d="M1040 250h108l-24-90h-60z" fill="${l.sol}"/>` +
    `<rect x="140" y="520" width="70" height="80" rx="8" fill="${l.sombra}" opacity=".6"/>` + arbol({ ...l, sombra: l.verde }, 175, 470, 60),
  cocina: (l) =>
    `<rect width="1200" height="800" fill="${l.pared}"/><rect y="600" width="1200" height="200" fill="${l.piso}"/>` +
    `<rect x="0" y="120" width="1200" height="170" fill="${l.muro}"/>` + [0, 1, 2, 3, 4].map((i) => `<rect x="${20 + i * 236}" y="134" width="220" height="142" rx="4" fill="${l.pared}" stroke="${l.sombra}" stroke-opacity=".18" stroke-width="3"/><rect x="${116 + i * 236}" y="250" width="28" height="6" rx="3" fill="${l.sombra}" opacity=".5"/>`).join("") +
    `<rect x="0" y="290" width="1200" height="140" fill="${l.vidrio}" opacity=".55"/>` +
    `<rect x="0" y="430" width="1200" height="24" fill="${l.sombra}" opacity=".75"/><rect x="0" y="454" width="1200" height="150" fill="${l.acento}"/>` + [0, 1, 2, 3, 4].map((i) => `<rect x="${20 + i * 236}" y="468" width="220" height="122" rx="4" fill="none" stroke="${l.pared}" stroke-opacity=".35" stroke-width="3"/>`).join("") +
    `<rect x="470" y="380" width="170" height="50" rx="6" fill="${l.sombra}" opacity=".85"/><path d="M700 430v-80q0-30 30-30" stroke="${l.sombra}" stroke-width="10" fill="none" opacity=".7"/>` +
    [330, 600, 870].map((x) => `<path d="M${x} 0v70" stroke="${l.sombra}" stroke-width="4" opacity=".6"/><path d="M${x - 40} 110q40-60 80 0z" fill="${l.sol}"/>`).join("") +
    `<rect x="150" y="620" width="900" height="26" rx="6" fill="${l.muro}"/>` + [260, 600, 940].map((x) => `<rect x="${x - 45}" y="668" width="90" height="16" rx="8" fill="${l.sombra}" opacity=".7"/><path d="M${x - 30} 684l-12 116M${x + 30} 684l12 116" stroke="${l.sombra}" stroke-width="8" opacity=".6"/>`).join(""),
  dormitorio: (l) =>
    `<rect width="1200" height="800" fill="${l.pared}"/><rect y="590" width="1200" height="210" fill="${l.piso}"/>` +
    `<rect x="760" y="100" width="330" height="360" fill="url(#c)" stroke="${l.sombra}" stroke-opacity=".3" stroke-width="8"/><path d="M925 100v360" stroke="${l.sombra}" stroke-opacity=".25" stroke-width="6"/>` +
    `<path d="M730 80h70v420q-40-30-70 0z" fill="${l.muro}"/><path d="M1050 80h70v420q-30-30-70 0z" fill="${l.muro}"/>` +
    `<rect x="150" y="300" width="520" height="150" rx="16" fill="${l.acento}"/><rect x="120" y="440" width="580" height="170" rx="14" fill="${l.muro}"/>` +
    `<rect x="120" y="500" width="580" height="110" rx="14" fill="${l.pared}" stroke="${l.sombra}" stroke-opacity=".12" stroke-width="3"/><rect x="180" y="410" width="190" height="80" rx="20" fill="${l.pared}"/><rect x="450" y="410" width="190" height="80" rx="20" fill="${l.pared}"/>` +
    `<rect x="120" y="560" width="580" height="50" fill="${l.acento}" opacity=".85"/><rect x="140" y="610" width="16" height="40" fill="${l.sombra}" opacity=".7"/><rect x="664" y="610" width="16" height="40" fill="${l.sombra}" opacity=".7"/>` +
    `<rect x="20" y="500" width="90" height="110" rx="6" fill="${l.sombra}" opacity=".65"/><path d="M40 500v-70" stroke="${l.sombra}" stroke-width="6" opacity=".6"/><path d="M10 430h60l-12-50H22z" fill="${l.sol}"/>` +
    `<rect x="330" y="140" width="160" height="110" fill="${l.pared}" stroke="${l.sombra}" stroke-opacity=".35" stroke-width="6"/><circle cx="410" cy="195" r="30" fill="${l.verde}" opacity=".75"/>`,
  terreno: (l) =>
    `<rect width="1200" height="800" fill="url(#c)"/><circle cx="880" cy="190" r="80" fill="${l.sol}" opacity=".9"/>` +
    `<path d="M0 470q200-90 420-30t420-40 360 30v370H0z" fill="${l.verde}" opacity=".55"/><path d="M0 540q300-70 620-20t580-30v310H0z" fill="${l.verde}"/>` +
    `<path d="M240 640L520 560L980 600L760 730Z" fill="${l.sol}" opacity=".28" stroke="${l.pared}" stroke-width="6" stroke-dasharray="18 14"/>` +
    [[240, 640], [520, 560], [980, 600], [760, 730]].map(([x, y]) => `<rect x="${x - 5}" y="${y - 46}" width="10" height="50" fill="${l.sombra}" opacity=".75"/><rect x="${x - 5}" y="${y - 46}" width="26" height="16" fill="${l.acento}"/>`).join("") +
    arbol(l, 130, 430, 80) + arbol(l, 1080, 440, 60) + arbol(l, 1010, 470, 40) +
    `<rect x="560" y="610" width="130" height="60" rx="6" fill="${l.pared}" stroke="${l.sombra}" stroke-opacity=".4" stroke-width="4"/><rect x="620" y="670" width="10" height="46" fill="${l.sombra}" opacity=".7"/><rect x="578" y="628" width="94" height="8" rx="4" fill="${l.acento}"/><rect x="578" y="646" width="60" height="8" rx="4" fill="${l.sombra}" opacity=".4"/>`,
};

mkdirSync(DESTINO, { recursive: true });
let n = 0;
for (const [nombre, dibujar] of Object.entries(ESCENAS)) {
  for (const l of LUCES) {
    writeFileSync(path.join(DESTINO, `${nombre}-${l.id}.svg`), marco(l, dibujar(l)));
    n++;
  }
}
process.stdout.write(`[demo-inmo] ${n} imágenes de ejemplo en public/demo-inmo/\n`);
