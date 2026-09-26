// ============================================================================
// EL WORKER DEL FRASCO — la escena 3D corre acá, fuera del hilo principal.
// ============================================================================
//
// La página le transfiere el control de su <canvas> (transferControlToOffscreen) y desde entonces todo
// —texturas, PMREM, compilación de shaders, cada cuadro, la bruma, la medición de fps— pasa en este hilo:
// el que responde al toque, al scroll y a la hidratación de React queda libre. Por mensaje viajan sólo
// cosas chicas: el puntero, cuánto salió el portal, rociar, el color de la familia, visible/oculto y el
// tamaño con el DPR.
//
// Primero se lo sondea («¿podés WebGL2 en un OffscreenCanvas?») ANTES de transferir el lienzo: una vez
// transferido, el <canvas> ya no sirve en la página. Si no puede, Frasco.tsx corre la misma escena en el
// hilo principal, como siempre.
//
// Sin "use client": no es un componente, es un módulo de worker (Turbopack lo empaqueta aparte con
// `new Worker(new URL("./frasco-worker.ts", import.meta.url), { type: "module" })`).

import { crearFrasco, type Frasco } from "./frasco-escena";

/** Lo que la página le manda al worker. */
export type AlWorker =
  | { tipo: "sondear" }
  | {
      tipo: "iniciar";
      lienzo: OffscreenCanvas;
      ancho: number;
      alto: number;
      dpr: number;
      color: string;
      fondo: string;
      movimiento: boolean;
      calidad: "alta" | "baja";
      letra: string;
      urlLetra: string;
    }
  | { tipo: "color"; hex: string }
  | { tipo: "mirar"; x: number; y: number }
  | { tipo: "rociar"; si: boolean }
  | { tipo: "salida"; p: number }
  | { tipo: "activo"; si: boolean }
  | { tipo: "medir"; ancho: number; alto: number; dpr: number }
  | { tipo: "soltar" };

/** Lo que el worker le contesta a la página. */
export type DelWorker = { tipo: "puedo" } | { tipo: "no-puedo" } | { tipo: "listo" } | { tipo: "perdido" } | { tipo: "error"; mensaje: string };

// `self` tipado a mano: el proyecto compila con la lib del DOM y la de workers pisa los mismos nombres.
const puerto = self as unknown as {
  postMessage(m: DelWorker): void;
  addEventListener(tipo: "message", cb: (e: MessageEvent<AlWorker>) => void): void;
  close(): void;
};

let escena: Frasco | null = null;
// Lo que llega antes de que la escena exista (un puntero que ya se movió) se aplica al terminar.
let pendientes: AlWorker[] = [];

function puedoWebGL2(): boolean {
  try {
    if (typeof OffscreenCanvas === "undefined") return false;
    const g = new OffscreenCanvas(1, 1).getContext("webgl2");
    if (!g) return false;
    g.getExtension("WEBGL_lose_context")?.loseContext(); // el contexto de prueba se devuelve enseguida
    return true;
  } catch {
    return false;
  }
}

function aplicar(m: AlWorker) {
  if (!escena) return;
  switch (m.tipo) {
    case "color":
      escena.color(m.hex);
      break;
    case "mirar":
      escena.mirar(m.x, m.y);
      break;
    case "rociar":
      escena.rociar(m.si);
      break;
    case "salida":
      escena.salida(m.p);
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
    crearFrasco({
      lienzo: m.lienzo,
      ancho: m.ancho,
      alto: m.alto,
      dpr: m.dpr,
      color: m.color,
      fondo: m.fondo,
      movimiento: m.movimiento,
      calidad: m.calidad,
      letra: m.letra,
      urlLetra: m.urlLetra,
      alPerder: () => puerto.postMessage({ tipo: "perdido" }),
    })
      .then((f) => {
        escena = f;
        for (const p of pendientes) aplicar(p);
        pendientes = [];
        puerto.postMessage({ tipo: "listo" });
      })
      .catch((err: unknown) => puerto.postMessage({ tipo: "error", mensaje: String(err) }));
    return;
  }
  if (escena) aplicar(m);
  else if (m.tipo !== "soltar") {
    // Del mismo tipo se guarda sólo el último (un puntero manda cientos antes del primer cuadro).
    pendientes = pendientes.filter((p) => p.tipo !== m.tipo);
    pendientes.push(m);
  } else puerto.close();
});
