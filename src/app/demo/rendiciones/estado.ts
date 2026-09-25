// Estado de la demo de Rendí: UN reducer para toda la pantalla (datos + navegación).
//
// Por qué uno solo: la demo cuenta una historia que cruza cuatro roles (quien rinde envía,
// quien aprueba aprueba, Tesorería contabiliza). Con un estado por rol, el recorrido guiado no
// podría llevar de uno a otro, y "Reiniciar demo" no podría volver todo a cero de una vez.
//
// La regla que este archivo NO rompe: el estado de una rendición (borrador → en aprobación →
// aprobada → …) cambia SÓLO con el resultado de `aplicarAccion` del motor (acción
// "transicion", que recibe la rendición que devolvió el motor). Acá se editan CONTENIDOS de una
// rendición abierta —qué comprobantes tiene, cuánto se declara devolver— nunca el estado a mano.
//
// Persistencia: localStorage, clave `rendi-demo-v1`. Cada lectura y escritura va en try/catch:
// en modo incógnito, con el almacenamiento bloqueado o lleno, la demo anda igual (sólo no
// recuerda). Lo guardado lleva la firma del escenario: si cambian los datos de la demo en un
// deploy nuevo, lo viejo se descarta en vez de mezclarse.

import type { Centavos, Comprobante, Rendicion, RolRendi } from "@/lib/rendiciones";
import { escenarioDemo } from "./escenario";
import { aprobadores, esEditable, quienesRinden } from "./derivados";
import { CLAVE_GUARDADO } from "./almacen";

export type PantallaRinde = "inicio" | "detalle" | "cargar" | "enviar";
export type PestanaTesoreria = "control" | "contabilizar" | "iva" | "haberes";
export type PestanaContador = "diccionario" | "reglas" | "tratamiento";

export interface Vista {
  rol: RolRendi;
  /** Persona que se está mirando en "Quien rinde". */
  legajoRinde: string;
  /** Quién es el usuario en "Quien aprueba". */
  legajoAprueba: string;
  pantallaRinde: PantallaRinde;
  comprobanteAbierto: string | null;
  rendicionAprobador: string | null;
  rendicionTesoreria: string | null;
  pestanaTesoreria: PestanaTesoreria;
  pestanaContador: PestanaContador;
}

export interface DatosDemo {
  rendiciones: Rendicion[];
  /** Todos los comprobantes de la empresa: los de las rendiciones y los que salieron a Cuentas a Pagar. */
  comprobantes: Comprobante[];
  /** Comprobantes que salieron de una rendición hacia Cuentas a Pagar (no se pagan por rendición). */
  enCuentasAPagar: string[];
  /** Contador para los ids de lo que se carga en la demo: ids deterministas, sin azar. */
  secuencia: number;
  /** Se prende con cualquier cambio de datos: el recorrido guiado ofrece arrancar de cero. */
  modificada: boolean;
}

export interface EstadoDemo {
  datos: DatosDemo;
  vista: Vista;
}

export type AccionDemo =
  | { tipo: "ir"; vista: Partial<Vista> }
  /** La rendición que devolvió `aplicarAccion` con `ok: true`. Es la única forma de cambiarle el estado. */
  | { tipo: "transicion"; rendicion: Rendicion }
  | { tipo: "agregar_comprobante"; rendicionId: string; comprobante: Comprobante }
  | { tipo: "nuevo_a_cuentas_a_pagar"; rendicionId: string; comprobante: Comprobante }
  | { tipo: "quitar_comprobante"; rendicionId: string; comprobanteId: string }
  | { tipo: "pasar_a_cuentas_a_pagar"; rendicionId: string; comprobanteId: string }
  | { tipo: "declarar_devolucion"; rendicionId: string; importe: Centavos }
  | { tipo: "marcar_original"; rendicionId: string; recibido: boolean }
  | { tipo: "reiniciar" };

function vistaInicial(): Vista {
  return {
    rol: "rinde",
    legajoRinde: quienesRinden[0]?.legajo ?? "",
    legajoAprueba: aprobadores[0]?.legajo ?? "",
    pantallaRinde: "inicio",
    comprobanteAbierto: null,
    rendicionAprobador: null,
    rendicionTesoreria: null,
    pestanaTesoreria: "control",
    pestanaContador: "diccionario",
  };
}

export function estadoInicial(): EstadoDemo {
  // El reducer nunca muta: compartir los arreglos del escenario es seguro, y "Reiniciar"
  // vuelve exactamente a ellos.
  return {
    datos: {
      rendiciones: escenarioDemo.rendiciones,
      comprobantes: escenarioDemo.comprobantes,
      enCuentasAPagar: [],
      secuencia: 1,
      modificada: false,
    },
    vista: vistaInicial(),
  };
}

