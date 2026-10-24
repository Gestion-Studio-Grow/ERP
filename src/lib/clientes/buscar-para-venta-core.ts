// ============================================================================
// CLIENTE DE LA VENTA (Magra, tanda 1 · 1D) — buscar, traer y dar de alta la ficha desde Vender.
// ============================================================================
//
// El mostrador busca al cliente por lo que tenga a mano: el nombre, el teléfono o el CUIT/DNI.
// Hasta acá `buscarClienteParaVenta` (order-actions.ts) sólo buscaba por teléfono exacto y no
// traía nada más que el nombre; para facturar a nombre del cliente había que ir a su ficha.
//
// Reglas (docs de diseño, «Tanda 1», fila 1D, y MG-015 … MG-019, MG-039):
//   · se busca desde 3 caracteres y se muestran como máximo 8 fichas;
//   · se busca SÓLO en el negocio de la sesión: el `tenantId` va en cada consulta además de RLS
//     (una consulta cruda no pasa por el candado de la app, ver crear-ficha.ts);
//   · al elegir, se trae lo que el mostrador necesita para venderle: los datos para facturar, la
//     última dirección de entrega (`Order.address` más reciente, sin columna nueva), lo que debe
//     (`AccountReceivable` OPEN menos lo cobrado) y los últimos 3 pedidos;
//   · el alta y la edición de los datos para facturar validan con la MISMA regla que la ficha
//     (`validarFichaFiscal`, src/lib/fiscal/ficha-fiscal.ts), con el CUIT por dígito verificador
//     (`validarCuit`, src/lib/fiscal/cuit.ts — no se reimplementa).
//
// Sin "use server": cada función recibe el negocio por parámetro, así que NO puede ser un
// endpoint. Las llaman las acciones de `buscar-para-venta.ts`, que ya resolvieron la sesión y el
// negocio, dentro de `tenantTransaction`. Lo puro (texto a buscar, CUIT, validación del alta) lo
// alcanza también el componente de cliente.

import type { Prisma } from "@/generated/prisma/client";
import { validarCuit } from "@/lib/fiscal/cuit";
import { DOC_TIPO } from "@/lib/fiscal/decidir-comprobante";
import { cambiosDeFicha, validarFichaFiscal, type FichaFiscal } from "@/lib/fiscal/ficha-fiscal";
import { normalizarTelefono } from "./telefono";
import { crearFichaEnTx } from "./crear-ficha";
import { isValidArgentinePhone } from "@/lib/contact-validation";
import { redondearAlCentavo } from "@/lib/dinero/redondeo";

type Tx = Prisma.TransactionClient;

/** Desde cuántos caracteres se busca. Con menos, cualquier letra trae medio negocio. */
export const MINIMO_PARA_BUSCAR = 3;
/** Cuántas fichas se muestran como máximo: más no se leen de un vistazo en el mostrador. */
export const MAXIMO_RESULTADOS = 8;
/** Cuántos pedidos anteriores se traen al elegir (chips «Repetir»). */
export const PEDIDOS_RECIENTES = 3;

// ── Lo que se escribió en el buscador ───────────────────────────────────────────

export type TextoParaBuscar =
  | { ok: true; texto: string; digitos: string }
  | { ok: false; motivo: string };

