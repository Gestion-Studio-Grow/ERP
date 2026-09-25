// ============================================================================
// TABLERO DE LA PLATAFORMA (consola GSG) — lo que se decide sin base: palabras, posición de cada
// llave y la frase de «¿anda todo?».
// ============================================================================
//
// La página (page.tsx) lee UNA vez el estado (src/lib/cockpit/datos.ts) y esto lo pone en
// palabras del dueño. Puro: se prueba con datos (tablero-core.test.ts).
//
//   · LLAVES: cada servicio (base, aislamiento, facturación, cobros, WhatsApp) es una llave de un
//     tablero eléctrico: arriba = anda en real, al medio = en prueba, abajo = apagado o caído.
//   · ESTADO GENERAL: sale de los servicios y de la base, NO de los negocios. Que un negocio esté
//     en prueba no es una falla de la plataforma (antes, un negocio en prueba ponía todo en
//     «Necesita tu ojo» para siempre).
//   · NOTAS A MANO: src/lib/cockpit/plan.ts es una lista escrita en el código. Se muestra como
//     tal («anotado a mano»), nunca como estado vivo, y sin siglas internas.

import type { TipoMarca } from "@/components/ui/Marca";
import type { AlertaCritica, EstadoTarea } from "@/lib/cockpit/plan";
import type { ComponenteSalud, EstadoSalud, SnapshotNeon, TenantSalud } from "@/lib/cockpit/salud";

export type ModoArca = "real" | "homologacion" | "stub";
export type ModoCobros = "real" | "test" | "stub";

/** Posición de la llave: arriba (anda en real), medio (en prueba), abajo (apagada o caída). */
export type PosicionLlave = "arriba" | "medio" | "abajo";

export interface Llave {
  id: string;
  nombre: string;
  posicion: PosicionLlave;
  /** La palabra corta bajo la llave. */
  estado: string;
  /** La frase que explica qué significa para el negocio. */
  dice: string;
  /** true = hay algo que mirar (no anda en real). */
  paraMirar: boolean;
  caida: boolean;
}

function posicionDe(e: EstadoSalud): PosicionLlave {
  return e === "sano" ? "arriba" : e === "atencion" ? "medio" : "abajo";
}

/**
 * Los servicios de la plataforma como llaves. Los modos de ARCA y de cobros vienen aparte porque
 * la frase depende del modo, no sólo de si anda.
 */
export function llavesDeServicios(
  componentes: readonly ComponenteSalud[],
  modos: { arca: ModoArca; cobros: ModoCobros },
): Llave[] {
  return componentes.map((c): Llave => {
    const caida = c.estado === "caido";
    const base = { id: c.id, posicion: posicionDe(c.estado), paraMirar: c.estado !== "sano", caida };
    switch (c.id) {
      case "app":
        // Siempre arriba: si esta pantalla se ve, el sistema está en línea.
        return {
          ...base,
          nombre: "Sistema",
          estado: "En línea",
          dice: "Si ves esta pantalla, el sistema y las vidrieras están en línea.",
        };
      case "db":
        return {
          ...base,
          nombre: "Base de datos",
          estado: caida ? "No responde" : "Anda",
          dice: caida
            ? "La última lectura no tuvo respuesta: nadie puede vender ni cobrar."
            : "Responde. Todos los negocios leen y guardan.",
        };
      case "rls":
        return {
          ...base,
          nombre: "Aislamiento",
          estado: c.estado === "sano" ? "Prendido" : "Apagado",
          dice:
            c.estado === "sano"
              ? "Cada negocio ve sólo lo suyo, aunque compartan la base."
              : "Apagado en este entorno: un error de programa podría mostrar datos de otro negocio.",
        };
      case "arca":
        return {
          ...base,
          nombre: "Facturación",
          estado: modos.arca === "real" ? "En real" : "En prueba",
          dice:
            modos.arca === "real"
              ? "Emite facturas con validez ante ARCA."
              : modos.arca === "homologacion"
                ? "Conectada al ambiente de prueba de ARCA: ninguna factura tiene validez fiscal."
                : "Simulada: no se le manda nada a ARCA.",
        };
      case "mp":
        return {
          ...base,
          nombre: "Cobros",
          estado: modos.cobros === "real" ? "En real" : "En prueba",
          dice:
            modos.cobros === "real"
              ? "Los links de Mercado Pago cobran de verdad."
              : modos.cobros === "test"
                ? "Con cuentas de prueba de Mercado Pago: no entra plata."
                : "Simulados: no se genera ningún cobro en Mercado Pago.",
        };
      case "whatsapp":
        return {
          ...base,
          nombre: "WhatsApp",
          estado: c.estado === "sano" ? "Conectado" : "Sin conectar",
          dice:
            c.estado === "sano"
              ? "Conectado a un servicio de envío de mensajes."
              : "Sin servicio de envío: los mensajes se mandan a mano desde el teléfono.",
        };
      default:
        // Un servicio nuevo en src/lib/cockpit aparece igual, con sus palabras de origen.
        return {
          ...base,
          nombre: c.label,
          estado: c.estado === "sano" ? "Anda" : c.estado === "atencion" ? "Para mirar" : "Caído",
          dice: c.nota,
        };
    }
  });
}