export function reducirDemo(estado: EstadoDemo, accion: AccionDemo): EstadoDemo {
  const { datos } = estado;
  switch (accion.tipo) {
    case "ir":
      return { ...estado, vista: { ...estado.vista, ...accion.vista } };

    case "reiniciar":
      return estadoInicial();

    case "transicion":
      return conDatos(estado, { rendiciones: reemplazar(datos.rendiciones, accion.rendicion) });

    case "agregar_comprobante": {
      const r = editable(datos, accion.rendicionId);
      if (!r) return estado;
      const c = nuevoComprobante(accion.comprobante, r, datos.secuencia);
      return conDatos(estado, {
        comprobantes: [...datos.comprobantes, c],
        rendiciones: reemplazar(datos.rendiciones, { ...r, comprobanteIds: [...r.comprobanteIds, c.id] }),
        secuencia: datos.secuencia + 1,
      });
    }

    case "nuevo_a_cuentas_a_pagar": {
      // Una factura con leyenda que se detecta al cargarla: no entra a la rendición, sale
      // derecho a Cuentas a Pagar (queda registrada para que Tesorería la vea).
      const r = editable(datos, accion.rendicionId);
      if (!r) return estado;
      const c = nuevoComprobante(accion.comprobante, r, datos.secuencia);
      return conDatos(estado, {
        comprobantes: [...datos.comprobantes, c],
        enCuentasAPagar: [...datos.enCuentasAPagar, c.id],
        secuencia: datos.secuencia + 1,
      });
    }

    case "quitar_comprobante": {
      const r = editable(datos, accion.rendicionId);
      if (!r || !r.comprobanteIds.includes(accion.comprobanteId)) return estado;
      return conDatos(estado, {
        comprobantes: datos.comprobantes.filter((c) => c.id !== accion.comprobanteId),
        rendiciones: reemplazar(datos.rendiciones, {
          ...r,
          comprobanteIds: r.comprobanteIds.filter((id) => id !== accion.comprobanteId),
        }),
      });
    }

    case "pasar_a_cuentas_a_pagar": {
      // Sale de la rendición pero NO se borra: sigue cargado en la empresa (cuenta para
      // duplicados y para la conciliación) y Tesorería lo ve entre las derivaciones.
      const r = editable(datos, accion.rendicionId);
      if (!r || !r.comprobanteIds.includes(accion.comprobanteId)) return estado;
      return conDatos(estado, {
        enCuentasAPagar: [...datos.enCuentasAPagar, accion.comprobanteId],
        rendiciones: reemplazar(datos.rendiciones, {
          ...r,
          comprobanteIds: r.comprobanteIds.filter((id) => id !== accion.comprobanteId),
        }),
      });
    }

    case "declarar_devolucion": {
      const r = editable(datos, accion.rendicionId);
      if (!r) return estado;
      return conDatos(estado, {
        rendiciones: reemplazar(datos.rendiciones, { ...r, devolucionDeclarada: Math.max(0, accion.importe) }),
      });
    }

    case "marcar_original": {
      const r = datos.rendiciones.find((x) => x.id === accion.rendicionId);
      if (!r) return estado;
      return conDatos(estado, {
        comprobantes: datos.comprobantes.map((c) =>
          r.comprobanteIds.includes(c.id) ? { ...c, originalRecibido: accion.recibido } : c,
        ),
      });
    }
  }
}

function conDatos(estado: EstadoDemo, cambios: Partial<DatosDemo>): EstadoDemo {
  return { ...estado, datos: { ...estado.datos, ...cambios, modificada: true } };
}

function reemplazar(rendiciones: Rendicion[], nueva: Rendicion): Rendicion[] {
  return rendiciones.map((r) => (r.id === nueva.id ? nueva : r));
}

function editable(datos: DatosDemo, rendicionId: string): Rendicion | undefined {
  const r = datos.rendiciones.find((x) => x.id === rendicionId);
  return r && esEditable(r) ? r : undefined;
}

function nuevoComprobante(c: Comprobante, r: Rendicion, secuencia: number): Comprobante {
  return { ...c, id: `${r.id}-D${secuencia}`, rendicionId: r.id, legajo: r.legajo };
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistencia (tolerante a fallos)
// ─────────────────────────────────────────────────────────────────────────────

// La clave vive en almacen.ts (sin dependencias) para que error.tsx pueda borrar lo guardado.
const CLAVE = CLAVE_GUARDADO;
const ROLES: RolRendi[] = ["rinde", "aprueba", "tesoreria", "contador"];

// Firma de TODO el escenario (FNV-1a sobre su JSON): cambia con cualquier cambio de los datos
// ficticios, así quien vuelve a la demo después de un deploy no ve un escenario viejo guardado.
const FIRMA_ESCENARIO = (() => {
  const texto = JSON.stringify(escenarioDemo);
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${escenarioDemo.reglaVersion}|${(h >>> 0).toString(36)}`;
})();

function firmaEscenario(): string {
  return FIRMA_ESCENARIO;
}

export function leerEstadoGuardado(): EstadoDemo | null {
  try {
    const crudo = window.localStorage.getItem(CLAVE);
    if (!crudo) return null;
    const guardado = JSON.parse(crudo) as { version?: number; firma?: string; estado?: unknown };
    if (guardado.version !== 1 || guardado.firma !== firmaEscenario()) return null;
    return esEstadoValido(guardado.estado) ? guardado.estado : null;
  } catch {
    return null;
  }
}

export function guardarEstado(estado: EstadoDemo): void {
  try {
    window.localStorage.setItem(CLAVE, JSON.stringify({ version: 1, firma: firmaEscenario(), estado }));
  } catch {
    /* almacenamiento bloqueado o lleno: la demo sigue, sólo no recuerda */
  }
}

function esEstadoValido(e: unknown): e is EstadoDemo {
  if (!e || typeof e !== "object") return false;
  const { datos, vista } = e as Partial<EstadoDemo>;
  return (
    Boolean(datos) &&
    Array.isArray(datos?.rendiciones) &&
    Array.isArray(datos?.comprobantes) &&
    Array.isArray(datos?.enCuentasAPagar) &&
    typeof datos?.secuencia === "number" &&
    Boolean(vista) &&
    ROLES.includes(vista?.rol as RolRendi)
  );
}
