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
  captura(anchoMax?: number): string;
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

function armarPieza(tipo: TipoPieza, d: DisenoStand): THREE.Group {
  const b = PIEZAS[tipo];
  const g = new THREE.Group();
  const acento = mate(d.colorAcento);
  const claro = mate("#f2f0e8");
  switch (tipo) {
    case "MOSTRADOR":
      g.add(caja(b.ancho, b.alto - 0.05, b.fondo, acento));
      g.add(caja(b.ancho + 0.08, 0.05, b.fondo + 0.08, claro, 0, b.alto - 0.025));
      break;
    case "PANTALLA":
      g.add(caja(b.ancho, b.alto - 0.9, b.fondo, mate("#15171a"), 0, 0.9 + (b.alto - 0.9) / 2));
      g.add(caja(b.ancho - 0.08, b.alto - 0.98, 0.01, new THREE.MeshStandardMaterial({ color: d.colorAcento, emissive: d.colorAcento, emissiveIntensity: 0.55 }), 0, 0.9 + (b.alto - 0.9) / 2, b.fondo / 2 + 0.006));
      g.add(caja(0.2, 0.9, 0.1, mate("#2a2d31"), 0, 0.45));
      break;
    case "TOTEM":
      g.add(caja(b.ancho, b.alto, b.fondo, acento));
      g.add(caja(b.ancho - 0.1, b.alto * 0.45, 0.01, claro, 0, b.alto * 0.68, b.fondo / 2 + 0.006));
      break;
    case "VITRINA":
      g.add(caja(b.ancho, 0.8, b.fondo, claro));
      g.add(caja(b.ancho, b.alto - 0.8, b.fondo, new THREE.MeshStandardMaterial({ color: "#cfe3ee", transparent: true, opacity: 0.35, roughness: 0.1 }), 0, 0.8 + (b.alto - 0.8) / 2));
      break;
    case "MESA": {
      const pata = mate("#2a2d31");
      g.add(caja(0.8, 0.04, 0.8, claro, 0, b.alto - 0.02));
      g.add(caja(0.06, b.alto - 0.04, 0.06, pata));
      for (const [x, z] of [[-0.48, 0], [0.48, 0], [0, -0.48], [0, 0.48]]) {
        g.add(caja(0.36, 0.05, 0.36, mate(d.colorAcento), x, 0.45, z));
        g.add(caja(0.05, 0.43, 0.05, pata, x, 0.215, z));
      }
      break;
    }
    case "TARIMA":
      g.add(caja(b.ancho, b.alto, b.fondo, mate("#2a2d31")));
      g.add(caja(b.ancho - 0.1, 0.01, b.fondo - 0.1, acento, 0, b.alto + 0.005));
      break;
    case "DEPOSITO":
      g.add(caja(b.ancho, b.alto, b.fondo, mate(d.colorPared)));
      g.add(caja(0.8, 2, 0.02, mate("#8a8a84"), 0, 1, b.fondo / 2 + 0.012));
      break;
    case "PLANTA":
      g.add(caja(0.36, 0.4, 0.36, mate("#2a2d31")));
      g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 0), mate("#3f7a4d", { flatShading: true })).translateY(0.85));
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
    captura(anchoMax = 1600) {
      renderer.render(scene, camara);
      const f = Math.min(1, anchoMax / op.lienzo.width);
      const c = document.createElement("canvas");
      c.width = Math.round(op.lienzo.width * f);
      c.height = Math.round(op.lienzo.height * f);
      c.getContext("2d")!.drawImage(op.lienzo, 0, 0, c.width, c.height);
      return c.toDataURL("image/jpeg", 0.85);
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
