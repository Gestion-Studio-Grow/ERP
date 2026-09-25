"use client";

// Mandar la lista de la casa a los locales: elegir a cuáles, ver el detalle de cada uno y
// confirmar. La confirmación va porque cambia precios en otros negocios de una vez (como
// "Actualizar precios"); lo de todos los días no la lleva.
//
// Lo que se manda es la elección y la HUELLA de la vista previa de cada local: el servidor
// vuelve a armar todo contra el catálogo de ese local en su transacción, y si la huella no
// coincide (alguien cambió un precio en el medio) ese local no se toca.
//
// SIN imports de valor de servidor: sólo la action (una referencia) y tipos.

import { useActionState, useState } from "react";
import { empujarCatalogoAction, type EstadoEmpuje } from "@/lib/multilocal/multilocal-actions";
import type { VistaDelLocal } from "@/lib/multilocal/catalogo-marca-core";
import { AvisoError, Badge, Button, Card, Marca, cn, fmtMoneyARS, fmtNumberAR } from "@/components/ui";

export type LocalParaAplicar = VistaDelLocal & { localTenantId: string; alias: string; resumen: string };

const precio = (n: number | null, saleUnit: "UNIT" | "WEIGHT") =>
  n === null ? "sin precio" : `${fmtMoneyARS(n)}${saleUnit === "WEIGHT" ? " /kg" : ""}`;

// `renglon` (diseño nuevo): cada local es un renglón del libro y no una tarjeta, y su estado va
// con Marca (forma + palabra). Mismo formulario, misma action, mismas reglas.
function HojaDeLocal({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("border-b border-line py-3", className)}>{children}</div>;
}

