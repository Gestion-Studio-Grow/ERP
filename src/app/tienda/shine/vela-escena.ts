// ============================================================================
// LA VELA DE SHINE — la escena 3D de la portada (three.js, sin React).
// ============================================================================
//
// Corre en un WEB WORKER sobre un OffscreenCanvas (vela-worker.ts) o, si el navegador no puede, en el
// hilo principal (EscenaVela.tsx): por eso no toca `window` ni `document` salvo detrás de un `typeof`, y el
// tamaño y el DPR le llegan de afuera. Se carga con import dinámico SÓLO en la vidriera de Shine: el
// resto del ERP no baja three.js. Misma técnica y presupuesto que el frasco de Qué Bien Olés
// (tienda/quebienoles/frasco-escena.ts).
//
// Qué se ve y de dónde sale (fotos del catálogo, public/tenants/shinevelas/):
//   · El frasco: el de «mundo-velas.jpg» — vidrio transparente de paredes rectas, alto ≈ 0,88 del
//     ancho, fondo grueso, esquina de abajo redondeada y la ROSCA (tres filetes) en el 20 % de arriba,
//     sin tapa (ninguna foto del catálogo muestra la tapa). Vidrio con transmisión física.
//   · La cera: soja color miel, llena hasta el hombro de la rosca, con las manchas claras verticales
//     donde la cera se despega del vidrio (el tercer frasco de la foto). Cerca de la llama se ve
//     traslúcida: la franja de arriba y el centro del tope brillan con la luz de la llama que la
//     atraviesa. Prendida, se forma el charco de cera líquida alrededor de la mecha.
//   · La mecha de algodón (derecha, con la punta quemada) y la llama: gota con núcleo blanco, borde
//     naranja y base azul, que titila y se inclina si pasás el dedo o el mouse rápido.
//   · La luz de la llama ilumina la cera, el vidrio, la mesa y la pared; apagada, la sala queda en
//     penumbra y la brasa de la mecha se enfría mientras sube el hilo de humo (el de «hero.jpg»).
//   · La mesa de tablones gastados, las escamas de soja sueltas y el fondo cálido con luces
//     desenfocadas son los de «hero.jpg».
//
// Presupuesto: UN objeto transmisivo (el vaso), texturas de lienzo generadas acá (cero descargas),
// sin mapas de sombra (una sombra de contacto y un halo pintados), materiales que comparten programa
// (cera, charco y escamas son el mismo), `compileAsync` antes del primer cuadro, baja de resolución
// sola si los primeros cuadros salen lentos, el bucle se apaga fuera de pantalla, con la pestaña
// oculta y también cuando la vela está apagada y quieta. Con movimiento reducido: un cuadro quieto.

import * as THREE from "three";
import { ajustesDelPaso, bucleNecesario, CUADROS_A_MEDIR, pasoDeEconomia, planDeEscena, titileo, type PasoDeCalidad } from "./vela-reglas";

export type OpcionesVela = {
  /** El lienzo: el `<canvas>` de la página (hilo principal) o su OffscreenCanvas (worker). */
  lienzo: HTMLCanvasElement | OffscreenCanvas;
  ancho: number;
  alto: number;
  dpr: number;
  /** Color de la cera (el del aroma elegido o el del catálogo). */
  cera: string;
  /** false = movimiento reducido: un cuadro quieto, sin humo. */
  movimiento: boolean;
  calidad: "alta" | "baja";
  /** false = sin baja automática de calidad (sólo para capturas de QA de la calidad completa). */
  adaptar?: boolean;
  /** "columna": la vela en la columna de la foto (vidriera de siempre); "sangre": portada a todo el ancho. */
  encuadre: "columna" | "sangre";
  encendida: boolean;
  /** Se perdió el contexto WebGL (driver, memoria): la vidriera vuelve a la foto. */
  alPerder?: () => void;
  /** Cuadros por segundo medidos (cada ~2 s mientras corre el bucle) y el paso de economía. */
  alRitmo?: (fps: number, paso: number) => void;
  /** Dónde cae la vela en el lienzo (fracción 0..1 de ancho y alto): para la QA y el cursor. */
  alUbicar?: (x: number, y: number) => void;
};

export type Vela = {
  cera(hex: string): void;
  encender(si: boolean): void;
  /** Hacia dónde mira la cámara: x, y en -1..1 (puntero). Moverlo rápido inclina la llama. */
  mirar(x: number, y: number): void;
  /** Encender/apagar el bucle (fuera de pantalla, pestaña oculta). */
  activo(si: boolean): void;
  medir(ancho: number, alto: number, dpr: number): void;
  soltar(): void;
};

// ── medidas (unidades de escena: el radio del frasco es 1; la mesa está en y = 0) ─────────────
const VASO = { radio: 1, alto: 1.765, interior: 0.915, fondo: 0.17 };
const CERA = { radio: 0.911, base: 0.17, tope: 1.34 };
const MECHA = { alto: 0.13 };
const Y_LLAMA = CERA.tope + MECHA.alto - 0.03;
// La llama de «mundo-velas.jpg» mide ≈ 0,46 del alto del frasco y asoma por encima del borde.
const LLAMA = { ancho: 0.3, alto: 0.8 };
const FOV = 30;

// PRNG con semilla: la mesa, las escamas y el fondo salen iguales en cada visita (y en cada captura).
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

