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
  | "agenda:manage" // crear/mover/cancelar turnos, cobrar
  | "agenda:complete" // marcar completado / no-show
  // Cobrar un turno: seña, cobro parcial o saldo. Va SEPARADA de `agenda:manage` a
  // propósito. Decisión del dueño (2026-09-07): en CH Estética **el profesional también
  // cobra, y rinde la comisión después** — es el flujo real del negocio. Pero cobrar no
  // puede implicar crear, cancelar o reprogramar turnos ajenos, que es lo que da
  // `agenda:manage`. Con una capacidad propia, el profesional cobra LO SUYO (el scoping a
  // su `professionalId` lo hace la acción) y nada más.
  | "agenda:collect"
  | "clients:read"
  | "clients:manage"
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
  | "modules:manage" // activar/desactivar los módulos (apps) del negocio — vidriera de módulos
  | "billing:manage" // emitir facturas y procesar la facturación electrónica ARCA (módulo ARCA)
  | "payments:manage" // generar links de cobro por Mercado Pago (módulo Cobros)
  // Panel del contador (/contador, módulo CARTERA): administrar la cartera de
  // clientes de un estudio contable. La capability sola NO alcanza: la página y
  // las actions exigen ADEMÁS el módulo `cartera` ASIGNADO al tenant (ADR-055) —
  // así un OWNER de un negocio común no ve el panel aunque el rol se la dé.
  | "cartera:manage"
  // Apariencia del backoffice (/admin/apariencia): elegir el color del equipo
  // (Tenant.accentPreset) y el tema claro/oscuro del panel. Solo OWNER — es
  // configuración del negocio, mismo tenor que localización/módulos.
  | "appearance:manage";

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
} as const;

const DEL_DUENIO: Record<Exclude<Capability, keyof typeof NO_SON_DEL_DUENIO>, true> = {
  "dashboard:read": true,
  "agenda:read": true,
  "agenda:manage": true,
  "agenda:complete": true,
  "agenda:collect": true,
  "clients:read": true,
  "clients:manage": true,
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
  "billing:manage": true,
  "payments:manage": true,
  "cartera:manage": true,
  "appearance:manage": true,
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
//   acciones de cierre y cobro; la capability solo habilita la clase de acción.
export const ROLE_CAPABILITIES: Record<Role, Capability[]> = {
  OWNER: ALL_CAPABILITIES,
  RECEPTION: [
    "dashboard:read",
    "agenda:read",
    "agenda:manage",
    "agenda:complete",
    "agenda:collect",
    "clients:read",
    "clients:manage",
    "waitlist:manage",
    // POS/pedidos es trabajo de mostrador puro (tomar el pedido, cobrarlo,
    // marcarlo listo/entregado), del mismo tenor que agenda + clientes, así que
    // RECEPTION lo tiene. El catálogo/precios sigue solo-OWNER.
    "orders:read",
    "orders:manage",
    // Anula, pero sólo lo cobrado hoy y siempre con motivo (`alcanceDeAnulacion`). Sin esto,
    // corregir una pesada un sábado con cola obligaría a llamar a la dueña; el control va por
    // lo que queda escrito (quién anuló y por qué), no por pedir su clave.
    "orders:void",
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
  PROFESSIONAL: ["agenda:read", "agenda:complete", "agenda:collect"],
};

export function roleHasCapability(role: Role, cap: Capability): boolean {
  return ROLE_CAPABILITIES[role].includes(cap);
}

/**
 * Hasta dónde llega `orders:void` según quién anula.
 *
 * - `soloHoy`: sólo se anula una venta COBRADA HOY (el día del asiento en la caja, en la zona
 *   del negocio). Una venta de ayer ya forma parte de un arqueo que otra persona puede estar
 *   contando; corregirla es decisión del dueño.
 * - `motivoObligatorio`: el motivo es lo único que explica, meses después, por qué falta esa
 *   plata en la caja.
 *
 * El dueño anula cualquier día que no esté cerrado y el motivo le queda opcional. Cualquier
 * otro rol con la capability recibe el alcance restringido: si mañana se le da `orders:void`
 * a un rol nuevo, arranca con el límite puesto, no sin él. `null` = no anula.
 */
export type AlcanceDeAnulacion = { soloHoy: boolean; motivoObligatorio: boolean };

export function alcanceDeAnulacion(role: Role): AlcanceDeAnulacion | null {
  if (!roleHasCapability(role, "orders:void")) return null;
  if (role === "OWNER") return { soloHoy: false, motivoObligatorio: false };
  return { soloHoy: true, motivoObligatorio: true };
}

// Ruta "home" de cada rol — a dónde mandarlo cuando entra al panel o cuando
// pide una página que su rol no puede ver. La home de cada rol SIEMPRE está
// dentro de sus capacidades (dashboard para OWNER/RECEPTION, agenda para
// PROFESSIONAL), así el redirect de `requireCapability` nunca cae en un loop.
export function homeRoute(role: Role): string {
  return role === "PROFESSIONAL" ? "/admin/turnos" : "/admin";
}
