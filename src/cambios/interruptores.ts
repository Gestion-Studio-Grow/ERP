// ============================================================================
// INTERRUPTORES POR NEGOCIO — el catálogo (código) y las constantes de su fila.
// ============================================================================
//
// Un interruptor prende algo NUEVO en un negocio que ya lo tiene instalado: cambia cómo se ve
// o se trabaja, sin deploy. Nunca da acceso a datos de otro negocio ni instala funcionalidad:
// eso sigue siendo un módulo (`Tenant.modules`), que es lo que se vende.
//
// El estado vive en AuditLog, sin tabla nueva: una fila por cambio, con
//   entity "Interruptor", entityId = id del interruptor,
//   action "interruptor.encender" | "interruptor.apagar",
//   actor "operator:<nombre>", channel "operador".
// Manda la última fila válida (mismo patrón que el cierre del mes, cierre-mes.ts:98-99).
//
// Quién puede escribirla: SÓLO la consola del operador (src/lib/operador/interruptores-escritura.server.ts,
// que llama únicamente la action interruptores-actions.ts después de `requireOperator()`) y, cuando
// exista el alta integrada, scripts/provision-tenant.ts. Lo cierra el trinquete de
// src/cambios/interruptores-escritura.test.ts. `audit()` la rechaza (audit-core.ts) y la lectura
// ignora toda fila que no sea de un operador por el canal del operador: una fila forjada desde la
// app de un negocio no prende nada (ya pasó con CierreDiario, audit-core.ts:13-17).
//
// Client-safe: sin Prisma ni nada de servidor. Lo importan el panel, la consola y audit-core.

/** La entidad de AuditLog que guarda el estado de los interruptores. */
export const ENTIDAD_INTERRUPTOR = "Interruptor";
/** El único canal que cuenta: el de la consola del operador. */
export const CANAL_INTERRUPTOR = "operador";
/** El prefijo de actor que cuenta: un operador con nombre (`operator:<nombre>`). */
export const PREFIJO_ACTOR_OPERADOR = "operator:";

export const ACCION_ENCENDER = "interruptor.encender";
export const ACCION_APAGAR = "interruptor.apagar";

export type AccionInterruptor = "encender" | "apagar";

export const ACCION_DE: Record<AccionInterruptor, string> = {
  encender: ACCION_ENCENDER,
  apagar: ACCION_APAGAR,
};

export interface Interruptor {
  id: string;
  /** Cómo se llama en la consola. */
  nombre: string;
  /** Qué cambia en el negocio, en una línea para la ficha. */
  queCambia: string;
  /** Qué se nombra en la Auditoría del negocio: "GSG activó <esto>". */
  enAuditoria: string;
  /**
   * ¿Prenderlo cambia QUÉ APPS ve cada persona? Sólo esos muestran la vista previa de apps en la
   * ficha y exigen 0 apps perdidas para prenderse (`decidirCambioDeInterruptor`). Uno que sólo
   * cambia cómo se ve no le quita nada a nadie: no se frena por apps.
   */
  cambiaLasApps: boolean;
}

