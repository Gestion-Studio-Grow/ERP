// ============================================================================
// LECTOR DE QR PARA TESTS — decodifica un QR limpio a partir de sus píxeles.
// ============================================================================
//
// Existe para que un test pueda afirmar "el QR impreso se lee como tal URL" sin confiar en
// el codificador: lee la matriz de la imagen, el formato (con su control BCH), desenmascara,
// recorre en zigzag, desentrelaza los bloques, verifica la corrección de errores
// (Reed-Solomon) y decodifica los modos numérico, alfanumérico y byte. De `qrcode` sólo toma
// las TABLAS del estándar (bloques por versión y posiciones de alineación).
//
// Alcance: imágenes sintéticas sin ruido, sin rotación ni perspectiva (las del generador del
// comprobante). No corrige errores: si un módulo se lee mal, falla y lo dice.
import { createRequire } from "node:module";
import path from "node:path";

type NivelQr = { bit: number };
const requerir = createRequire(path.join(process.cwd(), "package.json"));
const NIVELES = requerir("qrcode/lib/core/error-correction-level") as Record<"L" | "M" | "Q" | "H", NivelQr>;
const TABLA = requerir("qrcode/lib/core/error-correction-code") as {
  getBlocksCount(version: number, nivel: NivelQr): number;
  getTotalCodewordsCount(version: number, nivel: NivelQr): number;
};
const ALINEACION = requerir("qrcode/lib/core/alignment-pattern") as {
  getPositions(version: number): [number, number][];
};

/** `[fila][columna]`, true = módulo oscuro. */
export type MatrizQr = boolean[][];

/**
 * Matriz de módulos de un QR dibujado en una imagen RGB de 8 bits (3 bytes por píxel), con
 * margen claro alrededor. El tamaño del módulo sale del patrón de arriba a la izquierda (7 módulos).
 */
export function matrizDesdeImagen(rgb: Uint8Array, ancho: number, alto: number): MatrizQr {
  const oscuro = (x: number, y: number) => {
    const i = (y * ancho + x) * 3;
    return rgb[i] + rgb[i + 1] + rgb[i + 2] < 384;
  };
  let x0 = ancho;
  let y0 = alto;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      if (!oscuro(x, y)) continue;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  if (x1 < 0) throw new Error("La imagen no tiene ningún módulo oscuro.");
  let corrida = 0;
  while (x0 + corrida <= x1 && oscuro(x0 + corrida, y0)) corrida++;
  const modulo = corrida / 7;
  const n = Math.round((x1 - x0 + 1) / modulo);
  if (n < 21 || (n - 17) % 4 !== 0 || Math.round((y1 - y0 + 1) / modulo) !== n) {
    throw new Error(`La imagen no tiene el tamaño de un QR (${n} módulos).`);
  }
  return Array.from({ length: n }, (_, f) =>
    Array.from({ length: n }, (_, c) => oscuro(Math.floor(x0 + (c + 0.5) * modulo), Math.floor(y0 + (f + 0.5) * modulo))),
  );
}

function cantidadDeBits(v: number): number {
  let n = 0;
  while (v !== 0) {
    n++;
    v >>>= 1;
  }
  return n;
}

/** Los 10 bits BCH(15,5) del formato (generador 0x537). */
function bchDelFormato(datos: number): number {
  let d = datos << 10;
  while (cantidadDeBits(d) - 11 >= 0) d ^= 0x537 << (cantidadDeBits(d) - 11);
  return d;
}

function leerFormato(m: MatrizQr): { nivel: NivelQr; mascara: number } {
  const n = m.length;
  let vertical = 0;
  let horizontal = 0;
  for (let i = 0; i < 15; i++) {
    const fila = i < 6 ? i : i < 8 ? i + 1 : n - 15 + i;
    const col = i < 8 ? n - i - 1 : i < 9 ? 7 : 14 - i;
    if (m[fila][8]) vertical |= 1 << i;
    if (m[8][col]) horizontal |= 1 << i;
  }
  if (vertical !== horizontal) throw new Error("Las dos copias del formato del QR no coinciden.");
  const crudo = vertical ^ 0x5412;
  const datos = crudo >> 10;
  if (bchDelFormato(datos) !== (crudo & 0x3ff)) throw new Error("El control BCH del formato del QR no cuadra.");
  const nivel = (["M", "L", "H", "Q"] as const)[datos >> 3];
  return { nivel: NIVELES[nivel], mascara: datos & 7 };
}

function mascaraEn(patron: number, i: number, j: number): boolean {
  switch (patron) {
    case 0: return (i + j) % 2 === 0;
    case 1: return i % 2 === 0;
    case 2: return j % 3 === 0;
    case 3: return (i + j) % 3 === 0;
    case 4: return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0;
    case 5: return ((i * j) % 2) + ((i * j) % 3) === 0;
    case 6: return (((i * j) % 2) + ((i * j) % 3)) % 2 === 0;
    default: return (((i * j) % 3) + ((i + j) % 2)) % 2 === 0;
  }
}

