import type { Instrumentation } from "next";

/**
 * Arranque del servidor (Next `register`, una vez por instancia).
 *
 * ENG-123: si producción arranca con la facturación encendida y ARCA en modo simulado, lo deja en
 * el log de error. No tumba la app (turnos, ventas y cobros siguen); la emisión ya falla cerrado
 * (src/lib/fiscal/guarda-simulado.ts) y `/api/health` lo expone en `arca.simuladoEnProduccion`.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reportarArcaSimuladoAlArrancar } = await import("@/lib/fiscal/guarda-simulado");
  reportarArcaSimuladoAlArrancar();
}

/**
 * Todo error de servidor que Next captura (render, route handler, server action, proxy) deja UNA
 * línea estructurada en el log, con la ruta y el `digest` que ve el usuario en la pantalla de error:
 * así un «algo salió mal» reportado por un cliente se puede buscar en los logs de Vercel.
 *
 * No viajan headers (cookies, tokens) ni el query string (puede traer datos de clientes): sólo el
 * path. No relanza ni falla: un problema al loguear no puede tapar el error original.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  try {
    const digest =
      typeof err === "object" && err !== null && "digest" in err ? String(err.digest) : undefined;
    const ctx = {
      digest,
      method: request.method,
      path: request.path.split("?")[0],
      routePath: context.routePath,
      routeType: context.routeType,
      routerKind: context.routerKind,
    };
    if (process.env.NEXT_RUNTIME === "nodejs") {
      const { logger } = await import("@/lib/logger");
      logger.error("next.request", "error de servidor no manejado", err, ctx);
    } else {
      // Edge: el logger usa AsyncLocalStorage de Node; acá va una línea JSON equivalente.
      const message = err instanceof Error ? err.message : String(err);
      console.error(JSON.stringify({ level: "error", scope: "next.request", msg: message, ...ctx }));
    }
  } catch {
    // Nunca romper por loguear.
  }
};
