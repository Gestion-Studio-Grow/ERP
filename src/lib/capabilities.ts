// Modelo de capacidades RBAC (ADR-017 §2.b/§2.e) — DATO PURO, sin dependencias de
// servidor. Este módulo lo importan tanto los helpers server-side (`authz.ts`)
// como componentes de cliente (AdminShell, para ocultar navegación por rol). Por
// eso NO puede importar `next/headers`, Prisma ni `session.ts`: nada que arrastre
// código de servidor al bundle del cliente.
//
// El mapa rol→capacidades vive acá, en código, no en la base (ADR-017 §2.e: "el
// mapa rol→permisos vive en código"). Ocultar un botón en el front es UX; la
// seguridad real es el chequeo server-side de `requireCapability` (authz.ts).

export type Role = "OWNER" | "RECEPTION" | "PROFESSIONAL";

export type Capability =
  | "dashboard:read"
  | "agenda:read"
  // Aparecer en la reserva online (casilla 1 de la matriz). NO es `Professional.active`: apagarla saca a
  // la profesional de `/reserva` y del modal público, pero sigue en la grilla y en «Dar turno». Todos
  // los roles la traen prendida; sólo tiene efecto con ficha vinculada. Se aplica en los caminos públicos
  // con `profesionalesFueraDeReservaOnline` (src/lib/permisos/reserva-online.ts).
  | "booking:online"
  | "agenda:manage" // mover/reprogramar/cancelar/editar turnos
  // Crear un turno (casilla 2 de la matriz de permisos). Separada de `agenda:manage` (05/11/2026):
  // agendar y editar son dos casillas distintas. Sólo la exigen las acciones que CREAN un turno.
  | "agenda:create"
  | "agenda:complete" // marcar completado / no-show
  // Cobrar un turno: seña, cobro parcial o saldo. Va SEPARADA de `agenda:manage` a
  // propósito. Decisión del dueño (2026-09-07): en CH Estética **el profesional también
  // cobra, y rinde la comisión después** — es el flujo real del negocio. Pero cobrar no
  // puede implicar crear, cancelar o reprogramar turnos ajenos, que es lo que da
  // `agenda:manage`. Con una capacidad propia, el profesional cobra LO SUYO (el scoping a
  // su `professionalId` lo hace la acción) y nada más.
  | "agenda:collect"
  // Dar de baja (perdonar) el saldo de un turno ya prestado. SIN plata, pero es plata que el
  // negocio resigna: decisión de la dueña (reingeniería CH, D5: «tope $0, sólo la dueña da de
  // baja saldos»). Va SEPARADA de `agenda:manage` porque la recepción gestiona la agenda entera
  // y, con eso, podía regalar saldos. Sólo OWNER; `condonarSaldoTurno` la exige.
  | "agenda:forgive"
  // Anular un cobro de turno: asienta el egreso en la caja. Va SEPARADA de `agenda:collect` porque
  // cobrar no habilita deshacer. Orden del dueño (31/10/2026): «no se anulan cobros, pero solamente
  // recepcion con autorizacion de caro». Cómo anula cada rol: `anulacionDeCobro`, más abajo.
  | "agenda:void"
  // Confirmar un turno SIN la seña cuando el negocio la exige (interruptor «sena-obligatoria»): la
  // excepción, con motivo auditado (`confirmarSinSenia`). Sólo OWNER por defecto; no está en la matriz
  // por usuario, así que ningún override se la da a otro rol.
  | "agenda:confirmar-sin-senia"
  | "clients:read"
  | "clients:manage"
  // Ver teléfono y mail de los clientes (casilla 5). Sin ella el servidor los enmascara.
  | "clients:contact"
  | "waitlist:manage" // anotar/gestionar la lista de espera y convertir en turno
  | "catalog:read"
  | "catalog:manage"
  | "orders:read"
  | "orders:manage" // tomar pedidos / vender en mostrador (POS), avanzar y cobrar pedidos
  // Anular una venta o un pedido: asienta el egreso en la caja y devuelve la mercadería. Va
  // SEPARADA de `orders:manage` porque mueve plata hacia atrás, y hasta dónde llega depende
  // del rol: ver `alcanceDeAnulacion` más abajo.
  | "orders:void"
  // Stock y compras. Van de a una para poder darle al encargado de un local (hoy RECEPTION:
  // no hay rol propio sin migrar el enum de Postgres) lo que necesita para recibir, contar y
  // cargar mermas, sin darle los costos ni las compras. Ninguna habilita nada hasta que una
  // app la pida: se declaran juntas para que el mapa de roles se decida una sola vez.
  | "stock:read" // ver el stock, sin costos
  | "stock:receive" // recibir mercadería
  | "stock:count" // cargar un recuento
  | "stock:adjust" // cargar mermas y ajustes (RECEPTION con tope: lo fija la app de Mermas)
  | "purchasing:manage" // proveedores, pedidos y devoluciones a proveedor
  | "costs:read" // ver costos y margen
  // Mis locales (marca con varios locales). La capability sola NO alcanza: las apps exigen
  // además el módulo `multilocal` asignado y que el negocio sea la casa de la red, igual que
  // `cartera:manage` con su módulo.
  | "multilocal:manage"
  | "traslados:manage" // mandar mercadería de un local a otro de la misma red
  | "coupons:manage"
  | "reminders:manage"
  | "reviews:manage"
  | "reports:read"
  | "audit:read"
  | "users:manage"
  | "location:manage" // editar ubicación/contacto del negocio (módulo Localización)
  | "commissions:manage" // liquidar comisiones a profesionales (marcar período como pagado)
  // Ver SU liquidación («Mi liquidación», /admin/mis-comisiones): lo pendiente estimado y lo ya
  // liquidado de la profesional de la sesión, y nada más (el scoping a `User.professionalId` lo hace
  // el loader, comisiones/lectura.ts). Sin botones de plata. Spec: docs/producto/comisiones/LIQUIDACION.md.
  | "commissions:read-own"
  | "modules:manage" // activar/desactivar los módulos (apps) del negocio — vidriera de módulos
  | "billing:manage" // emitir facturas y procesar la facturación electrónica ARCA (módulo ARCA)
  | "payments:manage" // generar links de cobro por Mercado Pago (módulo Cobros)
  // Recibir señas en la cuenta MP propia del profesional (casilla 7). «Próximamente»: existe en el
  // union, pero ningún rol la tiene ni la matriz la graba (PLAN permisos §7).
  | "payments:own-account"
  // Habilitar la caja: abrir, cerrar y arquear (casilla 8). Vender NO la exige (`orders:manage`).
  | "cash:manage"
  // Panel del contador (/contador, módulo CARTERA): administrar la cartera de
  // clientes de un estudio contable. La capability sola NO alcanza: la página y
  // las actions exigen ADEMÁS el módulo `cartera` ASIGNADO al tenant (ADR-055) —
  // así un OWNER de un negocio común no ve el panel aunque el rol se la dé.
  | "cartera:manage"
  // Apariencia del backoffice (/admin/apariencia): elegir el color del equipo
  // (Tenant.accentPreset) y el tema claro/oscuro del panel. Solo OWNER — es
  // configuración del negocio, mismo tenor que localización/módulos.
  | "appearance:manage"
  // Marcar un cheque de la administración como rechazado (vouchers de CH): revierte la imputación del
  // pago y, si ya se había depositado, saca la plata de la caja. Orden del dueño (08/11/2026): «solamente
  // lo puede hacer el dueño y el administrador». No hay rol ADMIN aparte (el enum `UserRole` dice
  // «OWNER absorbe el admin»), así que es sólo OWNER. NO está en la matriz por usuario: ningún override
  // se la da a la recepción. `cash:manage` sola no alcanza.
  | "vouchers:rechazar-cheque";

