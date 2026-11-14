// GSG · los mails de la PLATAFORMA (código para entrar, constancias de trámites de GSG) con el logo v10 en el
// encabezado. Los clientes de correo no muestran SVG: el logo va como PNG servido por /gsg/logo-mail.png (generado
// con next/og desde esta misma fuente, sin binarios en Git) y con alt «Gestión Studio Grow». Los mails que manda un
// negocio con su marca (recordatorios de turno) NO pasan por acá. PURO: sin red ni base, testeable.

import { GSG_COBRE, GSG_GRAFITO, GSG_PAPEL, ISOTIPO_GSG, LOGO_GSG_ALTO_MINIMO, LOGO_GSG_V10 } from "./marca-svg";

export const RUTA_LOGO_MAIL_GSG = "/gsg/logo-mail.png";

/** Medidas: el PNG sale al doble (pantallas densas) y se muestra al alto mínimo de la marca con nombre (56 px). */
export const LOGO_MAIL_GSG = {
  alto: LOGO_GSG_ALTO_MINIMO,
  ancho: Math.round((LOGO_GSG_ALTO_MINIMO * LOGO_GSG_V10.ancho) / LOGO_GSG_V10.alto),
  escalaPng: 2,
} as const;

/** El logo v10 sobre papel, con colores fijos (el rasterizador no entiende `var()` ni `currentColor`). */
export function logoMailGsgSvg(): string {
  const L = LOGO_GSG_V10;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${L.viewBox}">` +
    `<rect width="${L.ancho}" height="${L.alto}" fill="${GSG_PAPEL}"/>` +
    `<g transform="${L.isotipo}"><path fill="${GSG_GRAFITO}" d="${ISOTIPO_GSG.forma}"/><path fill="${GSG_COBRE}" d="${ISOTIPO_GSG.nudo}"/></g>` +
    `<path fill="${GSG_GRAFITO}" d="${L.nombre}"/><path fill="${GSG_COBRE}" d="${L.tm}"/></svg>`
  );
}

/** Origen público de la plataforma (`https://gsgapp.com.ar`) desde `APP_BASE_DOMAIN`; sin la variable, null. */
export function origenPlataforma(dominio = process.env.APP_BASE_DOMAIN): string | null {
  const d = dominio?.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return d ? `https://${d}` : null;
}

const escapar = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/**
 * El mail en HTML: el logo arriba sobre papel y el mismo texto plano debajo (escapado, con sus saltos de línea).
 * Tablas y estilos en línea: es lo único que respetan todos los clientes de correo.
 */
export function htmlMailGsg({ cuerpo, origen }: { cuerpo: string; origen: string }): string {
  const { ancho, alto } = LOGO_MAIL_GSG;
  const parrafos = cuerpo
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px">${escapar(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  return (
    `<!doctype html><html lang="es-AR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>` +
    `<body style="margin:0;padding:0;background:${GSG_PAPEL}">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${GSG_PAPEL}"><tr><td align="center" style="padding:24px 16px">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">` +
    `<tr><td style="padding:0 0 16px"><img src="${escapar(origen)}${RUTA_LOGO_MAIL_GSG}" width="${ancho}" height="${alto}" alt="Gestión Studio Grow" style="display:block;border:0;width:${ancho}px;height:${alto}px"></td></tr>` +
    `<tr><td style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:${GSG_GRAFITO}">${parrafos}</td></tr>` +
    `</table></td></tr></table></body></html>`
  );
}

/** La versión HTML con el logo de GSG, sólo para los mails de la plataforma y con el origen público conocido. */
export function htmlDePlataforma(d: { cuerpo: string; marcaGsg?: boolean }, origen = origenPlataforma()): { html?: string } {
  return d.marcaGsg && origen ? { html: htmlMailGsg({ cuerpo: d.cuerpo, origen }) } : {};
}
