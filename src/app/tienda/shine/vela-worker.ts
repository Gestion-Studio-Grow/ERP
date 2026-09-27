// ============================================================================
// EL WORKER DE LA VELA — la escena 3D de Shine corre acá, fuera del hilo principal.
// ============================================================================
//
// Igual que el frasco de Qué Bien Olés (quebienoles/frasco-worker.ts): la página le transfiere el
// control de su <canvas> y desde entonces texturas, PMREM, compilación de shaders, cada cuadro, el
// humo y la medición de fps pasan en este hilo. Por mensaje viajan cosas chicas: el puntero, prender
// o apagar, el color de la cera, visible/oculto y el tamaño con el DPR. De vuelta: «listo», los fps
// y dónde cae la vela en el lienzo.
//
// Primero se lo sondea («¿podés WebGL2 en un OffscreenCanvas?») ANTES de transferir el lienzo: una vez
// transferido, el <canvas> ya no sirve en la página. Si no puede, EscenaVela.tsx corre la misma escena en
// el hilo principal.

import { crearVela, type Vela } from "./vela-escena";

/** Lo que la página le manda al worker. */
export type AlWorker =
  | { tipo: "sondear" }
  | {
      tipo: "iniciar";
      lienzo: OffscreenCanvas;
      ancho: number;
      alto: number;
      dpr: number;
      cera: string;
      movimiento: boolean;
      calidad: "alta" | "baja";
      encuadre: "columna" | "sangre";
      encendida: boolean;
    }
  | { tipo: "cera"; hex: string }
  | { tipo: "encender"; si: boolean }
  | { tipo: "mirar"; x: number; y: number }
  | { tipo: "activo"; si: boolean }
  | { tipo: "medir"; ancho: number; alto: number; dpr: number }
  | { tipo: "soltar" };

/** Lo que el worker le contesta a la página. */
export type DelWorker =
  | { tipo: "puedo" }
  | { tipo: "no-puedo" }
  | { tipo: "listo" }
  | { tipo: "perdido" }
  | { tipo: "error"; mensaje: string }
  | { tipo: "ritmo"; fps: number; paso: number }
  | { tipo: "ubicar"; x: number; y: number };

// `self` tipado a mano: el proyecto compila con la lib del DOM y la de workers pisa los mismos nombres.
const puerto = self as unknown as {
  postMessage(m: DelWorker): void;
  addEventListener(tipo: "message", cb: (e: MessageEvent<AlWorker>) => void): void;
  close(): void;
};

let escena: Vela | null = null;
// Lo que llega antes de que la escena exista se aplica al terminar (del mismo tipo, sólo el último).
let pendientes: AlWorker[] = [];

function puedoWebGL2(): boolean {
  try {
    if (typeof OffscreenCanvas === "undefined") return false;
    const g = new OffscreenCanvas(1, 1).getContext("webgl2");
    if (!g) return false;
    g.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

function aplicar(m: AlWorker) {
  if (!escena) return;
  switch (m.tipo) {
    case "cera":
      escena.cera(m.hex);
      break;
    case "encender":
      escena.encender(m.si);
      break;
    case "mirar":
      escena.mirar(m.x, m.y);
      break;
    case "activo":
      escena.activo(m.si);
      break;
    case "medir":
      escena.medir(m.ancho, m.alto, m.dpr);
      break;
    case "soltar":
      escena.soltar();
      escena = null;
      puerto.close();
      break;
    default:
      break;
  }
}

puerto.addEventListener("message", (e) => {
  const m = e.data;
  if (m.tipo === "sondear") {
    puerto.postMessage({ tipo: puedoWebGL2() ? "puedo" : "no-puedo" });
    return;
  }
  if (m.tipo === "iniciar") {
    crearVela({
      lienzo: m.lienzo,
      ancho: m.ancho,
      alto: m.alto,
      dpr: m.dpr,
      cera: m.cera,
      movimiento: m.movimiento,
      calidad: m.calidad,
      encuadre: m.encuadre,
      encendida: m.encendida,
      alPerder: () => puerto.postMessage({ tipo: "perdido" }),
      alRitmo: (fps, paso) => puerto.postMessage({ tipo: "ritmo", fps, paso }),
      alUbicar: (x, y) => puerto.postMessage({ tipo: "ubicar", x, y }),
    })
      .then((v) => {
        escena = v;
        for (const p of pendientes) aplicar(p);
        pendientes = [];
        puerto.postMessage({ tipo: "listo" });
      })
      .catch((err: unknown) => puerto.postMessage({ tipo: "error", mensaje: String(err) }));
    return;
  }
  if (escena) aplicar(m);
  else if (m.tipo !== "soltar") {
    pendientes = pendientes.filter((p) => p.tipo !== m.tipo);
    pendientes.push(m);
  } else puerto.close();
});