/** Módulos que no llevan datos: buscadores, separadores, formato, sincronismo, alineación, versión. */
function reservados(n: number, version: number): boolean[][] {
  const r = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  const marcar = (f0: number, c0: number, alto: number, ancho: number) => {
    for (let f = f0; f < f0 + alto; f++) for (let c = c0; c < c0 + ancho; c++) if (f >= 0 && c >= 0 && f < n && c < n) r[f][c] = true;
  };
  marcar(0, 0, 9, 9);
  marcar(0, n - 8, 9, 8);
  marcar(n - 8, 0, 8, 9);
  for (let i = 0; i < n; i++) {
    r[6][i] = true;
    r[i][6] = true;
  }
  if (version >= 2) for (const [f, c] of ALINEACION.getPositions(version)) marcar(f - 2, c - 2, 5, 5);
  if (version >= 7) {
    marcar(0, n - 11, 6, 3);
    marcar(n - 11, 0, 3, 6);
  }
  return r;
}

// Reed-Solomon sobre GF(256) con el polinomio del QR (0x11d).
const EXP = new Array<number>(512);
const LOG = new Array<number>(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}
const por = (a: number, b: number) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

function restoReedSolomon(datos: readonly number[], grado: number): number[] {
  let g = [1];
  for (let i = 0; i < grado; i++) {
    const nuevo = new Array<number>(g.length + 1).fill(0);
    g.forEach((coef, j) => {
      nuevo[j] ^= coef;
      nuevo[j + 1] ^= por(coef, EXP[i]);
    });
    g = nuevo;
  }
  const r = [...datos, ...new Array<number>(grado).fill(0)];
  for (let i = 0; i < datos.length; i++) {
    const coef = r[i];
    if (coef !== 0) g.forEach((gj, j) => (r[i + j] ^= por(gj, coef)));
  }
  return r.slice(datos.length);
}

const ALFANUMERICO = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";

/** Decodifica la matriz de un QR y devuelve el texto. */
export function leerQr(m: MatrizQr): string {
  const n = m.length;
  const version = (n - 17) / 4;
  const { nivel, mascara } = leerFormato(m);
  const res = reservados(n, version);

  const bits: number[] = [];
  let fila = n - 1;
  let paso = -1;
  for (let col = n - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (;;) {
      for (let c = 0; c < 2; c++) {
        if (!res[fila][col - c]) bits.push(m[fila][col - c] !== mascaraEn(mascara, fila, col - c) ? 1 : 0);
      }
      fila += paso;
      if (fila < 0 || fila >= n) {
        fila -= paso;
        paso = -paso;
        break;
      }
    }
  }
  const total = Math.floor(bits.length / 8);
  const bytes = Array.from({ length: total }, (_, k) => bits.slice(8 * k, 8 * k + 8).reduce((v, b) => (v << 1) | b, 0));

  const totalCorreccion = TABLA.getTotalCodewordsCount(version, nivel);
  const bloques = TABLA.getBlocksCount(version, nivel);
  const totalDatos = total - totalCorreccion;
  const enGrupo1 = bloques - (total % bloques);
  const datosGrupo1 = Math.floor(totalDatos / bloques);
  const porBloque = Array.from({ length: bloques }, () => [] as number[]);
  let k = 0;
  for (let i = 0; i <= datosGrupo1; i++) {
    for (let b = 0; b < bloques; b++) if (i < (b < enGrupo1 ? datosGrupo1 : datosGrupo1 + 1)) porBloque[b].push(bytes[k++]);
  }
  const porBloqueCorreccion = Array.from({ length: bloques }, () => [] as number[]);
  for (let i = 0; i < totalCorreccion / bloques; i++) for (let b = 0; b < bloques; b++) porBloqueCorreccion[b].push(bytes[k++]);
  porBloque.forEach((datos, b) => {
    if (restoReedSolomon(datos, totalCorreccion / bloques).join() !== porBloqueCorreccion[b].join()) {
      throw new Error(`La corrección de errores del bloque ${b + 1} no cuadra: el QR se leyó mal.`);
    }
  });

  const flujo = porBloque.flat();
  let pos = 0;
  const leer = (cuantos: number) => {
    let v = 0;
    for (let i = 0; i < cuantos; i++, pos++) v = (v << 1) | ((flujo[pos >> 3] >> (7 - (pos & 7))) & 1);
    return v;
  };
  const rango = version <= 9 ? 0 : version <= 26 ? 1 : 2;
  let texto = "";
  while (flujo.length * 8 - pos >= 4) {
    const modo = leer(4);
    if (modo === 0) break;
    if (modo === 1) {
      let resto = leer([10, 12, 14][rango]);
      for (; resto >= 3; resto -= 3) texto += String(leer(10)).padStart(3, "0");
      if (resto === 2) texto += String(leer(7)).padStart(2, "0");
      if (resto === 1) texto += String(leer(4));
    } else if (modo === 2) {
      const cuantos = leer([9, 11, 13][rango]);
      for (let i = 0; i + 1 < cuantos; i += 2) {
        const v = leer(11);
        texto += ALFANUMERICO[Math.floor(v / 45)] + ALFANUMERICO[v % 45];
      }
      if (cuantos % 2 === 1) texto += ALFANUMERICO[leer(6)];
    } else if (modo === 4) {
      const cuantos = leer([8, 16, 16][rango]);
      texto += Buffer.from(Array.from({ length: cuantos }, () => leer(8))).toString("utf8");
    } else {
      throw new Error(`El lector de pruebas no conoce el modo ${modo} del QR.`);
    }
  }
  return texto;
}
