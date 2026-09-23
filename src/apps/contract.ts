// ============================================================================
// CONTRATO DE APP — la pantalla con su botón en el Inicio.
// ============================================================================
//
// El ERP pasa a trabajar por APPS: cada tarea del negocio (vender, cerrar la caja,
// recibir mercadería, facturar) es una app con su botón en el Inicio. Este archivo dice
// qué ES una app. Convive con el MÓDULO (`ModuleDescriptor`, src/modules/contract.ts)
// sin extenderlo ni reemplazarlo:
//   · el MÓDULO es lo que se vende y se activa por negocio (`Tenant.modules`);
//   · la APP es la pantalla. Varias apps pueden colgar del mismo módulo (Stock, Mermas
//     y Recibir mercadería cuelgan de `inventario`) y una app sin módulo es del núcleo
//     (Caja, Usuarios): no se apaga nunca.
//
// Por qué un objeto nuevo y no más campos en las listas de hoy: la misma pantalla está
// declarada en SEIS lugares que ya se contradicen (ALL_ITEMS, NAV_ITEM_GROUPS,
// ENTERPRISE_NAV_ITEMS, BACKLOG_SCOPE_ITEM_NAV, `scopeItems[].ruta` y el mapa de íconos
// del shell). /admin/facturacion la reclamaban a la vez arca y bancos; /admin/caja la nav
// la trataba como núcleo y el descriptor de pos como suya. El registro (src/apps/registro.ts)
// es la única lista; las demás quedan como proyección del menú de hoy hasta la limpieza.
//
// DATO PURO: sólo importa TIPOS. Lo leen el servidor, los client components y los tests
// sin arrastrar Prisma ni nada de servidor al bundle del navegador.

import type { Capability } from "@/lib/capabilities";
import type { Perfil } from "@/modules/perfil";
import type { ModuleId } from "@/modules/contract";
import type { EspacioId } from "./espacios";

/**
 * Íconos disponibles. El dibujo de cada uno vive en src/components/iconos-apps.tsx, que
 * está tipado con este union: agregar un nombre acá sin su dibujo no compila.
 * Los nombres de las pantallas que ya existían son los MISMOS que usaba el shell, para
 * que la barra de CH no cambie un pixel.
 */
export type NombreIcono =
  | "dashboard"
  | "agenda"
  | "clientes"
  | "espera"
  | "pedidos"
  | "caja"
  | "cierre"
  | "catalogo"
  | "compras"
  | "ajustes"
  | "resenas"
  | "recordatorios"
  | "reportes"
  | "facturacion"
  | "bancos"
  | "auditoria"
  | "usuarios"
  | "localizacion"
  | "apariencia"
  | "modulos"
  | "cuentas-a-pagar"
  | "contabilidad"
  | "devoluciones"
  | "inventario"
  | "lotes"
  | "despiece"
  | "candado"
  | "vender"
  | "ventas";

/**
 * Rubro donde la app tiene sentido. Ausente = en todos. Junta en un campo los tres
 * booleanos de hoy (admin-nav-items.ts): `agendaOnly` → "servicios", `retailOnly` →
 * "mostrador", `carniceriaOnly` → "carniceria" (mostrador + migración cárnica aplicada).
 * No es seguridad: evita mostrar pantallas que en ese negocio son un callejón sin salida.
 */
export type RubroApp = "servicios" | "mostrador" | "carniceria";

/**
 * `lista`: la pantalla existe y se usa. `en-preparacion`: declarada pero todavía no se
 * ofrece (reemplaza a `ready` de ENTERPRISE_NAV_ITEMS). Una app en preparación no aparece
 * en el Inicio ni en la barra, y su página manda a "App no disponible".
 */
export type EstadoApp = "lista" | "en-preparacion";

/**
 * El número del botón. Lo va a calcular un loader por `id` (los escribe el frente del
 * Inicio; hoy todavía no hay ninguno). Qué parte del número ve cada rol lo decide
 * `partesDelKpi` (src/apps/visibles.ts), no el loader.
 *
 * LOS MONTOS PIDEN `reports:read`: RECEPTION entra a Caja y a Cierre, pero no ve cuánta
 * plata hay. Por eso la plata va declarada aparte, con su capability, y nunca escrita
 * dentro de `mide` (un texto no protege nada).
 */
export interface KpiDecl {
  id: string;
  /**
   * Qué cuenta el número, en palabras de negocio. Guía para quien escribe el loader. Sin
   * `capability` lo ve cualquiera que abre la app, así que no lleva plata: la plata va en
   * `monto`. Con `capability` (un número que es todo plata, como Reportes) lo ve sólo
   * quien la tiene.
   */
  mide: string;
  /** Capability para ver el número ENTERO, cuando es más fuerte que la de la app. */
  capability?: Capability;
  /**
   * La parte del número que es plata, cuando el resto lo puede ver cualquiera que abre la
   * app ("Abierta desde 9:10" para todos; "esperado en efectivo $X" sólo con reports:read).
   */
  monto?: { mide: string; capability: Capability };
}

