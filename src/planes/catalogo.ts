// ============================================================================
// CATÁLOGO DE PLANES — lo que se vende: módulos, perfil y límites. Dato puro.
// ============================================================================
//
// Un plan NO es código distinto: es una lista de módulos + un perfil + límites, validada contra
// el mismo catálogo de módulos (src/modules/catalog.ts) y aplicada por el mismo camino que hoy
// cambia módulos desde la consola (`validarCambio` → `planActivar`, src/modules/vista.ts:128).
// Qué app ve cada persona lo sigue decidiendo una sola regla, `motivoNoDisponible`
// (src/apps/visibles.ts:193); este archivo sólo dice qué trae cada plan.
//
// El "rubro" de un plan (servicios, mostrador, carnicería) es el de la BARRA, no el blueprint: una
// estética, una veterinaria o un plomero caen todos en "servicios". Por eso un plan sólo vende
// módulos que aceptan CUALQUIER blueprint de ese rubro: `commissions`, por ejemplo, es sólo del
// blueprint "servicios" (src/modules/descriptors/nativos.ts:167) y una estética real no lo puede
// recibir. catalogo.test.ts lo prueba contra todos los blueprints registrados.
//
//   plan = módulos del plan ∪ módulos de su rubro ∪ agregados sueltos, con un perfil y límites.
//
// La escalera del comercio es Facturación ⊆ Micro comerciante ⊆ Comerciante ⊆ PyME: cada plan
// contiene al anterior en módulos, apps y límites, así que subir nunca migra datos y bajar sólo
// oculta pantallas. El Estudio contable va aparte: es la casa de una cartera de clientes, cada uno
// un negocio propio con RLS (src/modules/descriptors/cartera.ts), y por eso no junta `cartera` con
// `multilocal` (los dos guardan su vínculo en CarteraCliente, multilocal.ts:17-20).
//
// Los tests (catalogo.test.ts) son el trinquete: todo módulo existe, sus dependencias están
// dentro del plan y lo acepta cualquier blueprint del rubro; la escalera se cumple en módulos, apps
// y límites; ningún plan vende una app en preparación ni un módulo que no se note; el Estudio trae
// la cartera y no Mis locales.
//
// LÍMITES Y NOMBRES: provisionales a confirmar por el dueño (E2 §1.3 y §6, INFORME-EXPLORE §3
// decisiones 8 y 9). Los PRECIOS no viven acá: están en ./precios.ts, fuera del código que decide.
//
// Nada decide todavía con esto: `Tenant.plan` es texto libre (prisma/schema.prisma:247) que la
// consola sólo muestra (src/app/operador/(console)/page.tsx:120) y ninguna regla lee.
// Lo usan después la tarjeta de plan de la consola (R2-F4) y los topes (R3-F3). Un negocio sin plan
// del catálogo (CH hoy) queda exactamente como está: ver limitesDelNegocio (./limites.ts).
//
// Client-safe: sólo importa TIPOS. Lo pueden leer el servidor, un client component y la web sin
// arrastrar el registro de apps ni el catálogo de módulos. Las apps del plan salen de
// ./apps-del-plan.ts, que sí importa el registro.

import type { RubroApp } from "@/apps/contract";
import type { ModuleId } from "@/modules/contract";
import type { Perfil } from "@/modules/perfil";

// ── Ids ──────────────────────────────────────────────────────────────────────

export const PLAN_IDS = ["facturacion", "micro", "comerciante", "pyme", "estudio"] as const;

/** Id estable del plan. Es lo que se guarda en `Tenant.plan`, tal cual (minúsculas, sin espacios). */
export type PlanId = (typeof PLAN_IDS)[number];

/**
 * La escalera del comercio, de menor a mayor. Cada plan contiene al anterior (lo prueba
 * catalogo.test.ts). El Estudio no está: es otro producto (la consola del contador).
 */
export const ESCALERA: readonly PlanId[] = ["facturacion", "micro", "comerciante", "pyme"];

