// «Pedir a Soporte GSG» desde la ficha de un cliente de la cartera (GSG-22 y los «sin dirección»).
// PURO (sin base, sin sesión): lo prueba pedido-soporte.test.ts. Lo guarda
// pedido-soporte.server.ts; lo expone pedido-soporte-actions.ts.
//
// La contadora no corrige el CUIT del emisor, no le da una dirección al cliente ni le asigna un
// plan: eso lo hace Soporte GSG desde la consola, porque toca la identidad fiscal y la plata del
// negocio. Lo que sí puede es PEDIRLO con un botón, con el dato correcto, y ver que quedó pedido.
//
// DÓNDE SE GUARDA (sin migración): una fila de `AuditLog` del ESTUDIO (RLS del estudio), acción
// `cartera.pedido_soporte`, entidad `PedidoSoporte`, `entityId` = el cliente. La resolución de
// Soporte es otra fila (`cartera.pedido_soporte_resuelto`, `changes.pedidoId`): nada se edita.
// Mismo criterio que el pedido de alta de C1 (src/lib/cartera-alta-reglas.ts).

import { cuitValido, normalizarCuit } from "@/lib/cuit";

export const ACCION_PEDIDO_SOPORTE = "cartera.pedido_soporte";
export const ACCION_PEDIDO_RESUELTO = "cartera.pedido_soporte_resuelto";
export const ENTIDAD_PEDIDO_SOPORTE = "PedidoSoporte";
/**
 * Cuánto hacia atrás se miran los pedidos. La MISMA ventana para la ficha de la contadora y para la
 * bandeja de Soporte GSG (/operador/pedidos-cartera): un pedido que Soporte todavía ve, la contadora
 * también lo ve marcado, y viceversa (no hay pedidos «fantasma» de un solo lado).
 */
export const VENTANA_PEDIDOS_DIAS = 365;

export function desdeDeLaVentana(ahora: Date = new Date()): Date {
  return new Date(ahora.getTime() - VENTANA_PEDIDOS_DIAS * 24 * 60 * 60 * 1000);
}

export const TIPOS_PEDIDO = ["corregir_cuit", "direccion_propia", "asignar_plan"] as const;
export type TipoPedido = (typeof TIPOS_PEDIDO)[number];

/** Cómo se dice cada pedido en la ficha (el botón) y en la consola de Soporte. */
export const TEXTO_PEDIDO: Readonly<Record<TipoPedido, { boton: string; pedido: string }>> = {
  corregir_cuit: { boton: "Pedir a Soporte GSG la corrección del CUIT", pedido: "Corregir el CUIT del emisor" },
  direccion_propia: { boton: "Pedir a Soporte GSG la dirección propia", pedido: "Activar la dirección propia del cliente" },
  asignar_plan: { boton: "Pedir a Soporte GSG que le asigne el plan", pedido: "Asignarle un plan" },
};

/** Largo máximo de la nota: una aclaración, no una carta. */
export const NOTA_MAX = 300;

export function esTipoPedido(x: unknown): x is TipoPedido {
  return typeof x === "string" && (TIPOS_PEDIDO as readonly string[]).includes(x);
}

export interface PedidoValido {
  tipo: TipoPedido;
  /** Sólo en «corregir_cuit»: el CUIT correcto, 11 dígitos sin guiones. */
  cuit: string | null;
  nota: string | null;
}

export type ValidacionPedido = { ok: true; pedido: PedidoValido } | { ok: false; error: string };

/** Lo que escribió la contadora, validado. PURA. */
export function validarPedido(input: { tipo?: unknown; cuit?: unknown; nota?: unknown }): ValidacionPedido {
  if (!esTipoPedido(input.tipo)) return { ok: false, error: "Elegí qué le pedís a Soporte GSG." };
  const notaCruda = typeof input.nota === "string" ? input.nota.trim().replace(/\s+/g, " ") : "";
  if (notaCruda.length > NOTA_MAX) {
    return { ok: false, error: `La aclaración es muy larga: dejala en ${NOTA_MAX} letras o menos.` };
  }
  const nota = notaCruda || null;
  if (input.tipo !== "corregir_cuit") return { ok: true, pedido: { tipo: input.tipo, cuit: null, nota } };

  const crudo = typeof input.cuit === "string" ? input.cuit : "";
  const cuit = normalizarCuit(crudo);
  if (!cuit) return { ok: false, error: "Escribí el CUIT correcto del cliente (11 números, con o sin guiones)." };
  if (!cuitValido(cuit)) {
    return { ok: false, error: "Ese CUIT no es válido: revisá los números (el último es el dígito verificador)." };
  }
  return { ok: true, pedido: { tipo: "corregir_cuit", cuit, nota } };
}

