// ============================================================================
// EL STAND EN 3D — la escena (three.js, sin React).
// ============================================================================
//
// Se carga con import dinámico SÓLO en el armador y en el visor de la propuesta: el resto del ERP no
// baja three.js. Dibuja un DisenoStand tal cual: el lote, las paredes según los lados abiertos, la
// cenefa con la marca y cada pieza como volumen simple. Muestra volumen y distribución; la imagen
// fotorrealista sigue saliendo del programa 3D del negocio y se sube como archivo.
//
// El bucle sólo corre si algo cambió (cámara o diseño): una pestaña quieta no gasta batería.

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { ACABADOS_PISO, dentroDelLote, paredesDe, PIEZAS, type DisenoStand, type Pieza, type TipoPieza } from "./stand";

export type Vista = "perspectiva" | "frente" | "planta";

export interface EscenaStand {
  dibujar(d: DisenoStand, seleccion?: string | null): void;
  vista(v: Vista): void;
  /** La imagen de lo que se ve ahora, lista para guardar en el proyecto. */
  captura(ancho?: number, alto?: number): string;
  /** El modelo en GLB (glTF binario): cada pieza es un objeto con su nombre, tipo, medidas y posición. Sin el marco de selección. */
  glb(): Promise<ArrayBuffer>;
  medir(ancho: number, alto: number): void;
  destruir(): void;
}

export interface OpcionesEscena {
  lienzo: HTMLCanvasElement;
  ancho: number;
  alto: number;
  /** Con edición, tocar una pieza la selecciona y arrastrarla la mueve por el lote. */
  editable?: boolean;
  alElegir?: (id: string | null) => void;
  alMover?: (id: string, x: number, z: number) => void;
}

const ESPESOR = 0.08;

function etiqueta(texto: string, fondo: string, tinta: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = fondo;
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = tinta;
  g.font = "600 76px 'Work Sans', system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(texto.toUpperCase(), c.width / 2, c.height / 2 + 4, c.width - 40);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Blanco o tinta sobre un color de fondo, el que se lea mejor. */
function tintaSobre(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 150 ? "#1a1a1a" : "#ffffff";
}

function caja(ancho: number, alto: number, fondo: number, mat: THREE.Material, x = 0, y = alto / 2, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(ancho, alto, fondo), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

const mate = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...extra });

function cil(radioArriba: number, radioAbajo: number, alto: number, mat: THREE.Material, x = 0, y = alto / 2, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radioArriba, radioAbajo, alto, 24), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** La marca del cliente como banda de texto sobre una cara: ancho dado, alto en proporción 8:1 como la textura. */
function rotulo(texto: string, ancho: number, fondo: string, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(ancho, ancho / 8), new THREE.MeshBasicMaterial({ map: etiqueta(texto, fondo, tintaSobre(fondo)) }));
  m.position.set(x, y, z);
  return m;
}

/** Un QR de adorno (no se lee): los tres cuadros de esquina y un relleno fijo, para que el tótem de registro se reconozca. */
function qrDeAdorno(lado: number, x: number, y: number, z: number): THREE.Group {
  const g = new THREE.Group();
  const n = 9;
  const c = lado / n;
  const negro = new THREE.MeshBasicMaterial({ color: "#111111" });
  g.add(new THREE.Mesh(new THREE.PlaneGeometry(lado + c, lado + c), new THREE.MeshBasicMaterial({ color: "#ffffff" })));
  const punto = (i: number, j: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(c * 0.92, c * 0.92), negro);
    m.position.set(-lado / 2 + c / 2 + i * c, lado / 2 - c / 2 - j * c, 0.002);
    g.add(m);
  };
  const esquina = (i0: number, j0: number) => {
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (!(i === 1 && j === 1)) punto(i0 + i, j0 + j);
  };
  esquina(0, 0);
  esquina(n - 3, 0);
  esquina(0, n - 3);
  for (let k = 0; k < 28; k++) {
    const i = (k * 5 + 3) % n;
    const j = (k * 7 + 1) % n;
    const enEsquina = (i < 3 && j < 3) || (i >= n - 3 && j < 3) || (i < 3 && j >= n - 3);
    if (!enEsquina) punto(i, j);
  }
  g.position.set(x, y, z);
  return g;
}

