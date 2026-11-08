"use server";

// ============================================================================
// buscarEnElNegocio(q) — la capa REGISTROS de Ctrl/⌘K (R6-F2). SÓLO LECTURA.
// ============================================================================
//
// Hasta 5 clientes (nombre o teléfono), 5 productos (nombre) y 5 pedidos (número) del negocio de
// la sesión. Autorizada por el orquestador el 25/09 como lectura nueva: no escribe nada, no toca
// plata y no cambia lo que ve CH con «Diseño nuevo» apagado (la paleta sólo existe prendido).
//
// CÓMO SE CUIDA:
//   · Sesión: `requireUser` (sin sesión, al login; una cookie de otro negocio no abre éste).
//   · Permisos: cada grupo con la MISMA regla que la guardia de su listado (`requireApp` →
//     `appPermitida`: rol, módulo, rubro y edición). Sin la app Clientes no se LEEN clientes;
//     no es que se lean y se escondan. Los montos, sólo con reports:read; salvo el precio de
//     venta para quien tiene Vender (lo ve igual al cobrar). El costo nunca se lee.
//   · Negocio: las lecturas van dentro de `tenantTransaction` (src/lib/rls.ts): RLS con el
//     negocio puesto y, además, el candado de la app (`scopeTxClient`) en cada `where`.
//   · Entrada: `leerBusqueda` (2 a 60 letras, recortada). Los errores dicen qué hacer, nunca
//     qué falló por dentro. En el log va el largo de lo buscado, no lo buscado (puede ser un
//     teléfono).
//   · Mismos filtros que los listados: productos no borrados (`getCatalog`), pedidos abiertos
//     según `wherePedidosAbiertos` (el tablero), sin reescribir esas reglas acá.
//
// LÍMITES MEDIDOS O CONOCIDOS (BACKLOG): la búsqueda es `ILIKE '%q%'` sin índice de trigramas
// (agregarlo es una migración) y distingue tildes («rodriguez» no trae «Rodríguez»; `unaccent`
// también es una extensión nueva). Proveedores y comprobantes por número quedan para otra porción.

import { requireUser } from "@/lib/authz";
import { enmascararTelefono, puedeVerContacto } from "@/lib/clientes/telefono";
import { criterioDeContacto, wherePorContacto } from "@/lib/clientes/busqueda-por-contacto";
import { permisoEfectivo } from "@/lib/capabilities";
import { tenantTransaction } from "@/lib/rls";
import { getCurrentTenantId } from "@/lib/tenant";
import { getCurrentTenantRubro } from "@/lib/carniceria/rubro";
import { wherePedidosAbiertos } from "@/lib/order-anulacion";
import { dateStrInBusinessTz } from "@/lib/datetime";
import { logger } from "@/lib/logger";
import { appPermitida } from "@/apps/visibles";
import { appPorId } from "@/apps/registro";
import { getNegocioApps } from "@/apps/contexto.server";
import {
  FILAS_A_LEER,
  armarRegistros,
  leerBusqueda,
  rangosDeCodigo,
  type ClienteLeido,
  type GrupoDeRegistros,
  type PedidoLeido,
  type PermisosDeBusqueda,
  type ProductoLeido,
} from "./registros-core";

export type ResultadoDeBusqueda = { ok: true; grupos: GrupoDeRegistros[] } | { ok: false; mensaje: string };

