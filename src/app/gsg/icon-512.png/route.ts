// GSG · /gsg/icon-512.png — ícono de app genérico 512×512. El manifiesto lo declara también `maskable`
// (manifest-core.ts): por eso va con zona segura, el isotipo al 50 % del lado, que ningún recorte toca.
import { pngGsg } from "../icono-png";

export const dynamic = "force-static";

export function GET() {
  return pngGsg(512, { zonaSegura: true });
}