export interface LecturaDeBase {
  estado: string;
  tipo: TipoMarca;
  /** Los números de la última lectura; null si no se midió. */
  numeros: { que: string; valor: string }[] | null;
  dice: string;
}

/** La medición de la base, en palabras. En pausa (lo normal) no se inventan números. */
export function lecturaDeBase(neon: SnapshotNeon): LecturaDeBase {
  if (neon.estado === "en_pausa") {
    return {
      estado: "Medición apagada",
      tipo: "pendiente",
      numeros: null,
      dice: "No se mide para no gastar la cuota del plan gratis de la base. Se prende con un ajuste del servidor.",
    };
  }
  if (neon.latenciaMs === null || neon.conexiones === null || neon.locks === null) {
    return {
      estado: "No se pudo leer",
      tipo: "anulado",
      numeros: null,
      dice: "La base no contestó la medición. Si los negocios tampoco pueden entrar, está caída.",
    };
  }
  const n = (v: number) => new Intl.NumberFormat("es-AR").format(v);
  return {
    estado: neon.estado === "sano" ? "En rango" : neon.estado === "atencion" ? "Lenta" : "Saturada",
    tipo: neon.estado === "sano" ? "hecho" : neon.estado === "atencion" ? "atencion" : "anulado",
    numeros: [
      { que: "Tarda en contestar", valor: `${n(neon.latenciaMs)} ms` },
      { que: "Conexiones abiertas", valor: n(neon.conexiones) },
      { que: "Operaciones esperando turno", valor: n(neon.locks) },
    ],
    dice:
      neon.estado === "sano"
        ? "Contesta rápido y sin colas."
        : "Contesta lento o con cola: los negocios lo notan al cobrar.",
  };
}

export interface EstadoGeneral {
  /** La frase del título: «Anda todo», «Anda, con cosas en prueba», «Hay algo caído». */
  frase: string;
  tipo: TipoMarca;
  /** Los nombres de lo que hay que mirar, en orden. */
  paraMirar: string[];
}

/** ¿Anda todo? Sale de los servicios y la base; los negocios en prueba no cuentan como falla. */
export function estadoGeneral(llaves: readonly Llave[], base: LecturaDeBase): EstadoGeneral {
  const baseCaida = base.tipo === "anulado";
  const caidas = llaves.filter((l) => l.caida).map((l) => l.nombre);
  if (baseCaida && !caidas.includes("Base de datos")) caidas.unshift("Base de datos");
  if (caidas.length > 0) {
    return { frase: "Hay algo caído", tipo: "anulado", paraMirar: caidas };
  }
  const mirar = llaves.filter((l) => l.paraMirar).map((l) => l.nombre);
  if (base.tipo === "atencion") mirar.unshift("Base de datos");
  if (mirar.length > 0) {
    return { frase: "Anda, con cosas para mirar", tipo: "atencion", paraMirar: mirar };
  }
  return { frase: "Anda todo", tipo: "hecho", paraMirar: [] };
}

