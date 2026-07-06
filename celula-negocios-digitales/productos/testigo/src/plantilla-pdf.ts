/**
 * Render del PARTE ESTRUCTURADO a HTML (plantilla control de plagas).
 * El HTML luego se convierte a PDF (Playwright/wkhtmltopdf). Se separa a propósito: el JSON del
 * parte es la fuente de verdad y el PDF es derivado — cambiar el diseño no re-llama al modelo.
 *
 * La plantilla es configurable por contratista (logo, colores, pie legal) vía ConfigContratista.
 */
import type { TParteEstructurado } from "./esquema-parte.js";
import { PENDIENTE } from "./esquema-parte.js";
import type { ConfigContratista } from "./tipos.js";

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

/** Marca visualmente los campos regulatorios que quedaron pendientes. */
const val = (s: string): string =>
  s === PENDIENTE ? `<span class="pendiente">⚠ PENDIENTE</span>` : esc(s);

const TIPO_LABEL: Record<string, string> = {
  desinsectacion: "Desinsectación",
  desratizacion: "Desratización",
  desinfeccion: "Desinfección",
  desinfestacion: "Desinfestación",
};

/** Devuelve el HTML completo (autocontenido) del parte, listo para imprimir a PDF. */
export function renderParteHTML(parte: TParteEstructurado, config: ConfigContratista): string {
  const productos = parte.productosAplicados
    .map(
      (p) => `<tr>
      <td>${val(p.nombreComercial)}</td>
      <td>${val(p.principioActivo)}</td>
      <td>${val(p.numeroRegistro)}</td>
      <td>${val(p.dosis)}</td>
      <td>${esc(p.metodoAplicacion)}</td>
    </tr>`,
    )
    .join("");

  const checklist = parte.checklist
    .map(
      (c) =>
        `<li><b>${esc(c.punto)}</b> — <span class="estado ${c.estado}">${c.estado.toUpperCase()}</span>${
          c.detalle ? ` · ${esc(c.detalle)}` : ""
        }</li>`,
    )
    .join("");

  const fotos = parte.fotos
    .map(
      (f) => `<figure>
      <div class="ph">[foto: ${esc(f.momento)}]</div>
      <figcaption><b>${esc(f.momento)}:</b> ${esc(f.epigrafe)}</figcaption>
    </figure>`,
    )
    .join("");

  const advertencias = parte.advertenciasSeguridad.map((a) => `<li>${esc(a)}</li>`).join("");
  const areas = parte.areasTratadas.map((a) => esc(a)).join(", ");
  const tipos = parte.tipoServicio.map((t) => TIPO_LABEL[t] ?? t).join(" · ");

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<style>
  :root { --tinta:#1f3a2e; --acento:#2f8f6b; --gris:#666; }
  * { box-sizing:border-box; }
  body { font-family:"Segoe UI",Arial,sans-serif; color:#222; margin:0; padding:32px; font-size:13px; }
  header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid var(--acento); padding-bottom:12px; }
  header .empresa { font-size:18px; font-weight:700; color:var(--tinta); }
  header .meta { text-align:right; color:var(--gris); font-size:12px; }
  h1 { font-size:15px; color:var(--acento); text-transform:uppercase; letter-spacing:.5px; margin:20px 0 6px; border-bottom:1px solid #ddd; padding-bottom:3px; }
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:6px 24px; }
  .campo b { color:var(--tinta); }
  table { width:100%; border-collapse:collapse; margin-top:6px; }
  th,td { border:1px solid #ccc; padding:5px 7px; text-align:left; font-size:12px; }
  th { background:var(--tinta); color:#fff; font-weight:600; }
  ul { margin:6px 0; padding-left:18px; }
  .estado.ok { color:var(--acento); font-weight:700; }
  .estado.observado { color:#c47f00; font-weight:700; }
  .estado.no_aplica { color:var(--gris); }
  .pendiente { color:#b00; font-weight:700; }
  .fotos { display:flex; flex-wrap:wrap; gap:12px; }
  figure { margin:0; width:calc(50% - 6px); }
  .ph { background:#eef2f0; border:1px dashed #aaa; height:120px; display:flex; align-items:center; justify-content:center; color:#999; font-size:11px; }
  figcaption { font-size:11px; color:#444; margin-top:3px; }
  .firma { margin-top:36px; display:flex; justify-content:space-between; }
  .firma div { text-align:center; width:45%; }
  .firma .linea { border-top:1px solid #333; margin-top:40px; padding-top:4px; font-size:12px; }
  footer { margin-top:24px; border-top:1px solid #ddd; padding-top:8px; color:var(--gris); font-size:10px; }
</style></head>
<body>
  <header>
    <div>
      <div class="empresa">${esc(config.nombreEmpresa)}</div>
      <div style="color:var(--gris)">Control de plagas · Matrícula ${esc(config.matriculaEmpresa)}</div>
    </div>
    <div class="meta">
      <div><b>PARTE N° ${esc(config.numeroParte)}</b></div>
      <div>Técnico: ${esc(config.operarioNombre)}</div>
    </div>
  </header>

  <h1>Datos del servicio</h1>
  <div class="grid">
    <div class="campo"><b>Cliente:</b> ${esc(config.cliente?.nombre ?? "—")}</div>
    <div class="campo"><b>Establecimiento:</b> ${esc(parte.tipoEstablecimiento)}</div>
    <div class="campo"><b>Dirección:</b> ${esc(config.cliente?.direccion ?? "—")}</div>
    <div class="campo"><b>Modalidad:</b> ${esc(parte.modalidad)}</div>
    <div class="campo"><b>Tipo de servicio:</b> ${tipos}</div>
    <div class="campo"><b>Plagas objetivo:</b> ${parte.plagasObjetivo.map(esc).join(", ")}</div>
    <div class="campo"><b>Áreas tratadas:</b> ${areas}</div>
    <div class="campo"><b>Nivel de infestación:</b> ${esc(parte.nivelInfestacion)}</div>
  </div>

  <h1>Diagnóstico (situación encontrada)</h1>
  <p>${esc(parte.diagnostico)}</p>

  <h1>Productos aplicados</h1>
  <table>
    <thead><tr><th>Producto</th><th>Principio activo</th><th>N° registro</th><th>Dosis</th><th>Método</th></tr></thead>
    <tbody>${productos}</tbody>
  </table>

  <h1>Verificación</h1>
  <ul>${checklist || "<li>—</li>"}</ul>

  <h1>Trabajo realizado</h1>
  <p>${esc(parte.trabajoRealizado)}</p>
  ${parte.observaciones ? `<p><b>Observaciones:</b> ${esc(parte.observaciones)}</p>` : ""}

  <h1>Seguridad</h1>
  <p><b>Plazo de reingreso:</b> ${val(parte.plazoReingreso)}</p>
  ${advertencias ? `<ul>${advertencias}</ul>` : ""}
  ${parte.proximoServicioSugerido ? `<p><b>Próximo servicio sugerido:</b> ${esc(parte.proximoServicioSugerido)}</p>` : ""}

  <h1>Registro fotográfico</h1>
  <div class="fotos">${fotos || "<i>Sin fotos.</i>"}</div>

  <div class="firma">
    <div><div class="linea">Firma del técnico<br>${esc(config.operarioNombre)}</div></div>
    <div><div class="linea">Conformidad del cliente</div></div>
  </div>

  <footer>${esc(config.textoLegalPie ?? "Documento generado con Testigo. Conserve este comprobante para eventuales controles de bromatología.")}</footer>
</body></html>`;
}

/**
 * Convierte el HTML a PDF. En producción usa Playwright (Chromium headless).
 * Se deja como stub aislado para no arrastrar la dependencia pesada al prototipo del núcleo.
 */
export async function htmlAPDF(_html: string): Promise<Buffer> {
  // Producción (worker con Playwright):
  //   const { chromium } = await import("playwright");
  //   const browser = await chromium.launch();
  //   const page = await browser.newPage();
  //   await page.setContent(_html, { waitUntil: "networkidle" });
  //   const pdf = await page.pdf({ format: "A4", printBackground: true, margin: { top: "12mm", bottom: "12mm" } });
  //   await browser.close();
  //   return pdf;
  throw new Error("htmlAPDF: conectar Playwright en el worker de PDF (ver comentario). El HTML ya está listo.");
}
