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
//  - Login del operador: clave por IP. Login del panel: IP + email con dos techos
//    (`createLoginGuard`, más abajo): la clave sólo por IP dejaba afuera a todo un local
//    que comparte el wifi.
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

// ── Login del panel: IP + email, con dos techos (UAT 16/10, C9) ──────────────────────────
//
// Con la clave sólo por IP, en un local con un wifi compartido una empleada que se equivoca
// cinco veces dejaba afuera a TODO el local durante 15 minutos (todas salen por la misma IP).
// Ahora el corte de 5 fallos es por IP + email: frena a quien se equivoca, no a la compañera.
// Para que eso no abra la puerta a la fuerza bruta, quedan dos techos más:
//  - por EMAIL desde cualquier IP (20 / 15 min): una botnet que prueba la clave de una cuenta
//    desde muchas IPs se frena igual. Costo aceptado: alguien que conoce el email puede trabar
//    esa cuenta un rato tipeando mal (el mismo tradeoff de antes, ahora acotado a una cuenta y
//    con un umbral 4 veces más alto, en vez de trabar a todo el local);
//  - por IP con cualquier email (30 / 15 min): desde una misma red no se puede barrer una
//    lista de emails de a 4 intentos cada uno.
// El login bueno limpia sólo el par IP + email: los techos no se resetean, así quien adivina
// una clave no le regala presupuesto nuevo a un ataque en curso.
export const LOGIN_EMAIL_RULE: RateLimitRule = { max: 20, windowMs: 15 * 60 * 1000 };
export const LOGIN_IP_RULE: RateLimitRule = { max: 30, windowMs: 15 * 60 * 1000 };

export interface LoginGuard {
  /** ¿Está frenado este intento (por el par, por el email o por la IP)? */
  blocked(ip: string, email: string): boolean;
  /** Un intento fallido suma a los tres contadores. */
  fail(ip: string, email: string): void;
  /** Login bueno: limpia el par IP + email. */
  succeed(ip: string, email: string): void;
}

export function createLoginGuard(now: () => number = Date.now): LoginGuard {
  const par = createRateLimiter(LOGIN_RULE, now);
  const porEmail = createRateLimiter(LOGIN_EMAIL_RULE, now);
  const porIp = createRateLimiter(LOGIN_IP_RULE, now);
  const claves = (ip: string, email: string) => {
    const e = email.trim().toLowerCase();
    return { par: `admin-login:${ip}:${e}`, email: `admin-login-email:${e}`, ip: `admin-login-ip:${ip}` };
  };
  return {
    blocked(ip, email) {
      const k = claves(ip, email);
      return par.blocked(k.par) || porEmail.blocked(k.email) || porIp.blocked(k.ip);
    },
    fail(ip, email) {
      const k = claves(ip, email);
      par.fail(k.par);
      porEmail.fail(k.email);
      porIp.fail(k.ip);
    },
    succeed(ip, email) {
      par.reset(claves(ip, email).par);
    },
  };
}

export const adminLoginGuard: LoginGuard = createLoginGuard();

// Regla de la API PÚBLICA de ingesta (`/api/public/v1/*`): anti-flood. A
// diferencia del login (cuenta fallos), acá cada request cuenta como un "hit"
// (`fail()` = registrar hit) — el mismo contador de ventana deslizante sirve
// como rate limiter de tráfico. Más permisiva que el login porque es tráfico
// legítimo de un front externo, pero acota ráfagas que quemarían compute de Neon.
// 60 req / min por IP.
export const PUBLIC_API_RULE: RateLimitRule = { max: 60, windowMs: 60 * 1000 };
export const publicApiRateLimiter: RateLimiter = createRateLimiter(PUBLIC_API_RULE);

/** Clave de la API pública por IP. */
export function publicApiKey(ip: string): string {
  return `public-api:${ip}`;
}

/**
 * IP del cliente a partir de un `Request` (rutas de la API pública, que reciben
 * el `Request` crudo y no usan `headers()` de next). Best-effort: detrás del
 * edge de Netlify la IP real viaja en `x-forwarded-for`. `"unknown"` como
 * fallback agrupa el tráfico sin IP bajo una misma clave (se lo limita igual).
 */
export function clientIpFromRequest(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * Chequea y registra un hit de la API pública para una IP. Devuelve los
 * segundos de espera (`Retry-After`) si la IP superó el límite, o `null` si el
 * request puede seguir. El hit solo se registra cuando NO está bloqueada, para
 * que la ventana se libere sola (no se penaliza extra al que ya está frenado).
 */
export function checkPublicApiRate(ip: string): number | null {
  const key = publicApiKey(ip);
  if (publicApiRateLimiter.blocked(key)) {
    return Math.ceil(publicApiRateLimiter.retryAfterMs(key) / 1000);
  }
  publicApiRateLimiter.fail(key);
  return null;
}
