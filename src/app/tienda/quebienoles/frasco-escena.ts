// ============================================================================
// EL FRASCO DE LA CASA — la escena 3D del portal de Qué Bien Olés (three.js, sin React).
// ============================================================================
//
// Corre en un WEB WORKER sobre un OffscreenCanvas (frasco-worker.ts) o, si el navegador no puede, en el
// hilo principal (Frasco.tsx): por eso no toca `window` ni `document` salvo detrás de un `typeof`, y el
// tamaño, el DPR y la letra le llegan de afuera. Se carga con import dinámico SÓLO en esta vidriera: el
// resto del ERP no baja three.js.
//
// Qué se ve y de dónde sale:
//   · El frasco: el de su posteo "Volvimos" (14/09) — tapa negra facetada y virola dorada moleteada —
//     sobre un cuerpo de vidrio grueso. No es un frasco de otra marca: es el "frasco de la casa".
//   · El vidrio es transmisión física (MeshPhysicalMaterial: transmisión, IOR, espesor, dispersión).
//     El color del líquido es la ATENUACIÓN del vidrio y cambia con la familia elegida.
//   · Detrás, un retablo OPACO con la Q y la corona de su caja: el vidrio lo REFRACTA en vivo. Tiene que
//     ser opaco a propósito: three.js sólo refracta lo opaco (lo transparente no entra al pase de
//     transmisión). Sus bordes terminan en el color exacto de la página (sin mapeo de tonos), así la
//     escena se funde con el fondo y no se ve el rectángulo del lienzo.
//   · El zócalo es el mármol negro de vetas doradas de su portada "Stock disponible".
//   · Apretar y sostener = rociar: la tapa sube, la boquilla tira bruma del color de la familia.
//
// Presupuesto: un solo objeto transmisivo, texturas de lienzo generadas acá (cero descargas), sombras y
// dispersión sólo en calidad alta, el bucle se apaga fuera de pantalla y con la pestaña oculta. Con
// movimiento reducido se pinta un cuadro quieto y no hay bruma.
//
// Lo que cuesta de verdad es COMPILAR los shaders físicos (medido: segundos en una GPU integrada). Por
// eso: (1) los materiales comparten programa donde el ojo no distingue (cuatro programas físicos en vez
// de ocho), (2) se compilan en paralelo con `compileAsync` (KHR_parallel_shader_compile), (3) la
// construcción cede el hilo entre bloques, (4) si los primeros cuadros salen lentos, la escena baja sola
// de resolución, y (5) en el worker todo esto pasa fuera del hilo que responde al toque y al scroll.
//
// (Se midió importar de "three" por nombre en vez de `import * as THREE`: el chunk no baja —138,5 → 138,7 KB gz—,
// Turbopack ya recorta igual; se deja el espacio de nombres, que es como estaba.)

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

export type OpcionesFrasco = {
  /** El lienzo: el `<canvas>` de la página (hilo principal) o su OffscreenCanvas (worker). */
  lienzo: HTMLCanvasElement | OffscreenCanvas;
  /** Tamaño CSS del lienzo y densidad de píxeles (el worker no puede medirlos: se los pasan). */
  ancho: number;
  alto: number;
  dpr: number;
  /** Color del líquido (el de la familia). */
  color: string;
  /** Color EXACTO de la página detrás del lienzo: la pared termina en él. */
  fondo: string;
  /** false = movimiento reducido: un cuadro quieto, sin bruma. */
  movimiento: boolean;
  calidad: "alta" | "baja";
  /** Familia CSS de la didona (para la Q de la etiqueta y del retablo). */
  letra: string;
  /** URL absoluta del archivo de la didona: en el worker no hay CSS, se carga con FontFace. */
  urlLetra?: string;
  /** Se perdió el contexto WebGL (driver, memoria): la vidriera muestra el respaldo. */
  alPerder?: () => void;
};

export type Frasco = {
  color(hex: string): void;
  /** Hacia dónde mira el frasco: x, y en -1..1 (puntero o inclinación). */
  mirar(x: number, y: number): void;
  rociar(si: boolean): void;
  /** Progreso de salida del portal al hacer scroll (0 = arriba, 1 = fuera). */
  salida(p: number): void;
  /** Encender/apagar el bucle (fuera de pantalla, pestaña oculta). */
  activo(si: boolean): void;
  /** Nuevo tamaño CSS del lienzo y DPR. */
  medir(ancho: number, alto: number, dpr: number): void;
  soltar(): void;
};

// ── medidas del frasco (unidades de escena; el zócalo arriba está en y = 0) ─────────────────
const CUERPO = { ancho: 1.34, alto: 1.72, fondo: 0.8, radio: 0.14 };
const CUELLO = { alto: 0.14 };
const VIROLA = { radio: 0.31, alto: 0.22 };
const TAPA = { alto: 0.6, bisel: 0.14 };
const Y_CUELLO = CUERPO.alto + CUELLO.alto / 2;
const Y_VIROLA = CUERPO.alto + CUELLO.alto + VIROLA.alto / 2;
const Y_TAPA = CUERPO.alto + CUELLO.alto + VIROLA.alto;
const Y_BOQUILLA = Y_TAPA + 0.07;