type Pincel = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function lienzo2d(ancho: number, alto: number) {
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

// ── texturas (todas dibujadas acá: cero descargas) ─────────────────────────────

/** La mesa de «hero.jpg»: tablones anchos, a lo largo (hacia el fondo), con veta, nudos y juntas. */
function texturaMesa(lado: number): THREE.Texture {
  const { c, g } = lienzo2d(lado, lado);
  const r = azar(2709);
  const tablas = 6;
  const ancho = lado / tablas;
  const tonos = ["#6b4a33", "#5d402d", "#74523a", "#56392a", "#664632", "#5f4431"];
  for (let i = 0; i < tablas; i++) {
    const x0 = i * ancho;
    g.fillStyle = tonos[i % tonos.length];
    g.fillRect(x0, 0, ancho, lado);
    // Veta: líneas finas a lo largo de la tabla, con ondulación.
    for (let k = 0; k < 70; k++) {
      const x = x0 + r() * ancho;
      const fase = r() * 6.28;
      const amp = 0.4 + r() * 1.8;
      g.beginPath();
      for (let y = 0; y <= lado; y += 8) {
        const xx = x + Math.sin(y / (40 + r() * 3) + fase) * amp;
        if (y === 0) g.moveTo(xx, y);
        else g.lineTo(xx, y);
      }
      g.strokeStyle = r() < 0.55 ? `rgba(30, 18, 10, ${0.05 + r() * 0.12})` : `rgba(160, 118, 80, ${0.05 + r() * 0.1})`;
      g.lineWidth = 0.5 + r() * 1.1;
      g.stroke();
    }
    // Nudos.
    const nudos = r() < 0.6 ? 1 : 0;
    for (let n = 0; n < nudos; n++) {
      const nx = x0 + ancho * (0.25 + r() * 0.5);
      const ny = r() * lado;
      for (let a = 0; a < 5; a++) {
        g.beginPath();
        g.ellipse(nx, ny, 4 + a * 3.5, 10 + a * 7, 0, 0, Math.PI * 2);
        g.strokeStyle = `rgba(28, 16, 9, ${0.35 - a * 0.05})`;
        g.lineWidth = 1.4;
        g.stroke();
      }
    }
    // Junta a lo largo (la ranura entre tablas) y alguna junta de punta.
    g.fillStyle = "#1f130b";
    g.fillRect(x0, 0, Math.max(2, lado / 340), lado);
    g.fillStyle = "rgba(190, 150, 110, 0.18)";
    g.fillRect(x0 + Math.max(2, lado / 340), 0, 1, lado);
    if (r() < 0.5) {
      const yj = r() * lado;
      g.fillStyle = "#24160d";
      g.fillRect(x0, yj, ancho, Math.max(2, lado / 400));
    }
  }
  // Desgaste: manchas suaves más claras (la mesa gastada de la foto).
  for (let i = 0; i < 26; i++) {
    const x = r() * lado;
    const y = r() * lado;
    const rad = lado * (0.03 + r() * 0.09);
    const d = g.createRadialGradient(x, y, 0, x, y, rad);
    d.addColorStop(0, `rgba(170, 128, 90, ${0.05 + r() * 0.08})`);
    d.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = d;
    g.fillRect(0, 0, lado, lado);
  }
  const t = textura(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** La pared de «hero.jpg»: marrón cálido en penumbra con luces desenfocadas doradas (bokeh). */
function texturaFondo(ancho: number, alto: number): THREE.Texture {
  const { c, g } = lienzo2d(ancho, alto);
  const r = azar(1507);
  const base = g.createLinearGradient(0, 0, ancho, alto);
  base.addColorStop(0, "#3a281d");
  base.addColorStop(0.55, "#4a3324");
  base.addColorStop(1, "#5a3c26");
  g.fillStyle = base;
  g.fillRect(0, 0, ancho, alto);
  // Un resplandor cálido arriba a la derecha, como la foto.
  const res = g.createRadialGradient(ancho * 0.72, alto * 0.3, 0, ancho * 0.72, alto * 0.3, ancho * 0.45);
  res.addColorStop(0, "rgba(201, 113, 27, 0.35)");
  res.addColorStop(1, "rgba(201, 113, 27, 0)");
  g.fillStyle = res;
  g.fillRect(0, 0, ancho, alto);
  // Bokeh: discos de borde suave, chicos y muchos, más en la mitad derecha y arriba (como la foto).
  const u = ancho / 1024;
  for (let i = 0; i < 46; i++) {
    const x = ancho * (0.04 + Math.pow(r(), 0.65) * 0.94);
    const y = alto * (0.06 + r() * 0.5);
    const rad = (5 + Math.pow(r(), 2) * 15) * u;
    const a = 0.3 + r() * 0.6;
    const d = g.createRadialGradient(x, y, 0, x, y, rad);
    d.addColorStop(0, `rgba(255, 216, 128, ${a})`);
    d.addColorStop(0.7, `rgba(255, 192, 74, ${a * 0.85})`);
    d.addColorStop(1, "rgba(255, 170, 60, 0)");
    g.fillStyle = d;
    g.beginPath();
    g.arc(x, y, rad, 0, Math.PI * 2);
    g.fill();
  }
  // Abajo, la pared se funde con el color de la niebla (donde termina la mesa).
  const pie = g.createLinearGradient(0, alto * 0.62, 0, alto);
  pie.addColorStop(0, "rgba(61, 42, 30, 0)");
  pie.addColorStop(1, "rgba(61, 42, 30, 1)");
  g.fillStyle = pie;
  g.fillRect(0, 0, ancho, alto);
  return textura(c);
}

/** Radial suave (sombra, halo, brillo): de `centro` a transparente. */
function texturaRadial(lado: number, paradas: [number, string][]): THREE.Texture {
  const { c, g } = lienzo2d(lado, lado);
  const m = lado / 2;
  const d = g.createRadialGradient(m, m, 0, m, m, m);
  for (const [p, col] of paradas) d.addColorStop(p, col);
  g.fillStyle = d;
  g.fillRect(0, 0, lado, lado);
  return textura(c, false);
}

/**
 * El costado de la cera (mapa de color): parejo, con las manchas claras verticales donde la soja se
 * despega del vidrio (se ven en el tercer frasco de «mundo-velas.jpg»). Gris claro: el color real
 * lo pone el material, así cambiar de aroma no rehace la textura.
 */
function texturaCeraCostado(): THREE.Texture {
  const { c, g } = lienzo2d(512, 256);
  const r = azar(911);
  g.fillStyle = "#dcdcdc";
  g.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 18; i++) {
    const x = r() * 512;
    const w = 6 + r() * 26;
    const y0 = r() * 120;
    const h = 60 + r() * 170;
    const d = g.createLinearGradient(x - w, 0, x + w, 0);
    d.addColorStop(0, "rgba(255,255,255,0)");
    d.addColorStop(0.5, `rgba(255,255,255,${0.5 + r() * 0.4})`);
    d.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = d;
    g.fillRect(x - w, y0, w * 2, h);
  }
  // Abajo más hondo (la cera se ve más oscura lejos de la llama).
  const hondo = g.createLinearGradient(0, 256, 0, 0);
  hondo.addColorStop(0, "rgba(90, 55, 20, 0.34)");
  hondo.addColorStop(0.6, "rgba(90, 60, 30, 0)");
  g.fillStyle = hondo;
  g.fillRect(0, 0, 512, 256);
  const t = textura(c);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** Brillo del costado (mapa de emisión): la franja de arriba, donde la llama atraviesa la cera. */
function texturaCeraBrilloCostado(): THREE.Texture {
  const { c, g } = lienzo2d(8, 256);
  const d = g.createLinearGradient(0, 256, 0, 0);
  d.addColorStop(0, "#000000");
  d.addColorStop(0.38, "#050505");
  d.addColorStop(0.62, "#363636");
  d.addColorStop(0.88, "#b8b8b8");
  d.addColorStop(1, "#ffffff");
  g.fillStyle = d;
  g.fillRect(0, 0, 8, 256);
  return textura(c);
}

/** El tope de la cera (color): un anillo apenas más claro donde toca el vidrio. */
function texturaCeraTope(): THREE.Texture {
  return texturaRadial(256, [
    [0, "#eeeeee"],
    [0.86, "#e8e8e8"],
    [0.95, "#ffffff"],
    [1, "#f4f4f4"],
  ]);
}

/** Brillo del tope: fuerte alrededor de la mecha, se apaga hacia el vidrio. */
function texturaCeraBrilloTope(): THREE.Texture {
  return texturaRadial(256, [
    [0, "#ffffff"],
    [0.25, "#c8c8c8"],
    [0.6, "#5a5a5a"],
    [1, "#262626"],
  ]);
}

/**
 * El estudio que se refleja en el vidrio: sala en penumbra, la ventana cálida de la izquierda (la luz
 * rasante de «mundo-velas.jpg»), un filo claro a la derecha y puntos de luz (el bokeh). Colores > 1:
 * el PMREM guarda en media precisión, así las tiras quedan como luz.
 */
function estudio(): THREE.Scene {
  const s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.BoxGeometry(14, 10, 14), new THREE.MeshBasicMaterial({ color: 0x1c130d, side: THREE.BackSide })));
  const tira = (ancho: number, alto: number, color: number, fuerza: number, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(ancho, alto),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(fuerza), side: THREE.DoubleSide }),
    );
    m.position.set(x, y, z);
    m.lookAt(0, 1, 0);
    s.add(m);
  };
  tira(1.4, 5, 0xffd6a0, 5, -5.2, 2, 2.4);
  tira(0.4, 4, 0xfff0dc, 3, 5.4, 1.8, 1.2);
  tira(6, 1, 0xffe9d0, 1.4, 0, 4.6, 0.5);
  // Del lado de la cámara: la tira alta que deja el reflejo blanco vertical en el costado del frasco
  // (el de cada frasco de «mundo-velas.jpg»), y un filo más fino a la derecha.
  tira(0.9, 5, 0xffffff, 9, -3.1, 1.6, 5.6);
  tira(0.25, 3.4, 0xfff4e6, 4, 2.6, 1.7, 6.2);
  for (let i = 0; i < 7; i++) tira(0.35, 0.35, 0xffc860, 4, -3 + i, 2.8 + (i % 3) * 0.5, -6.5);
  return s;
}

