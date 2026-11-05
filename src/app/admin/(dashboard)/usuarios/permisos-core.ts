// QUÉ PUEDE HACER CADA ROL — la tabla de la pantalla de Usuarios (diseño nuevo). PURO.
//
// No decide permisos: los LEE de `ROLE_CAPABILITIES` (capabilities.ts) y los dice en palabras de
// trabajo. Si mañana se le suma una capacidad a un rol, la tabla cambia sola; si alguien escribe a
// mano un «Sí» que el sistema no da, el test lo frena. Los matices que el sistema aplica fuera de la
// capacidad se dicen tal cual: el Mostrador anula sólo lo cobrado hoy, con motivo y con el código de
// la dueña (`alcanceDeAnulacion`), recepción anula un cobro de turno sólo con ese código
// (`anulacionDeCobro`), y el Profesional ve y cobra sólo sus turnos (el loader filtra por su ficha).

import { alcanceDeAnulacion, anulacionDeCobro, type Role } from "@/lib/capabilities";
import { permisoEfectivo, type CapabilityPorUsuario } from "@/lib/permisos-stub";
import { rolesParaAlta, etiquetaDeRol } from "./roles";

type Tarea = {
  texto: string;
  capacidad: CapabilityPorUsuario;
  /** Sólo en negocios con agenda (servicios) o sólo en los de mostrador. */
  rubro?: "servicios" | "mostrador";
};

const TAREAS: readonly Tarea[] = [
  { texto: "Vender y cobrar en el mostrador", capacidad: "orders:manage" },
  { texto: "Anular una venta", capacidad: "orders:void" },
  { texto: "Ver la agenda", capacidad: "agenda:read", rubro: "servicios" },
  // Dar un turno y moverlo/cancelarlo van separadas (matriz de permisos, decisión del 05/11): sólo
  // las acciones que CREAN turno piden `agenda:create`.
  { texto: "Dar turnos", capacidad: "agenda:create", rubro: "servicios" },
  { texto: "Mover, reprogramar y cancelar turnos", capacidad: "agenda:manage", rubro: "servicios" },
  { texto: "Cerrar y cobrar turnos", capacidad: "agenda:collect", rubro: "servicios" },
  { texto: "Anular el cobro de un turno", capacidad: "agenda:void", rubro: "servicios" },
  { texto: "Anotar en la lista de espera", capacidad: "waitlist:manage", rubro: "servicios" },
  { texto: "Ver y cargar clientes", capacidad: "clients:manage" },
  { texto: "Ver el teléfono y el mail de los clientes", capacidad: "clients:contact" },
  { texto: "Recibir mercadería, contar y cargar mermas", capacidad: "stock:receive" },
  { texto: "Abrir y cerrar la caja", capacidad: "cash:manage" },
  { texto: "Cambiar precios y el catálogo", capacidad: "catalog:manage" },
  { texto: "Ver costos, compras y proveedores", capacidad: "costs:read" },
  { texto: "Ver reportes y el resultado del mes", capacidad: "reports:read" },
  { texto: "Liquidar comisiones", capacidad: "commissions:manage", rubro: "servicios" },
  { texto: "Facturar y configurar los cobros", capacidad: "billing:manage" },
  { texto: "Sumar usuarios y cambiar contraseñas", capacidad: "users:manage" },
  { texto: "Ver quién hizo qué (auditoría)", capacidad: "audit:read" },
];

export type Celda = { puede: boolean; matiz?: string };
export type FilaDePermisos = { texto: string; capacidad: CapabilityPorUsuario; celdas: Celda[] };
export type TablaDePermisos = { roles: { valor: Role; nombre: string }[]; filas: FilaDePermisos[] };

// Lo que da el ROL (sin excepciones por persona): esta tabla habla de roles; las excepciones se ven
// en la matriz de abajo (matriz-core.ts).
function celda(role: Role, cap: CapabilityPorUsuario): Celda {
  if (!permisoEfectivo({ role, overrides: [] }, cap)) return { puede: false };
  if (cap === "orders:void") {
    const a = alcanceDeAnulacion(role);
    if (a?.conCodigo) return { puede: true, matiz: "Sólo lo de hoy, con motivo y el código de la dueña" };
  }
  if (cap === "agenda:void" && anulacionDeCobro(role) === "con-autorizacion") return { puede: true, matiz: "Con el código de la dueña" };
  if (role === "PROFESSIONAL" && cap.startsWith("agenda:")) return { puede: true, matiz: "Sólo lo suyo" };
  return { puede: true };
}

/** Las filas y columnas para este negocio: los roles que se pueden dar de alta acá. */
export function tablaDePermisos(esMostrador: boolean): TablaDePermisos {
  const roles = rolesParaAlta(esMostrador).map((o) => ({ valor: o.valor, nombre: etiquetaDeRol(o.valor, esMostrador) }));
  const filas = TAREAS.filter((t) => !t.rubro || (t.rubro === "mostrador") === esMostrador).map((t) => ({
    texto: t.texto,
    capacidad: t.capacidad,
    celdas: roles.map((r) => celda(r.valor, t.capacidad)),
  }));
  return { roles, filas };
}

/** Una línea por rol para el alta («Mostrador: vende, cobra, anula lo de hoy…»), derivada de la tabla. */
export function resumenDelRol(role: Role, esMostrador: boolean): string {
  const t = tablaDePermisos(esMostrador);
  const i = t.roles.findIndex((r) => r.valor === role);
  if (i === -1) return "";
  const si = t.filas.filter((f) => f.celdas[i].puede);
  if (si.length === t.filas.length) return "Todo, incluso precios, reportes y usuarios.";
  return si.map((f) => (f.celdas[i].matiz ? `${f.texto.toLowerCase()} (${f.celdas[i].matiz.toLowerCase()})` : f.texto.toLowerCase())).join(" · ");
}