// Las capacidades del DUEÑO. El nombre dice "ALL" y no son todas — ver la exclusión de
// abajo, que es deliberada y anterior a este comentario.
//
// EL MECANISMO, que es lo que cambió: esto era un array suelto con un comentario que pedía
// "mantener esta lista sincronizada con el union `Capability`", y el único test que la
// miraba verificaba la dirección contraria (que cada elemento del array fuera una capability
// válida). O sea: agregar una capability al union y olvidarse de la lista pasaba en verde, y
// el dueño se quedaba sin un permiso que el resto del sistema cree que tiene.
//
// Ahora el compilador lo exige. `Record<Exclude<Capability, NoEsDelDueño>, true>` obliga a
// que cada miembro del union esté en una de las dos listas: o se la damos al dueño, o está
// explícitamente excluida CON SU MOTIVO. Olvidarse deja de ser posible; excluir algo a
// propósito sigue siéndolo, y ahora se lee en el tipo en vez de en un comentario.
//
// (Escribí esto primero como un Record exhaustivo sobre `Capability` entero. Estaba mal:
// `tsc` exigió `modules:manage` y eso le habría dado al dueño una atribución que el negocio
// le sacó a propósito. La exclusión tenía que ser parte del tipo, no un agujero en él.)

/**
 * Capacidades que existen en el union y que el dueño NO tiene, con el motivo.
 *
 * Aprovisionar módulos es decidir qué producto compró el cliente: es una decisión comercial
 * y de implementación, no de operación diaria. Si el dueño puede prenderlos solo, se activa
 * funcionalidad que no contrató ni nadie le explicó — y puede apagarse Agenda un martes a la
 * mañana. Vive en la consola de operador, del lado del proveedor, igual que el alcance lo
 * activa el partner y no el usuario final.
 */
