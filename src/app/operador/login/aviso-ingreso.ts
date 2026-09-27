// Lo que dice la pantalla de /operador/login: la pista del usuario y el aviso de error.
//
// POR QUÉ (2026-09-27). El dueño cambió OPERATOR_PASSWORD en Vercel, redeployó y no pudo entrar,
// sin nada en pantalla que le dijera qué revisar: el campo decía «Operador» con un placeholder que
// desaparece al tipear, el error era «Nombre o clave incorrectos» y el freno anti fuerza bruta decía
// «unos minutos». Ahora la pantalla dice con qué usuario entra el dueño (su nombre no es secreto),
// de dónde sale la clave y cuánto falta para que se destrabe.
//
// Puro y sin servidor: lo usan la página y la acción de login (src/lib/operator-actions.ts), y los
// tests lo ejecutan (aviso-ingreso.test.ts).

import { LOGIN_RULE } from "@/lib/rate-limit";

/** La ventana del freno de login, en minutos (hoy 15). Nunca se espera más que eso. */
export const MINUTOS_DE_LA_VENTANA = Math.ceil(LOGIN_RULE.windowMs / 60_000);

/** Los ms que devuelve el limitador, en minutos enteros para mostrar: hacia arriba, de 1 a la ventana. */
export function minutosDeEspera(ms: number): number {
  if (!Number.isFinite(ms) || ms <= 0) return 1;
  return Math.min(MINUTOS_DE_LA_VENTANA, Math.max(1, Math.ceil(ms / 60_000)));
}

/** `?min=` de la dirección: sólo un entero de 1 a la ventana. Cualquier otra cosa, `null`. */
export function leerMinutos(raw: string | undefined): number | null {
  if (!raw || !/^\d{1,3}$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 1 && n <= MINUTOS_DE_LA_VENTANA ? n : null;
}

/** La pista visible debajo del campo Usuario, con el nombre del dueño configurado. */
export function pistaDelUsuario(duenio: string): string {
  return `Si sos el dueño: dejalo vacío o escribí «${duenio}»`;
}

export interface AvisoDeIngreso {
  titulo: string;
  detalle: string;
}

/** El aviso según `?error=`: `throttled` = el freno por conexión; cualquier otro = usuario o clave. */
export function avisoDeIngreso(error: string | undefined, minutos: number | null, duenio: string): AvisoDeIngreso | null {
  if (!error) return null;
  if (error === "throttled") {
    const espera = minutos === null ? "unos minutos" : minutos === 1 ? "1 minuto" : `${minutos} minutos`;
    return {
      titulo: "Demasiados intentos fallidos desde esta conexión.",
      detalle:
        `Esperá ${espera} y volvé a probar. El freno cuenta por conexión: si cambiás de red ` +
        `(por ejemplo, a los datos del celular), arranca de cero.`,
    };
  }
  return {
    titulo: "Usuario o clave incorrectos.",
    detalle: `Si sos el dueño, el usuario va vacío o «${duenio}», y la clave es la de OPERATOR_PASSWORD en Vercel (Production).`,
  };
}

/** La dirección a la que vuelve un login frenado, con los minutos que faltan. */
export function direccionFrenada(next: string, msQueFaltan: number): string {
  return `/operador/login?error=throttled&min=${minutosDeEspera(msQueFaltan)}&next=${encodeURIComponent(next)}`;
}