/** El perfil del vaso (radio, altura), de afuera hacia adentro: se revoluciona con LatheGeometry. */
function perfilDelVaso(): THREE.Vector2[] {
  const p: THREE.Vector2[] = [];
  const arco = (cx: number, cy: number, rad: number, desde: number, hasta: number, pasos: number) => {
    for (let i = 0; i <= pasos; i++) {
      const a = desde + ((hasta - desde) * i) / pasos;
      p.push(new THREE.Vector2(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad));
    }
  };
  // Afuera: el fondo, la esquina redondeada y la pared recta.
  p.push(new THREE.Vector2(0, 0));
  p.push(new THREE.Vector2(0.8, 0));
  arco(0.9, 0.1, 0.1, -Math.PI / 2, 0, 6);
  // Tramos cortos junto a cada quiebre: si no, la pared recta hereda la inclinación del hombro en toda
  // su altura (normales promediadas) y el vidrio refracta en bandas oscuras sobre la cera.
  p.push(new THREE.Vector2(1, 0.14));
  p.push(new THREE.Vector2(1, 1.385));
  p.push(new THREE.Vector2(1, 1.4));
  // El hombro y la rosca: tres filetes.
  p.push(new THREE.Vector2(0.985, 1.43));
  p.push(new THREE.Vector2(0.972, 1.45));
  for (let k = 0; k < 3; k++) {
    const y = 1.48 + k * 0.083;
    p.push(new THREE.Vector2(0.972, y));
    p.push(new THREE.Vector2(0.992, y + 0.018));
    p.push(new THREE.Vector2(0.992, y + 0.034));
    p.push(new THREE.Vector2(0.972, y + 0.052));
  }
  // El labio redondeado.
  arco(0.9435, 1.735, 0.0285, 0, Math.PI, 8);
  // Adentro: la pared y el fondo grueso, con su esquina (y sus tramos cortos, por lo mismo).
  p.push(new THREE.Vector2(VASO.interior, 1.72));
  p.push(new THREE.Vector2(VASO.interior, 0.265));
  p.push(new THREE.Vector2(VASO.interior, 0.25));
  arco(0.835, 0.25, 0.08, 0, -Math.PI / 2, 5);
  p.push(new THREE.Vector2(0, VASO.fondo));
  return p;
}

// ── la llama y el humo (shaders chicos: se compilan en un instante) ─────────────

const RUIDO_GLSL = /* glsl */ `
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float ruido(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}`;

const LLAMA_VERT = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

// Gota con núcleo blanco, cuerpo amarillo, borde naranja y base azul; el hueco oscuro junto a la mecha.
const LLAMA_FRAG = /* glsl */ `
uniform float uT; uniform float uVida; uniform float uLadeo; uniform float uAlto; uniform float uTitileo;
varying vec2 vUv;
${RUIDO_GLSL}
void main(){
  float alto = max(uAlto * uVida, 0.001);
  float y = vUv.y / alto;
  if (y > 1.0 || uVida <= 0.001) discard;
  float n = ruido(vec2(vUv.x * 4.0, vUv.y * 6.0 - uT * 4.5)) - 0.5;
  float x = vUv.x - 0.5 - (uLadeo + n * 0.16) * y * y;
  float w = 0.36 * pow(sin(3.14159 * pow(clamp(y, 0.0, 1.0), 0.6)), 0.8) * (1.0 - 0.2 * y);
  float d = abs(x) / max(w, 0.0001);
  float forma = smoothstep(1.0, 0.5, d) * smoothstep(0.0, 0.05, y);
  vec3 borde = vec3(1.0, 0.45, 0.1);
  vec3 cuerpo = vec3(1.0, 0.78, 0.36);
  vec3 nucleo = vec3(1.0, 0.98, 0.9);
  vec3 col = mix(borde, cuerpo, smoothstep(1.0, 0.45, d));
  float blanco = smoothstep(0.62, 0.0, d) * smoothstep(0.92, 0.25, y);
  col = mix(col, nucleo, blanco);
  float azul = smoothstep(0.24, 0.02, y) * smoothstep(0.15, 0.95, d);
  col = mix(col, vec3(0.3, 0.42, 1.0), azul * 0.85);
  // La punta: naranja, más tenue (el hollín que no llega a quemarse).
  col = mix(col, vec3(1.0, 0.5, 0.14), smoothstep(0.62, 1.0, y) * (1.0 - blanco) * 0.8);
  float hueco = smoothstep(0.2, 0.0, y) * smoothstep(0.55, 0.0, d);
  float a = forma * (1.0 - 0.6 * hueco) * (0.9 + 0.2 * n) * (1.0 - 0.35 * smoothstep(0.75, 1.0, y));
  // El brillo sigue el MISMO titileo que la luz puntual (vela-reglas.ts → titileo).
  gl_FragColor = vec4(col * a * 1.5 * uTitileo, a);
}`;

