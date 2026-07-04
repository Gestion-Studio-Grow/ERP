// Datos del negocio que hoy no están en la base de datos (no hay todavía un
// módulo de "configuración general"). Centralizados acá para cambiarlos en
// un solo lugar. TODO: mover a una tabla BusinessSettings editable desde el
// admin cuando haya más de un cliente usando el sistema.

export const BUSINESS_WHATSAPP = "5491100000000"; // reemplazar por el número real (sin +, sin espacios)

// Minutos de margen que se reservan automáticamente después de cada turno
// (limpieza del box, preparación del siguiente cliente). Se aplica al
// calcular disponibilidad, no es un turno visible en la agenda.
export const BUFFER_MIN = 10;

// Zona horaria del negocio (AMD-004). Es CONFIGURACIÓN, no la zona del
// servidor: en Netlify el server corre en UTC, así que interpretar las horas
// de atención con la zona del servidor daría horarios corridos. Toda hora de
// pared ("09:00") se interpreta en esta zona y se persiste en UTC.
// TODO (G1): pasar a columna por-tenant cuando llegue multi-tenant.
export const BUSINESS_TIMEZONE = "America/Argentina/Buenos_Aires";
