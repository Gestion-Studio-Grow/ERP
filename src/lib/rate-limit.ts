// Rate limiter EN MEMORIA (por proceso) — Célula 2 (Confiabilidad / seguridad).
//
// Primera línea contra fuerza bruta en los logins. Ventana deslizante: cuenta los
// intentos FALLIDOS por clave (IP) dentro de una ventana; al superar el máximo,
// bloquea hasta que la ventana se libere. Se resetea al login exitoso.
//
// Alcance y límites (decisión consciente, documentada):
//  - Estado POR PROCESO: no se comparte entre instancias de la función serverless.
//    Para el volumen actual (1–2 tenants) alcanza — un atacante golpea mayormente
//    una misma instancia. El upgrade natural (cuando escale) es un store externo
//    (Upstash/Redis) detrás de la MISMA interfaz `RateLimiter`.
//  - Clave por IP (no por email): frenar fuerza bruta sin habilitar un DoS de
//    "bloqueá la cuenta ajena spammeando su email". Tradeoff aceptado.
//
// Diseño testeable: `now()` es inyectable (tests con reloj falso) y el store es
// interno al limitador (cada instancia es independiente).

export type RateLimitRule = { max: number; windowMs: number };

export interface RateLimiter {
  /** Registra un intento fallido para la clave. */
  fail(key: string): void;
  /** ¿La clave superó el máximo de fallos dentro de la ventana? */
  blocked(key: string): boolean;
  /** Limpia los fallos de la clave (llamar al login exitoso). */
  reset(key: string): void;
  /** Milisegundos hasta que la clave se desbloquee (0 si no está bloqueada). */
  retryAfterMs(key: string): number;
}

export function createRateLimiter(
  rule: RateLimitRule,
  now: () => number = Date.now,
): RateLimiter {
  const hits = new Map<string, number[]>();

  // Devuelve (y persiste) los timestamps de la clave que siguen dentro de la ventana.
  const prune = (key: string): number[] => {
    const t = now();
    const kept = (hits.get(key) ?? []).filter((ts) => t - ts < rule.windowMs);
    if (kept.length) hits.set(key, kept);
    else hits.delete(key);
    return kept;
  };

  return {
    fail(key) {
      const arr = prune(key);
      arr.push(now());
      hits.set(key, arr);
    },
    blocked(key) {
      return prune(key).length >= rule.max;
    },
    reset(key) {
      hits.delete(key);
    },
    retryAfterMs(key) {
      const arr = prune(key);
      if (arr.length < rule.max) return 0;
      const oldest = Math.min(...arr);
      return Math.max(0, rule.windowMs - (now() - oldest));
    },
  };
}

// Regla de LOGIN: 5 fallos / 15 min por IP. Un limitador único compartido por los
// dos planos de login (admin y operador), separados por prefijo de clave.
export const LOGIN_RULE: RateLimitRule = { max: 5, windowMs: 15 * 60 * 1000 };
export const loginRateLimiter: RateLimiter = createRateLimiter(LOGIN_RULE);

/** Clave de login por plano + IP. */
export function loginKey(plano: "admin" | "operator", ip: string): string {
  return `${plano}-login:${ip}`;
}
