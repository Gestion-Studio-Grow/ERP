// CHECKLIST "LISTO PARA ABRIR", POR LOCAL — módulo PURO (sin Prisma, sin React, sin env).
//
// POR QUÉ EXISTE: MAGRA abre 5 locales y cada local es un TENANT PROPIO (no hay modelo de
// sucursal, decisión de arquitectura tomada). El alta automatiza 1 de los ~14 pasos reales de
// una apertura; los otros 13 son manuales. Con un local, "me acuerdo"; con cinco abriendo la
// misma semana, lo que no está en una lista se olvida, y lo que se olvida sale a producción:
// la vidriera con la dirección de demo, el catálogo con los precios de referencia del blueprint,
// o un local que cobra y no puede emitir factura.
//
// Este módulo NO adivina: recibe el estado REAL leído de la base (`EstadoApertura`) y responde
// qué falta. Puro a propósito → se testea con datos, y la respuesta a "¿cuál de los 5 está
// listo?" es la MISMA en la ficha del tenant y en el cockpit (una sola definición de "listo").
//
// Genérico por diseño: los valores provisionales NO se escriben acá a mano; se leen del
// `brandingDefaults` del rubro del blueprint (src/blueprints/retail/rubros.ts). El día que entre
// una verdulería o una tienda de velas, el chequeo funciona igual sin tocar este archivo.

import { getRetailRubro, resolveRubroId } from "@/blueprints/retail/rubros";

/** Modo ARCA de la PLATAFORMA (env), no del tenant. `modoDesdeEnv()` del plugin. */
export type ModoArcaPlataforma = "stub" | "homologacion" | "real";

/** Producto tal como se lee del catálogo del tenant (sólo lo que el chequeo necesita). */
export interface ProductoApertura {
  name: string;
  /** `Product.price` — venta por unidad. */
  price: number | null;
  /** `Product.pricePerKg` — venta por peso. */
  pricePerKg: number | null;
}

/** Datos de contacto públicos del local (`BusinessSettings`). `null` = ficha sin crear. */
export interface ContactoApertura {
  addressLine: string | null;
  instagram: string | null;
  whatsapp: string | null;
}

/** Foto del tenant que alimenta el checklist. Todo dato REAL de la base. */
export interface EstadoApertura {
  slug: string;
  blueprintId: string | null;
  subdomain: string | null;
  /** Usuarios activos del tenant (`User.active && !deletedAt`). */
  usuariosActivos: number;
  arcaCuit: string | null;
  arcaPuntoVenta: number | null;
  /** `Tenant.arcaHomologacion`: true = banco de pruebas, false = producción fiscal. */
  arcaHomologacion: boolean;
  /**
   * ¿Hay credencial ARCA cargada? `null` = no se pudo saber porque la tabla
   * `TenantFiscalCredential` todavía no está aplicada (Gate 2).
   */
  certificadoCargado: boolean | null;
  /** CUIT del certificado cargado, para detectar el mismatch con el del tenant. */
  certCuit: string | null;
  modoArca: ModoArcaPlataforma;
  /**
   * ¿La columna `Tenant.arcaCondicionIva` existe en la base? HOY es `false`: la columna está
   * declarada schema-ahead en src/lib/fiscal.ts:108-119 pero la migración NO está aplicada.
   * Importa porque `construirPerfilFiscal` (src/lib/fiscal.ts:208-217) LANZA si el tenant está
   * en producción fiscal y no tiene condición de IVA cargada — sin la columna, no puede tenerla.
   */
  condicionIvaDisponible: boolean;
  contacto: ContactoApertura | null;
  productos: ProductoApertura[];
}

/**
 * Un ítem del checklist. `ok === null` = NO APLICA a este tenant (p. ej. precios del catálogo en
 * un tenant de servicios): se muestra, pero no cuenta como pendiente.
 */