// PRNG con semilla: el mármol sale igual en cada visita (y en cada captura de QA).
function azar(semilla: number) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Cede el hilo entre bloques pesados (scheduler.yield si existe; si no, una macrotarea). */
function respirar(): Promise<void> {
  const s = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  return s?.yield ? s.yield() : new Promise((r) => setTimeout(r, 0));
}

/** El pincel 2D con el que se dibujan las texturas: el de un <canvas> o el de un OffscreenCanvas. */
type Pincel = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function lienzo2d(ancho: number, alto: number) {
  // En el worker no hay `document`: las texturas se dibujan en OffscreenCanvas (three las sube igual).
  const c: HTMLCanvasElement | OffscreenCanvas =
    typeof document !== "undefined" ? document.createElement("canvas") : new OffscreenCanvas(ancho, alto);
  c.width = ancho;
  c.height = alto;
  const g = c.getContext("2d") as Pincel | null;
  if (!g) throw new Error("sin 2d");
  return { c, g };
}

function textura(c: HTMLCanvasElement | OffscreenCanvas, color = true): THREE.Texture {
  const t = new THREE.CanvasTexture(c);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function oroLineal(g: Pincel, x0: number, y0: number, x1: number, y1: number) {
  const d = g.createLinearGradient(x0, y0, x1, y1);
  d.addColorStop(0, "#8f6726");
  d.addColorStop(0.35, "#f6e3a8");
  d.addColorStop(0.55, "#d8b36a");
  d.addColorStop(1, "#6f5220");
  return d;
}

/** La corona de la caja (tres puntas), centrada en (x, y), de ancho `a`. */
function corona(g: Pincel, x: number, y: number, a: number) {
  const h = a * 0.42;
  g.beginPath();
  g.moveTo(x - a / 2, y + h / 2);
  g.lineTo(x - a * 0.4, y - h / 2);
  g.lineTo(x - a * 0.2, y);
  g.lineTo(x, y - h * 0.75);
  g.lineTo(x + a * 0.2, y);
  g.lineTo(x + a * 0.4, y - h / 2);
  g.lineTo(x + a / 2, y + h / 2);
  g.closePath();
  g.fill();
}

/**
 * La didona tiene que estar cargada antes de dibujar la Q en el lienzo (si no, sale en serif). En la
 * página la declara el CSS y alcanza con pedirla; en el worker no hay CSS: se carga el archivo con
 * FontFace y se suma al conjunto del worker (`self.fonts`). Tope de 1,5 s: sin la letra no se frena.
 */
async function asegurarLetra(letra: string, urlLetra?: string) {
  const conjunto: FontFaceSet | undefined =
    typeof document !== "undefined" ? document.fonts : (globalThis as { fonts?: FontFaceSet }).fonts;
  if (!conjunto) return;
  const carga =
    typeof document === "undefined" && urlLetra
      ? new FontFace(letra.replace(/"/g, ""), `url(${urlLetra})`, { weight: "400 900" }).load().then((cara) => {
          conjunto.add(cara);
        })
      : conjunto.load(`700 120px ${letra}`).then(() => undefined);
  try {
    await Promise.race([carga, new Promise<void>((r) => setTimeout(r, 1500))]);
  } catch {
    /* sin la letra: la Q sale en serif del sistema, no se frena la escena */
  }
}

// ── texturas ─────────────────────────────────────────────────────────────────

/** Retablo detrás del frasco: halo cálido, la Q con corona y rayos finos. Bordes = fondo exacto. */
function texturaRetablo(fondo: string, letra: string, lado: number): THREE.Texture {
  const { c, g } = lienzo2d(lado, lado);
  const m = lado / 2;
  g.fillStyle = fondo;
  g.fillRect(0, 0, lado, lado);
  const halo = g.createRadialGradient(m, m * 0.95, 0, m, m, m);
  halo.addColorStop(0, "rgba(168, 124, 62, 0.72)");
  halo.addColorStop(0.35, "rgba(92, 66, 32, 0.42)");
  halo.addColorStop(0.72, "rgba(30, 22, 14, 0.12)");
  halo.addColorStop(1, "rgba(0, 0, 0, 0)");
  g.fillStyle = halo;
  g.fillRect(0, 0, lado, lado);
  // Rayos finos (la luz de las placas), contenidos en el centro para que el borde siga siendo fondo.
  g.save();
  g.globalAlpha = 0.18;
  g.strokeStyle = "#d8b36a";
  g.lineWidth = Math.max(1, lado / 1024);
  for (let i = -6; i <= 6; i++) {
    const x = m + i * lado * 0.035;
    const largo = lado * (0.34 - Math.abs(i) * 0.02);
    g.beginPath();
    g.moveTo(x, m - largo);
    g.lineTo(x, m + largo);
    g.stroke();
  }
  g.restore();
  // La Q didona con su corona, grande y baja de brillo: se lee a través del vidrio.
  g.save();
  g.globalAlpha = 0.34;
  g.fillStyle = oroLineal(g, m - lado * 0.2, m - lado * 0.25, m + lado * 0.2, m + lado * 0.25);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `700 ${Math.round(lado * 0.46)}px ${letra}, "Bodoni 72", Didot, serif`;
  g.fillText("Q", m, m + lado * 0.03);
  corona(g, m, m - lado * 0.24, lado * 0.13);
  g.restore();
  return textura(c);
}

/** Mármol negro con vetas doradas (portada "Stock disponible"). */
function texturaMarmol(ancho: number, alto: number): THREE.Texture {
  const { c, g } = lienzo2d(ancho, alto);
  const r = azar(1504);
  g.fillStyle = "#0c0a09";
  g.fillRect(0, 0, ancho, alto);
  // nubes tenues
  for (let i = 0; i < 40; i++) {
    const x = r() * ancho;
    const y = r() * alto;
    const rad = (0.05 + r() * 0.2) * ancho;
    const d = g.createRadialGradient(x, y, 0, x, y, rad);
    d.addColorStop(0, `rgba(40, 34, 30, ${0.05 + r() * 0.08})`);
    d.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = d;
    g.fillRect(0, 0, ancho, alto);
  }
  // vetas: caminatas con deriva, en dos grosores
  const veta = (grosor: number, alfa: number, color: string) => {
    let x = r() * ancho;
    let y = r() * alto;
    let dir = r() * Math.PI * 2;
    g.beginPath();
    g.moveTo(x, y);
    const pasos = 60 + Math.floor(r() * 90);
    for (let i = 0; i < pasos; i++) {
      dir += (r() - 0.5) * 0.7;
      x += Math.cos(dir) * ancho * 0.012;
      y += Math.sin(dir) * ancho * 0.012;
      g.lineTo(x, y);
    }
    g.strokeStyle = color;
    g.globalAlpha = alfa;
    g.lineWidth = grosor;
    g.stroke();
    g.globalAlpha = 1;
  };
  for (let i = 0; i < 9; i++) veta(1 + r() * 2.2, 0.28 + r() * 0.35, "#b8914c");
  for (let i = 0; i < 26; i++) veta(0.6 + r() * 0.8, 0.12 + r() * 0.18, "#e9dcc4");
  // La veta gruesa lleva un filo de luz al lado (como el oro real, que no es una línea plana).
  g.save();
  g.globalCompositeOperation = "lighter";
  for (let i = 0; i < 5; i++) veta(0.5 + r() * 0.5, 0.08 + r() * 0.08, "#fff1c8");
  g.restore();
  const t = textura(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Etiqueta del frente: la Q con corona y "QUÉ BIEN OLÉS · PERFUMERÍA", en oro. */
function texturaEtiqueta(letra: string, lado: number): THREE.Texture {
  const { c, g } = lienzo2d(lado, lado);
  const m = lado / 2;
  g.clearRect(0, 0, lado, lado);
  g.fillStyle = oroLineal(g, 0, 0, lado, lado);
  g.strokeStyle = g.fillStyle;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `700 ${Math.round(lado * 0.36)}px ${letra}, "Bodoni 72", Didot, serif`;
  g.fillText("Q", m, m * 0.86);
  corona(g, m, m * 0.42, lado * 0.12);
  g.lineWidth = Math.max(1, lado / 400);
  g.beginPath();
  g.moveTo(m - lado * 0.2, m * 1.34);
  g.lineTo(m + lado * 0.2, m * 1.34);
  g.stroke();
  g.font = `600 ${Math.round(lado * 0.052)}px ${letra}, serif`;
  g.fillText("QUÉ  BIEN  OLÉS", m, m * 1.46);
  g.font = `500 ${Math.round(lado * 0.034)}px ${letra}, serif`;
  g.fillText("P E R F U M E R Í A", m, m * 1.58);
  return textura(c);
}

/** Moleteado de la virola (relieve en diagonal cruzada), para bumpMap. */
function texturaMoleteado(): THREE.Texture {
  const { c, g } = lienzo2d(512, 64);
  g.fillStyle = "#808080";
  g.fillRect(0, 0, 512, 64);
  g.strokeStyle = "#ffffff";
  g.lineWidth = 2;
  for (let i = -64; i < 512 + 64; i += 9) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + 64, 64);
    g.stroke();
    g.beginPath();
    g.moveTo(i + 64, 0);
    g.lineTo(i, 64);
    g.stroke();
  }
  const t = textura(c, false);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 1);
  return t;
}

