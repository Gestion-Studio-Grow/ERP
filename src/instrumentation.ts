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
