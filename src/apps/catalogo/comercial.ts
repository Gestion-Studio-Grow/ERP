// ============================================================================
// CATÁLOGO DE APPS — Clientes y agenda (frente comercial).
// ============================================================================
//
// Agenda y Lista de espera van en el espacio Mostrador ("Recepción" en servicios) pero
// viven acá porque las trabaja el mismo frente que la ficha del cliente: el catálogo es por
// frente dueño, el espacio es un campo.
//
// Las apps de turnos llevan `rubro: "servicios"` (hoy `agendaOnly`): en un local de
// mostrador no hay un solo Service ni Professional (el seeder retail crea sólo Products) y
// sus formularios los piden obligatorios. Son callejones sin salida, no pantallas vacías.
//
// Ola 3 (frente comercial): la bandeja "Para contactar hoy", "Clientes por recuperar",
// "Unificar fichas duplicadas" y "Confirmar turnos de mañana" como app propia. Ninguna lleva
// `menuDeHoy`: no estaban en la barra de hoy, así que CH no las ve en su menú hasta pasarse al
// Inicio por apps. Sus números salen del motor comercial (src/lib/crm) con las MISMAS lecturas
// que sus pantallas (src/apps/kpis/comercial.server.ts).

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
    // El número es del negocio entero ("18 turnos hoy"): el PROFESSIONAL ve SU agenda, y un
    // número que no coincide con su pantalla le mentiría. Por eso pide agenda:manage.
    kpi: { id: "agenda", mide: "Turnos de hoy y qué parte ya está confirmada.", capability: "agenda:manage" },
    palabras: ["turnos", "reservas", "calendario", "citas"],
    menuDeHoy: { etiqueta: "Agenda", orden: 20 },
  },
  {
    id: "confirmar-manana",
    nombre: "Confirmar turnos de mañana",
    descripcion: "Avisar por WhatsApp a quienes tienen turno mañana, con el texto listo.",
    icono: "agenda",
    ruta: "/admin/turnos/manana",
    espacio: "mostrador",
    // La pide su loader (`getMananaConfirmar`): confirmar es de quien gestiona la agenda, no del
    // profesional.
    capability: "agenda:manage",
    modulo: "agenda",
    rubro: "servicios",
    estado: "lista",
    kpi: { id: "confirmar-manana", mide: "Turnos de mañana que todavía no tienen el aviso." },
    palabras: ["mañana", "confirmar turnos", "avisar", "recordatorio manual", "wsp"],
  },
  {
    id: "clientes",
    nombre: "Clientes",
    descripcion: "La ficha de cada cliente: turnos, pedidos, lo que debe y si quiere mensajes.",
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
    // Sólo el conteo: los huecos liberados cruzan tres lecturas (auditoría, turnos y anotados)
    // y un número del Inicio hace UNA. La pantalla los muestra arriba de todo.
    kpi: { id: "lista-de-espera", mide: "Personas esperando un turno." },
    palabras: ["cola", "waitlist", "anotados para un hueco"],
    menuDeHoy: { etiqueta: "Lista de espera", orden: 40 },
  },
  {
    id: "para-contactar-hoy",
    nombre: "Para contactar hoy",
    descripcion: "A quién escribirle hoy y por qué, con el WhatsApp listo.",
    icono: "clientes",
    ruta: "/admin/clientes/hoy",
    espacio: "clientes",
    // Ver la bandeja pide clients:read; dejar la constancia del contacto, clients:manage (la
    // acción). Las dos las tienen la dueña y la recepción.
    capability: "clients:read",
    modulo: "clients",
    estado: "lista",
    kpi: { id: "para-contactar-hoy", mide: "Clientes para escribir hoy: cumpleaños, por recuperar y reseñas." },
    palabras: ["bandeja", "contactar", "cumpleaños", "cumple", "whatsapp", "wsp", "pedir reseña"],
  },
  {
    id: "clientas-por-recuperar",
    nombre: "Clientes por recuperar",
    descripcion: "Quiénes pasaron su ciclo de siempre sin volver, con la regla a la vista.",
    icono: "clientes",
    ruta: "/admin/clientes/recuperar",
    espacio: "clientes",
    capability: "clients:read",
    modulo: "clients",
    estado: "lista",
    kpi: {
      id: "clientas-por-recuperar",
      mide: "Clientes en riesgo de no volver (entre 1,5 y 3 ciclos sin venir).",
      monto: { mide: "Lo que dejan por año si no vuelven (estimado).", capability: "reports:read" },
    },
    palabras: ["recuperar", "reactivar", "en riesgo", "no vuelven", "perdidas"],
  },
  {
    id: "unificar-fichas",
    nombre: "Unificar fichas duplicadas",
    descripcion: "Juntar en una las fichas de la misma persona, con su historial.",
    icono: "clientes",
    ruta: "/admin/clientes/duplicadas",
    espacio: "clientes",
    // Sólo la dueña o el dueño: unificar borra fichas, y se deshace a mano desde la auditoría
    // (quedan los ids movidos). Es la única capability de sólo-dueño que va con eso: quien
    // unifica tiene que poder leer el rastro para volver atrás.
    capability: "audit:read",
    modulo: "clients",
    estado: "lista",
    kpi: { id: "unificar-fichas", mide: "Grupos de fichas con el mismo teléfono escrito distinto." },
    palabras: ["duplicadas", "duplicados", "fusionar", "juntar fichas", "unir fichas"],
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