/** El catálogo. El primero reemplaza a la variable de deploy APPS_INICIO (retirada). */
export const INTERRUPTORES = [
  {
    id: "inicio-por-apps",
    nombre: "Trabaja por apps",
    queCambia:
      "El Inicio por apps y la barra por módulos: sus módulos deciden qué apps ve cada persona. Apagado, ve el menú de siempre.",
    enAuditoria: "el Inicio por apps",
    cambiaLasApps: true,
  },
  {
    // La piel «Renglón» (src/lib/diseno/): `data-diseno="renglon"` en la raíz del panel,
    // del ingreso, del panel del contador y de Facturita de ESTE negocio. Apagado, esas raíces
    // rinden el HTML de siempre (src/lib/diseno/raices-ch.test.ts).
    id: "diseno-nuevo",
    nombre: "Diseño nuevo",
    queCambia:
      "El diseño nuevo en su panel: botones, cifras y pantallas renovados, con las mismas apps y los mismos datos. Apagado, se ve como siempre.",
    enAuditoria: "el diseño nuevo",
    cambiaLasApps: false,
  },
  {
    // La practicidad de la agenda (plan de practicidad RAE, ítems T4 · T10 · T12 · E2 · E3 · E5 ·
    // E6): defaults en el alta, confirmación con la consecuencia al cancelar y en «no vino», qué
    // pasa con la seña, «reservar el próximo» al completar, el hueco a la lista de espera y la regla
    // de cancelación de la clienta a la vista y aplicada. Apagado, la agenda de siempre.
    id: "agenda-practica",
    nombre: "Agenda práctica",
    queCambia:
      "La agenda pregunta qué pasa con la seña al cancelar o marcar que no vino, propone mañana en el alta, ofrece reservar el próximo y avisa a la lista de espera. La clienta cancela online sólo con la anticipación del negocio. Apagado, la agenda de siempre.",
    enAuditoria: "la agenda práctica",
    cambiaLasApps: false,
  },
  {
    // El mostrador boutique de Magra (reingeniería, Tanda 1 en adelante): el pie de cobro único con
    // pago dividido y billetes, el campo único para la etiqueta de la balanza, el cliente con CUIT
    // en la venta, el envío con costo por zona y la pantalla Armar de los pedidos. Lo leen las
    // pantallas del mostrador con `mostradorBoutiquePrendido`. Se prende sólo en Magra y en los
    // negocios de QA; CH (beauty-spa) no ve nada hasta que el dueño lo decida. Apagado, el
    // mostrador de siempre, byte a byte. No cambia qué apps ve nadie: cambia cómo se vende.
    id: "mostrador-boutique",
    nombre: "Mostrador boutique",
    queCambia:
      "El mostrador nuevo: un solo pie para cobrar (con pago dividido, billetes y vuelto grande), la etiqueta de la balanza entra sola, el cliente con CUIT en la venta y el envío con su costo. Apagado, el mostrador de siempre.",
    enAuditoria: "el mostrador boutique",
    cambiaLasApps: false,
  },
  {
    // Las cuentas corrientes (el fiado y las cuentas de proveedores) por negocio: reemplaza la
    // variable de deploy CUENTAS_CORRIENTES_ENABLED (Magra, tanda 2 · 2D). Prendido, el cobro de
    // un fiado y el pago a un proveedor entran solos al libro de caja, Vender ofrece «A cuenta» y,
    // con el mostrador boutique, «Queda a cobrar» deja la deuda en la ficha del cliente. Si la
    // consola NUNCA lo tocó en ese negocio, manda la variable de siempre (`cuentasCorrientesPrendidas`,
    // settlement/asiento-libro.ts): ningún negocio cambia el día que esto se publica. Prenderlo exige
    // la columna `CashMovement.collectionId` en la base (lote de 5): sin ella el cobro falla entero
    // (la transacción vuelve atrás, no se pierde plata). Es decisión del dueño, lo prende GSG.
    id: "cuentas-corrientes",
    nombre: "Fiado y cuentas corrientes",
    queCambia:
      "El fiado en un solo lugar: lo que se entrega sin cobrar queda en la cuenta del cliente, «A cuenta» en Vender y los cobros del fiado y los pagos a proveedores entran solos al libro de caja. Si nunca se tocó acá, sigue la configuración general del servidor.",
    enAuditoria: "el fiado y las cuentas corrientes",
    cambiaLasApps: false,
  },
  {
    // Arqueo a ciegas al abrir la caja (N2 · M1-C3): el cajero cuenta el cajón antes de ver lo que
    // dice el libro, y una diferencia exige el motivo (caja-actions.ts, `openCashSession`). Apagado,
    // la apertura de siempre: se ve el efectivo esperado y el motivo es opcional. Lo prende GSG
    // cuando el dueño lo pide; ningún negocio cambia el día que esto se publica.
    id: "arqueo-ciego",
    nombre: "Arqueo a ciegas",
    queCambia:
      "Al abrir la caja, el cajero cuenta el cajón antes de ver cuánto dice el libro; si no coincide, tiene que anotar el motivo y la diferencia queda asentada una sola vez. Apagado, la caja muestra el efectivo esperado antes de contar.",
    enAuditoria: "el arqueo a ciegas",
    cambiaLasApps: false,
  },
] as const satisfies readonly Interruptor[];

export type InterruptorId = (typeof INTERRUPTORES)[number]["id"];

export const INICIO_POR_APPS: InterruptorId = "inicio-por-apps";

/** La piel «Renglón», por negocio (src/lib/diseno/diseno.server.ts la lee en cada pedido). */
export const DISENO_NUEVO: InterruptorId = "diseno-nuevo";