/** Los tres rubros de apps (src/apps/contract.ts:72). El plan suma los módulos propios de cada uno. */
export const RUBROS: readonly RubroApp[] = ["servicios", "mostrador", "carniceria"];

// ── Límites ──────────────────────────────────────────────────────────────────

export const LIMITE_IDS = [
  "usuarios",
  "locales",
  "comprobantesMes",
  "cuentasBancarias",
  "clientesCartera",
  "facturasAutomaticasMes",
] as const;

/**
 * Qué se limita. Qué significa cada uno, cómo se cuenta y si frena un alta o sólo avisa está en
 * `LIMITES` (./limites.ts).
 */
export type LimiteId = (typeof LIMITE_IDS)[number];

/** Tope de un límite: un número entero, o `null` = sin tope. */
export type Tope = number | null;

export type LimitesDelPlan = Readonly<Record<LimiteId, Tope>>;

// ── El plan ──────────────────────────────────────────────────────────────────

export interface PlanDescriptor {
  id: PlanId;
  /** Nombre de cara al cliente. Provisional a confirmar (INFORME-EXPLORE §3, decisión 9). */
  nombre: string;
  /** A quién le sirve, en una línea de negocio. */
  paraQuien: string;
  /**
   * Perfil Comercio/Empresa (`lite`/`enterprise`, src/modules/perfil.ts). En un negocio que trabaja
   * por apps no filtra pantallas (manda el módulo, visibles.ts:185); se guarda en `Tenant.profile`
   * para el motor de perfiles y para las órdenes formales a proveedor.
   */
  perfil: Perfil;
  /** Módulos que trae en cualquier rubro. El núcleo (apps con `modulo: null`) viene siempre y no se lista. */
  modulos: readonly ModuleId[];
  /** Módulos que suma según el rubro del negocio (turnos en servicios, etc.). */
  porRubro: Readonly<Partial<Record<RubroApp, readonly ModuleId[]>>>;
  /**
   * Módulos que GSG le puede sumar sueltos a un negocio de este plan desde la consola ("este Micro
   * suma Cuentas a cobrar"). Todo lo que no está acá ni en el plan, no se suma: se sube de plan.
   */
  agregables: readonly ModuleId[];
  /** Topes del plan. Provisionales a confirmar. Una excepción por negocio los ajusta (./limites.ts). */
  limites: LimitesDelPlan;
}

// Núcleo del producto de facturación de hoy (los descriptores con `nucleoPara: ["comerciante"]`,
// src/modules/nucleo.ts): facturar desde el banco y Mercado Pago, con clientes y reportes. Es la
// base de toda la escalera y lo que trae cada cliente de un estudio contable.
const FACTURAR = ["clients", "reports", "arca", "bancos", "mercadopago"] as const;

// El mostrador: vender, catálogo y stock.
const OPERAR = ["pos", "catalog", "inventario"] as const;

// Lo que suma el Comerciante: fiado con vencimiento, libro IVA y el contacto con la clientela.
const CRECER = ["cuentas-a-cobrar", "libros", "campanias", "reminders", "reviews"] as const;

// Lo que suma la PyME: proveedores con cheque, devoluciones a proveedor y la red de locales.
const EMPRESA = ["cuentas-a-pagar", "devoluciones-proveedor", "multilocal"] as const;

// Turnos: la agenda (con Confirmar mañana) en todos los planes que operan; la lista de espera desde
// Comerciante. Las Comisiones NO son un módulo del plan: la app cuelga de `reports` y del rubro
// servicios (src/apps/catalogo/finanzas.ts:221-226), así que ya vienen desde Micro. El módulo
// `commissions` no decide ninguna app y sólo acepta el blueprint "servicios" (nativos.ts:167): en
// el plan, una estética, una peluquería o una veterinaria no podían recibir Comerciante ni PyME.
const TURNOS_MICRO = ["agenda"] as const;
const TURNOS = ["agenda", "waitlist"] as const;