const NO_SON_DEL_DUENIO = {
  "modules:manage": "decisión comercial: se aprovisiona desde la consola de operador",
  "payments:own-account": "próximamente: falta decidir a dónde va la plata y cómo se liquida (PLAN permisos §7)",
} as const;

const DEL_DUENIO: Record<Exclude<Capability, keyof typeof NO_SON_DEL_DUENIO>, true> = {
  "dashboard:read": true,
  "agenda:read": true,
  "booking:online": true,
  "agenda:manage": true,
  "agenda:create": true,
  "agenda:complete": true,
  "agenda:collect": true,
  "agenda:forgive": true,
  "agenda:void": true,
  "agenda:confirmar-sin-senia": true,
  "clients:read": true,
  "clients:manage": true,
  "clients:contact": true,
  "waitlist:manage": true,
  "catalog:read": true,
  "catalog:manage": true,
  "orders:read": true,
  "orders:manage": true,
  "orders:void": true,
  "stock:read": true,
  "stock:receive": true,
  "stock:count": true,
  "stock:adjust": true,
  "purchasing:manage": true,
  "costs:read": true,
  "multilocal:manage": true,
  "traslados:manage": true,
  "coupons:manage": true,
  "reminders:manage": true,
  "reviews:manage": true,
  "reports:read": true,
  "audit:read": true,
  "users:manage": true,
  "location:manage": true,
  "commissions:manage": true,
  "commissions:read-own": true,
  "billing:manage": true,
  "payments:manage": true,
  "cash:manage": true,
  "cartera:manage": true,
  "appearance:manage": true,
  "vouchers:rechazar-cheque": true,
};

export const ALL_CAPABILITIES: Capability[] = Object.keys(DEL_DUENIO) as Capability[];

// Mapa rol → capacidades (ADR-017 §2.b, tabla de roles).
// - OWNER: todo (config, precios, reportes, gestión de usuarios).
// - RECEPTION: día a día operativo — agenda (ver/gestionar/cerrar), alta de
//   clientes y cobrar. NO ve reportes financieros ni edita catálogo/precios/
//   config (ADR-017: "No ve reportes financieros ni edita precios/config").
//   Supuesto de esta fase: catálogo, cupones, recordatorios, reseñas, auditoría,
//   usuarios, localización y liquidación de comisiones quedan solo-OWNER — el ADR
//   solo garantiza a RECEPTION agenda +
//   clientes + cobrar; el resto se mantiene en OWNER por ser lo más simple y
//   defendible. Si más adelante la recepción necesita alguna de esas, se agrega
//   la capability al arreglo (un renglón), sin tocar los guardas.
//   EXCEPCIÓN: la lista de espera (`waitlist:manage`) SÍ va a RECEPTION — es
//   trabajo de mostrador puro (anota a quien llama cuando está lleno y ofrece el
//   hueco cuando se libera), del mismo tenor operativo que agenda + clientes.
// - PROFESSIONAL: solo su propia agenda — leer, marcar completado/no-show y COBRAR sus
//   turnos. El scoping a su `professionalId` se hace en el loader (getAgendaDay) y en las
//   acciones de cierre y cobro; la capability solo habilita la clase de acción. NO ANULA un
//   cobro, ni el suyo (orden del dueño, 31/10/2026): cobrar no le da `agenda:void`.
export const ROLE_CAPABILITIES: Record<Role, Capability[]> = {
  OWNER: ALL_CAPABILITIES,
  RECEPTION: [
    "dashboard:read",
    "agenda:read",
    "booking:online",
    "agenda:manage",
    "agenda:create",
    "agenda:complete",
    "agenda:collect",
    // Sólo con el código de la dueña para ESE cobro: `anulacionDeCobro`.
    "agenda:void",
    "clients:read",
    "clients:manage",
    "clients:contact",
    "waitlist:manage",
    // POS/pedidos es trabajo de mostrador puro (tomar el pedido, cobrarlo,
    // marcarlo listo/entregado), del mismo tenor que agenda + clientes, así que
    // RECEPTION lo tiene. El catálogo/precios sigue solo-OWNER.
    "orders:read",
    "orders:manage",
    // Anula, pero sólo lo cobrado hoy, con motivo y, si la venta ya tiene plata, con el código de la
    // dueña (`alcanceDeAnulacion`; orden del dueño, 31/10/2026). Un pedido sin cobrar no lo pide.
    "orders:void",
    // Abrir, cerrar y arquear la caja del mostrador (casilla 8).
    "cash:manage",
    // El encargado del local: ve el stock (sin costos), recibe, cuenta y carga mermas. Los
    // costos, las compras y los proveedores siguen siendo del dueño.
    "stock:read",
    "stock:receive",
    "stock:count",
    "stock:adjust",
    // Traslados entre locales de la misma red: sin el módulo `multilocal` asignado a la casa
    // no habilita ninguna pantalla.
    "traslados:manage",
  ],
  // El profesional ve y cierra SU agenda, y cobra SUS turnos (decisión del dueño: cobra y
  // rinde la comisión después). No puede crear, cancelar ni reprogramar: eso es
  // `agenda:manage`, y sigue siendo de OWNER y RECEPCIÓN.
  // Ve SU liquidación (sólo la suya: el loader la acota a su `professionalId`), sin tocar plata.
  PROFESSIONAL: ["agenda:read", "booking:online", "agenda:complete", "agenda:collect", "commissions:read-own"],
};