/** Sombra de contacto (radial) bajo el frasco. */
function texturaSombra(): THREE.Texture {
  const { c, g } = lienzo2d(256, 256);
  const d = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  d.addColorStop(0, "rgba(0,0,0,0.85)");
  d.addColorStop(0.45, "rgba(0,0,0,0.45)");
  d.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = d;
  g.fillRect(0, 0, 256, 256);
  return textura(c, false);
}

/** Degradé vertical del perfume: hondo abajo, luminoso arriba (el menisco agarra la luz). */
function texturaLiquido(): THREE.Texture {
  const { c, g } = lienzo2d(16, 256);
  const d = g.createLinearGradient(0, 256, 0, 0);
  d.addColorStop(0, "#6f6f6f");
  d.addColorStop(0.55, "#d6d6d6");
  d.addColorStop(0.9, "#ffffff");
  d.addColorStop(1, "#fffaf0");
  g.fillStyle = d;
  g.fillRect(0, 0, 16, 256);
  return textura(c, false);
}

/** Punto suave para la bruma. */
function texturaGota(): THREE.Texture {
  const { c, g } = lienzo2d(64, 64);
  const d = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  d.addColorStop(0, "rgba(255,255,255,1)");
  d.addColorStop(0.4, "rgba(255,255,255,0.35)");
  d.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = d;
  g.fillRect(0, 0, 64, 64);
  return textura(c, false);
}