// El hilo de humo: cada partícula guarda cuándo nació; la trayectoria la calcula la GPU.
const HUMO_VERT = /* glsl */ `
attribute float aNace; attribute float aSemilla;
uniform float uT; uniform vec3 uOrigen; uniform float uEscala;
varying float vAlfa;
void main(){
  float edad = uT - aNace;
  float vida = 4.2;
  float k = clamp(edad / vida, 0.0, 1.0);
  vec3 p = uOrigen;
  p.y += edad * 0.36 + edad * edad * 0.018;
  float amp = 0.012 + 0.26 * k * k;
  float fase = aSemilla * 6.2831;
  p.x += sin(edad * 1.8 + uT * 0.35) * amp + sin(edad * 4.3 + fase) * 0.025 * k;
  p.z += cos(edad * 1.4 + uT * 0.2) * amp * 0.5;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  bool viva = edad >= 0.0 && edad <= vida;
  gl_PointSize = viva ? (0.03 + 0.42 * k) * uEscala / -mv.z : 0.0;
  vAlfa = viva ? smoothstep(0.0, 0.1, edad) * pow(1.0 - k, 1.7) * 0.42 : 0.0;
}`;

const HUMO_FRAG = /* glsl */ `
uniform vec3 uColor;
varying float vAlfa;
void main(){
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d) * vAlfa;
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor, a);
}`;

// ── la escena ────────────────────────────────────────────────────────────────