export async function buscarEnElNegocio(q: unknown): Promise<ResultadoDeBusqueda> {
  const busqueda = leerBusqueda(q);
  if (!busqueda.ok) return busqueda;

  // Fuera del try: el corte al login de `requireUser` tiene que llegar a Next tal cual.
  const user = await requireUser();
  const [negocio, rubro, tenantId] = await Promise.all([getNegocioApps(user.role), getCurrentTenantRubro(), getCurrentTenantId()]);
  const permisos: PermisosDeBusqueda = {
    clientes: appPermitida(appPorId("clientes"), negocio),
    // El catálogo de productos es el del mostrador; en servicios la pantalla lista servicios.
    productos: rubro.isRetail && appPermitida(appPorId("catalogo"), negocio),
    // Quien cobra (Vender) encuentra lo que Vender le deja cobrar, en cualquier rubro: la misma
    // lista de `cargarVender` (vender/datos.ts). Nombre y precio de venta; el costo no se lee.
    vender: appPermitida(appPorId("vender"), negocio),
    pedidos: appPermitida(appPorId("pedidos"), negocio),
    ventas: appPermitida(appPorId("ventas-del-dia"), negocio),
    verPlata: permisoEfectivo(user, "reports:read"),
  };
  const { texto, digitos, codigo } = busqueda;
  const veContacto = puedeVerContacto(user);
  // Por teléfono lo decide el helper único (casilla 5): sin `clients:contact`, sólo los últimos 4 completos.
  const porTelefono = wherePorContacto(criterioDeContacto(texto, veContacto));

  try {
    const leidos = await tenantTransaction(async (tx) => {
      const clientes: ClienteLeido[] = permisos.clientes
        ? (
            await tx.client.findMany({
              where: {
                OR: [
                  { name: { contains: texto, mode: "insensitive" } },
                  ...porTelefono,
                ],
              },
              orderBy: { name: "asc" },
              take: FILAS_A_LEER,
              select: { id: true, name: true, phone: true },
            })
            // Sin `clients:contact` (casilla 5 de la matriz) el teléfono sale enmascarado.
          ).map((c) => ({ id: c.id, nombre: c.name, telefono: veContacto ? c.phone : enmascararTelefono(c.phone) }))
        : [];

      const productos: ProductoLeido[] =
        permisos.productos || permisos.vender
          ? (
              await tx.product.findMany({
                where: {
                  deletedAt: null,
                  name: { contains: texto, mode: "insensitive" },
                  // Sin el Catálogo, sólo lo que se puede cobrar: ni pausados ni sin precio.
                  ...(permisos.productos ? {} : { active: true, OR: [{ price: { not: null } }, { pricePerKg: { not: null } }] }),
                },
                orderBy: { name: "asc" },
                take: FILAS_A_LEER,
                select: { id: true, name: true, active: true, saleUnit: true, price: true, pricePerKg: true },
              })
            ).map((p) => {
              const porPeso = p.saleUnit === "WEIGHT";
              return { id: p.id, nombre: p.name, activo: p.active, porPeso, precio: (porPeso ? p.pricePerKg : p.price) ?? null };
            })
          : [];

      let pedidos: PedidoLeido[] = [];
      // Por número (con o sin #), por el nombre de quien pidió o por su teléfono (UAT retail 07-08/11:
      // «3», un nombre o un teléfono daban 0). El teléfono sólo con `clients:contact`, como en Clientes,
      // y con 6 cifras o más: la base guarda el teléfono con formato, así que se trae por las últimas 4
      // y se confirma acá con todas las cifras.
      const porTelefonoDelPedido = veContacto && digitos !== null && digitos.length >= 6 ? digitos : null;
      const condiciones = [
        ...(codigo !== null ? rangosDeCodigo(codigo).map((r) => ({ code: r })) : []),
        ...(digitos === null ? [{ customerName: { contains: texto, mode: "insensitive" as const } }] : []),
        ...(porTelefonoDelPedido ? [{ customerPhone: { endsWith: porTelefonoDelPedido.slice(-4) } }] : []),
      ];
      if ((permisos.pedidos || permisos.ventas) && condiciones.length > 0) {
        const leidas = await tx.order.findMany({
          where: { OR: condiciones },
          // El exacto y los más nuevos: el orden fino lo pone `armarRegistros`.
          orderBy: { code: "desc" },
          take: FILAS_A_LEER,
          select: { id: true, code: true, customerName: true, customerPhone: true, status: true, total: true, createdAt: true },
        });
        const filas = leidas.filter(
          (f) =>
            (codigo !== null && String(f.code).startsWith(String(codigo))) ||
            // `contains` no escapa los comodines de LIKE («%» traería todo): se confirma acá, letra por letra.
            (digitos === null && f.customerName.toLowerCase().includes(texto.toLowerCase())) ||
            (porTelefonoDelPedido !== null && f.customerPhone.replace(/\D/g, "").includes(porTelefonoDelPedido)),
        );
        const exacto = codigo === null || filas.some((f) => f.code === codigo)
          ? []
          : await tx.order.findMany({ where: { code: codigo }, take: 1, select: { id: true, code: true, customerName: true, status: true, total: true, createdAt: true } });
        const todas = [...exacto, ...filas];
        const abiertos = new Set(
          todas.length === 0
            ? []
            : (await tx.order.findMany({ where: { AND: [wherePedidosAbiertos(tenantId), { id: { in: todas.map((f) => f.id) } }] }, select: { id: true } })).map(
                (f) => f.id,
              ),
        );
        pedidos = todas.map((f) => ({
          id: f.id,
          codigo: f.code,
          cliente: f.customerName,
          abierto: abiertos.has(f.id),
          anulado: f.status === "CANCELLED",
          dia: dateStrInBusinessTz(f.createdAt),
          total: f.total,
        }));
      }
      return { clientes, productos, pedidos };
    });
    return { ok: true, grupos: armarRegistros(leidos, busqueda, permisos) };
  } catch (err) {
    logger.error("buscador", "no se pudo buscar en el negocio", err, { largo: texto.length });
    return { ok: false, mensaje: "No pudimos buscar ahora. Probá de nuevo en un momento; si sigue, avisale al dueño." };
  }
}