/** Una fila de pedido o de resolución, tal como sale de AuditLog. */
export interface FilaPedido {
  id: string;
  action: string;
  entityId: string | null;
  changes: unknown;
  createdAt: Date;
}

export interface PedidoAbierto {
  id: string;
  clienteTenantId: string;
  tipo: TipoPedido;
  cuit: string | null;
  pedidoEl: string;
}

function campo(c: unknown, k: string): unknown {
  return typeof c === "object" && c !== null && !Array.isArray(c) ? (c as Record<string, unknown>)[k] : undefined;
}

/**
 * Los pedidos sin resolver, a partir de las filas del estudio (pedidos + resoluciones). Una fila que
 * no tiene la forma esperada se ignora: nunca se confía en `changes`. PURA.
 */
export function pedidosAbiertos(filas: readonly FilaPedido[]): PedidoAbierto[] {
  const resueltos = new Set(
    filas.filter((f) => f.action === ACCION_PEDIDO_RESUELTO).map((f) => campo(f.changes, "pedidoId")).filter((x): x is string => typeof x === "string"),
  );
  const abiertos: PedidoAbierto[] = [];
  for (const f of filas) {
    if (f.action !== ACCION_PEDIDO_SOPORTE || !f.entityId || resueltos.has(f.id)) continue;
    const tipo = campo(f.changes, "tipo");
    if (!esTipoPedido(tipo)) continue;
    const cuit = campo(f.changes, "cuit");
    abiertos.push({
      id: f.id,
      clienteTenantId: f.entityId,
      tipo,
      cuit: typeof cuit === "string" ? cuit : null,
      pedidoEl: f.createdAt.toISOString(),
    });
  }
  return abiertos.sort((a, b) => a.pedidoEl.localeCompare(b.pedidoEl));
}

/** Qué contesta el botón. */
export function respuestaDelPedido(tipo: TipoPedido, yaEstaba: boolean): string {
  // Sólo la primera letra en minúscula: «CUIT» es una sigla y va siempre en mayúsculas.
  const texto = TEXTO_PEDIDO[tipo].pedido;
  const que = texto.charAt(0).toLowerCase() + texto.slice(1);
  return yaEstaba
    ? `Ya lo habías pedido: está en la bandeja de pedidos de Soporte GSG (${que}). Queda marcado en la ficha hasta que lo resuelvan.`
    : `Listo: quedó en la bandeja de pedidos de Soporte GSG (${que}). Queda marcado en la ficha hasta que lo resuelvan.`;
}

// ── La resolución de Soporte GSG (la escribe la consola, /operador/pedidos-cartera) ──────────────

export const RESULTADOS_PEDIDO = ["hecho", "no_corresponde"] as const;
export type ResultadoPedido = (typeof RESULTADOS_PEDIDO)[number];

export const TEXTO_RESULTADO: Readonly<Record<ResultadoPedido, string>> = {
  hecho: "Hecho",
  no_corresponde: "No corresponde",
};

/**
 * Por qué «no corresponde»: una LISTA CERRADA, lo único que la contadora lee de Soporte (refutador
 * 26/09). Antes Soporte escribía la respuesta a mano y le llegaba tal cual a la ficha del cliente:
 * con el nombre de otro negocio, un estudio se enteraba de que existe. Estos textos no nombran ningún
 * negocio ni CUIT; lo que haga falta explicar va por WhatsApp. Mismo criterio que el descarte de un
 * pedido de alta (src/lib/soporte/avisos-a-la-contadora.ts).
 */
