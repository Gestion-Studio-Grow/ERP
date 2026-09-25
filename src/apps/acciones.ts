// ============================================================================
// ACCIONES — los verbos del buscador (Ctrl/⌘K): «Vender», «Cerrar el día», «Recibir mercadería».
// ============================================================================
//
// La primera capa de «¿Qué querés hacer?» (ARQUITECTURA §5.6): verbos con un enlace que YA EXISTE,
// cada uno atado a la app que lo resuelve. Es un dato fuera del contrato de la app: sumar una acción
// no toca el registro. Sólo verbos que hoy funcionan de punta a punta (nada de «Nuevo cliente»
// mientras Clientes no abra el alta por enlace).
//
// SEGURIDAD: el SERVIDOR filtra (`accionesParaPersona`) antes de mandarlas al navegador: una acción
// aparece sólo si su app está entre las que la persona ve (`appsVisibles`, la misma decisión que la
// guardia de la página) y, si la acción pide algo más que abrir la app (dar un turno pide
// agenda:manage, no sólo agenda:read), si su rol lo tiene. Esconder no protege: cada página sigue
// con su `requireApp`. Lo prueba acciones.test.ts con el registro real: el enlace de cada acción
// cae (appDeRuta) en la app que declara.
//
// Client-safe: sólo datos y una función pura (la llama el layout, en el servidor).

import { roleHasCapability, type Capability, type Role } from "@/lib/capabilities";
import { hrefNuevoTurno } from "@/app/admin/(dashboard)/turnos/pasos";
import type { AppDescriptor, NombreIcono } from "./contract";

export interface Accion {
  id: string;
  /** La app que resuelve la acción (y cuya visibilidad decide si aparece). */
  app: string;
  /** El verbo, como lo diría quien atiende. */
  verbo: string;
  href: string;
  icono: NombreIcono;
  /** Lo que pide además de ver la app. */
  capability?: Capability;
  /** Palabras con las que también se encuentra. */
  palabras: readonly string[];
}

/** En el orden en que aparecen sin texto: lo del día primero. */
export const ACCIONES: readonly Accion[] = [
  { id: "vender", app: "vender", verbo: "Vender", href: "/admin/vender", icono: "vender", palabras: ["cobrar", "venta", "ticket", "mostrador"] },
  {
    id: "dar-un-turno",
    app: "agenda",
    verbo: "Dar un turno",
    href: hrefNuevoTurno(),
    icono: "agenda",
    capability: "agenda:manage",
    palabras: ["turno", "reservar", "agendar", "cita"],
  },
  {
    id: "tomar-un-pedido",
    app: "vender",
    verbo: "Tomar un pedido",
    href: "/admin/vender?modo=pedido",
    icono: "pedidos",
    palabras: ["pedido", "encargo", "envío", "retiro", "whatsapp"],
  },
  {
    id: "confirmar-manana",
    app: "confirmar-manana",
    verbo: "Confirmar los turnos de mañana",
    href: "/admin/turnos/manana",
    icono: "agenda",
    palabras: ["avisar", "recordar", "whatsapp", "confirmar"],
  },
  { id: "abrir-la-caja", app: "caja-del-dia", verbo: "Abrir la caja", href: "/admin/caja", icono: "caja", palabras: ["caja", "apertura", "efectivo", "gasto", "retiro"] },
  { id: "cerrar-el-dia", app: "cierre-del-dia", verbo: "Cerrar el día", href: "/admin/caja/cierre", icono: "cierre", palabras: ["arqueo", "cierre", "contar la plata", "cerrar la caja"] },
  { id: "recibir-mercaderia", app: "recibir-mercaderia", verbo: "Recibir mercadería", href: "/admin/compras", icono: "compras", palabras: ["compra", "proveedor", "remito", "ingreso"] },
  { id: "contar-un-producto", app: "recuento", verbo: "Contar un producto", href: "/admin/ajustes/recuento", icono: "ajustes", palabras: ["recuento", "contar", "inventario", "stock"] },
  { id: "cargar-una-merma", app: "mermas", verbo: "Cargar una merma", href: "/admin/ajustes", icono: "ajustes", palabras: ["merma", "rotura", "vencido", "pérdida", "ajuste"] },
  { id: "aumentar-precios", app: "actualizar-precios", verbo: "Aumentar precios", href: "/admin/catalogo/precios", icono: "catalogo", palabras: ["precio", "aumento", "lista", "actualizar"] },
  { id: "imprimir-etiquetas", app: "etiquetas-de-precio", verbo: "Imprimir etiquetas de precio", href: "/admin/catalogo/etiquetas", icono: "lotes", palabras: ["etiqueta", "cartel", "precio", "góndola"] },
  { id: "hacer-una-factura", app: "facturacion", verbo: "Hacer una factura", href: "/admin/facturacion", icono: "facturacion", palabras: ["factura", "arca", "afip", "comprobante"] },
  { id: "cerrar-el-mes", app: "cierre-del-mes", verbo: "Cerrar el mes para el contador", href: "/admin/cierre-mes", icono: "cierre", palabras: ["contador", "paquete", "mes", "congelar"] },
  { id: "sumar-una-persona", app: "usuarios", verbo: "Sumar una persona al equipo", href: "/admin/usuarios", icono: "usuarios", palabras: ["usuario", "empleado", "cajera", "acceso", "contraseña"] },
];

/**
 * Las acciones que ESTA persona puede usar: su app está entre las visibles (las que el servidor
 * ya calculó con `appsVisibles`) y su rol tiene lo que la acción pide además. `rutas`, si viene,
 * limita a las acciones cuya app es una de esas pantallas (CH sin «Trabaja por apps»: las mismas
 * pantallas de su barra de siempre, ARQUITECTURA §5.10).
 */
export function accionesParaPersona(
  visibles: readonly Pick<AppDescriptor, "id" | "nombre" | "ruta">[],
  role: Role,
  rutas?: ReadonlySet<string>,
): (Accion & { nombreApp: string })[] {
  const porId = new Map(visibles.map((a) => [a.id, a]));
  return ACCIONES.flatMap((a) => {
    const app = porId.get(a.app);
    if (!app) return [];
    if (a.capability && !roleHasCapability(role, a.capability)) return [];
    if (rutas && !rutas.has(app.ruta)) return [];
    return [{ ...a, nombreApp: app.nombre }];
  });
}