/** Limpia lo escrito y dice si alcanza para buscar. PURA. */
export function textoParaBuscar(crudo: string | null | undefined): TextoParaBuscar {
  const texto = String(crudo ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
  if (texto.replace(/\s/g, "").length < MINIMO_PARA_BUSCAR) {
    return { ok: false, motivo: `Escribí al menos ${MINIMO_PARA_BUSCAR} letras o números para buscar.` };
  }
  return { ok: true, texto, digitos: texto.replace(/\D/g, "") };
}

// ── El CUIT de la venta ─────────────────────────────────────────────────────────

export type CuitDeLaVenta =
  | { ok: true; cuit: string; formateado: string }
  | { ok: false; motivo: string };

/**
 * El CUIT que se carga en Vender, con el motivo en las palabras del mostrador (MG-016). La regla
 * es la única del repo (`validarCuit`, módulo 11); acá sólo cambia la frase del verificador. No
 * se sugiere «el dígito correcto»: si el error está en otro número, «corregir» el último fabrica
 * el CUIT de otra persona — por eso se pide mirar la constancia. PURA.
 */
export function revisarCuit(valor: string | number | null | undefined): CuitDeLaVenta {
  const r = validarCuit(valor, "CUIT");
  if (r.ok) return { ok: true, cuit: r.cuit, formateado: r.formateado };
  if (r.error === "DIGITO_VERIFICADOR") {
    return { ok: false, motivo: "Ese CUIT no cierra: revisá el último número y los demás contra la constancia de ARCA." };
  }
  return { ok: false, motivo: r.motivo };
}

/** Qué documento es lo escrito en «CUIT/DNI». */
export type DocumentoEscrito =
  | { estado: "vacio" }
  | { estado: "valido"; docTipo: number; docNro: string; texto: string }
  | { estado: "invalido"; motivo: string };

/**
 * Lee el campo único «CUIT/DNI»: 11 números son un CUIT (se valida el verificador), de 6 a 8 un
 * DNI. `docTipo` permite forzar CUIL (86) cuando el formulario lo eligió. PURA.
 */
export function leerDocumento(crudo: string | null | undefined, docTipo?: number | null): DocumentoEscrito {
  const texto = String(crudo ?? "").trim();
  if (texto === "") return { estado: "vacio" };
  if (!/^[\d\s.\-/]+$/.test(texto)) {
    return { estado: "invalido", motivo: "El CUIT o DNI lleva sólo números (se puede escribir con guiones o puntos)." };
  }
  const d = texto.replace(/\D/g, "");
  if (d.length === 11 || docTipo === DOC_TIPO.CUIT || docTipo === DOC_TIPO.CUIL) {
    const c = revisarCuit(d);
    if (!c.ok) return { estado: "invalido", motivo: docTipo === DOC_TIPO.CUIL ? c.motivo.replace(/\bCUIT\b/g, "CUIL") : c.motivo };
    const tipo = docTipo === DOC_TIPO.CUIL ? DOC_TIPO.CUIL : DOC_TIPO.CUIT;
    return { estado: "valido", docTipo: tipo, docNro: c.cuit, texto: `${tipo === DOC_TIPO.CUIL ? "CUIL" : "CUIT"} ${c.formateado}` };
  }
  if (d.length >= 6 && d.length <= 8 && Number(d) > 0) {
    const dni = String(Number(d));
    return { estado: "valido", docTipo: DOC_TIPO.DNI, docNro: dni, texto: `DNI ${Number(dni).toLocaleString("es-AR")}` };
  }
  return { estado: "invalido", motivo: "Un CUIT tiene 11 números y un DNI entre 6 y 8. Revisá lo que escribiste." };
}

// ── Buscar ──────────────────────────────────────────────────────────────────────

export type CoincidePor = "documento" | "telefono" | "nombre";

export interface ClienteEncontrado {
  id: string;
  nombre: string;
  telefono: string | null;
  docTipo: number | null;
  docNro: string | null;
  razonSocial: string | null;
  condicionIva: string | null;
  /** Por qué apareció: ordena (documento, después teléfono, después nombre). */
  coincide: CoincidePor;
}

const SELECT_ENCONTRADO = {
  id: true,
  name: true,
  phone: true,
  docTipo: true,
  docNro: true,
  razonSocial: true,
  condicionIva: true,
} as const;

type FilaEncontrada = {
  id: string;
  name: string;
  phone: string | null;
  docTipo: number | null;
  docNro: string | null;
  razonSocial: string | null;
  condicionIva: string | null;
};

const PESO: Record<CoincidePor, number> = { documento: 0, telefono: 1, nombre: 2 };

/** Ordena y recorta lo encontrado: un mismo cliente una sola vez, con su mejor coincidencia. PURA. */
export function ordenarEncontrados(
  filas: readonly (FilaEncontrada & { coincide: CoincidePor })[],
  digitos: string,
): ClienteEncontrado[] {
  const porId = new Map<string, FilaEncontrada & { coincide: CoincidePor }>();
  for (const f of filas) {
    const previa = porId.get(f.id);
    if (!previa || PESO[f.coincide] < PESO[previa.coincide]) porId.set(f.id, f);
  }
  const exacto = (f: FilaEncontrada) => (digitos !== "" && f.docNro === digitos ? 0 : 1);
  return [...porId.values()]
    .sort(
      (a, b) =>
        exacto(a) - exacto(b) ||
        PESO[a.coincide] - PESO[b.coincide] ||
        a.name.localeCompare(b.name, "es") ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )
    .slice(0, MAXIMO_RESULTADOS)
    .map((f) => ({
      id: f.id,
      nombre: f.name,
      telefono: f.phone ? f.phone : null,
      docTipo: f.docTipo,
      docNro: f.docNro,
      razonSocial: f.razonSocial,
      condicionIva: f.condicionIva,
      coincide: f.coincide,
    }));
}

/**
 * Busca fichas del negocio por nombre (o razón social), teléfono o número de documento. Devuelve
 * a lo sumo `MAXIMO_RESULTADOS`; con menos de `MINIMO_PARA_BUSCAR` caracteres, nada. DENTRO de la
 * transacción del llamador (`tenantTransaction`, con el GUC de RLS puesto).
 *
 * El teléfono se compara por sus dígitos (`regexp_replace` en SQL): lo guardado es lo que se
 * tipeó («11 5555-1234»), así que un `contains` sobre el texto no lo encuentra. Mismo criterio
 * que crear-ficha.ts; el `tenantId` va a mano además de RLS.
 */
export async function buscarClientesParaVentaEnTx(tx: Tx, tenantId: string, crudo: string): Promise<ClienteEncontrado[]> {
  const q = textoParaBuscar(crudo);
  if (!q.ok || !tenantId) return [];
  const { texto, digitos } = q;
  const conDigitos = digitos.length >= MINIMO_PARA_BUSCAR;

  const porNombre = await tx.client.findMany({
    where: {
      tenantId,
      OR: [
        { name: { contains: texto, mode: "insensitive" } },
        { razonSocial: { contains: texto, mode: "insensitive" } },
      ],
    },
    select: SELECT_ENCONTRADO,
    orderBy: { name: "asc" },
    take: MAXIMO_RESULTADOS,
  });

  const porDocumento = conDigitos
    ? await tx.client.findMany({
        where: { tenantId, docNro: { contains: digitos } },
        select: SELECT_ENCONTRADO,
        orderBy: { name: "asc" },
        take: MAXIMO_RESULTADOS,
      })
    : [];

  let porTelefono: FilaEncontrada[] = [];
  if (conDigitos) {
    // Lo escrito puede venir con +54, 0 o 15: se compara también la clave normalizada.
    const clave = normalizarTelefono(digitos);
    const patrones = [...new Set([digitos, clave].filter((p) => p.length >= MINIMO_PARA_BUSCAR))].map((p) => `%${p}%`);
    const ids = new Set<string>();
    for (const patron of patrones) {
      const filas = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "Client"
        WHERE "tenantId" = ${tenantId}
          AND regexp_replace(COALESCE("phone", ''), '[^0-9]', '', 'g') LIKE ${patron}
        ORDER BY "name" ASC, "id" ASC
        LIMIT ${MAXIMO_RESULTADOS}`;
      for (const f of filas) ids.add(f.id);
    }
    if (ids.size > 0) {
      porTelefono = await tx.client.findMany({
        where: { tenantId, id: { in: [...ids] } },
        select: SELECT_ENCONTRADO,
      });
    }
  }

  return ordenarEncontrados(
    [
      ...porDocumento.map((f) => ({ ...f, coincide: "documento" as const })),
      ...porTelefono.map((f) => ({ ...f, coincide: "telefono" as const })),
      ...porNombre.map((f) => ({ ...f, coincide: "nombre" as const })),
    ],
    digitos,
  );
}

// ── Al elegir ───────────────────────────────────────────────────────────────────

export interface PedidoReciente {
  id: string;
  code: number;
  /** ISO: viaja al navegador sin perder la hora. */
  fecha: string;
  total: number;
  estado: string;
  renglones: { productId: string | null; nombre: string; cantidad: number; porPeso: boolean }[];
}

export interface ClienteDeLaVentaDetalle extends FichaFiscal {
  id: string;
  nombre: string;
  telefono: string | null;
  /** La dirección del pedido con envío más reciente, o null. */
  ultimaDireccion: string | null;
  ultimosPedidos: PedidoReciente[];
}

/**
 * Lo que el mostrador ve al elegir un cliente: datos para facturar, última dirección y últimos
 * pedidos (no anulados). `null` si la ficha no es de este negocio. El saldo va aparte
 * (`saldoDelClienteEnTx`): su tabla puede no estar en una base vieja, y dentro de una
 * transacción un error de «no existe la tabla» la aborta entera.
 */
export async function detalleDelClienteEnTx(tx: Tx, tenantId: string, clientId: string): Promise<ClienteDeLaVentaDetalle | null> {
  const id = String(clientId ?? "").trim();
  if (!id || !tenantId) return null;
  const c = await tx.client.findFirst({
    where: { id, tenantId },
    select: { id: true, name: true, phone: true, docTipo: true, docNro: true, razonSocial: true, condicionIva: true, domicilio: true },
  });
  if (!c) return null;

  const [conDireccion, pedidos] = await Promise.all([
    tx.order.findMany({
      where: { tenantId, clientId: id, address: { not: null } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { address: true },
      take: 5,
    }),
    tx.order.findMany({
      where: { tenantId, clientId: id, status: { not: "CANCELLED" } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: PEDIDOS_RECIENTES,
      select: {
        id: true,
        code: true,
        createdAt: true,
        total: true,
        status: true,
        items: { select: { productId: true, name: true, quantity: true, saleUnit: true }, orderBy: { id: "asc" } },
      },
    }),
  ]);

  return {
    id: c.id,
    nombre: c.name,
    telefono: c.phone ? c.phone : null,
    docTipo: c.docTipo,
    docNro: c.docNro,
    razonSocial: c.razonSocial,
    condicionIva: c.condicionIva,
    domicilio: c.domicilio,
    ultimaDireccion: conDireccion.map((o) => (o.address ?? "").trim()).find((a) => a !== "") ?? null,
    ultimosPedidos: pedidos.map((o) => ({
      id: o.id,
      code: o.code,
      fecha: new Date(o.createdAt).toISOString(),
      total: o.total,
      estado: o.status,
      renglones: o.items.map((i) => ({ productId: i.productId, nombre: i.name, cantidad: i.quantity, porPeso: i.saleUnit === "WEIGHT" })),
    })),
  };
}

/**
 * Lo que debe el cliente: suma de los fiados OPEN menos lo cobrado de cada uno (misma cuenta que
 * la ficha, src/lib/crm/cargas.server.ts `cargarFiado`). Al centavo. 0 si no debe nada.
 */
export async function saldoDelClienteEnTx(tx: Tx, tenantId: string, clientId: string): Promise<number> {
  const deudas = await tx.accountReceivable.findMany({
    where: { tenantId, clientId, status: "OPEN" },
    select: { id: true, amount: true },
  });
  if (deudas.length === 0) return 0;
  const cobrado = await tx.collection.groupBy({
    by: ["originId"],
    where: { tenantId, originType: "RECEIVABLE", originId: { in: deudas.map((d) => d.id) } },
    _sum: { amount: true },
  });
  const porDeuda = new Map(cobrado.map((g) => [g.originId, Number(g._sum.amount ?? 0)]));
  const saldo = deudas.reduce((acc, d) => acc + Math.max(0, redondearAlCentavo(Number(d.amount) - (porDeuda.get(d.id) ?? 0))), 0);
  return redondearAlCentavo(saldo);
}

// ── Alta y edición en línea ─────────────────────────────────────────────────────

/** Lo que manda el bloque Cliente al guardar. Con `id`, edita los datos para facturar de esa ficha. */
export interface DatosDelClienteDeLaVenta {
  id?: string | null;
  nombre?: string | null;
  telefono?: string | null;
  docTipo?: string | number | null;
  docNro?: string | number | null;
  razonSocial?: string | null;
  condicionIva?: string | null;
  domicilio?: string | null;
}

export type ClienteValidado = {
  id: string | null;
  nombre: string;
  telefono: string;
  ficha: FichaFiscal;
};

export type CampoDelCliente = "nombre" | "telefono" | keyof FichaFiscal;

export type ResultadoValidacion =
  | { ok: true; cliente: ClienteValidado }
  | { ok: false; campo: CampoDelCliente; error: string };

const limpio = (v: unknown) => (v == null ? "" : String(v).trim().replace(/\s+/g, " "));

/**
 * Valida el alta o la edición desde Vender. Los datos para facturar pasan por `validarFichaFiscal`
 * (la regla de la ficha: con CUIT, razón social y condición; con A, domicilio), con el verificador
 * del CUIT dicho como en el mostrador (`revisarCuit`). En el alta hace falta el nombre, y el
 * teléfono es opcional pero, si está, tiene que ser un número argentino. PURA.
 */
export function validarClienteDeLaVenta(d: DatosDelClienteDeLaVenta): ResultadoValidacion {
  const id = limpio(d.id) || null;
  const nombre = limpio(d.nombre).slice(0, 120);
  const telefono = limpio(d.telefono).slice(0, 40);

  if (!id && nombre === "") return { ok: false, campo: "nombre", error: "Falta el nombre del cliente." };
  if (!id && telefono !== "" && !isValidArgentinePhone(telefono)) {
    return { ok: false, campo: "telefono", error: "Ese teléfono no parece un número argentino: probá con el código de área (11…)." };
  }

  // El campo único «CUIT/DNI»: sin tipo elegido, se deduce del largo.
  let docTipo = limpio(d.docTipo);
  const docNro = limpio(d.docNro);
  if (docTipo === "" && docNro !== "") {
    const leido = leerDocumento(docNro);
    if (leido.estado === "invalido") return { ok: false, campo: "docNro", error: leido.motivo };
    if (leido.estado === "valido") docTipo = String(leido.docTipo);
  }
  if ((docTipo === String(DOC_TIPO.CUIT) || docTipo === String(DOC_TIPO.CUIL)) && docNro !== "") {
    const leido = leerDocumento(docNro, Number(docTipo));
    if (leido.estado === "invalido") return { ok: false, campo: "docNro", error: leido.motivo };
  }

  const v = validarFichaFiscal({
    docTipo,
    docNro,
    razonSocial: d.razonSocial,
    condicionIva: d.condicionIva,
    domicilio: d.domicilio,
  });
  if (!v.ok) return { ok: false, campo: v.campo, error: v.error };
  return { ok: true, cliente: { id, nombre, telefono, ficha: v.ficha } };
}

/** Lo que pasó al guardar, para la auditoría y para la pantalla. */
export type ClienteGuardado =
  | { ok: true; id: string; creado: boolean; cambios: Record<string, { antes: unknown; despues: unknown }> }
  | { ok: false; campo?: CampoDelCliente; error: string; existenteId?: string };

/**
 * Guarda el cliente validado: edita los datos para facturar de una ficha existente o da de alta
 * una nueva con ellos. DENTRO de la transacción del llamador:
 *   · el alta usa `crearFichaEnTx` (candado por teléfono, ata los pedidos sin ficha con su
 *     número); si el teléfono ya es de otra ficha, no duplica: devuelve cuál es;
 *   · un CUIT/DNI que ya está en otra ficha del negocio tampoco se duplica (una persona, una
 *     ficha): se devuelve cuál es para elegirla;
 *   · la edición lee y escribe en la misma transacción, así el «antes» de la auditoría es el que
 *     se pisó (mismo criterio que `guardarFichaFiscal`).
 * La auditoría la escribe la acción después, con el actor de la sesión.
 */
export async function guardarClienteDeLaVentaEnTx(tx: Tx, tenantId: string, c: ClienteValidado): Promise<ClienteGuardado> {
  const { ficha } = c;

  if (ficha.docNro) {
    const otra = await tx.client.findFirst({
      where: { tenantId, docNro: ficha.docNro, ...(c.id ? { id: { not: c.id } } : {}) },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    });
    if (otra) {
      return {
        ok: false,
        campo: "docNro",
        error: `Ese documento ya está en la ficha de ${otra.name}. Elegila en la búsqueda.`,
        existenteId: otra.id,
      };
    }
  }

  if (c.id) {
    const antes = await tx.client.findFirst({
      where: { id: c.id, tenantId },
      select: { docTipo: true, docNro: true, razonSocial: true, condicionIva: true, domicilio: true },
    });
    if (!antes) return { ok: false, error: "Esa ficha de cliente no existe en este negocio." };
    const cambios = cambiosDeFicha(antes, ficha);
    if (Object.keys(cambios).length > 0) {
      await tx.client.updateMany({ where: { id: c.id, tenantId }, data: { ...ficha } });
    }
    return { ok: true, id: c.id, creado: false, cambios };
  }

  const r = await crearFichaEnTx(tx, tenantId, { name: c.nombre, phone: c.telefono, email: null, notes: null, birthDate: null });
  if (!r.ok) {
    return {
      ok: false,
      campo: "telefono",
      error: `Ese teléfono ya es de la ficha de ${r.existente.name}. Elegila en la búsqueda.`,
      existenteId: r.existente.id,
    };
  }
  const vacia: FichaFiscal = { docTipo: null, docNro: null, razonSocial: null, condicionIva: null, domicilio: null };
  const cambios = cambiosDeFicha(vacia, ficha);
  if (Object.keys(cambios).length > 0) {
    await tx.client.updateMany({ where: { id: r.id, tenantId }, data: { ...ficha } });
  }
  return {
    ok: true,
    id: r.id,
    creado: true,
    cambios: {
      name: { antes: null, despues: c.nombre },
      phone: { antes: null, despues: c.telefono },
      ...cambios,
      pedidosVinculados: { antes: null, despues: r.pedidos },
    },
  };
}

// ── Padrón de ARCA (gancho) ─────────────────────────────────────────────────────

/** Lo que traería el padrón de ARCA para un CUIT. */
export interface DatosDelPadron {
  razonSocial: string;
  condicionIva: string | null;
  domicilio: string | null;
}

/**
 * GANCHO: la consulta al padrón de ARCA (constancia de inscripción) por CUIT. Hoy devuelve
 * `null` siempre: no hay cliente del padrón en `src/` (ni en el plugin ARCA). El bloque Cliente ya
 * la llama y, con `null`, pide completar razón social y condición a mano desde la constancia.
 * Cuando el plugin ARCA la exponga, se conecta acá y nada más cambia. Provisional a confirmar.
 */
export async function consultarPadron(cuit: string): Promise<DatosDelPadron | null> {
  void cuit;
  return null;
}
