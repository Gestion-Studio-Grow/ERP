// Política de fuerza de contraseña (mínimo verificable) para las contraseñas que ELIGE
// una persona (el cambio forzado en /admin). NO se aplica a la temporal generada por el
// sistema (`generateStrongPassword`) que ya es aleatoria de alta entropía.
//
// Criollo claro (ADR-046, zona humana): los mensajes son para la pyme, no jerga. Regla
// simple y honesta: largo mínimo + que no sea puro número ni puras letras (obliga a
// mezclar), sin exigir símbolos raros que la gente termina anotando en un papel.
//
// FUENTE ÚNICA: la usan el server action de cambio (fuente de verdad, revalida siempre) y
// el formulario cliente (feedback en vivo). Nunca confiar solo en el cliente.

export const MIN_PASSWORD_LENGTH = 10;

export type PasswordCheck = {
  ok: boolean;
  problems: string[];
};

// Devuelve todos los problemas (no corta en el primero) para poder mostrarlos juntos.
export function validatePasswordStrength(password: string): PasswordCheck {
  const problems: string[] = [];
  const pw = password ?? "";

  if (pw.length < MIN_PASSWORD_LENGTH) {
    problems.push(`Tiene que tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }
  const hasLetter = /\p{L}/u.test(pw);
  const hasNumber = /\d/.test(pw);
  if (!hasLetter || !hasNumber) {
    problems.push("Combiná letras y números (no la dejes solo con números ni solo con letras).");
  }
  // Evita "aaaaaaaaaa" / "1111111111": si hay un único carácter repetido, no sirve.
  if (pw.length > 0 && new Set(pw).size < 4) {
    problems.push("Usá una combinación menos repetitiva.");
  }

  return { ok: problems.length === 0, problems };
}
