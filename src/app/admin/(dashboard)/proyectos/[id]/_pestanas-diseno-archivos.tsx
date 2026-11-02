// Lo que ya existía en la ficha y sigue vivo: el armador de stands y las piezas para aprobar, debajo de lo de Diseño. Y la pestaña
// Archivos con su filtro por tipo.

import Link from "next/link";
import { Badge, buttonClasses, cn } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import { crearEntregable } from "@/lib/proyectos/acciones";
import { alternarVisibleFicha, borrarArchivoFicha, vincularArchivo } from "@/lib/proyectos/acciones-ficha";
import { ayudaEspecificacion, ESTADO_ENTREGABLE_LABEL, estadoDelEntregable, fechaCorta, resumenEntregables, ultimaEnviada, waLink, yaVencio } from "@/lib/proyectos/core";
import { datosArchivos, datosDiseno, type Cabecera } from "@/lib/proyectos/ficha.server";
import type { Actor } from "@/lib/proyectos/gestion.server";
import { puede } from "@/lib/proyectos/gestion.server";
import { campo, tarjeta } from "../_vista";
import { BotonConConfirmacion, FormAccion } from "./_cliente";
import { BotonNuevoStand, CopiarLink, SubirArchivo } from "./_piezas";

export async function ArmadorYPiezas({ a, cab }: { a: Actor; cab: Cabecera }) {
  const { proyecto: p, negocio } = cab;
  const { stands, entregables } = await datosDiseno(a, p.id);
  const piezas = resumenEntregables(entregables);
  const waPiezas = waLink(p.client.phone, `Hola ${p.client.name}! Te compartimos las piezas de ${negocio.nombre} para "${p.nombre}", para que las revises:`);
  const edita = puede(a, "diseno", "editar");
  return (
    <div className="grid gap-4">
      <section className={tarjeta} aria-label="Stands en 3D">
        <h2 className="mb-3 font-semibold text-strong">Stands en 3D</h2>
        {stands.length === 0 && <p className="mb-3 text-sm text-muted">Todavía no hay opciones armadas.</p>}
        <ul className="mb-3 grid gap-2">
          {stands.map((s) => (
            <li key={s.id}>
              <Link href={`/admin/proyectos/${p.id}/stand/${s.id}`} className="flex min-h-11 items-center justify-between rounded-lg border border-line px-3 text-sm font-medium text-strong hover:border-accent">
                {s.nombre}<span className="text-xs font-normal text-muted">Abrir</span>
              </Link>
            </li>
          ))}
        </ul>
        {edita && <BotonNuevoStand proyectoId={p.id} />}
      </section>

      <section className={tarjeta} aria-label="Piezas para aprobar">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold text-strong">Piezas para aprobar</h2>
            {piezas.total > 0 && <p className="text-sm text-muted">{piezas.aprobados} de {piezas.total} aprobadas{piezas.esperando > 0 && ` · ${piezas.esperando} esperando al cliente`}{piezas.paraCorregir > 0 && ` · ${piezas.paraCorregir} para corregir`}</p>}
          </div>
          {p.tokenEntregables && (
            <div className="flex flex-wrap gap-2">
              <a href={`/entregables/${p.tokenEntregables}`} target="_blank" rel="noopener noreferrer" className={buttonClasses("outline", "md")}>Ver como el cliente</a>
              <CopiarLink ruta={`/entregables/${p.tokenEntregables}`} />
              {waPiezas && <a href={waPiezas} target="_blank" rel="noopener noreferrer" className={buttonClasses("outline", "md")}>Abrir WhatsApp</a>}
            </div>
          )}
        </div>
        {entregables.length === 0 && <p className="mb-3 text-sm text-muted">Cargá cada pieza que el cliente tiene que aprobar: una gráfica, una escenografía, un video.</p>}
        {entregables.length > 0 && (
          <ul className="mb-3 grid gap-2">
            {entregables.map((e) => {
              const estado = estadoDelEntregable(e.versiones);
              const respuesta = estado === "CAMBIOS" ? ultimaEnviada(e.versiones) : null;
              return (
                <li key={e.id}>
                  <Link href={`/admin/proyectos/${p.id}/entregable/${e.id}`} className="block min-h-11 rounded-lg border border-line px-3 py-2 text-sm hover:border-accent">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-strong">{e.nombre}</span>
                      <Badge tone={estado === "APROBADO" ? "success" : estado === "CAMBIOS" ? "danger" : "neutral"}>{ESTADO_ENTREGABLE_LABEL[estado]}</Badge>
                      {e.versiones.length > 0 && <span className="text-xs text-muted">Versión {e.versiones[0].numero}</span>}
                      {e.venceEl && <span className={cn("text-xs", estado !== "APROBADO" && yaVencio(e.venceEl) ? "font-medium text-danger" : "text-muted")}>Para el {fechaCorta(e.venceEl)}</span>}
                    </span>
                    {e.especificacion && <span className="mt-0.5 block text-xs text-muted">{e.especificacion}</span>}
                    {respuesta?.comentario && <span className="mt-1 block">{respuesta.respondidoPor}: «{respuesta.comentario}»</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        {edita && (
          <form action={crearEntregable} className="grid gap-2 border-t border-line pt-3 sm:grid-cols-[2fr_2fr_1fr_auto]">
            <input type="hidden" name="proyectoId" value={p.id} />
            <input name="nombre" required maxLength={120} aria-label="Nombre de la pieza" placeholder="Pieza" className={campo} />
            <input name="especificacion" maxLength={300} aria-label="Especificación de la pieza" placeholder={ayudaEspecificacion(p.servicio)} className={campo} />
            <input type="date" name="venceEl" aria-label="Para cuándo" className={campo} />
            <SubmitButton className={buttonClasses("outline", "md")}>Agregar pieza</SubmitButton>
          </form>
        )}
      </section>
    </div>
  );
}

// ── Archivos ────────────────────────────────────────────────────────────────

const TIPO_LABEL: Record<string, string> = { OTRO: "Otro", PRESUPUESTO: "Presupuesto", PRESENTACION: "Presentación", RENDER: "Render", PLANO: "Plano", CONTRATO: "Contrato", DISENO: "Diseño", REFERENCIA: "Referencia" };
const FILTROS = ["OTRO", "PRESUPUESTO", "PRESENTACION", "RENDER", "PLANO", "CONTRATO"];

function tamano(bytes: number | null): string {
  if (bytes === null) return "—";
  return bytes >= 1_048_576 ? `${(bytes / 1_048_576).toLocaleString("es-AR", { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export async function PestanaArchivos({ a, cab, tipo }: { a: Actor; cab: Cabecera; tipo?: string }) {
  const { proyecto: p } = cab;
  const { archivos, items } = await datosArchivos(a, cab);
  const edita = puede(a, "ficha", "editar") || puede(a, "diseno", "editar");
  const lista = tipo ? archivos.filter((f) => f.tipo === tipo) : archivos;
  const items_ = new Map(items.map((i) => [i.id, i.descripcion]));
  return (
    <section className={tarjeta} aria-label="Archivos">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-strong">Archivos</h2>
        {p.carpetaUrl && <a href={p.carpetaUrl} target="_blank" rel="noopener noreferrer" className={buttonClasses("outline", "md")}>Abrir carpeta</a>}
      </div>
      <nav aria-label="Filtrar por tipo" className="mb-3 flex flex-wrap gap-1">
        <Link scroll={false} href="?tab=archivos" aria-current={!tipo ? "true" : undefined} className={cn("flex min-h-11 items-center rounded-lg px-3 text-sm font-medium", !tipo ? "bg-accent text-on-accent" : "border border-line text-strong")}>Todos</Link>
        {FILTROS.map((f) => (
          <Link key={f} scroll={false} href={`?tab=archivos&tipo=${f}`} aria-current={tipo === f ? "true" : undefined} className={cn("flex min-h-11 items-center rounded-lg px-3 text-sm font-medium", tipo === f ? "bg-accent text-on-accent" : "border border-line text-strong")}>{TIPO_LABEL[f]}</Link>
        ))}
      </nav>
      {lista.length === 0 ? (
        <p className="mb-3 text-sm text-muted">{tipo ? "No hay archivos de este tipo." : "Todavía no hay archivos."}</p>
      ) : (
        <div className="mb-3 overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="py-1 pr-2 font-medium">Archivo</th>
                <th className="pr-2 font-medium">Tipo</th>
                <th className="pr-2 font-medium">Vinculado a ítem</th>
                <th className="pr-2 font-medium">Origen</th>
                <th className="pr-2 font-medium">Quién</th>
                <th className="pr-2 font-medium">Fecha</th>
                <th className="pr-2 font-medium">Tamaño</th>
                {edita && <th aria-label="Acciones" />}
              </tr>
            </thead>
            <tbody>
              {lista.map((f) => {
                const ruta = f.esImagen || f.esPdf ? `/admin/proyectos/${p.id}/archivo/${f.id}` : f.url ?? "#";
                return (
                  <tr key={f.id} className="border-t border-line align-top">
                    <td className="py-1.5 pr-2">
                      <a href={ruta} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center gap-2 underline">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {f.esImagen && <img src={ruta} alt="" loading="lazy" className="h-10 w-14 shrink-0 rounded object-cover" />}
                        <span className="min-w-0 break-words">{f.nombre}</span>
                      </a>
                    </td>
                    <td className="py-1.5 pr-2">{TIPO_LABEL[f.tipo] ?? f.tipo}</td>
                    <td className="py-1.5 pr-2 min-w-48">
                      {edita ? (
                        <FormAccion accion={vincularArchivo} className="flex items-center gap-1">
                          <input type="hidden" name="id" value={f.id} />
                          <input type="hidden" name="proyectoId" value={p.id} />
                          <select name="itemId" defaultValue={f.itemId ?? ""} aria-label={`Ítem de ${f.nombre}`} className={campo}>
                            <option value="">Sin vincular</option>
                            {items.map((i) => <option key={i.id} value={i.id}>{i.descripcion}</option>)}
                          </select>
                          <button type="submit" className={buttonClasses("ghost", "md")} aria-label={`Vincular ${f.nombre}`}>Vincular</button>
                        </FormAccion>
                      ) : (
                        (f.itemId && items_.get(f.itemId)) || "—"
                      )}
                    </td>
                    <td className="py-1.5 pr-2">{f.esImagen || f.esPdf ? "Subido" : "Link"}</td>
                    <td className="py-1.5 pr-2">{f.subidoPor ?? "—"}</td>
                    <td className="py-1.5 pr-2 whitespace-nowrap">{fechaCorta(f.createdAt)}</td>
                    <td className="py-1.5 pr-2 whitespace-nowrap">{tamano(f.tamano)}</td>
                    {edita && (
                      <td className="py-1">
                        <span className="flex flex-wrap items-center justify-end gap-1">
                          {f.esImagen && (
                            <FormAccion accion={alternarVisibleFicha}>
                              <input type="hidden" name="id" value={f.id} />
                              <input type="hidden" name="proyectoId" value={p.id} />
                              <button type="submit" className={buttonClasses("ghost", "md")}>{f.visibleCliente ? "Sacar de propuesta" : "Sumar a propuesta"}</button>
                            </FormAccion>
                          )}
                          <BotonConConfirmacion accion={borrarArchivoFicha} ocultos={{ id: f.id, proyectoId: p.id }} texto="Borrar" textoConfirma="Sí, borrar" etiqueta={`Borrar ${f.nombre}`} />
                        </span>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {edita && <SubirArchivo proyectoId={p.id} />}
    </section>
  );
}