export function AplicarCatalogo({ locales, bloqueada, renglon = false }: { locales: LocalParaAplicar[]; bloqueada: boolean; renglon?: boolean }) {
  const Caja = renglon ? HojaDeLocal : Card;
  const [estado, aplicar, pendiente] = useActionState<EstadoEmpuje, FormData>(empujarCatalogoAction, null);
  const [elegidos, setElegidos] = useState<Set<string>>(
    () => new Set(locales.filter((l) => l.aplicable).map((l) => l.localTenantId)),
  );
  // La confirmación vale para el resultado que había cuando se pidió: cuando llega uno nuevo
  // (aplicado o con problemas), se cierra sola y hay que volver a pedirla.
  const [confirmadoCon, setConfirmadoCon] = useState<EstadoEmpuje | undefined>(undefined);
  const confirmando = confirmadoCon !== undefined && confirmadoCon === estado;
  const setConfirmando = (si: boolean) => setConfirmadoCon(si ? estado : undefined);

  // Sólo cuenta lo que se puede aplicar: un local con problemas o al día no suma aunque esté tildado.
  const aAplicar = locales.filter((l) => elegidos.has(l.localTenantId) && l.aplicable);
  const cambios = aAplicar.reduce((s, l) => s + l.cambiosDePrecio.length + l.cambiosDeControl.length, 0);
  const nuevos = aAplicar.reduce((s, l) => s + l.nuevos.length, 0);

  function alternar(id: string) {
    setConfirmando(false);
    setElegidos((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }

  return (
    <form action={aplicar} className="space-y-4">
      {estado && (
        <div role={estado.ok ? "status" : undefined}>
          {estado.ok ? (
            <Card className="border-success/30 bg-success-soft">
              <p className="font-semibold text-strong">{estado.mensaje}</p>
              <ul className="mt-1 space-y-0.5 text-sm text-body">
                {estado.resultados.map((r) => (
                  <li key={r.localTenantId}>{r.texto}</li>
                ))}
              </ul>
            </Card>
          ) : (
            <AvisoError
              titulo={estado.mensaje}
              comoSeguir={
                estado.resultados.length > 0 ? (
                  <span className="block space-y-0.5">
                    {estado.resultados.map((r) => (
                      <span key={r.localTenantId} className="block">
                        {r.texto}
                      </span>
                    ))}
                  </span>
                ) : (
                  "Revisá la vista previa de abajo y volvé a aplicar."
                )
              }
            />
          )}
        </div>
      )}

      <ul className={renglon ? "border-t border-line-strong" : "space-y-3"} aria-label="Lo que cambiaría en cada local">
        {locales.map((l) => {
          const tildado = elegidos.has(l.localTenantId);
          return (
            <li key={l.localTenantId}>
              <Caja className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <label className={cn("flex min-h-11 items-center gap-3", !l.aplicable && "cursor-not-allowed")}>
                    <input
                      type="checkbox"
                      name="elegido"
                      value={l.localTenantId}
                      checked={tildado && l.aplicable}
                      disabled={!l.aplicable || bloqueada}
                      onChange={() => alternar(l.localTenantId)}
                      className="size-5 accent-[var(--accent)]"
                    />
                    <span className="min-w-0">
                      <span className="block font-semibold text-strong break-words">{l.alias}</span>
                      <span className="block text-sm text-muted">{l.resumen}</span>
                    </span>
                  </label>
                  {renglon ? (
                    l.problemas.length > 0 ? (
                      <Marca tipo="atencion">No se puede mandar</Marca>
                    ) : l.alDia ? (
                      <Marca tipo="hecho">Al día</Marca>
                    ) : (
                      <Marca tipo="pendiente">Distinto a tu lista</Marca>
                    )
                  ) : l.problemas.length > 0 ? (
                    <Badge tone="danger">No se puede aplicar</Badge>
                  ) : l.alDia ? (
                    <Badge tone="success" dot>
                      Al día
                    </Badge>
                  ) : (
                    <Badge tone="warning" dot>
                      Distinto a tu lista
                    </Badge>
                  )}
                </div>
                <input type="hidden" name={`huella:${l.localTenantId}`} value={l.huella} />

                {l.problemas.length > 0 && (
                  <div className="rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-sm">
                    <p className="font-medium text-strong">Qué lo impide (arreglalo en el local o en tu lista y volvé):</p>
                    <ul className="mt-1 space-y-0.5 text-body">
                      {l.problemas.slice(0, 10).map((p, i) => (
                        <li key={i}>{p.nombre ? `«${p.nombre}»: ${p.motivo}` : p.motivo}</li>
                      ))}
                      {l.problemas.length > 10 && <li>y {fmtNumberAR(l.problemas.length - 10)} más.</li>}
                    </ul>
                  </div>
                )}

                {!l.alDia && l.problemas.length === 0 && (
                  <details className="rounded-lg border border-line px-3 py-2 text-sm">
                    <summary className="flex min-h-11 cursor-pointer items-center font-medium text-strong">Ver el detalle</summary>
                    <div className="space-y-3 pb-2">
                      {l.cambiosDePrecio.length > 0 && (
                        <Lista titulo={`Cambia el precio (${fmtNumberAR(l.cambiosDePrecio.length)})`}>
                          {l.cambiosDePrecio.map((c) => (
                            <li key={c.nombre} className="flex flex-wrap justify-between gap-x-3">
                              <span className="break-words">
                                {c.nombre}
                                {c.pausado ? <span className="text-muted"> (pausado en el local: sigue pausado)</span> : null}
                              </span>
                              <span className="tabular-nums text-muted">
                                {precio(c.antes, c.saleUnit)} → <span className="text-strong">{precio(c.despues, c.saleUnit)}</span>
                              </span>
                            </li>
                          ))}
                        </Lista>
                      )}
                      {l.cambiosDeControl.length > 0 && (
                        <Lista titulo={`Cambia si controla stock (${fmtNumberAR(l.cambiosDeControl.length)})`}>
                          {l.cambiosDeControl.map((c) => (
                            <li key={c.nombre}>
                              {c.nombre}: {c.antes ? "sí" : "no"} → {c.despues ? "sí" : "no"}
                            </li>
                          ))}
                        </Lista>
                      )}
                      {l.nuevos.length > 0 && (
                        <Lista titulo={`No existen en ${l.alias}: se crean (${fmtNumberAR(l.nuevos.length)})`}>
                          {l.nuevos.map((n) => (
                            <li key={n.nombre} className="flex flex-wrap justify-between gap-x-3">
                              <span className="break-words">{n.nombre}</span>
                              <span className="tabular-nums text-muted">{precio(n.precio, n.saleUnit)}</span>
                            </li>
                          ))}
                        </Lista>
                      )}
                    </div>
                  </details>
                )}

                {l.soloEnElLocal.length > 0 && (
                  <p className="text-xs text-muted">
                    Sólo en {l.alias} (no se tocan): {l.soloEnElLocal.slice(0, 12).join(", ")}
                    {l.soloEnElLocal.length > 12 ? ` y ${fmtNumberAR(l.soloEnElLocal.length - 12)} más` : ""}. Si alguno es un
                    producto tuyo con otro nombre, renombralo en el local para que se crucen.
                  </p>
                )}
              </Caja>
            </li>
          );
        })}
      </ul>

      <div className="border-t border-line pt-4">
        {aAplicar.length === 0 ? (
          <p className="text-sm text-muted">
            {bloqueada
              ? "Primero arreglá los nombres repetidos de tu lista."
              : "Tildá los locales a los que querés mandar tu lista. Los que están al día o con problemas no se pueden elegir."}
          </p>
        ) : confirmando ? (
          <div className="space-y-3" role="group" aria-label="Confirmar">
            <p className="text-sm text-strong">
              Vas a cambiar {fmtNumberAR(cambios)} {cambios === 1 ? "precio o dato" : "precios o datos"} y crear {fmtNumberAR(nuevos)}{" "}
              {nuevos === 1 ? "producto" : "productos"} en {aAplicar.map((l) => l.alias).join(", ")}. Si un local había puesto un precio
              propio, queda el de tu lista.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="submit" disabled={pendiente} className="w-full sm:w-auto">
                {pendiente ? "Aplicando…" : "Sí, aplicar"}
              </Button>
              <Button type="button" variant="outline" disabled={pendiente} onClick={() => setConfirmando(false)} className="w-full sm:w-auto">
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <Button type="button" onClick={() => setConfirmando(true)} className="w-full sm:w-auto">
            Mandar tu lista a {aAplicar.length === 1 ? aAplicar[0].alias : `${fmtNumberAR(aAplicar.length)} locales`}
          </Button>
        )}
      </div>
    </form>
  );
}

function Lista({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-medium text-strong">{titulo}</p>
      <ul className="mt-1 max-h-64 space-y-1 overflow-y-auto pr-1 text-body">{children}</ul>
    </div>
  );
}
