// Selectores y rutas de OpenKey: el ÚNICO lugar que conoce la pantalla.
// ============================================================================
// PROVISIONALES: hoy calzan con el OpenKey SIMULADO (openkey-simulado.mjs). Cuando CH consiga acceso
// (y autorización escrita) se calibran contra el real [A VALIDAR] y no se toca nada más del RPA.

/** Rutas relativas a OPENKEY_URL. */
export const RUTAS = {
  login: "/login",
  listado: "/vouchers",
};

/** Selectores CSS. */
export const SEL = {
  // Login
  formLogin: "form#login",
  usuario: "#usuario",
  clave: "#clave",
  ingresar: "#ingresar",
  errorLogin: ".error-login",
  // Listado y búsqueda por número
  campoBuscar: "#buscar",
  botonBuscar: "#boton-buscar",
  /** Marca de «la búsqueda terminó» para un número dado. */
  resultadosDe: (numero) => `#resultados[data-busqueda="${escaparAtributo(numero)}"]`,
  filaDe: (numero) => `tr[data-numero="${escaparAtributo(numero)}"]`,
  estadoEnFila: ".estado",
  botonBaja: "button.dar-de-baja",
  // Confirmación de la baja
  confirmarBaja: "#confirmar-baja",
  bajaHecha: "#baja-hecha",
};

/** Texto del estado en OpenKey → el nuestro. Lo que no esté acá es DESCONOCIDO (no se toca). */
export const ESTADOS = {
  disponible: "DISPONIBLE",
  activo: "DISPONIBLE",
  vigente: "DISPONIBLE",
  usado: "BAJA",
  utilizado: "BAJA",
  "dado de baja": "BAJA",
  baja: "BAJA",
  anulado: "ANULADO",
  vencido: "ANULADO",
};

export function estadoDesdeTexto(texto) {
  const t = String(texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  return ESTADOS[t] ?? "DESCONOCIDO";
}

function escaparAtributo(v) {
  return String(v).replace(/["\\]/g, "\\$&");
}