export interface ResumenNegocios {
  total: number;
  produccion: number;
  prueba: number;
  suspendidos: number;
  /** Negocios que piden algo a la plataforma: suspendidos, o en producción sin link publicado. */
  conProblema: { id: string; nombre: string; que: string }[];
}

/** Los negocios vistos desde la plataforma. Estar en prueba no es un problema. */
export function resumenDeNegocios(tenants: readonly TenantSalud[]): ResumenNegocios {
  const conProblema: ResumenNegocios["conProblema"] = [];
  for (const t of tenants) {
    if (t.status === "SUSPENDED") {
      conProblema.push({ id: t.id, nombre: t.name, que: "Suspendido: no puede entrar nadie." });
    } else if (t.status === "ACTIVE" && !t.subdomain) {
      conProblema.push({ id: t.id, nombre: t.name, que: "En producción sin link publicado." });
    }
  }
  return {
    total: tenants.length,
    produccion: tenants.filter((t) => t.status === "ACTIVE").length,
    prueba: tenants.filter((t) => t.status === "TRIAL").length,
    suspendidos: tenants.filter((t) => t.status === "SUSPENDED").length,
    conProblema,
  };
}

export interface NotaAMano {
  id: string;
  urgente: boolean;
  titulo: string;
  detalle: string;
  queHacesVos: string;
}

// Las notas conocidas, dichas sin siglas. Una nota nueva en plan.ts se muestra con sus palabras.
const NOTAS_EN_PALABRAS: Record<string, Omit<NotaAMano, "id" | "urgente">> = {
  "sec-secretos": {
    titulo: "Cambiar las claves de la base y prender la vuelta atrás en el tiempo",
    detalle:
      "Antes de cobrar en real: hay claves de acceso a la base que conviene cambiar, y la base todavía no puede volver a un momento anterior si algo se rompe.",
    queHacesVos: "Cambiar las claves y prender la restauración a un momento en Neon.",
  },
  "mig-fiscal": {
    titulo: "Cambios de la base para facturar, escritos y sin aplicar",
    detalle: "Los de facturación y los de stock están listos pero no se aplicaron a la base de producción.",
    queHacesVos: "Autorizar que se apliquen.",
  },
  "cred-arca-mp": {
    titulo: "Faltan las credenciales de ARCA y de Mercado Pago para pasar a real",
    detalle: "Facturación y cobros andan en prueba: falta el certificado y el CUIT de ARCA y la clave de Mercado Pago.",
    queHacesVos: "Cargarlas en la configuración del servidor.",
  },
  "deploy-magra": {
    titulo: "Publicar el sitio de MAGRA",
    detalle: "El negocio ya está cargado y separado del resto; falta publicar su sitio.",
    queHacesVos: "Autorizar la publicación.",
  },
};

/** Las alertas escritas a mano, en palabras del dueño y con las urgentes primero. */
export function notasAMano(alertas: readonly AlertaCritica[]): NotaAMano[] {
  return alertas
    .map((a): NotaAMano => {
      const p = NOTAS_EN_PALABRAS[a.id];
      return {
        id: a.id,
        urgente: a.severidad === "roja",
        titulo: p?.titulo ?? a.titulo,
        detalle: p?.detalle ?? a.detalle,
        queHacesVos: p?.queHacesVos ?? a.accionDueno,
      };
    })
    .sort((x, y) => Number(y.urgente) - Number(x.urgente));
}

export const MARCA_DE_TAREA: Record<EstadoTarea, { tipo: TipoMarca; palabra: string }> = {
  hecho: { tipo: "hecho", palabra: "Hecho" },
  "en-curso": { tipo: "medias", palabra: "En curso" },
  pendiente: { tipo: "pendiente", palabra: "Pendiente" },
};