/**
 * El estudio que se refleja en el vidrio: cuarto oscuro con tiras de luz (la foto de producto de sus
 * placas: una ventana cálida a la izquierda, un filo frío a la derecha, cenital suave, rebote dorado).
 * Colores > 1: el PMREM guarda en media precisión, así las tiras quedan como luz, no como pintura.
 */
function estudio(): THREE.Scene {
  const s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.BoxGeometry(14, 10, 14), new THREE.MeshBasicMaterial({ color: 0x0b0907, side: THREE.BackSide })));
  const tira = (ancho: number, alto: number, color: number, fuerza: number, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(ancho, alto), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(fuerza), side: THREE.DoubleSide }));
    m.position.set(x, y, z);
    m.lookAt(0, 0.8, 0);
    s.add(m);
  };
  tira(1.1, 7, 0xffd8a0, 7, -5.4, 1.2, 2.6);
  tira(0.45, 6, 0xcfdcff, 3.2, 5.8, 1.6, -1.2);
  tira(7, 1.1, 0xfff1da, 2.4, 0, 4.6, 0.4);
  tira(3.2, 0.5, 0xc8a05a, 1.6, 0.4, -1.6, 5);
  tira(0.3, 4, 0xffffff, 4, 3.4, 2.2, 4.6);
  // Del lado de la cámara: las vetas de luz verticales que se ven sobre el frente del frasco.
  // (Todo adentro del cuarto de 14 × 10 × 14: una tira sobre la pared o afuera no se refleja.)
  tira(0.55, 5, 0xfff0d8, 6, -2.4, 1.8, 5.6);
  tira(0.28, 4, 0xffffff, 4, 2.5, 2.1, 6.2);
  tira(8, 3.4, 0x3a2c1e, 3.2, 0, 1.6, 6.6);
  // Una tira corta y alta, arriba a la derecha: la agarran el bisel y el aro de la tapa al girar.
  tira(1.6, 0.4, 0xfff6e6, 3, 2.2, 4.4, 3.2);
  return s;
}

// ── la escena ────────────────────────────────────────────────────────────────