export function roleHasCapability(role: Role, cap: Capability): boolean {
  return ROLE_CAPABILITIES[role].includes(cap);
}

// ─────────────────────── Matriz de permisos por usuario (PLAN permisos §2) ───────────────────
//
// El rol da el default; la matriz graba, por usuario, sólo la EXCEPCIÓN (fila en
// `UserPermissionOverride`). `permisoEfectivo` es el ÚNICO resolvedor para un usuario de sesión:
// `roleHasCapability(user.role, …)` directo ignoraría la matriz (test guardián en
// `capabilities.test.ts`).

/**
 * Capacidades que la matriz puede prender o apagar por usuario (casillas 1–6 y 8). CANDADO: un
 * override de cualquier otra capability se IGNORA, así nadie se prende `users:manage` ni
 * `agenda:void` por la base. `payments:own-account` (casilla 7) queda fuera: «próximamente».
 */
export const CAPACIDADES_POR_USUARIO: readonly Capability[] = [
  "booking:online",
  "agenda:create",
  "agenda:manage",
  "agenda:collect",
  "clients:contact",
  "stock:receive",
  "stock:count",
  "stock:adjust",
  "cash:manage",
] as const;

export type PermisoOverride = { capability: string; allowed: boolean };

/** Lo mínimo que necesita el resolvedor: un `SessionUser` lo cumple. */
export type UsuarioConPermisos = {
  role: Role;
  overrides: ReadonlyArray<PermisoOverride>;
};

export function esCapacidadPorUsuario(cap: string): cap is Capability {
  return (CAPACIDADES_POR_USUARIO as readonly string[]).includes(cap);
}

/** Override si existe y la capability está en la matriz; si no, el default del rol. */
export function permisoEfectivo(user: UsuarioConPermisos, cap: Capability): boolean {
  if (esCapacidadPorUsuario(cap)) {
    // `?? []`: el tipo lo exige, pero un usuario armado a mano (fixture, cast) sin la lista no puede
    // tumbar la autorización: vale el rol.
    const override = (user.overrides ?? []).find((o) => o.capability === cap);
    if (override) return override.allowed === true;
  }
  return roleHasCapability(user.role, cap);
}

/**
 * Agendar y editar turnos (casillas 2 y 3) que la matriz le prende a un PROFESSIONAL valen «en su
 * agenda»: la agenda de TURNOS, donde todo pasa por `soloLoSuyo`. Los otros módulos que gatean con
 * esas mismas capacidades (pádel, taller, inmobiliaria, proyectos…) no tienen ese scoping, así que
 * ahí un PROFESSIONAL se rige por su ROL y la excepción no le abre nada (certificación M3). Para
 * todo lo demás es `permisoEfectivo`. Es el ÚNICO lugar donde vive esta regla.
 */
const DE_LA_AGENDA_DE_TURNOS: readonly Capability[] = ["agenda:create", "agenda:manage"];