const PLANES_LISTA: readonly PlanDescriptor[] = [
  {
    id: "facturacion",
    nombre: "Facturación",
    paraQuien: "Quien sólo quiere facturar lo que cobra por el banco y Mercado Pago, sin mostrador ni stock.",
    perfil: "lite",
    modulos: [...FACTURAR],
    porRubro: {},
    agregables: [],
    limites: {
      usuarios: 2,
      locales: 1,
      comprobantesMes: 300,
      cuentasBancarias: 1,
      clientesCartera: 0,
      // El tope de hoy (CAP_FACTURAS_MES_DEFAULT, src/plugins/bancos/domain/reglas.ts:34).
      facturasAutomaticasMes: 159,
    },
  },
  {
    id: "micro",
    nombre: "Micro comerciante",
    paraQuien: "Un local, el dueño y una o dos personas: abrís, vendés, facturás y cerrás la caja.",
    perfil: "lite",
    modulos: [...FACTURAR, ...OPERAR],
    porRubro: { servicios: [...TURNOS_MICRO] },
    // Los dos módulos que tienen sentido sueltos antes de pasar a Comerciante (E2 §1.3).
    agregables: ["cuentas-a-cobrar", "libros"],
    limites: {
      usuarios: 2,
      locales: 1,
      comprobantesMes: 300,
      cuentasBancarias: 1,
      clientesCartera: 0,
      facturasAutomaticasMes: 159,
    },
  },
  {
    id: "comerciante",
    nombre: "Comerciante",
    paraQuien: "El comercio establecido que fía, compra en serio y quiere saber cuánto gana.",
    perfil: "lite",
    modulos: [...FACTURAR, ...OPERAR, ...CRECER],
    porRubro: { servicios: [...TURNOS] },
    agregables: ["cuentas-a-pagar", "devoluciones-proveedor"],
    limites: {
      usuarios: 6,
      locales: 1,
      comprobantesMes: 1000,
      cuentasBancarias: 3,
      clientesCartera: 0,
      facturasAutomaticasMes: 159,
    },
  },
  {
    id: "pyme",
    nombre: "PyME",
    paraQuien: "Varios locales o un local con depósito, proveedores con cheque y el contador conforme.",
    perfil: "enterprise",
    // `multilocal` exige su módulo siempre (moduloDuro) y su asignación es la barrera de acceso a
    // los datos de los locales: la escribe la consola, negocio por negocio y auditada (R2-F4), igual
    // que hoy toggleTenantModule. Asignarlo sin locales vinculados no abre datos de nadie.
    modulos: [...FACTURAR, ...OPERAR, ...CRECER, ...EMPRESA],
    porRubro: { servicios: [...TURNOS] },
    agregables: [],
    limites: {
      // "Nunca cobrar por usuario": el tope ordena, no factura (E2 §6.2). E2 §1.3 dice "sin tope
      // comercial (uso razonable 30)"; acá 30 FRENA el alta 31 con "escribinos y lo ampliamos"
      // (LIMITES.usuarios.bloquea). Si el dueño lo quiere sin freno, es `null`. Provisional a confirmar.
      usuarios: 30,
      locales: 3,
      comprobantesMes: 3000,
      cuentasBancarias: null,
      clientesCartera: 0,
      facturasAutomaticasMes: 159,
    },
  },
  {
    id: "estudio",
    nombre: "Estudio contable",
    paraQuien: "El estudio que lleva la facturación de sus clientes: cada cliente es su propio negocio.",
    perfil: "lite",
    // El núcleo del producto contador (`nucleoPara: ["contador"]`): la cartera y lo que necesita
    // para facturar. Sin `multilocal`: se excluyen (multilocal.ts:17-20, apps-del-negocio.ts:104).
    modulos: ["cartera", "clients", "reports", "arca"],
    porRubro: {},
    // Para facturar sus propios honorarios desde el banco o Mercado Pago. Sin `libros`: un estudio
    // tiene siempre el menú de su producto (con `cartera`, derivarProducto da "contador",
    // src/lib/producto-identidad.ts:125) y ahí el Libro IVA es de la edición Empresa
    // (src/apps/catalogo/finanzas.ts:197): el agregado no le mostraba nada.
    agregables: ["bancos", "mercadopago"],
    limites: {
      usuarios: 5,
      locales: 1,
      comprobantesMes: 300,
      cuentasBancarias: 1,
      // Clientes incluidos; cada cliente adicional se suma con una excepción (./limites.ts).
      clientesCartera: 10,
      facturasAutomaticasMes: 159,
    },
  },
];