export const MOTIVOS_NO_CORRESPONDE = {
  "ya-estaba": "Ya estaba así: no hacía falta cambiar nada.",
  "falta-constancia": "Hace falta la constancia de inscripción de ARCA del cliente: pedísela y volvé a pedirlo.",
  "lo-pide-el-cliente": "Esto lo tiene que pedir el cliente (la dueña o el dueño del negocio) a Soporte GSG.",
  "soporte-escribe": "Soporte GSG te escribe por WhatsApp.",
} as const;
export type MotivoNoCorresponde = keyof typeof MOTIVOS_NO_CORRESPONDE;
export const MOTIVOS_NO_CORRESPONDE_EN_ORDEN = Object.keys(MOTIVOS_NO_CORRESPONDE) as MotivoNoCorresponde[];
/** Lo que lee la contadora si la fila no trae un código de la lista (una vieja, escrita a mano). */
export const MOTIVO_NO_CORRESPONDE_POR_DEFECTO: MotivoNoCorresponde = "soporte-escribe";

export function esMotivoNoCorresponde(x: unknown): x is MotivoNoCorresponde {
  return typeof x === "string" && Object.prototype.hasOwnProperty.call(MOTIVOS_NO_CORRESPONDE, x);
}

export interface ResolucionValida {
  resultado: ResultadoPedido;
  /** Sólo con «no corresponde»: un código de MOTIVOS_NO_CORRESPONDE. Nunca texto libre. */
  motivo: MotivoNoCorresponde | null;
}

/** Lo que eligió Soporte al cerrar un pedido, validado. No hay campo de texto libre. PURA. */
export function validarResolucion(input: { resultado?: unknown; motivo?: unknown }): { ok: true; resolucion: ResolucionValida } | { ok: false; error: string } {
  const resultado = input.resultado;
  if (typeof resultado !== "string" || !(RESULTADOS_PEDIDO as readonly string[]).includes(resultado)) {
    return { ok: false, error: "Elegí si quedó hecho o si no corresponde." };
  }
  if (resultado === "hecho") return { ok: true, resolucion: { resultado: "hecho", motivo: null } };
  if (!esMotivoNoCorresponde(input.motivo)) {
    return { ok: false, error: "Si no corresponde, elegí qué le decimos a la contadora (lo lee en la ficha del cliente)." };
  }
  return { ok: true, resolucion: { resultado: "no_corresponde", motivo: input.motivo } };
}

/** El texto que lee la contadora: SIEMPRE uno de la lista, nunca algo guardado como texto. PURA. */
export function textoDeLaResolucion(resultado: ResultadoPedido, motivo: unknown): string | null {
  if (resultado === "hecho") return null;
  return MOTIVOS_NO_CORRESPONDE[esMotivoNoCorresponde(motivo) ? motivo : MOTIVO_NO_CORRESPONDE_POR_DEFECTO];
}

/** La última respuesta de Soporte GSG sobre un cliente, para mostrarla en la ficha. */
export interface RespuestaDeSoporte {
  pedidoId: string;
  clienteTenantId: string;
  tipo: TipoPedido;
  resultado: ResultadoPedido;
  /** Lo que lee la contadora: un texto de MOTIVOS_NO_CORRESPONDE (null si «hecho»). Nunca texto libre. */
  respuesta: string | null;
  resueltoEl: string;
}

/**
 * Las respuestas de Soporte GSG, de la más nueva a la más vieja, a partir de las mismas filas del
 * estudio (pedidos + resoluciones). Sólo cuenta una resolución que apunta a un pedido real del
 * estudio: una fila suelta no inventa respuestas. PURA.
 */
export function respuestasDeSoporte(filas: readonly FilaPedido[]): RespuestaDeSoporte[] {
  const pedidos = new Map<string, { clienteTenantId: string; tipo: TipoPedido }>();
  for (const f of filas) {
    const tipo = campo(f.changes, "tipo");
    if (f.action === ACCION_PEDIDO_SOPORTE && f.entityId && esTipoPedido(tipo)) pedidos.set(f.id, { clienteTenantId: f.entityId, tipo });
  }
  const salida: RespuestaDeSoporte[] = [];
  const vistos = new Set<string>();
  for (const f of filas) {
    if (f.action !== ACCION_PEDIDO_RESUELTO) continue;
    const pedidoId = campo(f.changes, "pedidoId");
    const resultado = campo(f.changes, "resultado");
    if (typeof pedidoId !== "string" || vistos.has(pedidoId)) continue;
    const p = pedidos.get(pedidoId);
    if (!p || typeof resultado !== "string" || !(RESULTADOS_PEDIDO as readonly string[]).includes(resultado)) continue;
    vistos.add(pedidoId);
    salida.push({
      pedidoId,
      clienteTenantId: p.clienteTenantId,
      tipo: p.tipo,
      resultado: resultado as ResultadoPedido,
      // Del código de la lista; `changes.respuesta` (texto de una fila vieja) no se lee nunca.
      respuesta: textoDeLaResolucion(resultado as ResultadoPedido, campo(f.changes, "motivo")),
      resueltoEl: f.createdAt.toISOString(),
    });
  }
  return salida.sort((a, b) => b.resueltoEl.localeCompare(a.resueltoEl));
}

