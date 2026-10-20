// ============================================================================
// LA BALANZA SIMULADA — un `navigator.serial` falso para los tests de navegador.
// ============================================================================
//
// En CI no hay balanza enchufada (y Playwright no puede tocar la ventanita de elegir puerto).
// `scriptDeBalanzaSimulada(opciones)` devuelve un script para `page.addInitScript(...)` que
// instala un `navigator.serial` falso con UN puerto que se comporta como una balanza:
//   · sólo con la velocidad y los bits correctos manda tramas que se entienden; con otra
//     velocidad manda basura (lo que pasa de verdad) y, si es «a pedido», no contesta;
//   · continuo: una trama cada `intervaloMs`, partida en dos pedazos (como llega por USB);
//   · a pedido: contesta sólo al comando que le corresponde;
//   · `requestPort()` devuelve el puerto (o falla como si no eligieran ninguno con `sinPuerto`);
//     `getPorts()` lo devuelve si ya se eligió una vez o si viene `autorizado` (para probar la
//     reconexión al recargar); `open()` falla como puerto ocupado con `ocupado`.
// En la página queda `window.__balanzaSimulada` para manejarla desde el test:
//   · `fijarPeso(kg, estable)`, `desenchufar()`, `enchufar()`;
//   · `escritos` (lo que la página le mandó) y `aperturas` (con qué se abrió cada vez).
// `scriptSinWebSerial()` saca `navigator.serial` (un navegador sin Web Serial).
//
// Las funciones de abajo se pasan a texto con `toString()` y corren EN LA PÁGINA: no pueden usar
// nada de afuera (ni imports ni otras funciones del módulo, salvo `armarTramaSimulada`, que va
// en el script). tsx/esbuild les agrega `__name(...)`: el script define un `__name` que no hace
// nada.

import type { ComandoSerie, ProtocoloSerie } from "./protocolos";
import type { ConfiguracionDeBits } from "./detector";

export type OpcionesBalanzaSimulada = {
  protocolo: ProtocoloSerie;
  peso: number;
  estable: boolean;
  /** La única velocidad con la que la balanza se entiende. Por defecto, 9600. */
  velocidad?: number;
  bits?: ConfiguracionDeBits;
  /** Con protocolo "a-pedido": a qué comando contesta. Por defecto, ENQ. */
  comando?: ComandoSerie;
  intervaloMs?: number;
  usbVendorId?: number;
  usbProductId?: number;
  /** `getPorts()` ya devuelve el puerto, sin elegirlo (el permiso de una visita anterior). */
  autorizado?: boolean;
  /** `requestPort()` falla como si la persona cerrara la ventanita sin elegir. */
  sinPuerto?: boolean;
  /** `open()` falla como si otro programa tuviera el puerto. */
  ocupado?: boolean;
};

/**
 * Una trama de la balanza simulada, con su fin de línea. `variacion` mueve el peso unos gramos
 * (para el ASCII sin bandera, que se ve «moviéndose» cuando no se repite).
 */
export function armarTramaSimulada(protocolo: ProtocoloSerie, peso: number, estable: boolean, variacion = 0): string {
  const kg = peso + (estable ? 0 : variacion);
  const signo = kg < 0 ? "-" : "+";
  const abs = Math.abs(kg);
  const fijo = abs.toFixed(3);
  if (protocolo === "cas") return (estable ? "ST" : "US") + ",GS," + signo + fijo.padStart(7, " ") + "kg\r\n";
  if (protocolo === "ascii") return (kg < 0 ? "-" : " ") + fijo.padStart(8, " ") + " kg\r\n";
  if (protocolo === "a-pedido") return "\u0002" + (kg < 0 ? "-" : "") + fijo.padStart(6, "0") + (estable ? "" : " M") + "\u0003";
  // Toledo: A = coma con 3 decimales (5) | bit 5; B = kilos | movimiento | negativo | bit 5; C = bit 5.
  const a = String.fromCharCode(0x20 | 5);
  const b = String.fromCharCode(0x20 | 0x10 | (estable ? 0 : 0x08) | (kg < 0 ? 0x02 : 0));
  const c = String.fromCharCode(0x20);
  const trama = "\u0002" + a + b + c + String(Math.round(abs * 1000)).padStart(6, "0") + "000000" + "\r";
  let suma = 0;
  for (let i = 0; i < trama.length; i++) suma += trama.charCodeAt(i);
  return trama + String.fromCharCode((128 - (suma & 0x7f)) & 0x7f);
}