export async function crearVela(op: OpcionesVela): Promise<Vela> {
  const alta = op.calidad === "alta";
  const plan = planDeEscena(op.movimiento);
  let ancho = op.ancho;
  let alto = op.alto;
  let dpr = op.dpr;

  // Texturas primero (lienzo 2D, sin GPU) y una respiración entre las pesadas.
  const mapaMesa = texturaMesa(alta ? 1024 : 512);
  await respirar();
  const mapaFondo = texturaFondo(alta ? 2048 : 1024, alta ? 1024 : 512);
  await respirar();
  const ceraCostado = texturaCeraCostado();
  const ceraBrilloCostado = texturaCeraBrilloCostado();
  const ceraTope = texturaCeraTope();
  const ceraBrilloTope = texturaCeraBrilloTope();
  const mapaSombra = texturaRadial(128, [
    [0, "rgba(0,0,0,0.9)"],
    [0.55, "rgba(0,0,0,0.5)"],
    [1, "rgba(0,0,0,0)"],
  ]);
  // Cáusticas falsas: el vidrio junta la luz de la llama en un anillo cálido alrededor de la base.
  const mapaCaustica = texturaRadial(256, [
    [0, "rgba(255,170,90,0.55)"],
    [0.3, "rgba(255,160,80,0.35)"],
    [0.4, "rgba(255,196,120,0.95)"],
    [0.46, "rgba(255,170,90,0.4)"],
    [0.75, "rgba(255,140,60,0.12)"],
    [1, "rgba(255,140,60,0)"],
  ]);
  // Caída casi gaussiana: sin borde de disco.
  const mapaHalo = texturaRadial(128, [
    [0, "rgba(255,196,120,1)"],
    [0.18, "rgba(255,170,85,0.55)"],
    [0.45, "rgba(255,150,60,0.16)"],
    [0.75, "rgba(255,140,50,0.035)"],
    [1, "rgba(255,140,50,0)"],
  ]);

  const renderer = new THREE.WebGLRenderer({ canvas: op.lienzo, antialias: alta, alpha: false, powerPreference: "high-performance" });
  // Calidad en 4 escalones (0 = completa … 3 = la más liviana); un equipo modesto arranca en el 1.
  const topeDelEquipo = () => Math.min(dpr || 1, alta ? 1.75 : 1.25);
  let paso: PasoDeCalidad = alta ? 0 : 1;
  let densidad = ajustesDelPaso(paso, topeDelEquipo()).densidad;
  renderer.setPixelRatio(densidad);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.transmissionResolutionScale = ajustesDelPaso(paso, topeDelEquipo()).transmision;

  const escena = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const entorno = pmrem.fromScene(estudio(), 0.04).texture;
  escena.environment = entorno;
  await respirar();

  const COLOR_PARED = new THREE.Color(0x3d2a1e);
  escena.background = COLOR_PARED.clone();
  // La mesa se pierde en la penumbra hacia el fondo, sin horizonte duro (el desenfoque de la foto).
  const niebla = new THREE.Fog(COLOR_PARED.clone(), 6.5, 12.5);
  escena.fog = niebla;
  const camara = new THREE.PerspectiveCamera(FOV, 1, 0.1, 60);

  // La pared con las luces desenfocadas (sin niebla ni mapeo de tonos: es el fondo de la foto).
  const pared = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 15),
    new THREE.MeshBasicMaterial({ map: mapaFondo, toneMapped: false, fog: false }),
  );
  pared.position.set(1.5, 4, -7);
  escena.add(pared);

  // La mesa de tablones.
  mapaMesa.repeat.set(2.2, 3.4);
  // Lambert: madera mate, sin muestrear el entorno por píxel (la mesa es lo que más píxeles ocupa).
  const mesa = new THREE.Mesh(new THREE.PlaneGeometry(22, 34), new THREE.MeshLambertMaterial({ map: mapaMesa }));
  mesa.rotation.x = -Math.PI / 2;
  mesa.position.z = 8; // de z = -9 (se pierde en el fondo) a z = 25 (siempre pasa por debajo de la cámara)
  escena.add(mesa);

  const decal = (map: THREE.Texture, lado: number, aditivo: boolean) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(lado, lado),
      new THREE.MeshBasicMaterial({
        map,
        transparent: true,
        depthWrite: false,
        blending: aditivo ? THREE.AdditiveBlending : THREE.NormalBlending,
        toneMapped: false,
        color: aditivo ? 0xffffff : 0x000000,
      }),
    );
    m.rotation.x = -Math.PI / 2;
    escena.add(m);
    return m;
  };
  const sombra = decal(mapaSombra, 2.9, false);
  sombra.position.y = 0.003;
  (sombra.material as THREE.MeshBasicMaterial).opacity = 0.7;
  // La sombra suave que la luz de la ventana (arriba a la izquierda) estira hacia atrás a la derecha.
  const sombraVentana = decal(mapaSombra, 2.6, false);
  sombraVentana.scale.set(1.5, 0.75, 1);
  sombraVentana.rotation.z = 0.55;
  sombraVentana.position.set(0.9, 0.002, -0.55);
  (sombraVentana.material as THREE.MeshBasicMaterial).opacity = 0.42;
  // La luz que la llama tira sobre la mesa a través del vidrio: un anillo cálido (cáusticas falsas).
  const luzEnMesa = decal(mapaCaustica, 4.6, true);
  luzEnMesa.position.y = 0.005;

  // ── materiales: la cera, el charco y las escamas comparten UN programa ─────────
  const colorCera = new THREE.Color(op.cera);
  const tinteBrillo = new THREE.Color(0xffa24a);
  const cera = new THREE.MeshStandardMaterial({
    color: colorCera.clone(),
    map: ceraCostado,
    emissive: colorCera.clone().lerp(tinteBrillo, 0.55),
    emissiveMap: ceraBrilloCostado,
    emissiveIntensity: 0,
    roughness: 0.6,
    metalness: 0,
    // La cera casi no toma luz del estudio (ese entorno está para los reflejos del vidrio): la
    // ilumina la llama. Si no, se ve pálida, como de yeso, aun apagada.
    envMapIntensity: 0.12,
  });
  const ceraArriba = cera.clone();
  ceraArriba.map = ceraTope;
  ceraArriba.emissiveMap = ceraBrilloTope;
  const charcoMat = ceraArriba.clone();
  charcoMat.roughness = 0.08;
  const escamaMat = ceraArriba.clone();
  escamaMat.color.set(0xf2e6cf);
  escamaMat.emissiveIntensity = 0;

  const vidrio = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.035,
    metalness: 0,
    transmission: 1,
    thickness: 0.22,
    ior: 1.5,
    attenuationColor: new THREE.Color(0xfff1dc),
    attenuationDistance: 3,
    specularIntensity: 1,
    envMapIntensity: 1.9,
    // Barniz: el brillo de borde (fresnel) y los filos de la rosca se leen más nítidos.
    clearcoat: 1,
    clearcoatRoughness: 0.04,
  });
  // El vidrio del paso más liviano: sin transmisión (no hay segundo pase de la escena). Es un vidrio
  // de SÓLO REFLEJOS: sin color propio y con mezcla aditiva, suma el brillo del estudio y el fresnel
  // de los bordes sin agrisar la cera de atrás (con mezcla normal parecía una funda gris). Se compila
  // junto con todo, así cambiar a él no da un tirón.
  const vidrioLiviano = new THREE.MeshStandardMaterial({
    color: 0x000000,
    roughness: 0.04,
    metalness: 0,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    envMapIntensity: 2.4,
  });

  const vela = new THREE.Group();
  escena.add(vela);

  const geoVaso = new THREE.LatheGeometry(perfilDelVaso(), alta ? 96 : 64);
  const vaso = new THREE.Mesh(geoVaso, vidrio);
  vela.add(vaso);
  const vasoLiviano = new THREE.Mesh(geoVaso, vidrioLiviano);
  vasoLiviano.renderOrder = 8;
  vela.add(vasoLiviano); // visible sólo para compilarlo; se oculta antes del primer cuadro

  const segmentos = alta ? 96 : 64;
  const ceraLado = new THREE.Mesh(new THREE.CylinderGeometry(CERA.radio, CERA.radio, CERA.tope - CERA.base, segmentos, 1, true), cera);
  ceraLado.position.y = (CERA.tope + CERA.base) / 2;
  vela.add(ceraLado);
  const tope = new THREE.Mesh(new THREE.CircleGeometry(CERA.radio, segmentos), ceraArriba);
  tope.rotation.x = -Math.PI / 2;
  tope.position.y = CERA.tope;
  vela.add(tope);
  // El charco de cera líquida alrededor de la mecha: crece mientras la vela está prendida.
  const charco = new THREE.Mesh(new THREE.CircleGeometry(CERA.radio * 0.96, segmentos), charcoMat);
  charco.rotation.x = -Math.PI / 2;
  charco.position.y = CERA.tope + 0.002;
  vela.add(charco);

  // La mecha de algodón, con la punta quemada un poco inclinada.
  const curvaMecha = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(0, CERA.tope - 0.02, 0),
    new THREE.Vector3(0, CERA.tope + MECHA.alto * 0.7, 0),
    new THREE.Vector3(0.022, CERA.tope + MECHA.alto, 0.004),
  );
  const mecha = new THREE.Mesh(new THREE.TubeGeometry(curvaMecha, 10, 0.013, 8), new THREE.MeshBasicMaterial({ color: 0x241913 }));
  vela.add(mecha);
  // La punta carbonizada (el «hongo» de la mecha quemada), donde vive la brasa al apagar.
  const carbon = new THREE.Mesh(new THREE.SphereGeometry(0.021, 10, 8), new THREE.MeshBasicMaterial({ color: 0x0c0907 }));
  carbon.scale.set(1, 1.25, 1);
  carbon.position.set(0.022, CERA.tope + MECHA.alto, 0.004);
  vela.add(carbon);
  const brasaMat = new THREE.MeshBasicMaterial({ color: 0xff5a14, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0 });
  const brasa = new THREE.Mesh(new THREE.SphereGeometry(0.024, 10, 8), brasaMat);
  brasa.position.set(0.022, CERA.tope + MECHA.alto, 0.004);
  vela.add(brasa);

  // La llama (un plano que siempre mira a la cámara) y dos halos de luz.
  const llamaMat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uVida: { value: 0 }, uLadeo: { value: 0 }, uAlto: { value: 1 }, uTitileo: { value: 1 } },
    vertexShader: LLAMA_VERT,
    fragmentShader: LLAMA_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });
  const geoLlama = new THREE.PlaneGeometry(LLAMA.ancho, LLAMA.alto);
  geoLlama.translate(0, LLAMA.alto / 2, 0);
  const llama = new THREE.Mesh(geoLlama, llamaMat);
  llama.position.set(0.012, Y_LLAMA, 0);
  llama.renderOrder = 10;
  vela.add(llama);
  const halo = (lado: number, opacidad: number) => {
    const m = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: mapaHalo, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, toneMapped: false, opacity: opacidad }),
    );
    m.scale.set(lado, lado, 1);
    m.position.set(0.01, Y_LLAMA + LLAMA.alto * 0.36, 0);
    m.renderOrder = 9;
    vela.add(m);
    return m;
  };
  const haloCerca = halo(1.35, 0.62);
  const haloLejos = halo(4.2, 0.2);

  // Las escamas de soja sueltas sobre la mesa (las de «hero.jpg»).
  const geoEscama = new THREE.SphereGeometry(1, 14, 8);
  const r = azar(3508);
  const lugares: [number, number][] = [
    [-1.55, 0.95],
    [-1.25, 1.5],
    [-1.95, 1.3],
    [1.45, 1.2],
    [1.85, 0.7],
    [1.2, 1.75],
    [-0.6, 1.75],
    [0.55, 1.95],
    [2.3, 1.55],
  ];
  for (const [x, z] of lugares) {
    const e = new THREE.Mesh(geoEscama, escamaMat);
    e.scale.set(0.12 + r() * 0.07, 0.018 + r() * 0.01, 0.06 + r() * 0.03);
    e.rotation.set((r() - 0.5) * 0.3, r() * Math.PI, (r() - 0.5) * 0.25);
    e.position.set(x, 0.012, z);
    escena.add(e);
  }

  // Luces: la de la llama (puntual, titila) y la sala en penumbra (una ventana cálida + relleno).
  const luzLlama = new THREE.PointLight(0xffa04a, 0, 0, 2);
  luzLlama.position.set(0.01, Y_LLAMA + 0.16, 0);
  vela.add(luzLlama);
  const ventana = new THREE.DirectionalLight(0xffd9b0, 0.34);
  ventana.position.set(-4, 5, 3);
  escena.add(ventana);
  const relleno = new THREE.HemisphereLight(0xffe2c4, 0x2a1a10, 0.26);
  escena.add(relleno);

  // El humo.
  const N = alta ? 320 : 200;
  const nace = new Float32Array(N).fill(-1000);
  const semilla = new Float32Array(N);
  for (let i = 0; i < N; i++) semilla[i] = r();
  const geoHumo = new THREE.BufferGeometry();
  geoHumo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  const atrNace = new THREE.BufferAttribute(nace, 1).setUsage(THREE.DynamicDrawUsage);
  geoHumo.setAttribute("aNace", atrNace);
  geoHumo.setAttribute("aSemilla", new THREE.BufferAttribute(semilla, 1));
  const humoMat = new THREE.ShaderMaterial({
    uniforms: {
      uT: { value: 0 },
      uOrigen: { value: new THREE.Vector3(0.022, CERA.tope + MECHA.alto + 0.01, 0.004) },
      uEscala: { value: 400 },
      uColor: { value: new THREE.Color(0.86, 0.83, 0.79) },
    },
    vertexShader: HUMO_VERT,
    fragmentShader: HUMO_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: false,
  });
  const humo = new THREE.Points(geoHumo, humoMat);
  humo.frustumCulled = false;
  humo.renderOrder = 11;
  vela.add(humo);
  let siguiente = 0;
  let acumulado = 0;

  // ── estado ─────────────────────────────────────────────────────────────────
  let encendida = op.encendida;
  let llamaVida = plan.transiciones ? 0 : encendida ? 1 : 0; // nace de a poco (como un fósforo)
  let luz = llamaVida;
  let brillo = 0; // la cera tarda en tomar la luz
  let brasaVida = 0;
  let charcoRadio = plan.transiciones ? 0.25 : encendida ? 0.85 : 0;
  let apagadaEn = -100;
  let t = 0;
  let ladeo = 0;
  let ladeoVel = 0;
  const objetivo = { x: 0, y: 0 };
  const mirada = { x: 0, y: 0 };
  let activoHost = false;
  let corriendo = false;
  let midiendo = op.adaptar !== false;
  let cuadrosMedidos = 0;
  let tiempoMedido = 0;
  let cuadrosRitmo = 0;
  let tiempoRitmo = 0;
  const colorObjetivo = colorCera.clone();
  const reloj = new THREE.Timer();
  const tmpV = new THREE.Vector3();
  const COLOR_CHARCO = new THREE.Color();
  const tmpV2 = new THREE.Vector2();
  const tmpC = new THREE.Color();
  let desplazo = 0;
  let distancia = 6;
  // Pantalla chica: los mandos ocupan la franja de abajo; la vela sube (se mira más abajo).
  let miraY = 1.12;

  function ubicar() {
    const w = ancho || 1;
    const h = alto || 1;
    renderer.setSize(w, h, false);
    camara.aspect = w / h;
    const tan = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    // Que la vela entre entera con aire (llama incluida) en cualquier proporción.
    distancia = Math.max(4.1 / (2 * tan), 4.2 / (2 * tan * camara.aspect));
    const medioAncho = tan * distancia * camara.aspect;
    // La niebla se mide desde la cámara: empieza pasando la vela, así la vela nunca queda adentro
    // (con un lienzo alto la cámara se aleja y, con la niebla fija, la cera salía casi negra).
    niebla.near = distancia + 2.5;
    niebla.far = distancia + 8.5;
    // Pantalla ancha: la vela corrida a la derecha (el texto va a la izquierda). Angosta: al centro.
    desplazo =
      op.encuadre === "sangre" ? (camara.aspect >= 1.25 ? medioAncho * 0.46 : 0) : camara.aspect >= 0.95 ? medioAncho * 0.2 : 0;
    // (Los mandos van en dos filas debajo de 720 px en la portada a todo el ancho y de 900 en la columna.)
    miraY = w < 720 || (op.encuadre === "columna" && w <= 900) ? 0.6 : 1.12;
    const buf = renderer.getDrawingBufferSize(tmpV2);
    humoMat.uniforms.uEscala.value = buf.y / (2 * tan);
    colocarCamara();
    camara.updateProjectionMatrix();
    // Dónde cae la vela (el centro del frasco) en el lienzo.
    camara.updateMatrixWorld();
    tmpV.set(0, 0.95, 0).project(camara);
    op.alUbicar?.((tmpV.x + 1) / 2, (1 - tmpV.y) / 2);
  }

  function colocarCamara() {
    // La cámara gira alrededor del eje de la vela: la vela queda en su lugar de la pantalla y la
    // mesa, las escamas y el fondo se mueven (paralaje).
    const az = mirada.x * 0.22;
    const alturaOjo = 2.3 - mirada.y * 0.25;
    const cos = Math.cos(az);
    const sin = Math.sin(az);
    const ex = -desplazo;
    const ez = distancia;
    camara.position.set(ex * cos + ez * sin, alturaOjo, -ex * sin + ez * cos);
    camara.lookAt(ex * cos, miraY, -ex * sin);
    // La llama siempre de frente a la cámara.
    llama.rotation.y = Math.atan2(camara.position.x - llama.position.x, camara.position.z - llama.position.z);
  }

  /** Baja un paso: la densidad de píxeles se lleva de a poco (sin salto visible); el vidrio cambia de una. */
  function economizar(nuevo: PasoDeCalidad) {
    paso = nuevo;
    const aj = ajustesDelPaso(paso, topeDelEquipo());
    renderer.transmissionResolutionScale = aj.transmision;
    vaso.visible = aj.vidrioFisico;
    vasoLiviano.visible = !aj.vidrioFisico;
  }

  /** Acerca la densidad de píxeles a la del paso, en escalones chicos (uno por cuadro). */
  function acercarDensidad() {
    const meta = ajustesDelPaso(paso, topeDelEquipo()).densidad;
    if (Math.abs(meta - densidad) < 0.01) return false;
    densidad += Math.sign(meta - densidad) * Math.min(0.06, Math.abs(meta - densidad));
    renderer.setPixelRatio(densidad);
    humoMat.uniforms.uEscala.value = renderer.getDrawingBufferSize(tmpV2).y / (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)));
    return true;
  }

  function aplicarLuz(f: number) {
    luzLlama.intensity = 4 * luz * f;
    llamaMat.uniforms.uTitileo.value = f;
    const b = brillo * (0.92 + 0.08 * f);
    cera.emissiveIntensity = 1.15 * b;
    ceraArriba.emissiveIntensity = 1.2 * b;
    charcoMat.emissiveIntensity = 1.35 * b;
    llamaMat.uniforms.uVida.value = llamaVida;
    llamaMat.uniforms.uAlto.value = 0.94 + 0.06 * f;
    (haloCerca.material as THREE.SpriteMaterial).opacity = 0.62 * luz * f;
    (haloLejos.material as THREE.SpriteMaterial).opacity = 0.2 * luz;
    (luzEnMesa.material as THREE.MeshBasicMaterial).opacity = 0.32 * luz * f;
    brasaMat.opacity = Math.min(1, brasaVida);
    // La sala: la pared toma la luz de la vela; apagada queda en penumbra.
    const sala = 0.6 + 0.4 * luz;
    (escena.background as THREE.Color).copy(COLOR_PARED).multiplyScalar(sala);
    niebla.color.copy(COLOR_PARED).multiplyScalar(sala);
    (pared.material as THREE.MeshBasicMaterial).color.setScalar(0.62 + 0.38 * luz);
    ventana.intensity = 0.34 + 0.1 * (1 - luz);
  }

  function colorDeLaCera(k: number) {
    colorCera.lerp(colorObjetivo, k);
    cera.color.copy(colorCera);
    ceraArriba.color.copy(colorCera);
    // La cera líquida es más honda y más saturada que la sólida.
    COLOR_CHARCO.copy(colorCera).multiplyScalar(0.8);
    charcoMat.color.copy(COLOR_CHARCO);
    const emisivo = tmpC.copy(colorCera).lerp(tinteBrillo, 0.55);
    cera.emissive.copy(emisivo);
    ceraArriba.emissive.copy(emisivo);
    charcoMat.emissive.copy(emisivo);
  }

  function emitirHumo(dt: number) {
    const desde = t - apagadaEn;
    if (!plan.humo || desde < 0 || desde > 2.8) return;
    const ritmo = 95 * Math.pow(1 - desde / 2.8, 1.4);
    acumulado += dt * ritmo;
    let cambio = false;
    while (acumulado >= 1) {
      acumulado -= 1;
      nace[siguiente] = t - acumulado / Math.max(ritmo, 1);
      siguiente = (siguiente + 1) % N;
      cambio = true;
    }
    if (cambio) atrNace.needsUpdate = true;
  }

  function humoEnElAire() {
    return plan.humo && t - apagadaEn < 2.8 + 4.3;
  }

  /** `dt`: paso topado (física: ladeo, humo, cámara). `real`: el tiempo que pasó de verdad (rampas). */
  function actualizar(dt: number, real = dt) {
    t += dt;
    // Un solo titileo (ruido orgánico) para la llama, su luz, los halos y el anillo en la mesa.
    const f = titileo(t);
    // La llama: nace en 0,7 s (con un leve rebote), se apaga en 0,15 s.
    // En un equipo lento (cuadros de 300 ms o más) las rampas usan el tiempo real: la vela se ve
    // prendida del todo en el primer segundo, no en cámara lenta.
    if (encendida) llamaVida = Math.min(1, llamaVida + real / 0.7);
    else llamaVida = Math.max(0, llamaVida - real / 0.15);
    const suaveLuz = 1 - Math.exp(-real * (encendida ? 5 : 14));
    luz += (llamaVida - luz) * suaveLuz;
    brillo += (luz - brillo) * (1 - Math.exp(-real * 1.6));
    // La brasa: se enciende al apagar y se enfría en ~2 s.
    // La brasa: se aviva al apagar y se enfría en ~1,6 s.
    brasaVida = encendida ? 0.35 * llamaVida : Math.max(0, brasaVida - real / 1.6);
    // El charco: crece prendida (≈ 14 s hasta el borde que llega), se endurece apagada.
    const metaCharco = encendida ? 0.85 : 0;
    charcoRadio += (metaCharco - charcoRadio) * (1 - Math.exp(-real / (encendida ? 5 : 2.5)));
    charco.scale.setScalar(Math.max(0.001, charcoRadio));
    charco.visible = charcoRadio > 0.02;
    // Ladeo de la llama: resorte + el soplo del puntero.
    ladeoVel += (-ladeo * 38 - ladeoVel * 5.5) * dt;
    ladeo += ladeoVel * dt;
    llamaMat.uniforms.uLadeo.value = Math.max(-0.35, Math.min(0.35, ladeo)) + Math.sin(t * 1.3) * 0.015;
    llamaMat.uniforms.uT.value = t;
    humoMat.uniforms.uT.value = t;
    emitirHumo(dt);
    colorDeLaCera(1 - Math.exp(-real * 3));
    // Cámara con resorte.
    const s = 1 - Math.exp(-dt * 3.5);
    mirada.x += (objetivo.x - mirada.x) * s;
    mirada.y += (objetivo.y - mirada.y) * s;
    colocarCamara();
    aplicarLuz(f);
  }

  function hayQueSeguir(): boolean {
    return bucleNecesario({
      movimiento: op.movimiento,
      enPantalla: activoHost,
      pestanaVisible: activoHost,
      encendida,
      humoEnElAire: humoEnElAire(),
      enTransicion:
        (encendida ? llamaVida < 1 : llamaVida > 0) ||
        brasaVida > 0.01 ||
        Math.abs(charcoRadio - (encendida ? 0.85 : 0)) > 0.01 ||
        Math.abs(brillo - luz) > 0.01 ||
        Math.abs(colorCera.r - colorObjetivo.r) + Math.abs(colorCera.g - colorObjetivo.g) + Math.abs(colorCera.b - colorObjetivo.b) > 0.004,
      camaraMoviendose:
        Math.abs(objetivo.x - mirada.x) + Math.abs(objetivo.y - mirada.y) > 0.002 ||
        Math.abs(ajustesDelPaso(paso, topeDelEquipo()).densidad - densidad) > 0.01,
    });
  }

  function cuadro(tiempo: number) {
    reloj.update(tiempo);
    // El primer delta tras `reset()` puede salir negativo (reset usa performance.now y el cuadro trae la
    // marca del rAF): un paso negativo prendía la llama estando apagada. Nunca menos de cero.
    const crudo = Math.max(0, reloj.getDelta());
    // Tope del paso: 0,1 s. En un equipo lento la vela sigue en tiempo real (el humo se calcula por
    // edad y aguanta pasos grandes); con un tope más chico andaba en cámara lenta.
    const dt = Math.min(crudo, 0.1);
    actualizar(dt, Math.min(crudo, 1));
    renderer.render(escena, camara);
    // Con la llama ya prendida se miden los cuadros; si salen lentos, un paso más liviano (hasta 3).
    const acomodando = acercarDensidad();
    if (midiendo && llamaVida >= 1 && !acomodando) {
      cuadrosMedidos++;
      tiempoMedido += crudo;
      // Se decide a los 40 cuadros o, en un equipo lento, a los 0,75 s (con al menos 6 cuadros): así
      // se acomoda en uno a tres segundos y no en diez.
      if (cuadrosMedidos >= CUADROS_A_MEDIR || (tiempoMedido >= 0.75 && cuadrosMedidos >= 6)) {
        const nuevo = pasoDeEconomia((tiempoMedido / cuadrosMedidos) * 1000, paso);
        cuadrosMedidos = 0;
        tiempoMedido = 0;
        if (nuevo !== paso) {
          economizar(nuevo);
          midiendo = nuevo < 3;
        } else midiendo = false;
      }
    }
    cuadrosRitmo++;
    tiempoRitmo += crudo;
    if (tiempoRitmo >= 2) {
      op.alRitmo?.(Math.round((cuadrosRitmo / tiempoRitmo) * 10) / 10, paso);
      cuadrosRitmo = 0;
      tiempoRitmo = 0;
    }
    if (!hayQueSeguir()) parar();
  }

  function arrancar() {
    if (corriendo || !op.movimiento) return;
    corriendo = true;
    reloj.reset();
    cuadrosRitmo = 0;
    tiempoRitmo = 0;
    renderer.setAnimationLoop(cuadro);
  }
  function parar() {
    if (!corriendo) return;
    corriendo = false;
    renderer.setAnimationLoop(null);
  }
  function despertar() {
    if (hayQueSeguir()) arrancar();
  }

  function pintarQuieto() {
    // Movimiento reducido: la vela tal cual está, sin titilar, sin humo, sin transiciones.
    t = 1.3;
    llamaVida = encendida ? 1 : 0;
    luz = llamaVida;
    brillo = luz;
    brasaVida = 0;
    charcoRadio = encendida ? 0.85 : 0;
    charco.scale.setScalar(Math.max(0.001, charcoRadio));
    charco.visible = charcoRadio > 0.02;
    llamaMat.uniforms.uT.value = t;
    llamaMat.uniforms.uLadeo.value = 0;
    colorDeLaCera(1);
    colocarCamara();
    aplicarLuz(1);
    renderer.render(escena, camara);
  }

  const alPerder = (e: Event) => {
    e.preventDefault();
    parar();
    op.alPerder?.();
  };
  op.lienzo.addEventListener("webglcontextlost", alPerder);

  ubicar();
  colorDeLaCera(1);
  aplicarLuz(1);
  // Los shaders se compilan en paralelo (sin bloquear) antes del primer cuadro.
  try {
    await renderer.compileAsync(escena, camara);
  } catch {
    /* sin la extensión o con un driver raro: el primer render compila como siempre */
  }
  economizar(paso); // deja visible el vidrio que corresponde (el liviano ya quedó compilado)
  if (!op.movimiento) pintarQuieto();
  else renderer.render(escena, camara); // primer cuadro (la vela por prenderse); el bucle arranca con `activo`

  return {
    cera(hex) {
      colorObjetivo.set(hex);
      if (!op.movimiento) pintarQuieto();
      else despertar(); // el color cambia de a poco, aunque la vela esté apagada
    },
    encender(si) {
      if (si === encendida) return;
      encendida = si;
      if (!si) {
        apagadaEn = t;
        brasaVida = 1;
        acumulado = 0;
        // Un soplo: la llama se inclina al irse.
        ladeoVel += 1.6;
      }
      if (!op.movimiento) pintarQuieto();
      else despertar();
    },
    mirar(x, y) {
      const nx = Math.max(-1, Math.min(1, x));
      const ny = Math.max(-1, Math.min(1, y));
      // Pasar rápido cerca de la vela la hace inclinarse (el aire que movés).
      ladeoVel += Math.max(-2, Math.min(2, (nx - objetivo.x) * 6));
      objetivo.x = nx;
      objetivo.y = ny;
      if (!op.movimiento) return;
      despertar();
    },
    activo(si) {
      activoHost = si;
      if (!op.movimiento) return;
      if (si) despertar();
      else parar();
    },
    medir(w, h, d) {
      ancho = w;
      alto = h;
      if (d && d !== dpr) {
        dpr = d;
        densidad = ajustesDelPaso(paso, topeDelEquipo()).densidad;
        renderer.setPixelRatio(densidad);
      }
      ubicar();
      if (!op.movimiento || !corriendo) {
        if (!op.movimiento) pintarQuieto();
        else renderer.render(escena, camara);
      }
    },
    soltar() {
      parar();
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