export async function crearFrasco(op: OpcionesFrasco): Promise<Frasco> {
  const alta = op.calidad === "alta";
  let ancho = op.ancho;
  let alto = op.alto;
  let dpr = op.dpr;
  await asegurarLetra(op.letra, op.urlLetra);

  // Las texturas primero (lienzo 2D, sin GPU) y una respiración: el mármol y el retablo son lo más
  // pesado del hilo y no tienen por qué compartir tarea con la creación del contexto.
  const mapaRetablo = texturaRetablo(op.fondo, op.letra, alta ? 1024 : 512);
  const marmol = texturaMarmol(alta ? 1024 : 512, alta ? 512 : 256);
  await respirar();
  const mapaEtiqueta = texturaEtiqueta(op.letra, alta ? 1024 : 512);
  const moleteado = texturaMoleteado();
  const degradeLiquido = texturaLiquido();

  const renderer = new THREE.WebGLRenderer({
    canvas: op.lienzo,
    antialias: alta,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(dpr || 1, alta ? 1.75 : 1.25));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = alta;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.transmissionResolutionScale = alta ? 1 : 0.5;

  const escena = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const entorno = pmrem.fromScene(estudio(), 0.035).texture;
  escena.environment = entorno;
  await respirar();

  const camara = new THREE.PerspectiveCamera(28, 1, 0.1, 60);

  // Pared de fondo: el color exacto de la página (sin mapeo de tonos).
  const fondo = new THREE.Color(op.fondo);
  const pared = new THREE.Mesh(new THREE.PlaneGeometry(60, 34), new THREE.MeshBasicMaterial({ color: fondo, toneMapped: false }));
  pared.position.set(0, 1.5, -3.4);
  escena.add(pared);

  // Todo lo que se corre con el diseño (a la derecha en pantalla ancha, centrado en el teléfono).
  const set = new THREE.Group();
  escena.add(set);

  const retablo = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 7.2), new THREE.MeshBasicMaterial({ map: mapaRetablo, toneMapped: false }));
  retablo.position.set(0, 1.55, -3.3);
  set.add(retablo);

  // ── materiales: cuatro programas físicos, compartidos a propósito ─────────────────────────
  // Cada combinación distinta de mapas/rasgos es un programa aparte y cada programa físico tarda en
  // compilar. Se agrupan: «laqueado» (tapa y cabezal), «oro» (virola, vástago, disco y filete: el mismo
  // bump con escala distinta), «con mapa» (zócalo, etiqueta y perfume: mapa + laca, todos reciben sombra)
  // y el vidrio, que es único. Los colores y escalas son uniformes: no cambian el programa.
  // Laca: las caras planas reflejan las tiras del estudio, pero con un poco de rugosidad en el
  // barniz, así el reflejo tiene cuerpo (un brillo que se degrada) y no es un rectángulo gris pegado.
  const laca = new THREE.MeshPhysicalMaterial({
    color: 0x131014,
    metalness: 0.4,
    roughness: 0.16,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
    flatShading: true,
    envMapIntensity: 2.2,
  });
  const oro = new THREE.MeshPhysicalMaterial({
    color: 0xd4ab62,
    metalness: 1,
    roughness: 0.28,
    bumpMap: moleteado,
    bumpScale: 1.4,
    envMapIntensity: 1.5,
  });
  const oroLiso = oro.clone();
  oroLiso.color.set(0xe0bb72);
  oroLiso.roughness = 0.18;
  oroLiso.bumpScale = 0;
  oroLiso.envMapIntensity = 1.6;
  const conMapa = (map: THREE.Texture, extra: THREE.MeshPhysicalMaterialParameters) =>
    new THREE.MeshPhysicalMaterial({ map, clearcoat: 1, clearcoatRoughness: 0.08, ...extra });

  // Zócalo de mármol.
  const zocalo = new THREE.Mesh(new RoundedBoxGeometry(4.4, 0.42, 2.4, 3, 0.03), conMapa(marmol, { roughness: 0.16, metalness: 0, envMapIntensity: 0.9 }));
  zocalo.position.y = -0.21;
  zocalo.receiveShadow = alta;
  set.add(zocalo);
  // Filete de bronce en el canto de arriba: lo que hace que el mármol se lea como una vitrina.
  const bronce = oroLiso.clone();
  bronce.color.set(0xc9a25a);
  bronce.roughness = 0.22;
  const filete = new THREE.Mesh(new THREE.BoxGeometry(4.42, 0.018, 2.42), bronce);
  filete.position.y = -0.006;
  set.add(filete);

  const sombra = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 1.5),
    new THREE.MeshBasicMaterial({ map: texturaSombra(), transparent: true, depthWrite: false, opacity: 0.85, color: 0x000000 }),
  );
  sombra.rotation.x = -Math.PI / 2;
  sombra.position.y = 0.004;
  set.add(sombra);

  // El frasco.
  const frasco = new THREE.Group();
  set.add(frasco);

  // El perfume se ve más hondo que el color plano de la familia (así se ve un líquido a través de vidrio grueso).
  const hondo = (hex: string) => new THREE.Color(hex).multiplyScalar(0.62);
  const colorLiquido = hondo(op.color);
  const vidrio = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.035,
    metalness: 0,
    transmission: 1,
    thickness: 1.15,
    ior: 1.5,
    attenuationColor: new THREE.Color(0xfff6e6),
    attenuationDistance: 5,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    specularIntensity: 1,
    envMapIntensity: 1.6,
  });
  if (alta) vidrio.dispersion = 0.2;

  const cuerpo = new THREE.Mesh(new RoundedBoxGeometry(CUERPO.ancho, CUERPO.alto, CUERPO.fondo, 6, CUERPO.radio), vidrio);
  cuerpo.position.y = CUERPO.alto / 2;
  frasco.add(cuerpo);

  // El perfume adentro: un volumen OPACO dentro del vidrio grueso (fondo de 0,1 y paredes de 0,1),
  // lleno hasta el 78 %. Opaco a propósito: así entra al pase de transmisión y el vidrio lo refracta
  // como líquido; arriba queda vidrio limpio y se lee el nivel.
  const perfume = conMapa(degradeLiquido, { color: colorLiquido.clone(), emissive: colorLiquido.clone(), emissiveIntensity: 0.05, roughness: 0.18, metalness: 0, envMapIntensity: 0.9 });
  const altoLiquido = CUERPO.alto * 0.78;
  const liquido = new THREE.Mesh(new RoundedBoxGeometry(CUERPO.ancho - 0.22, altoLiquido, CUERPO.fondo - 0.22, 4, 0.08), perfume);
  liquido.position.y = 0.11 + altoLiquido / 2;
  liquido.receiveShadow = alta;
  frasco.add(liquido);
  // El menisco: una lámina más clara en la superficie, así el nivel se lee como una línea de luz y no
  // como un cambio de tono. Opaca por lo mismo que el perfume (lo transparente no se refracta).
  const claroMenisco = new THREE.Color(0xfff4dc);
  const menisco = new THREE.Mesh(
    new THREE.BoxGeometry(CUERPO.ancho - 0.24, 0.022, CUERPO.fondo - 0.24),
    conMapa(degradeLiquido, { color: colorLiquido.clone().lerp(claroMenisco, 0.55), roughness: 0.08, metalness: 0, envMapIntensity: 1.3 }),
  );
  menisco.position.y = 0.11 + altoLiquido;
  menisco.receiveShadow = alta;
  frasco.add(menisco);

  const cuello = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, CUELLO.alto, 48), vidrio);
  cuello.position.y = Y_CUELLO;
  frasco.add(cuello);

  const virola = new THREE.Mesh(new THREE.CylinderGeometry(VIROLA.radio, VIROLA.radio, VIROLA.alto, 96), oro);
  virola.position.y = Y_VIROLA;
  virola.castShadow = alta;
  frasco.add(virola);

  const boquilla = new THREE.Group();
  const vastago = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 24), oroLiso);
  vastago.position.y = 0.05;
  const cabezal = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 32), laca);
  cabezal.position.y = 0.16;
  boquilla.add(vastago, cabezal);
  boquilla.position.y = Y_TAPA;
  frasco.add(boquilla);

  // La tapa: ocho caras planas (flatShading) que agarran las tiras del estudio una por una al girar,
  // un aro de oro en la base y el disco de arriba. Una cara plana al frente, como en su foto.
  const tapa = new THREE.Group();
  const tapaCuerpo = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.52, TAPA.alto, 8, 1), laca);
  tapaCuerpo.position.y = TAPA.alto / 2;
  tapaCuerpo.rotation.y = Math.PI / 8;
  const tapaBisel = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.47, TAPA.bisel, 8, 1), laca);
  tapaBisel.position.y = TAPA.alto + TAPA.bisel / 2;
  tapaBisel.rotation.y = Math.PI / 8;
  const tapaDisco = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.018, 8), oroLiso);
  tapaDisco.position.y = TAPA.alto + TAPA.bisel + 0.009;
  tapaDisco.rotation.y = Math.PI / 8;
  const tapaAro = new THREE.Mesh(new THREE.CylinderGeometry(0.525, 0.53, 0.028, 8, 1), oroLiso);
  tapaAro.position.y = 0.014;
  tapaAro.rotation.y = Math.PI / 8;
  for (const m of [tapaCuerpo, tapaBisel, tapaDisco, tapaAro]) {
    m.castShadow = alta;
    tapa.add(m);
  }
  tapa.position.y = Y_TAPA;
  frasco.add(tapa);

  const etiqueta = new THREE.Mesh(new THREE.PlaneGeometry(0.74, 0.74), conMapa(mapaEtiqueta, { transparent: true, metalness: 0.9, roughness: 0.3, envMapIntensity: 1.3 }));
  etiqueta.position.set(0, CUERPO.alto * 0.52, CUERPO.fondo / 2 + 0.004);
  etiqueta.receiveShadow = alta;
  frasco.add(etiqueta);

  // Luces: la cálida de las placas, un filo frío y un relleno bajo.
  const clave = new THREE.SpotLight(0xffe0b4, 0, 0, 0.42, 0.85, 2);
  clave.castShadow = alta;
  clave.shadow.mapSize.set(1024, 1024);
  clave.shadow.bias = -0.0004;
  clave.shadow.radius = 5;
  set.add(clave, clave.target);
  clave.position.set(-2.4, 6.4, 3.6);
  clave.target.position.set(0, 1.1, 0);
  const filo = new THREE.DirectionalLight(0xa9c0ff, 0.9);
  filo.position.set(4, 3, -3);
  escena.add(filo);
  escena.add(new THREE.HemisphereLight(0xffe8c8, 0x080604, 0.28));

  // La bruma.
  const N = alta ? 700 : 320;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const vel = new Float32Array(N * 3);
  const vida = new Float32Array(N);
  const vidaMax = new Float32Array(N).fill(1);
  const geoBruma = new THREE.BufferGeometry();
  const atrPos = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  const atrCol = new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage);
  geoBruma.setAttribute("position", atrPos);
  geoBruma.setAttribute("color", atrCol);
  const bruma = new THREE.Points(
    geoBruma,
    new THREE.PointsMaterial({
      size: alta ? 0.12 : 0.15,
      map: texturaGota(),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
      sizeAttenuation: true,
    }),
  );
  bruma.frustumCulled = false;
  escena.add(bruma);
  const colorBruma = new THREE.Color();
  let siguiente = 0;
  let acumulado = 0;

  // ── estado ─────────────────────────────────────────────────────────────────
  const objetivo = { x: 0, y: 0 };
  const mirada = { x: 0, y: 0 };
  let rociando = false;
  let soltadoEn = -10;
  let tapaArriba = 0;
  let salida = 0;
  let t = 0;
  let encendido = 0; // intro: la luz se prende
  let vivas = 0;
  let activo = false;
  let anchoDePantalla = true;
  let economia = !alta; // ya bajó de resolución (o nació en calidad baja)
  let cuadrosMedidos = 0;
  let tiempoMedido = 0;
  const colorObjetivo = colorLiquido.clone();
  const colorMenisco = menisco.material.color;
  const colorBrumaBase = new THREE.Color(op.color);
  const blancoBruma = new THREE.Color(0xfff4e0);
  const reloj = new THREE.Timer();
  const tmpV = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();
  const tmpC = new THREE.Color();
  const origenBruma = new THREE.Vector3();

  function ubicar() {
    const w = ancho || 1;
    const h = alto || 1;
    renderer.setSize(w, h, false);
    camara.aspect = w / h;
    anchoDePantalla = camara.aspect >= 1.05;
    // Que el frasco entre ENTERO (tapa levantada incluida) en cualquier proporción: la distancia sale
    // del alto que hay que mostrar y, en lo angosto, también del ancho (frasco + un margen).
    const tan = Math.tan(THREE.MathUtils.degToRad(camara.fov / 2));
    const porAlto = 4.9 / (2 * tan);
    const porAncho = 2.7 / (2 * tan * camara.aspect);
    const dist = Math.max(porAlto, porAncho);
    // Pantalla ancha: el frasco a la derecha del titular (≈ 70 % del ancho). Teléfono: centrado.
    const medioAncho = tan * dist * camara.aspect;
    set.position.x = anchoDePantalla ? medioAncho * 0.42 : 0;
    camara.position.set(0, 1.7, dist);
    camara.lookAt(0, anchoDePantalla ? 1.42 : 1.3, 0);
    camara.updateProjectionMatrix();
  }

  /** Los primeros cuadros salen lentos (GPU integrada, teléfono): menos píxeles, sin recompilar nada. */
  function economizar() {
    economia = true;
    renderer.setPixelRatio(Math.min(dpr || 1, 1));
    renderer.transmissionResolutionScale = 0.5;
    ubicar();
  }

  function emitir(dt: number) {
    const porSegundo = alta ? 420 : 220;
    acumulado += dt * porSegundo;
    frasco.updateWorldMatrix(true, false);
    frasco.getWorldQuaternion(tmpQ);
    // La boquilla dispara hacia adelante-izquierda del frasco (hacia el titular).
    const dir = tmpV.set(-0.72, 0.16, 0.68).applyQuaternion(tmpQ).normalize();
    origenBruma.set(0, Y_BOQUILLA + 0.16, 0.1).applyMatrix4(frasco.matrixWorld);
    colorBruma.copy(colorBrumaBase).lerp(blancoBruma, 0.5);
    while (acumulado >= 1) {
      acumulado -= 1;
      const i = siguiente;
      siguiente = (siguiente + 1) % N;
      const v = 1.9 + Math.random() * 1.5;
      const abre = 0.34;
      vel[i * 3] = dir.x * v + (Math.random() - 0.5) * abre;
      vel[i * 3 + 1] = dir.y * v + (Math.random() - 0.5) * abre;
      vel[i * 3 + 2] = dir.z * v + (Math.random() - 0.5) * abre;
      pos[i * 3] = origenBruma.x;
      pos[i * 3 + 1] = origenBruma.y;
      pos[i * 3 + 2] = origenBruma.z;
      vidaMax[i] = 1.2 + Math.random() * 1.1;
      vida[i] = vidaMax[i];
    }
  }

  function moverBruma(dt: number) {
    vivas = 0;
    const freno = Math.exp(-dt * 1.9);
    for (let i = 0; i < N; i++) {
      if (vida[i] <= 0) {
        col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0;
        continue;
      }
      vivas++;
      vida[i] -= dt;
      const k = i * 3;
      vel[k] = vel[k] * freno + Math.sin(t * 2.1 + i * 1.7) * dt * 0.5;
      vel[k + 1] = vel[k + 1] * freno + dt * 0.16;
      vel[k + 2] = vel[k + 2] * freno + Math.cos(t * 1.7 + i) * dt * 0.3;
      pos[k] += vel[k] * dt;
      pos[k + 1] += vel[k + 1] * dt;
      pos[k + 2] += vel[k + 2] * dt;
      const f = Math.max(0, vida[i] / vidaMax[i]);
      const a = Math.pow(f, 1.3) * 0.42;
      col[k] = colorBruma.r * a;
      col[k + 1] = colorBruma.g * a;
      col[k + 2] = colorBruma.b * a;
    }
    atrPos.needsUpdate = true;
    atrCol.needsUpdate = true;
  }

  function actualizar(dt: number) {
    t += dt;
    // Intro: la luz se prende con un titileo breve, como una lámpara de vitrina.
    encendido = Math.min(1, encendido + dt / 1.5);
    const e = 1 - Math.pow(1 - encendido, 3);
    const titileo = encendido < 0.3 ? Math.sin(t * 70) * 0.22 * (0.3 - encendido) / 0.3 : 0;
    clave.intensity = 150 * Math.max(0, e + titileo);
    frasco.position.y = (1 - e) * -0.1;

    // Mirada con resorte + vaivén suave cuando nadie toca.
    const suave = 1 - Math.exp(-dt * 4);
    mirada.x += (objetivo.x - mirada.x) * suave;
    mirada.y += (objetivo.y - mirada.y) * suave;
    frasco.rotation.y = 0.42 + Math.sin(t * 0.42) * 0.16 + mirada.x * 0.55 + salida * 1.1;
    frasco.rotation.x = mirada.y * 0.1;

    // La tapa sube antes de rociar y vuelve un rato después de soltar.
    const tapaObjetivo = rociando || t - soltadoEn < 0.35 ? 1 : 0;
    tapaArriba += (tapaObjetivo - tapaArriba) * (1 - Math.exp(-dt * 9));
    tapa.position.y = Y_TAPA + tapaArriba * 0.62;
    tapa.position.x = -tapaArriba * 0.16;
    tapa.rotation.z = tapaArriba * 0.24;

    // Color de la familia: el perfume de adentro cambia de a poco (y el menisco, con él).
    const k = 1 - Math.exp(-dt * 3);
    perfume.color.lerp(colorObjetivo, k);
    perfume.emissive.lerp(colorObjetivo, k);
    colorMenisco.lerp(tmpC.copy(colorObjetivo).lerp(claroMenisco, 0.55), k);

    if (rociando && tapaArriba > 0.55) emitir(dt);
    moverBruma(dt);

    camara.position.y = 1.7 + salida * 0.5;
  }

  function cuadro(tiempo: number) {
    reloj.update(tiempo);
    const crudo = reloj.getDelta();
    const dt = Math.min(crudo, 1 / 20);
    actualizar(dt);
    renderer.render(escena, camara);
    // Con la luz ya prendida se miden 45 cuadros: si el promedio pasa de 30 ms, se baja de resolución.
    if (!economia && encendido >= 1) {
      cuadrosMedidos++;
      tiempoMedido += crudo;
      if (cuadrosMedidos >= 45) {
        if (tiempoMedido / cuadrosMedidos > 0.03) economizar();
        else economia = true; // anda bien: no se mide más
      }
    }
  }

  function pintarQuieto() {
    // Movimiento reducido: la luz ya prendida, el frasco en tres cuartos, sin bruma.
    encendido = 1;
    clave.intensity = 150;
    frasco.rotation.y = 0.42 + mirada.x * 0.3;
    perfume.color.copy(colorObjetivo);
    perfume.emissive.copy(colorObjetivo);
    colorMenisco.copy(colorObjetivo).lerp(claroMenisco, 0.55);
    renderer.render(escena, camara);
  }

  function encender(si: boolean) {
    if (!op.movimiento) return;
    if (si === activo) return;
    activo = si;
    if (si) reloj.reset();
    renderer.setAnimationLoop(si ? cuadro : null);
  }

  const alPerder = (e: Event) => {
    e.preventDefault();
    encender(false);
    op.alPerder?.();
  };
  op.lienzo.addEventListener("webglcontextlost", alPerder);

  ubicar();
  // Los shaders se compilan en paralelo (sin bloquear) antes del primer cuadro: el primer cuadro sale
  // entero, no a los tirones.
  try {
    await renderer.compileAsync(escena, camara);
  } catch {
    /* sin la extensión o con un driver raro: el primer render compila como siempre */
  }
  if (op.movimiento) encender(true);
  else pintarQuieto();

  return {
    color(hex) {
      colorObjetivo.copy(hondo(hex));
      colorBrumaBase.set(hex);
      if (!op.movimiento) pintarQuieto();
    },
    mirar(x, y) {
      objetivo.x = Math.max(-1, Math.min(1, x));
      objetivo.y = Math.max(-1, Math.min(1, y));
    },
    rociar(si) {
      if (!op.movimiento) return;
      if (!si && rociando) soltadoEn = t;
      rociando = si;
    },
    salida(p) {
      salida = Math.max(0, Math.min(1, p));
    },
    activo(si) {
      // Con bruma en el aire se deja terminar el cuadro aunque salga de pantalla un instante.
      encender(si || vivas > 0);
    },
    medir(w, h, d) {
      ancho = w;
      alto = h;
      if (d && d !== dpr) {
        dpr = d;
        renderer.setPixelRatio(Math.min(dpr, economia ? 1 : alta ? 1.75 : 1.25));
      }
      ubicar();
      if (!op.movimiento) pintarQuieto();
    },
    soltar() {
      encender(false);
      reloj.dispose();
      op.lienzo.removeEventListener("webglcontextlost", alPerder);
      escena.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
        for (const mat of mats) {
          for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
          mat.dispose();
        }
      });
      entorno.dispose();
      pmrem.dispose();
      renderer.dispose();
    },
  };
}