/** Un pedido que la ficha ofrece para un cliente, con por qué y si ya está pedido. */
export interface PedidoDeLaFicha {
  tipo: TipoPedido;
  /** Por qué se ofrece, en una línea para la contadora. */
  motivo: string;
  /** Hay algo que lo frena hoy (se muestra primero y resaltado). */
  urgente: boolean;
  /** Si ya hay un pedido abierto de este tipo: cuándo se pidió (ISO). */
  pedidoEl: string | null;
  /** Lo último que contestó Soporte GSG a este pedido (sin uno abierto, y de los últimos 60 días). */
  respuesta: RespuestaDeSoporte | null;
}

/** Cuántos días se muestra en la ficha la respuesta de Soporte GSG. */
export const RESPUESTA_VISIBLE_DIAS = 60;

/**
 * Qué puede pedirle la contadora a Soporte GSG para UN cliente. PURA.
 * - Corregir el CUIT: siempre (el que ve puede estar mal aunque el sistema no lo detecte); urgente
 *   si falta o es el de relleno (`cuitIncompleto`).
 * - La dirección propia: sólo si no la tiene (sin ella no hay panel donde subir el extracto).
 * - Asignarle un plan: sólo si no tiene ninguno (queda con el límite básico).
 * Los urgentes van primero; un pedido ya abierto trae su fecha para marcarlo en vez de repetirlo.
 */
export function pedidosDeLaFicha(c: {
  clienteTenantId: string;
  tieneDireccion: boolean;
  sinPlan: boolean;
  cuitIncompleto: boolean;
  abiertos: readonly PedidoAbierto[];
  /** Las respuestas de Soporte GSG del estudio (respuestasDeSoporte). */
  respuestas?: readonly RespuestaDeSoporte[];
  ahora?: Date;
}): PedidoDeLaFicha[] {
  const abierto = (tipo: TipoPedido) =>
    c.abiertos.find((p) => p.clienteTenantId === c.clienteTenantId && p.tipo === tipo)?.pedidoEl ?? null;
  const desde = (c.ahora ?? new Date()).getTime() - RESPUESTA_VISIBLE_DIAS * 24 * 60 * 60 * 1000;
  const respuesta = (tipo: TipoPedido) => {
    if (abierto(tipo)) return null;
    const r = [...(c.respuestas ?? [])]
      .filter((x) => x.clienteTenantId === c.clienteTenantId && x.tipo === tipo)
      .sort((a, b) => b.resueltoEl.localeCompare(a.resueltoEl))[0];
    return r && new Date(r.resueltoEl).getTime() >= desde ? r : null;
  };
  const salida: PedidoDeLaFicha[] = [];
  if (!c.tieneDireccion) {
    salida.push({
      tipo: "direccion_propia",
      motivo: "Sin su dirección propia no hay un panel donde subir el extracto ni entrar a su negocio.",
      urgente: true,
      pedidoEl: abierto("direccion_propia"),
      respuesta: respuesta("direccion_propia"),
    });
  }
  salida.push({
    tipo: "corregir_cuit",
    motivo: c.cuitIncompleto
      ? "Le falta el CUIT del emisor (o tiene uno de relleno): sin él no puede facturar."
      : "Si el CUIT que ves no es el de su constancia de ARCA, pedí que lo corrijan.",
    urgente: c.cuitIncompleto,
    pedidoEl: abierto("corregir_cuit"),
    respuesta: respuesta("corregir_cuit"),
  });
  if (c.sinPlan) {
    salida.push({
      tipo: "asignar_plan",
      motivo: "No tiene plan: queda con el límite básico de facturas automáticas del mes.",
      urgente: false,
      pedidoEl: abierto("asignar_plan"),
      respuesta: respuesta("asignar_plan"),
    });
  }
  return salida.sort((a, b) => Number(b.urgente) - Number(a.urgente));
}