export interface ItemApertura {
  id:
    | "precios"
    | "direccion"
    | "instagram"
    | "facturacion"
    | "subdominio"
    | "usuarios";
  label: string;
  ok: boolean | null;
  /** Qué pasa HOY (el dato), en una línea: "12 de 20 productos al precio del blueprint". */
  detalle: string;
  /** Qué se rompe si esto queda así. Es la razón por la que el ítem está en la lista. */
  porQue: string;
}

export interface ResultadoApertura {
  items: ItemApertura[];
  /** Ítems que aplican y NO están listos. 0 = el local puede abrir. */
  pendientes: number;
  listo: boolean;
}

// --- Detección de valores provisionales --------------------------------------

/** Normaliza para comparar texto cargado por humanos (mayúsculas, espacios dobles, acentos). */
function norm(v: string | null | undefined): string {
  return (v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Marcas que el propio repo usa para decir "esto todavía no es el dato real"
 * (p. ej. `"@instagram-a-confirmar"`, `"Av. Provisional 1234, Canning"`). Se chequean por
 * CONTENIDO además de comparar contra el default del rubro: si mañana alguien edita el
 * placeholder a medias ("Av. Provisional 1234, Lomas"), sigue detectándose.
 */
const MARCAS_PROVISIONALES = ["provisional", "a confirmar", "a-confirmar", "placeholder", "ejemplo"];

/**
 * ¿El valor sigue siendo el de demo? Devuelve "vacio" | "provisional" | "propio".
 * `defaultDelRubro` es el valor que sembró el blueprint para ESE rubro.
 */
export function estadoDelValor(
  valor: string | null | undefined,
  defaultDelRubro: string | null | undefined,
): "vacio" | "provisional" | "propio" {
  const v = norm(valor);
  if (v === "") return "vacio";
  const d = norm(defaultDelRubro);
  if (d !== "" && v === d) return "provisional";
  if (MARCAS_PROVISIONALES.some((m) => v.includes(m))) return "provisional";
  return "propio";
}

// --- Precios vs. catálogo semilla del blueprint ------------------------------

/** Precio efectivo con el que se vende un producto: por kilo si es al peso, si no por unidad. */
function precioEfectivo(p: ProductoApertura): number | null {
  return p.pricePerKg ?? p.price ?? null;
}

/**
 * Cuántos productos del tenant siguen EXACTAMENTE al precio provisional que sembró el blueprint.
 * Match por nombre normalizado: si el nombre cambió, el producto ya es del negocio y no se cuenta.
 *
 * POR QUÉ el corte es "precio idéntico al semilla": los precios del blueprint son de referencia
 * (rubros.ts:9-11 los declara provisionales, ARS mediados 2026). Un local que abre con ellos
 * vende a un precio que NO es el suyo — pérdida directa en cada ticket, no un detalle de demo.
 */
export function preciosSemillaPendientes(
  productos: ProductoApertura[],
  catalogoSemilla: { name: string; precio: number }[],
): { pendientes: string[]; total: number } {
  const semilla = new Map(catalogoSemilla.map((c) => [norm(c.name), c.precio]));
  const pendientes: string[] = [];
  for (const p of productos) {
    const esperado = semilla.get(norm(p.name));
    if (esperado == null) continue;
    if (precioEfectivo(p) === esperado) pendientes.push(p.name);
  }
  return { pendientes, total: productos.length };
}

/** Catálogo semilla del rubro, aplanado a `{ name, precio }`. `null` si el tenant no es retail. */
export function catalogoSemillaDe(
  e: Pick<EstadoApertura, "blueprintId" | "slug">,
): { name: string; precio: number }[] | null {
  const rubroId = resolveRubroId({ blueprintId: e.blueprintId, slug: e.slug });
  const rubro = rubroId ? getRetailRubro(rubroId) : null;
  if (!rubro) return null;
  return rubro.catalog.map((c) => ({
    name: c.name,
    precio: c.sale === "kg" ? c.pricePerKg : c.price,
  }));
}

// --- Semáforo fiscal: ¿puede EMITIR, de verdad? ------------------------------

export interface EvaluacionFiscal {
  listo: boolean;
  /** Qué falta, en el orden en que hay que resolverlo. Vacío ⇔ `listo`. */
  faltantes: string[];
  /** Falta que NO se puede resolver desde la consola (necesita migración). */
  bloqueadoPorMigracion: boolean;
}

/**
 * ¿Este tenant puede emitir una factura electrónica HOY?
 *
 * POR QUÉ NO ALCANZA CON CUIT + CERTIFICADO (que era lo único que miraba el semáforo de la ficha):
 * quien decide de verdad es `construirPerfilFiscal` (src/lib/fiscal.ts:145-231), que LANZA si
 * falta `arcaPuntoVenta` (:178-186) o si el tenant está en producción fiscal sin condición de IVA
 * (:208-217). Y la emisión corre best-effort dentro de un try/catch: si lanza, la venta SE COBRA
 * igual y la factura no sale. El descuadre aparece a fin de mes, cuando ya hay que remendarlo a
 * mano contra ARCA. Un semáforo verde acá es una promesa de plata; por eso mira exactamente las
 * mismas condiciones que el constructor del perfil, ni una menos.
 */
export function evaluarListoParaFacturar(
  e: Pick<
    EstadoApertura,
    "arcaCuit" | "arcaPuntoVenta" | "arcaHomologacion" | "certificadoCargado" | "certCuit" | "modoArca" | "condicionIvaDisponible"
  >,
): EvaluacionFiscal {
  const faltantes: string[] = [];
  let bloqueadoPorMigracion = false;

  if (!e.arcaCuit?.trim()) faltantes.push("falta el CUIT del emisor");
  if (e.arcaPuntoVenta == null || !Number.isInteger(e.arcaPuntoVenta) || e.arcaPuntoVenta <= 0) {
    faltantes.push("falta el punto de venta de ARCA");
  }
  if (e.certificadoCargado === null) {
    faltantes.push("la tabla de credenciales fiscales no está aplicada (migración pendiente)");
    bloqueadoPorMigracion = true;
  } else if (!e.certificadoCargado) {
    faltantes.push("falta el certificado ARCA");
  } else if (e.arcaCuit?.trim() && e.certCuit && e.certCuit !== e.arcaCuit.trim()) {
    faltantes.push("el CUIT del certificado no coincide con el del tenant");
  }

  // En modo `homologacion` el plugin FUERZA homologación aunque el tenant diga producción
  // (configParaModo, src/plugins/arca/*: el banco de pruebas no puede apuntar a producción),
  // así que la condición de IVA se asume y no bloquea. En modo `real` manda el flag del tenant.
  const emiteEnProduccion = e.modoArca === "real" && !e.arcaHomologacion;
  if (emiteEnProduccion && !e.condicionIvaDisponible) {
    faltantes.push(
      "falta la condición de IVA del emisor: la columna arcaCondicionIva no está en la base (migración pendiente) y en producción no se asume",
    );
    bloqueadoPorMigracion = true;
  }

  if (e.modoArca === "stub") faltantes.push("ARCA está en modo stub (apagado) en la plataforma");

  return { listo: faltantes.length === 0, faltantes, bloqueadoPorMigracion };
}

// --- El checklist ------------------------------------------------------------

export function checklistApertura(e: EstadoApertura): ResultadoApertura {
  const items: ItemApertura[] = [];

  // 1 · Precios propios (sólo aplica a locales de mostrador con catálogo del blueprint).
  const semilla = catalogoSemillaDe(e);
  if (!semilla) {
    items.push({
      id: "precios",
      label: "Precios propios",
      ok: null,
      detalle: "no aplica (el tenant no es un local de mostrador)",
      porQue: "El chequeo compara contra el catálogo semilla del rubro retail; sin rubro no hay contra qué comparar.",
    });
  } else if (e.productos.length === 0) {
    items.push({
      id: "precios",
      label: "Precios propios",
      ok: false,
      detalle: "el catálogo está vacío",
      porQue: "Sin catálogo no hay qué vender: la vidriera abre sin productos y el mostrador no puede cobrar.",
    });
  } else {
    const { pendientes, total } = preciosSemillaPendientes(e.productos, semilla);
    items.push({
      id: "precios",
      label: "Precios propios",
      ok: pendientes.length === 0,
      detalle:
        pendientes.length === 0
          ? `${total} productos, ninguno al precio del blueprint`
          : `${pendientes.length} de ${total} todavía al precio del blueprint (${pendientes.slice(0, 3).join(", ")}${pendientes.length > 3 ? "…" : ""})`,
      porQue: "Los precios del blueprint son de referencia, no los del negocio: cada venta a ese precio es plata que el local pierde o cobra de más.",
    });
  }

  // 2 y 3 · Dirección e Instagram: los defaults del rubro salen publicados en la vidriera.
  const rubroId = resolveRubroId({ blueprintId: e.blueprintId, slug: e.slug });
  const defaults = rubroId ? getRetailRubro(rubroId)?.brandingDefaults : undefined;

  const dir = estadoDelValor(e.contacto?.addressLine, defaults?.addressLine);
  items.push({
    id: "direccion",
    label: "Dirección del local",
    ok: dir === "propio",
    detalle:
      dir === "vacio"
        ? "sin cargar"
        : dir === "provisional"
          ? `todavía la provisional ("${e.contacto?.addressLine}")`
          : (e.contacto?.addressLine ?? ""),
    porQue: "La dirección se publica en la vidriera y arma el link del mapa: con la provisional, el cliente que va a retirar llega a una dirección que no existe.",
  });

  const ig = estadoDelValor(e.contacto?.instagram, defaults?.instagram);
  items.push({
    id: "instagram",
    label: "Instagram",
    ok: ig === "propio",
    detalle:
      ig === "vacio"
        ? "sin cargar"
        : ig === "provisional"
          ? `todavía el placeholder ("${e.contacto?.instagram}")`
          : (e.contacto?.instagram ?? ""),
    porQue: "Es un link público: el placeholder deja un enlace roto (y antes apuntaba a una cuenta ajena) en la vidriera del cliente.",
  });

  // 4 · Facturación electrónica (el semáforo que antes pintaba verde de más).
  const fiscal = evaluarListoParaFacturar(e);
  items.push({
    id: "facturacion",
    label: "Listo para facturar",
    ok: fiscal.listo,
    detalle: fiscal.listo ? "CUIT, punto de venta y certificado en orden" : fiscal.faltantes.join(" · "),
    porQue: "La emisión corre best-effort: si el perfil fiscal está incompleto, la venta se cobra igual y la factura no sale — se descubre a fin de mes.",
  });

  // 5 · Subdominio ruteado.
  items.push({
    id: "subdominio",
    label: "Link propio (subdominio)",
    ok: Boolean(e.subdomain?.trim()),
    detalle: e.subdomain?.trim() ? e.subdomain.trim() : "sin subdominio",
    porQue: "Sin subdominio el local no tiene URL propia para poner en el perfil, el volante o el WhatsApp.",
  });

  // 6 · Más de un usuario.
  items.push({
    id: "usuarios",
    label: "Más de un usuario",
    ok: e.usuariosActivos > 1,
    detalle: `${e.usuariosActivos} usuario${e.usuariosActivos === 1 ? "" : "s"} activo${e.usuariosActivos === 1 ? "" : "s"}`,
    porQue: "Con un solo login, el día que el dueño no está nadie puede abrir la caja ni atender el mostrador.",
  });

  const pendientes = items.filter((i) => i.ok === false).length;
  return { items, pendientes, listo: pendientes === 0 };
}
