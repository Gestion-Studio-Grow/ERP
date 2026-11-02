// Lo que habla con Cloudflare R2. Sin las variables de entorno no hay nube y todo sigue como antes: imagen achicada, PDF chico y links.

import "server-only";
import { urlFirmada, type ConfigR2 } from "./r2-core";

export function configR2(): ConfigR2 | null {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_ENDPOINT } = process.env;
  const endpoint = R2_ENDPOINT || (R2_ACCOUNT_ID ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : "");
  if (!endpoint || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) return null;
  return { endpoint, bucket: R2_BUCKET, accessKey: R2_ACCESS_KEY_ID, secret: R2_SECRET_ACCESS_KEY, region: "auto" };
}

/** Lo que de verdad pesa el archivo en la nube, o null si no llegó. El navegador puede declarar cualquier cosa. */
export async function tamanoEnNube(c: ConfigR2, clave: string): Promise<number | null> {
  const r = await fetch(urlFirmada(c, { metodo: "HEAD", clave, ahora: new Date(), segundos: 60 }), { method: "HEAD", cache: "no-store" });
  if (!r.ok) return null;
  const n = Number(r.headers.get("content-length"));
  return Number.isFinite(n) ? n : null;
}

/** Borrar en la nube no frena a quien borra: si falla queda un archivo huérfano y su rastro en el log. */
export async function borrarDeNube(clave: string): Promise<void> {
  const c = configR2();
  if (!c) return console.error(`[proyectos] sin nube configurada: quedó sin borrar ${clave}`);
  try {
    const r = await fetch(urlFirmada(c, { metodo: "DELETE", clave, ahora: new Date(), segundos: 60 }), { method: "DELETE", cache: "no-store" });
    if (!r.ok && r.status !== 404) console.error(`[proyectos] la nube respondió ${r.status} al borrar ${clave}`);
  } catch (e) {
    console.error(`[proyectos] no se pudo borrar ${clave} de la nube`, e);
  }
}