function armarPieza(tipo: TipoPieza, d: DisenoStand): THREE.Group {
  const b = PIEZAS[tipo];
  const g = new THREE.Group();
  const acento = mate(d.colorAcento);
  const claro = mate("#f2f0e8");
  const oscuro = mate("#2a2d31");
  const negro = mate("#15171a");
  const metal = mate("#8d9399", { metalness: 0.7, roughness: 0.35 });
  const vidrio = new THREE.MeshStandardMaterial({ color: "#cfe3ee", transparent: true, opacity: 0.35, roughness: 0.1 });
  const luz = new THREE.MeshStandardMaterial({ color: d.colorAcento, emissive: d.colorAcento, emissiveIntensity: 0.55 });
  const blanco = new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 0.8 });
  const marca = d.textoMarca.trim();
  const zapatilla = (x: number, y: number, z = 0.02) => {
    g.add(caja(0.3, 0.035, 0.11, claro, x, y + 0.0175, z));
    g.add(caja(0.2, 0.07, 0.1, acento, x - 0.03, y + 0.07, z));
  };
  switch (tipo) {
    case "MOSTRADOR":
      g.add(caja(b.ancho, b.alto - 0.05, b.fondo, acento, 0, (b.alto - 0.05) / 2));
      g.add(caja(b.ancho + 0.08, 0.05, b.fondo + 0.08, claro, 0, b.alto - 0.025));
      g.add(caja(b.ancho + 0.02, 0.06, b.fondo + 0.02, oscuro, 0, 0.03));
      g.add(caja(0.28, 0.015, 0.2, negro, b.ancho * 0.25, b.alto + 0.008));
      if (marca) g.add(rotulo(marca, b.ancho - 0.25, d.colorAcento, 0, 0.62, b.fondo / 2 + 0.003));
      break;
    case "PANTALLA":
      g.add(caja(b.ancho, b.alto - 0.9, b.fondo, negro, 0, 0.9 + (b.alto - 0.9) / 2));
      g.add(caja(b.ancho - 0.08, b.alto - 0.98, 0.01, luz, 0, 0.9 + (b.alto - 0.9) / 2, b.fondo / 2 + 0.006));
      g.add(caja(0.2, 0.9, 0.1, oscuro, 0, 0.45));
      g.add(caja(0.9, 0.04, 0.45, oscuro, 0, 0.02));
      if (marca) g.add(rotulo(marca, b.ancho * 0.6, d.colorAcento, 0, 1.5, b.fondo / 2 + 0.013));
      break;
    case "TOTEM":
      g.add(caja(b.ancho, b.alto, b.fondo, acento, 0, b.alto / 2));
      g.add(caja(b.ancho + 0.04, 0.05, b.fondo + 0.04, claro, 0, b.alto - 0.025));
      g.add(caja(b.ancho + 0.04, 0.08, b.fondo + 0.04, oscuro, 0, 0.04));
      g.add(caja(b.ancho - 0.1, b.alto * 0.45, 0.01, claro, 0, b.alto * 0.68, b.fondo / 2 + 0.006));
      g.add(qrDeAdorno(0.46, 0, b.alto * 0.68, b.fondo / 2 + 0.014));
      if (marca) g.add(rotulo(marca, b.ancho - 0.12, d.colorAcento, 0, b.alto * 0.36, b.fondo / 2 + 0.004));
      break;
    case "VITRINA": {
      g.add(caja(b.ancho, 0.8, b.fondo, claro, 0, 0.4));
      g.add(caja(b.ancho, b.alto - 0.8, b.fondo, vidrio, 0, 0.8 + (b.alto - 0.8) / 2));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(caja(0.03, b.alto - 0.8, 0.03, metal, sx * (b.ancho / 2 - 0.015), 0.8 + (b.alto - 0.8) / 2, sz * (b.fondo / 2 - 0.015)));
      g.add(caja(b.ancho, 0.03, b.fondo, metal, 0, b.alto - 0.015));
      g.add(caja(b.ancho - 0.06, 0.02, b.fondo - 0.06, claro, 0, 1.3));
      g.add(caja(b.ancho - 0.1, 0.012, 0.02, blanco, 0, b.alto - 0.04, b.fondo / 2 - 0.05));
      zapatilla(-0.18, 0.8, 0);
      zapatilla(0.18, 1.3, 0);
      break;
    }
    case "MESA": {
      g.add(cil(0.4, 0.4, 0.04, claro, 0, b.alto - 0.02));
      g.add(cil(0.04, 0.04, b.alto - 0.07, oscuro, 0, (b.alto - 0.07) / 2 + 0.03));
      g.add(cil(0.25, 0.25, 0.03, oscuro, 0, 0.015));
      for (const [x, z] of [[-0.48, 0], [0.48, 0], [0, -0.48], [0, 0.48]] as const) {
        g.add(caja(0.36, 0.05, 0.36, acento, x, 0.45, z));
        g.add(caja(0.05, 0.43, 0.05, oscuro, x, 0.215, z));
        const fuera = x !== 0 ? [Math.sign(x) * 0.18, 0] : [0, Math.sign(z) * 0.18];
        g.add(caja(x !== 0 ? 0.04 : 0.36, 0.38, x !== 0 ? 0.36 : 0.04, acento, x + fuera[0], 0.69, z + fuera[1]));
      }
      break;
    }
    case "TARIMA":
      g.add(caja(b.ancho, b.alto, b.fondo, oscuro, 0, b.alto / 2));
      g.add(caja(b.ancho - 0.1, 0.01, b.fondo - 0.1, acento, 0, b.alto + 0.005));
      g.add(caja(b.ancho, 0.02, b.fondo, claro, 0, b.alto - 0.01));
      g.add(caja(b.ancho * 0.4, 0.1, 0.3, oscuro, 0, 0.05, b.fondo / 2 + 0.15));
      g.add(caja(b.ancho - 0.1, 0.015, 0.01, luz, 0, 0.1, b.fondo / 2 + 0.006));
      break;
    case "DEPOSITO":
      g.add(caja(b.ancho, b.alto, b.fondo, mate(d.colorPared), 0, b.alto / 2));
      g.add(caja(0.84, 2.04, 0.01, oscuro, 0, 1.02, b.fondo / 2 + 0.008));
      g.add(caja(0.8, 2, 0.02, mate("#8a8a84"), 0, 1, b.fondo / 2 + 0.012));
      g.add(caja(0.03, 0.2, 0.03, metal, 0.28, 1.0, b.fondo / 2 + 0.035));
      for (const y of [2.2, 2.28, 2.36]) g.add(caja(0.6, 0.03, 0.02, oscuro, -0.35, y, b.fondo / 2 + 0.012));
      break;
    case "PLANTA":
      g.add(cil(0.2, 0.15, 0.4, mate("#2a2d31"), 0, 0.2));
      for (const [x, y, z, r] of [[0, 0.85, 0, 0.34], [-0.12, 1.1, 0.08, 0.22], [0.13, 1.05, -0.07, 0.24]] as const) g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), mate("#3f7a4d", { flatShading: true })).translateX(x).translateY(y).translateZ(z));
      break;
    case "PHOTOCALL":
      g.add(caja(b.ancho, b.alto, 0.06, acento, 0, b.alto / 2, -b.fondo / 2 + 0.03));
      g.add(caja(b.ancho - 0.3, b.alto - 0.4, 0.01, claro, 0, b.alto / 2, -b.fondo / 2 + 0.065));
      g.add(caja(b.ancho + 0.1, 0.06, 0.1, metal, 0, b.alto + 0.03, -b.fondo / 2 + 0.03));
      for (const x of [-b.ancho / 2 + 0.25, b.ancho / 2 - 0.25]) {
        g.add(caja(0.06, 0.05, b.fondo, oscuro, x, 0.025));
        g.add(caja(0.05, b.alto * 0.9, 0.3, oscuro, x, (b.alto * 0.9) / 2, -b.fondo / 2 + 0.2));
      }
      if (marca) for (const y of [b.alto * 0.72, b.alto * 0.45, b.alto * 0.18]) g.add(rotulo(marca, b.ancho - 0.6, "#f2f0e8", 0, y, -b.fondo / 2 + 0.075));
      break;
    case "ZONA_PRUEBA":
      g.add(caja(b.ancho, 0.1, b.fondo, oscuro, 0, 0.05));
      g.add(caja(b.ancho - 0.1, 0.01, b.fondo - 0.1, mate("#3b3f45"), 0, 0.105));
      g.add(caja(b.ancho - 0.2, 0.012, 0.04, claro, 0, 0.112, b.fondo / 2 - 0.15));
      g.add(caja(1.2, 0.35, 0.35, acento, 0, 0.275, -0.1));
      g.add(caja(1.7, 1.2, 0.02, metal, 0, 0.7, -b.fondo / 2 + 0.01));
      g.add(caja(1.6, 1.1, 0.03, new THREE.MeshStandardMaterial({ color: "#d7e3ea", metalness: 0.6, roughness: 0.15 }), 0, 0.65, -b.fondo / 2 + 0.02));
      zapatilla(-0.3, 0.45, -0.1);
      break;
    case "DESAFIO":
      g.add(caja(b.ancho, 0.08, b.fondo, oscuro, 0, 0.04));
      g.add(caja(b.ancho - 0.1, 0.01, b.fondo - 0.1, acento, 0, 0.085));
      g.add(caja(0.12, 1.22, 0.12, oscuro, 0, 0.69, -0.3));
      g.add(caja(0.9, 0.6, 0.05, negro, 0, 1.6, -0.3));
      g.add(caja(0.82, 0.52, 0.01, luz, 0, 1.6, -0.27));
      for (const x of [-0.5, 0.5]) g.add(caja(0.05, 0.9, 0.05, metal, x, 0.53, 0.5));
      g.add(caja(1.0, 0.02, 0.02, luz, 0, 0.95, 0.5));
      break;
    case "MURO_EXHIBICION":
      g.add(caja(b.ancho, b.alto, 0.04, mate(d.colorPared), 0, b.alto / 2, -b.fondo / 2 + 0.02));
      g.add(caja(b.ancho, 0.3, 0.05, acento, 0, b.alto - 0.15, -b.fondo / 2 + 0.045));
      if (marca) g.add(rotulo(marca, b.ancho - 0.5, d.colorAcento, 0, b.alto - 0.15, -b.fondo / 2 + 0.073));
      for (const y of [0.55, 1.05, 1.55]) {
        g.add(caja(b.ancho - 0.1, 0.03, b.fondo - 0.04, claro, 0, y, 0.01));
        g.add(caja(b.ancho - 0.1, 0.012, 0.02, blanco, 0, y + 0.45, -b.fondo / 2 + 0.07));
        for (const x of [-0.5, 0.5]) zapatilla(x, y + 0.015);
      }
      break;
    case "MONITOR_55":
      g.add(caja(0.9, 0.04, b.fondo, oscuro, 0, 0.02));
      g.add(caja(0.1, 0.9, 0.08, oscuro, 0, 0.49));
      g.add(caja(1.24, 0.74, 0.05, negro, 0, 1.4));
      g.add(caja(1.16, 0.66, 0.01, luz, 0, 1.4, 0.03));
      if (marca) g.add(rotulo(marca, 0.8, d.colorAcento, 0, 1.4, 0.037));
      break;
    case "CINTA": {
      const z0 = -b.fondo / 2 + 0.2;
      g.add(caja(b.ancho, 0.12, b.fondo, oscuro, 0, 0.14));
      g.add(caja(b.ancho - 0.2, 0.02, b.fondo - 0.25, negro, 0, 0.21));
      for (const x of [-b.ancho / 2 + 0.05, b.ancho / 2 - 0.05]) g.add(caja(0.1, 0.06, b.fondo - 0.05, metal, x, 0.23));
      for (const x of [-0.35, 0.35]) g.add(caja(0.04, 1.0, 0.04, metal, x, 0.7, z0));
      g.add(caja(0.8, 0.25, 0.12, negro, 0, 1.17, z0));
      g.add(caja(0.5, 0.12, 0.01, luz, 0, 1.19, z0 + 0.066));
      break;
    }
    case "ARCO":
      for (const x of [-b.ancho / 2 + 0.2, b.ancho / 2 - 0.2]) {
        g.add(caja(0.4, b.alto - 0.7, b.fondo, acento, x, (b.alto - 0.7) / 2));
        g.add(caja(0.5, 0.08, b.fondo + 0.1, oscuro, x, 0.04));
      }
      g.add(caja(b.ancho, 0.7, b.fondo, acento, 0, b.alto - 0.35));
      g.add(caja(b.ancho - 0.2, 0.05, b.fondo + 0.02, claro, 0, b.alto - 0.7));
      if (marca) for (const s of [1, -1]) g.add(rotulo(marca, b.ancho - 0.8, d.colorAcento, 0, b.alto - 0.35, s * (b.fondo / 2 + 0.003))).rotation.y = s === 1 ? 0 : Math.PI;
      break;
    case "SILLON":
      g.add(caja(b.ancho, 0.4, b.fondo, oscuro, 0, 0.2));
      for (const x of [-b.ancho / 4, b.ancho / 4]) g.add(caja(b.ancho / 2 - 0.15, 0.12, b.fondo - 0.2, claro, x, 0.46, 0.05));
      g.add(caja(b.ancho, 0.4, 0.2, acento, 0, 0.6, -b.fondo / 2 + 0.1));
      for (const x of [-b.ancho / 2 + 0.075, b.ancho / 2 - 0.075]) g.add(caja(0.15, 0.25, b.fondo, acento, x, 0.53));
      break;
    case "POUF":
      g.add(cil(0.25, 0.25, 0.4, acento, 0, 0.2));
      g.add(cil(0.23, 0.23, 0.05, claro, 0, 0.425));
      break;
    case "ISLA_PRODUCTO":
      g.add(caja(b.ancho - 0.2, 0.7, b.fondo - 0.2, claro, 0, 0.35));
      g.add(caja(b.ancho, 0.05, b.fondo, acento, 0, 0.725));
      g.add(caja(b.ancho - 0.1, 0.25, b.fondo - 0.1, vidrio, 0, 0.875));
      g.add(caja(b.ancho, 0.03, b.fondo, metal, 0, 1.0 - 0.015 + 0.0));
      for (const [x, z] of [[-0.25, -0.2], [0.25, -0.2], [0, 0.25]] as const) {
        g.add(caja(0.28, 0.08, 0.18, oscuro, x, 0.79, z));
        zapatilla(x, 0.83, z);
      }
      break;
    case "BARRA":
      g.add(caja(b.ancho, b.alto - 0.05, b.fondo, acento, 0, (b.alto - 0.05) / 2));
      g.add(caja(b.ancho + 0.08, 0.05, b.fondo + 0.14, claro, 0, b.alto - 0.025, 0.03));
      g.add(caja(b.ancho + 0.02, 0.06, b.fondo + 0.02, oscuro, 0, 0.03));
      g.add(caja(b.ancho - 0.2, 0.03, 0.03, metal, 0, 0.2, b.fondo / 2 + 0.08));
      for (const x of [-0.6, 0.6]) {
        g.add(cil(0.12, 0.12, 0.4, vidrio, x, b.alto + 0.2));
        g.add(cil(0.05, 0.05, 0.04, metal, x, b.alto + 0.42));
      }
      if (marca) g.add(rotulo(marca, b.ancho - 0.4, d.colorAcento, 0, 0.55, b.fondo / 2 + 0.003));
      break;
  }
  return g;
}

