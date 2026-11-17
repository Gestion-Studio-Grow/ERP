// CONSOLA DE LA CUADRILLA · quién puede qué (GSG-MIA-062, criterios 3 y 4 del plan).
//
// PURO: no toca la base. Cada acción del servidor arma el `Actor` desde la sesión (nunca desde lo que
// manda el navegador) y el contexto desde la fila leída BAJO RLS, y pregunta acá ANTES de escribir.
//
// Actores:
// - OPERADOR GSG: la persona de GSG en /operador (rol del dueño u operador). Ve todos los negocios, pero
//   cada lectura y escritura corre parada en UN negocio (`enElNegocio`, RLS con `app_rls`).
// - SUPERVISOR: persona del negocio (dueña o quien tenga la consola) que NO es usuario de agente. Sólo su negocio.
// - AGENTE: el usuario propio de un agente. Habla en su hilo y levanta excepciones; nunca supervisa ni aprueba.
//
// Nivel 0 (mismo criterio que `crm-comercial/permisos.ts`: «el sistema no le manda nada a nadie»):
// - `enviar_a_terceros` lo niega SIEMPRE el servidor, para cualquiera.
// - Plata y envíos a terceros se aprueban de a una, por una persona, viendo el contenido: no entran en
//   ningún lote y la aprobación trae la huella del contenido que se vio (si cambió, se rechaza).

export const TIPOS = ["APROBACION", "FRENADO", "RECHAZO", "ESCALADO"] as const;
export type Tipo = (typeof TIPOS)[number];
export const CATEGORIAS = ["PLATA", "ENVIO_TERCEROS", "OTRA"] as const;
export type Categoria = (typeof CATEGORIAS)[number];
export const ESTADOS_EXCEPCION = ["PENDIENTE", "APROBADA", "RECHAZADA", "RESUELTA"] as const;
export type EstadoExcepcion = (typeof ESTADOS_EXCEPCION)[number];
export const ESTADOS_AGENTE = ["ACTIVO", "PAUSADO", "FRENADO"] as const;
export type EstadoAgente = (typeof ESTADOS_AGENTE)[number];

export type Actor =
  | { tipo: "operador"; nombre: string }
  | { tipo: "supervisor"; tenantId: string; userId: string; nombre: string }
  | { tipo: "agente"; tenantId: string; userId: string; agenteId: string; nombre: string };

export const OPERACIONES = [
  "ver_consola",
  "aprobar",
  "rechazar",
  "resolver",
  "aprobar_lote",
  "rechazar_lote",
  "pausar",
  "reanudar",
  "reasignar",
  "hablar",
  "levantar_excepcion",
  "enviar_a_terceros",
] as const;
export type Operacion = (typeof OPERACIONES)[number];

export type ExcepcionCtx = {
  tenantId: string;
  agenteId: string;
  tipo: string;
  categoria: string;
  estado: string;
  creadaPorUserId: string | null;
};

export type Contexto = {
  /** Negocio sobre el que se quiere actuar (de la fila leída, no del formulario). */
  tenantId?: string;
  excepcion?: ExcepcionCtx;
  /** Para un lote: las excepciones que lo forman. */
  lote?: ExcepcionCtx[];
  /** Para hablar: el hilo ("agente:<id>" o "equipo:<nombre>") y, si es de agente, de qué agente. */
  hiloAgenteId?: string | null;
  /** Aprobar nivel 0: ¿la huella del contenido que vio la persona coincide con la de la fila? */
  contenidoVisto?: boolean;
};

export type Resultado = { ok: true } | { ok: false; motivo: string };
const SI: Resultado = { ok: true };
const no = (motivo: string): Resultado => ({ ok: false, motivo });

/** Plata o envío a terceros: lo que nunca se aprueba en lote ni sin mirar. */
export function esNivel0(categoria: string): boolean {
  return categoria === "PLATA" || categoria === "ENVIO_TERCEROS";
}