/** La agenda práctica (src/lib/turnos/practica.server.ts la lee en cada pedido). */
export const AGENDA_PRACTICA: InterruptorId = "agenda-practica";

/** El mostrador boutique (reingeniería de Magra): Vender, Pedidos, Armar y el cobro nuevos. */
export const MOSTRADOR_BOUTIQUE: InterruptorId = "mostrador-boutique";

/** Fiado y cuentas corrientes por negocio (reemplaza CUENTAS_CORRIENTES_ENABLED; tri-estado). */
export const CUENTAS_CORRIENTES: InterruptorId = "cuentas-corrientes";

/** Arqueo a ciegas al abrir la caja (N2 · M1-C3; lo lee `openCashSession`). */
export const ARQUEO_CIEGO: InterruptorId = "arqueo-ciego";

/**
 * ¿Este negocio trabaja con el mostrador boutique? Recibe el estado que arma
 * `interruptoresDelNegocio()` (src/cambios/interruptores.server.ts) y lo decide sin base. Un estado
 * sin la entrada (un catálogo viejo en memoria, un objeto parcial) cuenta como apagado: lo nuevo
 * nunca se prende por un hueco. PURA y client-safe.
 */
export function mostradorBoutiquePrendido(
  estado: Readonly<Partial<Record<InterruptorId, { encendido: boolean }>>>,
): boolean {
  return estado[MOSTRADOR_BOUTIQUE]?.encendido === true;
}

export function esInterruptorId(id: unknown): id is InterruptorId {
  return typeof id === "string" && INTERRUPTORES.some((i) => i.id === id);
}

export function interruptorPorId(id: InterruptorId): Interruptor {
  return INTERRUPTORES.find((i) => i.id === id) as Interruptor;
}

/**
 * Entidades de AuditLog que `audit()` (la escritura de la app de un negocio) no puede escribir.
 * Normaliza mayúsculas y espacios: "interruptor " tampoco pasa.
 */
export function entidadReservadaDeLaConsola(entity: string): boolean {
  return entity.trim().toLowerCase() === ENTIDAD_INTERRUPTOR.toLowerCase();
}

// ── Qué fila cuenta ─────────────────────────────────────────────────────────────────────────

/** Lo que hace falta de una fila de AuditLog para decidir si es un interruptor válido. */
export interface FilaDeAuditoria {
  entity: string;
  entityId: string | null;
  action: string;
  actor: string;
  channel: string | null;
}

/**
 * ¿Esta fila es un cambio de interruptor escrito por la consola? Entidad, id del catálogo, acción
 * conocida, actor `operator:<nombre>` con nombre, y canal "operador". Una fila de `audit()` (canal
 * admin o public) nunca cumple, aunque diga entity "Interruptor".
 */
export function esFilaDeInterruptorValida(f: FilaDeAuditoria): boolean {
  return (
    f.entity === ENTIDAD_INTERRUPTOR &&
    esInterruptorId(f.entityId) &&
    (f.action === ACCION_ENCENDER || f.action === ACCION_APAGAR) &&
    f.channel === CANAL_INTERRUPTOR &&
    f.actor.startsWith(PREFIJO_ACTOR_OPERADOR) &&
    f.actor.length > PREFIJO_ACTOR_OPERADOR.length
  );
}

/** "operator:facu" → "facu"; cualquier otro actor → null. */
export function operadorDeActor(actor: string): string | null {
  return actor.startsWith(PREFIJO_ACTOR_OPERADOR) && actor.length > PREFIJO_ACTOR_OPERADOR.length
    ? actor.slice(PREFIJO_ACTOR_OPERADOR.length)
    : null;
}

/**
 * Lo que la Auditoría del NEGOCIO muestra de una fila de interruptor: un texto fijo, sin el nombre
 * del operador, sin motivo y sin nada de otros negocios ("GSG activó el Inicio por apps"). `null`
 * si la fila no es un interruptor válido (se muestra como cualquier otra).
 */
export function textoDeInterruptorEnAuditoria(f: FilaDeAuditoria): string | null {
  if (!esFilaDeInterruptorValida(f)) return null;
  const i = interruptorPorId(f.entityId as InterruptorId);
  return `GSG ${f.action === ACCION_ENCENDER ? "activó" : "apagó"} ${i.enAuditoria}`;
}