export function crearEscena(op: OpcionesEscena): EscenaStand {
  const renderer = new THREE.WebGLRenderer({ canvas: op.lienzo, antialias: true, preserveDrawingBuffer: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(op.ancho, op.alto, false);
  renderer.shadowMap.enabled = true;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#e8e6dc");
  const camara = new THREE.PerspectiveCamera(38, op.ancho / op.alto, 0.1, 400);
  const controles = new OrbitControls(camara, op.lienzo);
  controles.enableDamping = false;
  controles.maxPolarAngle = Math.PI / 2 - 0.02;

  scene.add(new THREE.HemisphereLight("#ffffff", "#b9b6a8", 1.5));
  const sol = new THREE.DirectionalLight("#ffffff", 2);
  sol.position.set(8, 14, 10);
  sol.castShadow = true;
  sol.shadow.mapSize.set(2048, 2048);
  sol.shadow.camera.left = sol.shadow.camera.bottom = -24;
  sol.shadow.camera.right = sol.shadow.camera.top = 24;
  scene.add(sol);

  const suelo = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), mate("#d5d3c8"));
  suelo.rotation.x = -Math.PI / 2;
  suelo.position.y = -0.002;
  suelo.receiveShadow = true;
  scene.add(suelo);

  const stand = new THREE.Group();
  scene.add(stand);
  let diseno: DisenoStand | null = null;
  let seleccion: string | null = null;
  let vistaActual: Vista = "perspectiva";
  let pendiente = false;
  let destruida = false;

  const pintar = () => {
    if (pendiente || destruida) return;
    pendiente = true;
    requestAnimationFrame(() => {
      pendiente = false;
      if (!destruida) renderer.render(scene, camara);
    });
  };
  controles.addEventListener("change", pintar);

  function limpiar() {
    stand.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.dispose();
      for (const mat of [m.material].flat()) {
        (mat as THREE.MeshStandardMaterial).map?.dispose();
        mat.dispose();
      }
    });
    stand.clear();
  }

  function encuadrar(v: Vista) {
    if (!diseno) return;
    const radio = Math.max(diseno.ancho, diseno.fondo, diseno.altoPared * 1.4);
    const dist = radio * (camara.aspect < 1 ? 2.1 : 1.6);
    controles.target.set(0, v === "planta" ? 0 : diseno.altoPared * 0.35, 0);
    if (v === "planta") camara.position.set(0, dist * 1.25, 0.001);
    else if (v === "frente") camara.position.set(0, diseno.altoPared * 0.6, dist * 1.1);
    else camara.position.set(dist * 0.75, dist * 0.55, dist * 0.85);
    controles.update();
  }

  function dibujar(d: DisenoStand, sel: string | null = null) {
    const primera = !diseno;
    const cambioLote = !diseno || diseno.ancho !== d.ancho || diseno.fondo !== d.fondo || diseno.altoPared !== d.altoPared;
    diseno = d;
    seleccion = sel;
    limpiar();
    const alzado = d.tarimaPiso ? 0.1 : 0;
    stand.add(caja(d.ancho, 0.04 + alzado, d.fondo, mate(ACABADOS_PISO[d.piso].color, { roughness: d.piso === "ALFOMBRA" ? 1 : 0.5 })));

    const matPared = () => mate(d.colorPared);
    const lados = paredesDe(d.tipo);
    const h = d.altoPared;
    for (const lado of lados) {
      if (lado === "fondo") stand.add(caja(d.ancho, h, ESPESOR, matPared(), 0, h / 2, -d.fondo / 2));
      if (lado === "izquierda") stand.add(caja(ESPESOR, h, d.fondo, matPared(), -d.ancho / 2, h / 2, 0));
      if (lado === "derecha") stand.add(caja(ESPESOR, h, d.fondo, matPared(), d.ancho / 2, h / 2, 0));
    }

    // La marca: en la cenefa del fondo; en isla, sobre un pórtico colgante para que se vea desde lejos.
    const texto = d.textoMarca.trim();
    if (texto) {
      const tinta = tintaSobre(d.colorAcento);
      const mat = new THREE.MeshStandardMaterial({ map: etiqueta(texto, d.colorAcento, tinta) });
      const alto = 0.42;
      if (lados.includes("fondo")) {
        const c = new THREE.Mesh(new THREE.BoxGeometry(d.ancho, alto, 0.02), mat);
        c.position.set(0, h - alto / 2 - 0.1, -d.fondo / 2 + ESPESOR / 2 + 0.012);
        stand.add(c);
      } else {
        const c = new THREE.Mesh(new THREE.BoxGeometry(d.ancho * 0.8, alto, d.fondo * 0.04), mat);
        c.position.set(0, h, 0);
        stand.add(c);
        for (const x of [-d.ancho * 0.38, d.ancho * 0.38]) stand.add(caja(0.08, h, 0.08, mate(d.colorAcento), x, h / 2, 0));
      }
    }

    for (const p of d.piezas) {
      const g = armarPieza(p.tipo, d);
      g.position.set(p.x, 0.04 + alzado, p.z);
      g.rotation.y = -(p.giro * Math.PI) / 2;
      g.userData.piezaId = p.id;
      // Para identificar cada objeto al exportar: tipo y medidas reales en metros.
      g.name = PIEZAS[p.tipo].label;
      Object.assign(g.userData, { tipo: p.tipo, ancho: PIEZAS[p.tipo].ancho, fondo: PIEZAS[p.tipo].fondo, alto: PIEZAS[p.tipo].alto, x: p.x, z: p.z, giro: p.giro, unidad: "m" });
      if (p.id === seleccion) {
        const b = PIEZAS[p.tipo];
        const marco = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(b.ancho + 0.1, b.alto + 0.1, b.fondo + 0.1)), new THREE.LineBasicMaterial({ color: "#ff5a1f" }));
        marco.position.y = b.alto / 2;
        g.add(marco);
      }
      stand.add(g);
    }

    if (primera || cambioLote) encuadrar(vistaActual);
    pintar();
  }

  // ── Elegir y arrastrar piezas ─────────────────────────────────────────────
  const rayo = new THREE.Raycaster();
  const puntero = new THREE.Vector2();
  const plano = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const punto = new THREE.Vector3();
  let arrastre: { pieza: Pieza; dx: number; dz: number; movio: boolean } | null = null;

  const apuntar = (e: PointerEvent) => {
    const r = op.lienzo.getBoundingClientRect();
    puntero.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    rayo.setFromCamera(puntero, camara);
  };

  const alBajar = (e: PointerEvent) => {
    if (!diseno) return;
    apuntar(e);
    for (const hit of rayo.intersectObjects(stand.children, true)) {
      let o: THREE.Object3D | null = hit.object;
      while (o && !o.userData.piezaId) o = o.parent;
      if (!o) continue;
      const pieza = diseno.piezas.find((p) => p.id === o!.userData.piezaId);
      if (!pieza || !rayo.ray.intersectPlane(plano, punto)) return;
      arrastre = { pieza, dx: pieza.x - punto.x, dz: pieza.z - punto.z, movio: false };
      controles.enabled = false;
      op.lienzo.setPointerCapture(e.pointerId);
      op.alElegir?.(pieza.id);
      return;
    }
    op.alElegir?.(null);
  };
  const alMoverPuntero = (e: PointerEvent) => {
    if (!arrastre || !diseno) return;
    apuntar(e);
    if (!rayo.ray.intersectPlane(plano, punto)) return;
    const n = dentroDelLote({ ...arrastre.pieza, x: punto.x + arrastre.dx, z: punto.z + arrastre.dz }, diseno);
    if (n.x !== arrastre.pieza.x || n.z !== arrastre.pieza.z) {
      arrastre.pieza = n;
      arrastre.movio = true;
      op.alMover?.(n.id, n.x, n.z);
    }
  };
  const alSoltar = () => {
    arrastre = null;
    controles.enabled = true;
  };
  if (op.editable) {
    op.lienzo.addEventListener("pointerdown", alBajar, { capture: true });
    op.lienzo.addEventListener("pointermove", alMoverPuntero);
    op.lienzo.addEventListener("pointerup", alSoltar);
    op.lienzo.addEventListener("pointercancel", alSoltar);
  }

  return {
    dibujar,
    vista(v) {
      vistaActual = v;
      encuadrar(v);
      pintar();
    },
    captura(ancho = 1600, alto = 900) {
      const antes = renderer.getSize(new THREE.Vector2());
      const ratio = renderer.getPixelRatio();
      const aspecto = camara.aspect;
      renderer.setPixelRatio(1);
      renderer.setSize(ancho, alto, false);
      camara.aspect = ancho / alto;
      camara.updateProjectionMatrix();
      renderer.render(scene, camara);
      const datos = op.lienzo.toDataURL("image/jpeg", 0.85);
      renderer.setPixelRatio(ratio);
      renderer.setSize(antes.x, antes.y, false);
      camara.aspect = aspecto;
      camara.updateProjectionMatrix();
      renderer.render(scene, camara);
      return datos;
    },
    async glb() {
      const { GLTFExporter } = await import("three/examples/jsm/exporters/GLTFExporter.js");
      // El marco de selección es ayuda de edición, no parte del modelo.
      const marcos: THREE.Object3D[] = [];
      stand.traverse((o) => {
        if (o instanceof THREE.LineSegments && o.visible) {
          o.visible = false;
          marcos.push(o);
        }
      });
      try {
        stand.name = diseno?.textoMarca.trim() || "Stand";
        return (await new GLTFExporter().parseAsync(stand, { binary: true, onlyVisible: true })) as ArrayBuffer;
      } finally {
        for (const o of marcos) o.visible = true;
      }
    },
    medir(ancho, alto) {
      renderer.setSize(ancho, alto, false);
      camara.aspect = ancho / alto;
      camara.updateProjectionMatrix();
      pintar();
    },
    destruir() {
      destruida = true;
      op.lienzo.removeEventListener("pointerdown", alBajar, { capture: true });
      op.lienzo.removeEventListener("pointermove", alMoverPuntero);
      op.lienzo.removeEventListener("pointerup", alSoltar);
      op.lienzo.removeEventListener("pointercancel", alSoltar);
      controles.dispose();
      limpiar();
      renderer.dispose();
    },
  };
}
