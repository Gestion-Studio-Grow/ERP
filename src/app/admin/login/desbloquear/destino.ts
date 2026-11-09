// El `?error=` del login según por qué el desbloqueo pide la contraseña (textos en login-core.ts).

export type MotivoDeContrasenia = "sin-sesion" | "vencida" | "sin-pin" | "sin-intentos";

export function errorDelLoginPara(motivo: MotivoDeContrasenia): string {
  if (motivo === "sin-intentos") return "pin";
  if (motivo === "sin-pin") return "inactiva";
  return "vencida";
}