/** Corre EN LA PÁGINA (ver arriba). */
function instalarBalanzaSimulada(o: Required<Omit<OpcionesBalanzaSimulada, "usbVendorId" | "usbProductId">> & {
  usbVendorId?: number;
  usbProductId?: number;
}) {
  const estado = { peso: o.peso, estable: o.estable, enchufada: true };
  const escritos: string[] = [];
  const aperturas: { baudRate: number; dataBits?: number; parity?: string }[] = [];
  const codificar = (t: string) => Uint8Array.from(t, (ch) => ch.charCodeAt(0));
  const comandos: Record<string, string> = { ENQ: "\u0005", P: "P", W: "W", $: "$" };
  let autorizado = o.autorizado;

  const serie = new EventTarget();
  type Ctrl = ReadableStreamDefaultController<Uint8Array>;

  const puerto = new (class extends EventTarget {
    abierto = false;
    correcto = false;
    ctrl: Ctrl | null = null;
    lectura: ReadableStream<Uint8Array> | null = null;
    reloj: ReturnType<typeof setInterval> | null = null;
    vuelta = 0;
    get readable() {
      if (!this.abierto) return null;
      if (!this.lectura) {
        this.lectura = new ReadableStream<Uint8Array>({
          start: (c) => {
            this.ctrl = c;
          },
          cancel: () => {
            this.ctrl = null;
            this.lectura = null;
          },
        });
      }
      return this.lectura;
    }
    get writable() {
      if (!this.abierto) return null;
      return new WritableStream<Uint8Array>({
        write: (chunk) => {
          const t = String.fromCharCode(...chunk);
          escritos.push(t);
          if (o.protocolo === "a-pedido" && this.correcto && t.startsWith(comandos[o.comando])) {
            this.emitir(armarTramaSimulada("a-pedido", estado.peso, estado.estable));
          }
        },
      });
    }
    emitir(t: string) {
      try {
        this.ctrl?.enqueue(codificar(t));
      } catch {
        // la lectura ya se cerró
      }
    }
    async open(op: { baudRate: number; dataBits?: number; parity?: string }) {
      if (o.ocupado) throw new DOMException("Failed to open serial port.", "NetworkError");
      if (this.abierto) throw new DOMException("The port is already open.", "InvalidStateError");
      if (!estado.enchufada) throw new DOMException("The device has been lost.", "NetworkError");
      aperturas.push({ baudRate: op.baudRate, dataBits: op.dataBits, parity: op.parity });
      const bits = (op.dataBits ?? 8) === 7 && op.parity === "even" ? "7E1" : (op.dataBits ?? 8) === 8 && (op.parity ?? "none") === "none" ? "8N1" : "otro";
      this.abierto = true;
      this.correcto = op.baudRate === o.velocidad && bits === o.bits;
      this.reloj = setInterval(() => {
        this.vuelta++;
        if (!this.ctrl) return;
        if (!this.correcto) {
          // Velocidad equivocada: bytes sin sentido (nunca un CR ni un STX limpio).
          if (o.protocolo !== "a-pedido") this.emitir("ø\u0080æþ\u0098Ãÿ\u0086");
          return;
        }
        if (o.protocolo === "a-pedido") return;
        const variacion = this.vuelta % 2 === 0 ? 0.004 : -0.003;
        const trama = armarTramaSimulada(o.protocolo, estado.peso, estado.estable, variacion);
        const mitad = Math.ceil(trama.length / 2);
        this.emitir(trama.slice(0, mitad));
        this.emitir(trama.slice(mitad));
      }, o.intervaloMs);
    }
    async close() {
      if (this.reloj) clearInterval(this.reloj);
      this.reloj = null;
      try {
        this.ctrl?.close();
      } catch {
        // ya cerrada
      }
      this.ctrl = null;
      this.lectura = null;
      this.abierto = false;
    }
    getInfo() {
      return { usbVendorId: o.usbVendorId, usbProductId: o.usbProductId };
    }
  })();

  Object.assign(serie, {
    requestPort: async () => {
      if (o.sinPuerto) throw new DOMException("No port selected by the user.", "NotFoundError");
      autorizado = true;
      return puerto;
    },
    getPorts: async () => (autorizado && estado.enchufada ? [puerto] : []),
  });
  Object.defineProperty(Navigator.prototype, "serial", { configurable: true, get: () => serie });

  (window as unknown as { __balanzaSimulada: unknown }).__balanzaSimulada = {
    escritos,
    aperturas,
    fijarPeso(kg: number, estable: boolean) {
      estado.peso = kg;
      estado.estable = estable;
    },
    desenchufar() {
      estado.enchufada = false;
      if (puerto.reloj) clearInterval(puerto.reloj);
      puerto.reloj = null;
      try {
        puerto.ctrl?.error(new DOMException("The device has been lost.", "NetworkError"));
      } catch {
        // ya cerrada
      }
      puerto.ctrl = null;
      puerto.lectura = null;
      puerto.abierto = false;
      serie.dispatchEvent(new Event("disconnect"));
    },
    enchufar() {
      estado.enchufada = true;
      serie.dispatchEvent(new Event("connect"));
    },
  };
}

/** El script para `page.addInitScript(...)` que instala la balanza simulada. */
export function scriptDeBalanzaSimulada(opciones: OpcionesBalanzaSimulada): string {
  const o = {
    velocidad: 9600,
    bits: "8N1" as ConfiguracionDeBits,
    comando: "ENQ" as ComandoSerie,
    intervaloMs: 40,
    autorizado: false,
    sinPuerto: false,
    ocupado: false,
    ...opciones,
  };
  return `(() => { const __name = (f) => f; ${armarTramaSimulada.toString()}; (${instalarBalanzaSimulada.toString()})(${JSON.stringify(o)}); })();`;
}

/** El script para `page.addInitScript(...)` de un navegador SIN Web Serial. */
export function scriptSinWebSerial(): string {
  return `(() => { try { delete Navigator.prototype.serial; } catch {} try { Object.defineProperty(navigator, "serial", { configurable: true, value: undefined }); } catch {} })();`;
}
