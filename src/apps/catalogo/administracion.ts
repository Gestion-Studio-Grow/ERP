// ============================================================================
// CATÁLOGO DE APPS — Plataforma y Administración.
// ============================================================================
//
// Los catálogos se reparten por FRENTE DUEÑO, no por espacio (el espacio es un campo de la
// app): así dos frentes de la misma ola nunca editan el mismo archivo. Este reúne lo que no
// es de ningún dominio del negocio: el Inicio, la pantalla de "App no disponible" y la
// configuración del negocio. Todas son del núcleo (`modulo: null`): no se apagan.
//
// `menuDeHoy` reproduce la barra de hoy (rótulo y orden de ALL_ITEMS en
// src/lib/admin-nav-items.ts). Las `palabras` son los alias de hoy, sin agregar ninguno:
// en CH el buscador tiene que encontrar exactamente lo mismo que encuentra hoy.

import type { AppDescriptor } from "../contract";

export const APPS_ADMINISTRACION = [
  {
    id: "inicio",
    nombre: "Inicio",
    descripcion: "Lo que pide atención hoy y todas tus apps.",
    icono: "dashboard",
    ruta: "/admin",
    exacta: true,
    espacio: "plataforma",
    capability: "dashboard:read",
    modulo: null,
    estado: "lista",
    palabras: ["tablero", "panel", "home", "resumen"],
    menuDeHoy: { etiqueta: "Inicio", orden: 10 },
  },
  {
    // Destino de `requireApp` cuando la persona no puede abrir una app. Vive FUERA de
    // (dashboard) y sólo pide sesión: si dependiera del layout del panel, un PROFESSIONAL
    // rebotado desde una pantalla ajena podría volver a rebotar.
    id: "app-no-disponible",
    nombre: "App no disponible",
    descripcion: "Qué app no está disponible, por qué y a quién pedírsela.",
    icono: "candado",
    ruta: "/admin/no-disponible",
    espacio: "plataforma",
    capability: null,
    modulo: null,
    estado: "lista",
    enLanzador: false,
  },
  {
    id: "auditoria",
    nombre: "Auditoría",
    descripcion: "Quién hizo qué y cuándo.",
    icono: "auditoria",
    ruta: "/admin/auditoria",
    espacio: "administracion",
    capability: "audit:read",
    modulo: null,
    estado: "lista",
    kpi: { id: "auditoria", mide: "Acciones registradas hoy." },
    palabras: ["log", "historial", "quien hizo que", "registro"],
    menuDeHoy: { etiqueta: "Auditoría", orden: 210 },
  },
  {
    id: "usuarios",
    nombre: "Usuarios y permisos",
    descripcion: "Quién entra al sistema y qué puede hacer cada uno.",
    icono: "usuarios",
    ruta: "/admin/usuarios",
    espacio: "administracion",
    capability: "users:manage",
    modulo: null,
    estado: "lista",
    kpi: { id: "usuarios", mide: "Usuarios activos." },
    palabras: ["empleados", "permisos", "roles", "accesos", "contrasena"],
    menuDeHoy: { etiqueta: "Usuarios", orden: 220 },
  },
  {
    id: "datos-del-negocio",
    nombre: "Datos del negocio",
    descripcion: "Dirección, teléfono y horarios que ven tus clientes.",
    icono: "localizacion",
    ruta: "/admin/localizacion",
    espacio: "administracion",
    capability: "location:manage",
    modulo: null,
    estado: "lista",
    palabras: ["direccion", "ubicacion", "contacto", "sucursal", "telefono"],
    menuDeHoy: { etiqueta: "Localización", orden: 230 },
  },
  {
    id: "apariencia",
    nombre: "Apariencia",
    descripcion: "El color del equipo y el tema claro u oscuro del panel.",
    icono: "apariencia",
    ruta: "/admin/apariencia",
    espacio: "administracion",
    capability: "appearance:manage",
    modulo: null,
    estado: "lista",
    palabras: ["tema", "color", "modo oscuro", "marca"],
    menuDeHoy: { etiqueta: "Apariencia", orden: 240 },
  },
] as const satisfies readonly AppDescriptor[];
