// Texto para la pantalla: reglas chicas de escritura que se repetían en varias pantallas.
// Puro (sin framework): sirve en servidor, en cliente y en los tests.

/** La primera letra en mayúscula y el resto como viene: «septiembre 2026» → «Septiembre 2026». */
export function mayuscula(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
