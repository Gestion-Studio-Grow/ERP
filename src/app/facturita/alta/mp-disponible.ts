// El alta es estática (se arma en el build): lo que se lee acá es el entorno del build de Vercel,
// el mismo de producción. Sólo se mira SI está la app de MP cargada; nunca sale un secreto.
import { configOAuthMP } from "@/plugins/mercadopago/oauth-mp";

export function conexionMPDisponibleEnElAlta(env: Record<string, string | undefined> = process.env): boolean {
  return configOAuthMP(env) !== null && Boolean(env.INTEGRACIONES_MASTER_KEY?.trim());
}