/**
 * Cómo figura la app en el menú de HOY (la barra lateral que ve CH). Existe sólo mientras
 * conviven el menú viejo y el Inicio por apps: con él se proyecta la barra idéntica a la de
 * hoy (mismo rótulo, mismo orden) y se prueba contra `menuItemsParaTenant`. Una app nueva
 * no lo lleva: no estaba en la barra. Se borra en la limpieza posterior a la ola 4.
 */
export interface MenuDeHoy {
  /** El rótulo que hoy muestra la barra ("Caja", no "Caja del día"). */
  etiqueta: string;
  /** Posición en la barra de hoy (ALL_ITEMS y después ENTERPRISE_NAV_ITEMS). */
  orden: number;
  /**
   * El módulo con el que la barra de hoy filtra esta pantalla en un Comerciante, cuando NO
   * es el de la app. Ausente = el mismo que `modulo`; `null` = la barra de hoy no la filtra
   * por módulo. Hace falta porque el Comerciante tiene gate desde antes del registro
   * (layout.tsx) y su barra no puede cambiar: Compras, Ajustes, Stock, Lotes y Despiece se
   * filtraban con `catalog` (no con `inventario`), y las pantallas de edición, con ninguno.
   * Sólo lo usa el gate de origen "producto"; en el piloto manda `modulo`.
   */
  moduloDeHoy?: ModuleId | null;
}

export interface AppDescriptor {
  /** kebab-case estable. Es lo que recibe `requireApp(id)`. */
  id: string;
  /** Nombre en el Inicio, el buscador y "App no disponible". */
  nombre: string;
  /** Para qué sirve, en una línea de negocio. Se muestra debajo del nombre. */
  descripcion: string;
  icono: NombreIcono;
  /**
   * Raíz de la app. Cubre sus sub-rutas por SEGMENTO: /admin/clientes cubre
   * /admin/clientes/abc, pero no /admin/clientesX (src/apps/rutas.ts).
   */
  ruta: `/admin${string}`;
  /** Sólo el Inicio: matchea su ruta exacta y no absorbe todo /admin/*. */
  exacta?: true;
  espacio: EspacioId;
  /**
   * La capability que exige su PÁGINA. `requireApp` la aplica y un test verifica que sea
   * la misma que pide la página hoy: si divergen, el registro miente sobre quién entra.
   * `null` = alcanza con tener sesión. Sólo la usa "App no disponible": es el destino de
   * todos los rechazos y tiene que poder abrirla cualquiera, PROFESSIONAL incluido.
   */
  capability: Capability | null;
  /**
   * Capability que TAMBIÉN alcanza para abrirla en un local de mostrador del PILOTO (contexto con
   * origen "piloto" y `esMostrador`). Es el encargado: RECEPTION con permisos de stock abre
   * Stock, Recibir mercadería y Mermas en su local, sin que la recepción de un negocio de
   * servicios (CH, contexto `null`) las sume a su barra. Fuera del piloto no cuenta: la barra de
   * hoy no cambia (paridad dorada). Ausente = sólo `capability`.
   */
  capabilityEnMostrador?: Capability;
  /** Módulo que la habilita, o `null` si es del núcleo (no se apaga). */
  modulo: ModuleId | null;
  /**
   * Exige el módulo SIEMPRE, aun con el gate apagado (contexto `null`). Es para las apps
   * que leen datos de otro negocio (Mis locales): sin esto, con el gate apagado cualquier
   * OWNER las vería. Además, su página y sus actions llaman a `exigirCasa()`.
   */
  moduloDuro?: true;
  rubro?: RubroApp;
  /**
   * Pantalla de la edición por perfiles (Comercio/Empresa). Presente = sólo se ofrece con
   * el motor de perfiles encendido y un perfil igual o mayor (hoy ENTERPRISE_NAV_ITEMS se
   * suma sólo con `PROFILES_ENABLED`). En los negocios del piloto no cuenta: manda el
   * módulo asignado.
   */
  perfilMin?: Perfil;
  estado: EstadoApp;
  kpi?: KpiDecl;
  /**
   * Palabras con las que la gente la busca además del nombre ("afip", "stock", "arqueo").
   * Un alias no habilita nada: el buscador sólo recorre las apps que la persona ya ve.
   */
  palabras?: readonly string[];
  menuDeHoy?: MenuDeHoy;
  /**
   * `false` = no se ofrece en el Inicio, la barra ni el buscador, aunque se pueda abrir.
   * Es para las pantallas a las que se llega sólo por un redirect ("App no disponible").
   */
  enLanzador?: false;
}