export function permisoFueraDeLaAgenda(user: UsuarioConPermisos, cap: Capability): boolean {
  if (user.role === "PROFESSIONAL" && DE_LA_AGENDA_DE_TURNOS.includes(cap)) {
    return roleHasCapability(user.role, cap);
  }
  return permisoEfectivo(user, cap);
}

/** Para piezas que reciben a veces sólo el rol (fixtures, pantallas viejas) y a veces el usuario. */
export function permisoDe(quien: Role | UsuarioConPermisos, cap: Capability): boolean {
  return typeof quien === "string" ? roleHasCapability(quien, cap) : permisoEfectivo(quien, cap);
}

/**
 * Scoping «en su agenda» (PLAN permisos §5), lógica pura de `soloLoSuyo` (authz.ts). Un
 * PROFESSIONAL —aunque la matriz le prenda agendar/editar/cobrar— opera SÓLO turnos de su
 * `professionalId`; sin ficha vinculada, ninguno. Los demás roles no se limitan. Devuelve el
 * motivo del rechazo o `null` si puede.
 */
export function motivoSoloLoSuyo(
  user: { role: Role; professionalId: string | null },
  professionalIdDelTurno: string | null | undefined,
): string | null {
  if (user.role !== "PROFESSIONAL") return null;
  if (!user.professionalId) {
    return "Tu usuario no tiene una ficha de profesional vinculada: no podés operar turnos.";
  }
  if (professionalIdDelTurno !== user.professionalId) {
    return "Ese turno es de otra profesional: sólo podés tocar los tuyos.";
  }
  return null;
}

/**
 * Hasta dónde llega `orders:void` según quién anula.
 *
 * - `soloHoy`: sólo se anula una venta COBRADA HOY (el día del asiento en la caja, en la zona
 *   del negocio). Una venta de ayer ya forma parte de un arqueo que otra persona puede estar
 *   contando; corregirla es decisión del dueño.
 * - `motivoObligatorio`: el motivo es lo único que explica, meses después, por qué falta esa
 *   plata en la caja.
 * - `conCodigo`: una venta que ya tiene plata (cobrada o a cuenta) se anula sólo con el código que
 *   la dueña saca para ESA venta (`codigo-anulacion.ts`). Orden del dueño, 31/10/2026: «no se anulan
 *   cobros, pero solamente recepcion con autorizacion de caro». Un pedido sin cobrar no lo pide:
 *   no hay plata que devolver.
 *
 * El dueño anula cualquier día que no esté cerrado y el motivo le queda opcional. Cualquier
 * otro rol con la capability recibe el alcance restringido: si mañana se le da `orders:void`
 * a un rol nuevo, arranca con el límite puesto, no sin él. `null` = no anula.
 */
export type AlcanceDeAnulacion = { soloHoy: boolean; motivoObligatorio: boolean; conCodigo: boolean };

export function alcanceDeAnulacion(role: Role): AlcanceDeAnulacion | null {
  if (!roleHasCapability(role, "orders:void")) return null;
  if (role === "OWNER") return { soloHoy: false, motivoObligatorio: false, conCodigo: false };
  return { soloHoy: true, motivoObligatorio: true, conCodigo: true };
}

/**
 * Cómo anula un cobro de turno cada rol (`agenda:void`). Vale para todos los negocios.
 *
 * - `directa`: la dueña. También es quien autoriza a los demás.
 * - `con-autorizacion`: con el código que la dueña saca para ESE cobro (`codigo-anulacion.ts`).
 *   Cualquier rol nuevo con la capacidad arranca acá: con el límite puesto, no sin él.
 * - `null`: no anula. Acepta texto (el `viewer` que cruza el borde RSC): un rol desconocido, tampoco.
 */
export type AnulacionDeCobro = "directa" | "con-autorizacion";

export function anulacionDeCobro(role: string | null | undefined): AnulacionDeCobro | null {
  if (!role || !Object.prototype.hasOwnProperty.call(ROLE_CAPABILITIES, role)) return null;
  if (!roleHasCapability(role as Role, "agenda:void")) return null;
  return role === "OWNER" ? "directa" : "con-autorizacion";
}

// Ruta "home" de cada rol — a dónde mandarlo cuando entra al panel o cuando
// pide una página que su rol no puede ver. La home de cada rol SIEMPRE está
// dentro de sus capacidades (dashboard para OWNER/RECEPTION, agenda para
// PROFESSIONAL), así el redirect de `requireCapability` nunca cae en un loop.
export function homeRoute(role: Role): string {
  return role === "PROFESSIONAL" ? "/admin/turnos" : "/admin";
}
