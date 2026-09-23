// ============================================================================
// CATÁLOGO DE APPS — Clientes y agenda (frente comercial).
// ============================================================================
//
// Agenda y Lista de espera van en el espacio Mostrador ("Recepción" en servicios) pero
// viven acá porque las trabaja el mismo frente que la ficha del cliente: el catálogo es por
// frente dueño, el espacio es un campo.
//
// Las cuatro apps de turnos llevan `rubro: "servicios"` (hoy `agendaOnly`): en un local de
// mostrador no hay un solo Service ni Professional (el seeder retail crea sólo Products) y
// sus formularios los piden obligatorios. Son callejones sin salida, no pantallas vacías.

import type { AppDescriptor } from "../contract";

export const APPS_COMERCIAL = [
  {
    id: "agenda",
    nombre: "Agenda",
    descripcion: "Los turnos del día por profesional.",
    icono: "agenda",
    ruta: "/admin/turnos",
    espacio: "mostrador",
    // La página pide agenda:read (turnos/page.tsx) porque el PROFESSIONAL ve SU agenda:
    // es su casa (`homeRoute`). Las sub-rutas que exigen más (turnos/lista pide
    // agenda:manage) lo siguen exigiendo en su propia página.
    capability: "agenda:read",
    modulo: "agenda",
    rubro: "servicios",
    estado: "lista",
    kpi: { id: "agenda", mide: "Turnos de hoy y qué parte ya está confirmada." },
    palabras: ["turnos", "reservas", "calendario", "citas"],
    menuDeHoy: { etiqueta: "Agenda", orden: 20 },
  },
  {
    id: "clientes",
    nombre: "Clientes",
    descripcion: "La ficha de cada cliente: datos, historial y contacto.",
    icono: "clientes",
    ruta: "/admin/clientes",
    espacio: "clientes",
    capability: "clients:read",
    modulo: "clients",
    estado: "lista",
    kpi: { id: "clientes", mide: "Clientes nuevos este mes (primera visita o primer pedido)." },
    palabras: ["fichas", "base de clientes", "historial del cliente"],
    menuDeHoy: { etiqueta: "Clientes", orden: 30 },
  },
  {
    id: "lista-de-espera",
    nombre: "Lista de espera",
    descripcion: "Quién espera un hueco, para avisarle cuando se libera.",
    icono: "espera",
    ruta: "/admin/espera",
    espacio: "mostrador",
    capability: "waitlist:manage",
    modulo: "waitlist",
    rubro: "servicios",
    estado: "lista",
    kpi: { id: "lista-de-espera", mide: "Personas esperando un turno." },
    palabras: ["cola", "waitlist", "anotados para un hueco"],
    menuDeHoy: { etiqueta: "Lista de espera", orden: 40 },
  },
  {
    id: "resenas",
    nombre: "Reseñas",
    descripcion: "Las opiniones de tus clientes y cuáles se publican.",
    icono: "resenas",
    ruta: "/admin/resenas",
    espacio: "clientes",
    capability: "reviews:manage",
    modulo: "reviews",
    rubro: "servicios",
    estado: "lista",
    kpi: { id: "resenas", mide: "Promedio de estrellas y reseñas sin publicar." },
    palabras: ["opiniones", "comentarios", "estrellas"],
    menuDeHoy: { etiqueta: "Reseñas", orden: 150 },
  },
  {
    id: "recordatorios",
    nombre: "Recordatorios",
    descripcion: "Los avisos de turno por WhatsApp.",
    icono: "recordatorios",
    ruta: "/admin/recordatorios",
    espacio: "clientes",
    capability: "reminders:manage",
    modulo: "reminders",
    rubro: "servicios",
    estado: "lista",
    kpi: { id: "recordatorios", mide: "Turnos de mañana que ya tienen el aviso." },
    palabras: ["whatsapp", "avisos", "mensajes"],
    menuDeHoy: { etiqueta: "Recordatorios", orden: 160 },
  },
  {
    id: "campanias",
    nombre: "Campañas",
    descripcion: "Quién se anotó en la campaña activa.",
    // Mismo ícono que Clientes: es el que usa la barra de hoy.
    icono: "clientes",
    ruta: "/admin/campania",
    espacio: "clientes",
    capability: "clients:read",
    modulo: "campanias",
    estado: "lista",
    kpi: { id: "campanias", mide: "Anotados en la campaña activa ('—' si la tabla no está en la base)." },
    palabras: ["obsequio", "promociones", "leads", "anotados", "apertura"],
    menuDeHoy: { etiqueta: "Campañas", orden: 190 },
  },
] as const satisfies readonly AppDescriptor[];