/** Los planes por id. */
export const PLANES: Readonly<Record<PlanId, PlanDescriptor>> = Object.fromEntries(
  PLANES_LISTA.map((p) => [p.id, p]),
) as Record<PlanId, PlanDescriptor>;

/**
 * ¿Es un id de plan del catálogo? ESTRICTO a propósito: `Tenant.plan` hoy es texto libre que el
 * operador escribía a mano (operator-actions.ts:148), y un "PYME" o "Micro " de antes no tiene que
 * prender los topes de un plan. Sólo cuenta el id exacto que escribe la consola.
 */
export function esPlanId(x: unknown): x is PlanId {
  return typeof x === "string" && (PLAN_IDS as readonly string[]).includes(x);
}

export function planPorId(id: PlanId): PlanDescriptor {
  return PLANES[id];
}

function descriptor(plan: PlanId | PlanDescriptor): PlanDescriptor {
  return typeof plan === "string" ? planPorId(plan) : plan;
}

/**
 * El rubro de apps de un negocio, con los mismos dos datos que usa la barra
 * (`NegocioApps.esMostrador` y `carniceriaLista`, src/apps/visibles.ts:107-110).
 */
export function rubroDelNegocio(n: { esMostrador: boolean; carniceriaLista: boolean }): RubroApp {
  if (!n.esMostrador) return "servicios";
  return n.carniceriaLista ? "carniceria" : "mostrador";
}

// ── Los módulos de un negocio con este plan ──────────────────────────────────

export interface ModulosDelPlan {
  /** Plan ∪ rubro ∪ agregados aceptados, sin repetidos, en ese orden. */
  modulos: ModuleId[];
  /** Los agregados que se aceptaron (los que el plan ofrece y no traía ya). */
  agregados: ModuleId[];
  /** Los que no se pueden sumar sueltos a este plan, con el porqué. */
  rechazados: { id: ModuleId; motivo: string }[];
}

/**
 * Los módulos de un negocio de este plan y este rubro, con sus agregados. PURA. No valida
 * dependencias ni rubro contra el catálogo de módulos: eso lo garantiza catalogo.test.ts para cada
 * plan y lo vuelve a resolver el gate (`resolverActivacion`) con el negocio real.
 */
export function modulosDelPlan(
  plan: PlanId | PlanDescriptor,
  rubro: RubroApp,
  agregados: readonly ModuleId[] = [],
): ModulosDelPlan {
  const p = descriptor(plan);
  const modulos = [...new Set([...p.modulos, ...(p.porRubro[rubro] ?? [])])];
  const aceptados: ModuleId[] = [];
  const rechazados: { id: ModuleId; motivo: string }[] = [];
  for (const id of new Set(agregados)) {
    if (modulos.includes(id)) continue;
    if (!p.agregables.includes(id)) {
      rechazados.push({
        id,
        motivo: `El plan ${p.nombre} no permite sumar "${id}" suelto: hay que pasar a un plan que lo traiga.`,
      });
      continue;
    }
    aceptados.push(id);
  }
  return { modulos: [...modulos, ...aceptados], agregados: aceptados, rechazados };
}

/** Todos los módulos que un plan puede llegar a tener: los suyos, los de cualquier rubro y los agregables. */
export function modulosPosiblesDelPlan(plan: PlanId | PlanDescriptor): ModuleId[] {
  const p = descriptor(plan);
  return [...new Set([...p.modulos, ...RUBROS.flatMap((r) => p.porRubro[r] ?? []), ...p.agregables])];
}
