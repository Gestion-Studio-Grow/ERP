"use client";

// Cartera del contador: tabla de clientes + panel de detalle pegajoso con las
// acciones (emitir automáticas, abrir backoffice, pausar/reactivar, baja).
// Client component solo por la selección de fila y los estados de las acciones;
// los datos vienen resueltos del server (page.tsx) y las mutaciones son Server
// Actions con su propio gate (capability + pertenencia a la cartera).

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, fmtCuit, fmtMoneyARS, fmtNumberAR } from "@/components/ui";
import { fmtDateTimeAr } from "@/lib/datetime";
import { UMBRAL_ALERTA_CAP, type EstadoCartera, type FilaCartera } from "@/lib/cartera-core";
import { emitirAutomaticasClienteAction, setEstadoCarteraAction } from "@/lib/cartera-actions";

/** Mini barra de objetivo (facturas del mes vs tope) para la celda de la tabla. */
function GoalMini({ usado, tope }: { usado: number; tope: number }) {
  const pct = tope > 0 ? Math.min(100, Math.round((usado / tope) * 100)) : 0;
  const color = pct >= 100 ? "bg-danger-fill" : pct >= UMBRAL_ALERTA_CAP * 100 ? "bg-warning-fill" : "bg-accent";
  return (
    <span className="block min-w-28">
      <span className="tabular-nums text-strong">
        {fmtNumberAR(usado)}
        <span className="text-muted"> / {fmtNumberAR(tope)}</span>
      </span>
      <span
        role="progressbar"
        aria-valuenow={usado}
        aria-valuemin={0}
        aria-valuemax={tope}
        aria-label={`Facturas del mes: ${usado} de ${tope}`}
        className="mt-1 block h-1 overflow-hidden rounded-full bg-bar-track"
      >
        <span className={`block h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </span>
    </span>
  );
}

function EstadoBadge({ estado }: { estado: EstadoCartera }) {
  if (estado === "activa") return <Badge tone="success" dot>Activo</Badge>;
  if (estado === "pausada") return <Badge tone="warning" dot>En pausa</Badge>;
  return <Badge tone="neutral" dot>De baja</Badge>;
}

export default function CarteraPanel({
  filas,
  baseDomain,
}: {
  filas: FilaCartera[];
  baseDomain: string | null;
}) {
  const router = useRouter();
  const [seleccionId, setSeleccionId] = useState<string | null>(null);
  const [confirmaBaja, setConfirmaBaja] = useState(false);
  const [mensaje, setMensaje] = useState<{ tono: "ok" | "error"; texto: string } | null>(null);
  const [pendiente, startTransition] = useTransition();

  const seleccion = useMemo(
    () => filas.find((f) => f.clienteTenantId === seleccionId) ?? null,
    [filas, seleccionId],
  );

  const seleccionar = (id: string) => {
    setSeleccionId((prev) => (prev === id ? null : id));
    setConfirmaBaja(false);
    setMensaje(null);
  };

  const correr = (fn: () => Promise<{ ok: boolean; textoOk: string; textoError?: string }>) => {
    setMensaje(null);
    startTransition(async () => {
      const r = await fn();
      setMensaje(
        r.ok
          ? { tono: "ok", texto: r.textoOk }
          : { tono: "error", texto: r.textoError ?? "No se pudo completar la acción." },
      );
      router.refresh();
    });
  };

  const emitir = (f: FilaCartera) =>
    correr(async () => {
      const r = await emitirAutomaticasClienteAction(f.clienteTenantId);
      if (!r.ok) return { ok: false, textoOk: "", textoError: r.error };
      const e = r.resultado;
      const partes = [`Se ${e.emitidas === 1 ? "emitió" : "emitieron"} ${fmtNumberAR(e.emitidas)} factura${e.emitidas === 1 ? "" : "s"} de ${f.alias}.`];
      if (e.mensaje) partes.push(e.mensaje);
      if (e.errores.length > 0) {
        partes.push(`${fmtNumberAR(e.errores.length)} propuesta${e.errores.length === 1 ? " falló y quedó" : "s fallaron y quedaron"} para reintentar.`);
      }
      return { ok: true, textoOk: partes.join(" ") };
    });

  const setEstado = (f: FilaCartera, estado: EstadoCartera, textoOk: string) =>
    correr(async () => {
      const r = await setEstadoCarteraAction(f.clienteTenantId, estado);
      if (!r.ok) return { ok: false, textoOk: "", textoError: r.error };
      if (estado === "baja") setSeleccionId(null);
      return { ok: true, textoOk };
    });

  const urlCliente = (f: FilaCartera, path: string): string | null =>
    f.subdomain && baseDomain ? `https://${f.subdomain}.${baseDomain}${path}` : null;

  if (filas.length === 0) {
    return (
      <section aria-label="Cartera de clientes" className="mb-xl">
        <div className="rounded-xl border border-line bg-surface-raised p-8 text-center shadow-card">
          <h2 className="text-lg font-semibold text-strong">Tu cartera está vacía</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">
            Agregá tu primer cliente acá abajo: con el nombre, el CUIT y un email queda dado de
            alta y listo para facturar.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Cartera de clientes" className="mb-xl">
      {/* Resultado de la última acción (para lector de pantalla también). */}
      <div aria-live="polite">
        {mensaje && (
          <div
            role={mensaje.tono === "error" ? "alert" : undefined}
            className={`mb-sm rounded-xl border px-4 py-3 text-sm ${
              mensaje.tono === "error"
                ? "border-danger/40 bg-danger-soft text-danger"
                : "border-success/40 bg-success-soft text-success"
            }`}
          >
            {mensaje.texto}
          </div>
        )}
      </div>

      {/* Master-detail unificado con ColaRevision (fixes 3/31): dos columnas
          recién desde xl (1280px) — en notebooks 13" iba apretado con lg. */}
      <div className="grid grid-cols-1 items-start gap-md xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* Tabla */}
        <div className="overflow-x-auto rounded-xl border border-line bg-surface-raised shadow-card">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <caption className="sr-only">
              Clientes de la cartera con su resumen fiscal del mes
            </caption>
            <thead>
              <tr className="border-b border-line bg-surface-sunken text-[11px] uppercase tracking-[.06em] text-muted">
                <th scope="col" className="px-[22px] py-2.5 font-semibold">Cliente</th>
                <th scope="col" className="px-[22px] py-2.5 text-right font-semibold">Facturado</th>
                <th scope="col" className="px-[22px] py-2.5 font-semibold">Facturas / tope</th>
                <th scope="col" className="px-[22px] py-2.5 text-right font-semibold">A revisar</th>
                <th scope="col" className="px-[22px] py-2.5 font-semibold">Última importación</th>
                <th scope="col" className="px-[22px] py-2.5 font-semibold">ARCA</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => {
                const activaFila = f.clienteTenantId === seleccionId;
                const alerta = f.pctCap >= UMBRAL_ALERTA_CAP;
                return (
                  <tr
                    key={f.clienteTenantId}
                    onClick={() => seleccionar(f.clienteTenantId)}
                    className={`cursor-pointer border-b border-line last:border-b-0 transition-colors ${
                      activaFila
                        ? "bg-accent-soft shadow-[inset_2.5px_0_0_var(--accent)]"
                        : "hover:bg-surface-sunken"
                    } ${f.estado === "pausada" ? "opacity-60" : ""}`}
                  >
                    <td className="px-[22px] py-[13px]">
                      {/* Botón real dentro de la celda: la fila también responde al
                          clic, pero el teclado/lector navega por acá. */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          seleccionar(f.clienteTenantId);
                        }}
                        aria-expanded={activaFila}
                        className="block w-full rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                      >
                        <span className="flex items-center gap-2 font-medium text-strong">
                          {f.alias}
                          {f.estado !== "activa" && <EstadoBadge estado={f.estado} />}
                        </span>
                        <span className="mt-0.5 block text-xs tabular-nums text-muted">
                          {fmtCuit(f.cuit)}
                        </span>
                      </button>
                    </td>
                    <td className="whitespace-nowrap px-[22px] py-[13px] text-right tabular-nums text-strong">
                      {fmtMoneyARS(f.montoFacturadoMes)}
                    </td>
                    <td className="px-[22px] py-[13px]">
                      <GoalMini usado={f.facturasMes} tope={f.capFacturasMes} />
                      {alerta && (
                        <span className="mt-1 block text-xs font-medium text-danger">
                          Cerca del tope
                        </span>
                      )}
                    </td>
                    <td className="px-[22px] py-[13px] text-right">
                      {f.pendientesRevision > 0 ? (
                        <Badge tone="warning" dot>{fmtNumberAR(f.pendientesRevision)}</Badge>
                      ) : (
                        <span className="tabular-nums text-muted">0</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-[22px] py-[13px] text-muted">
                      {f.ultimaImportacion ? (
                        <>
                          <span className="block max-w-40 truncate text-strong">
                            {f.ultimaImportacion.nombreArchivo}
                          </span>
                          <span className="text-xs tabular-nums">
                            {fmtDateTimeAr(f.ultimaImportacion.createdAt)}
                          </span>
                        </>
                      ) : (
                        "Sin extractos"
                      )}
                    </td>
                    <td className="px-[22px] py-[13px]">
                      {f.arcaConfigurado ? (
                        // Homologación = warning (mismo criterio que ArcaPill, fix 22):
                        // es un ambiente de prueba, no un estado informativo.
                        <Badge tone={f.arcaHomologacion ? "warning" : "success"} dot>
                          {f.arcaHomologacion ? "Homologación" : "Producción"}
                        </Badge>
                      ) : (
                        <Badge tone="neutral" dot>Sin CUIT</Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Panel de detalle pegajoso */}
        <aside className="xl:sticky xl:top-6 xl:self-start" aria-label="Detalle del cliente seleccionado">
          {seleccion ? (
            <div className="rounded-xl border border-line bg-surface-raised p-5 shadow-card">
              <h2 className="text-lg font-semibold tracking-[-0.02em] text-strong">{seleccion.alias}</h2>
              <p className="mt-0.5 text-sm text-muted">
                {seleccion.nombre} · <span className="tabular-nums">{fmtCuit(seleccion.cuit)}</span>
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-muted">Facturado del mes</dt>
                  <dd className="tabular-nums font-medium text-strong">
                    {fmtMoneyARS(seleccion.montoFacturadoMes)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Facturas / tope</dt>
                  <dd className="tabular-nums font-medium text-strong">
                    {fmtNumberAR(seleccion.facturasMes)} / {fmtNumberAR(seleccion.capFacturasMes)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Pendientes de revisión</dt>
                  <dd className="tabular-nums font-medium text-strong">
                    {fmtNumberAR(seleccion.pendientesRevision)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Listas para emitir</dt>
                  <dd className="tabular-nums font-medium text-strong">
                    {fmtNumberAR(seleccion.listasParaEmitir)}
                  </dd>
                </div>
              </dl>

              <div className="mt-5 flex flex-col gap-2">
                <Button
                  size="sm"
                  disabled={pendiente || seleccion.estado !== "activa" || seleccion.listasParaEmitir === 0}
                  onClick={() => emitir(seleccion)}
                >
                  {pendiente
                    ? "Emitiendo…"
                    : `Emitir automáticas (${fmtNumberAR(seleccion.listasParaEmitir)})`}
                </Button>
                {seleccion.estado !== "activa" && (
                  <p className="text-xs text-muted">
                    El cliente está en pausa: reactivalo para emitir.
                  </p>
                )}

                {urlCliente(seleccion, "/admin/facturacion/bancos") ? (
                  <a
                    href={urlCliente(seleccion, "/admin/facturacion/bancos")!}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-9 items-center justify-center rounded-md border border-line-strong bg-surface-raised px-3 text-sm font-medium text-strong transition-colors hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    Importar extracto (su backoffice)
                  </a>
                ) : (
                  <p className="text-xs text-muted">
                    Este cliente todavía no tiene URL propia: los extractos se importan desde su
                    backoffice cuando el dueño le asigne una.
                  </p>
                )}
                {urlCliente(seleccion, "/admin") && (
                  <a
                    href={urlCliente(seleccion, "/admin")!}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium text-body transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    Abrir su backoffice
                  </a>
                )}

                <div className="mt-2 flex flex-wrap gap-2 border-t border-line pt-3">
                  {seleccion.estado === "activa" ? (
                    <Button
                      size="sm"
                      variant="subtle"
                      disabled={pendiente}
                      onClick={() => setEstado(seleccion, "pausada", `${seleccion.alias} quedó en pausa.`)}
                    >
                      Pausar
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="subtle"
                      disabled={pendiente}
                      onClick={() => setEstado(seleccion, "activa", `${seleccion.alias} volvió a estar activo.`)}
                    >
                      Reactivar
                    </Button>
                  )}
                  {confirmaBaja ? (
                    <>
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={pendiente}
                        onClick={() =>
                          setEstado(
                            seleccion,
                            "baja",
                            `${seleccion.alias} salió de tu cartera. Sus datos no se borran.`,
                          )
                        }
                      >
                        Confirmar baja
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmaBaja(false)}>
                        Cancelar
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="ghost" disabled={pendiente} onClick={() => setConfirmaBaja(true)}>
                      Dar de baja
                    </Button>
                  )}
                </div>
                {confirmaBaja && (
                  <p className="text-xs text-muted">
                    La baja saca al cliente de tu cartera; sus datos y facturas quedan intactos en su
                    propio negocio.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-line bg-surface-raised p-5 text-sm text-muted shadow-xs">
              Elegí un cliente de la tabla para ver el detalle y las acciones: emitir sus facturas
              automáticas, pausarlo o darlo de baja.
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