const DE_PERSONA: ReadonlySet<Operacion> = new Set([
  "ver_consola",
  "aprobar",
  "rechazar",
  "resolver",
  "aprobar_lote",
  "rechazar_lote",
  "pausar",
  "reanudar",
  "reasignar",
]);

function alcance(actor: Actor, tenantId: string | undefined): Resultado {
  if (actor.tipo === "operador") return SI;
  if (!tenantId) return no("Falta indicar de qué negocio es.");
  return tenantId === actor.tenantId ? SI : no("Eso es de otro negocio: no lo podés ver ni tocar.");
}

function decidirUna(actor: Actor, op: Operacion, e: ExcepcionCtx | undefined, contenidoVisto: boolean | undefined): Resultado {
  if (!e) return no("Falta indicar qué excepción.");
  const a = alcance(actor, e.tenantId);
  if (!a.ok) return a;
  if (e.estado !== "PENDIENTE") return no("Esa excepción ya se decidió.");
  if (actor.tipo !== "operador" && e.creadaPorUserId && e.creadaPorUserId === actor.userId) {
    return no("No podés decidir algo que levantaste vos.");
  }
  if (op === "aprobar") {
    if (e.tipo !== "APROBACION") return no("Sólo se aprueba un pedido de aprobación; lo demás se resuelve.");
    if (esNivel0(e.categoria) && contenidoVisto !== true) {
      return no("Plata y envíos a terceros se aprueban de a uno, abriendo el pedido y viendo el contenido.");
    }
  }
  if (op === "resolver" && e.tipo === "APROBACION") return no("Un pedido de aprobación se aprueba o se rechaza.");
  return SI;
}

/**
 * ¿Puede este actor hacer esta operación en este contexto? Devuelve el motivo en criollo si no.
 * `null` = sin sesión: nada.
 */
export function puede(actor: Actor | null | undefined, operacion: Operacion, ctx: Contexto = {}): Resultado {
  if (!actor) return no("Tenés que entrar con tu usuario.");
  if (!(OPERACIONES as readonly string[]).includes(operacion)) return no("Esa acción no existe en la consola.");
  if (operacion === "enviar_a_terceros") {
    return no("El sistema no le manda nada a nadie: el envío lo hace una persona, después de aprobarlo.");
  }
  if (actor.tipo === "agente" && DE_PERSONA.has(operacion)) {
    return no("Un usuario de agente no supervisa ni aprueba: eso lo hace una persona.");
  }

  switch (operacion) {
    case "ver_consola":
      return alcance(actor, actor.tipo === "operador" ? undefined : (ctx.tenantId ?? actor.tenantId));
    case "aprobar":
    case "rechazar":
    case "resolver":
      return decidirUna(actor, operacion, ctx.excepcion, ctx.contenidoVisto);
    case "aprobar_lote":
    case "rechazar_lote": {
      const lote = ctx.lote ?? [];
      if (lote.length === 0) return no("Elegí al menos una excepción.");
      if (lote.length > 50) return no("De a 50 como máximo.");
      for (const e of lote) {
        if (operacion === "aprobar_lote" && esNivel0(e.categoria)) {
          return no("En el lote hay plata o envíos a terceros: esos se aprueban de a uno, viendo el contenido.");
        }
        const r = decidirUna(actor, operacion === "aprobar_lote" ? "aprobar" : "rechazar", e, false);
        if (!r.ok) return r;
      }
      return SI;
    }
    case "pausar":
    case "reanudar":
    case "reasignar":
      return alcance(actor, ctx.tenantId);
    case "hablar": {
      const a = alcance(actor, ctx.tenantId);
      if (!a.ok) return a;
      if (actor.tipo === "agente" && ctx.hiloAgenteId !== actor.agenteId) {
        return no("Un agente habla sólo en su propio hilo.");
      }
      return SI;
    }
    case "levantar_excepcion":
      if (actor.tipo !== "agente") return no("Las excepciones las levanta un agente.");
      return alcance(actor, ctx.tenantId);
  }
  return no("Esa acción no existe en la consola.");
}
