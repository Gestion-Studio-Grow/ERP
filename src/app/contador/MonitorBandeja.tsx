"use client";

// "¿De quién me ocupo hoy?" — la bandeja del contador. Va ARRIBA del panel de volumen
// porque responde otra pregunta: el volumen mira lo que pasó; esto, lo que está roto o
// por romperse y falla en silencio (ver src/lib/monitor-core.ts).
//
// En este orden: (1) la cabecera con cuántos NO pueden emitir y, una sola vez, lo que es
// de la plataforma (emisión apagada, ARCA simulado, clientes en prueba); (2) una línea
// por cliente con su PEOR señal, el número y el botón de la acción que existe; (3) los
// que están al día, plegados. Los pausados no aparecen: el contador los pausó a
// propósito. Montos, ninguno: son del panel de volumen de abajo.
//
// Client component sólo por los botones (pausar, emitir): los datos llegan resueltos del
// server y las mutaciones son las mismas Server Actions del panel, con su propio gate.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Bloque, Button, Franja, Marca, MenuMas, Plata, Renglon, buttonClasses, fmtNumberAR } from "@/components/ui";
import { useDiseno } from "@/lib/diseno/DisenoProvider";
import { folioDeBandeja, ordenarBandeja } from "./bandeja-core";
import type { FilaCartera } from "@/lib/cartera-core";
import {
  noPuedeEmitir,
  peorSenal,
  titularMonitor,
  type AvisoPlataforma,
  type FilaMonitor,
  type ResumenMonitor,
} from "@/lib/monitor-core";
import { emitirAutomaticasClienteAction, setEstadoCarteraAction } from "@/lib/cartera-actions";

export default function MonitorBandeja({
  filas,
  resumen,
  avisos,
  cartera,
  baseDomain,
}: {
  /** Ya ordenadas por urgencia (evaluarCartera). */
  filas: FilaMonitor[];
  resumen: ResumenMonitor;
  avisos: AvisoPlataforma[];
  /** Las filas del panel de volumen: de ahí salen el subdominio y las listas para emitir. */
  cartera: FilaCartera[];
  baseDomain: string | null;
}) {
  const router = useRouter();
  const nuevo = useDiseno();
  const [mensaje, setMensaje] = useState<{ tono: "ok" | "error"; texto: string } | null>(null);
  const [pendiente, startTransition] = useTransition();

  const porId = useMemo(() => new Map(cartera.map((f) => [f.clienteTenantId, f])), [cartera]);
  // El titular sale de la regla pura: con la emisión apagada no dice "Todos pueden emitir".
  const titular = titularMonitor(resumen, avisos);
  const aAtender = filas.filter((f) => f.estado === "critico" || f.estado === "atencion");
  const alDia = filas.filter((f) => f.estado === "ok");

  const correr = (fn: () => Promise<{ ok: true; texto: string } | { ok: false; error: string }>) => {
    setMensaje(null);
    startTransition(async () => {
      const r = await fn();
      setMensaje(r.ok ? { tono: "ok", texto: r.texto } : { tono: "error", texto: r.error });
      router.refresh();
    });
  };

  const pausar = (f: FilaMonitor) =>
    correr(async () => {
      const r = await setEstadoCarteraAction(f.clienteTenantId, "pausada");
      return r.ok ? { ok: true, texto: `${f.alias} quedó en pausa: no va a aparecer acá.` } : r;
    });

  const emitir = (f: FilaMonitor) =>
    correr(async () => {
      const r = await emitirAutomaticasClienteAction(f.clienteTenantId);
      if (!r.ok) return r;
      const e = r.resultado;
      const partes = [
        `${f.alias}: ${e.emitidas === 1 ? "se emitió 1 factura" : `se emitieron ${fmtNumberAR(e.emitidas)} facturas`}.`,
      ];
      if (e.mensaje) partes.push(e.mensaje);
      if (e.errores.length > 0) {
        partes.push(`${fmtNumberAR(e.errores.length)} ${e.errores.length === 1 ? "falló y quedó" : "fallaron y quedaron"} para reintentar.`);
      }
      return { ok: true, texto: partes.join(" ") };
    });

  const urlCliente = (clienteTenantId: string, ruta: string): string | null => {
    const sub = porId.get(clienteTenantId)?.subdomain;
    return sub && baseDomain ? `https://${sub}.${baseDomain}${ruta}` : null;
  };

  // Sin cartera no hay bandeja: el panel de abajo ya dice "tu cartera está vacía".
  if (resumen.total === 0) return null;

  // Diseño nuevo: la bandeja como bloque de renglones. Mismo contenido y mismas acciones que la
  // de siempre; cambia la forma y el orden (gravedad → lo que vence → la plata, bandeja-core.ts).
  if (nuevo) {
    const ordenadas = ordenarBandeja(aAtender, (id) => porId.get(id)?.montoFacturadoMes ?? 0);
    const hayFiscal = cartera.some((f) => f.validezFiscal);
    return (
      <div className="mb-xl flex flex-col gap-3">
        {titular.nota && <p className="text-sm text-body">{titular.nota}</p>}
        {avisos.map((a) => (
          <Franja key={a.id} tono="info">
            {a.texto}
          </Franja>
        ))}
        <div aria-live="polite">
          {mensaje && (
            <Franja tono={mensaje.tono === "error" ? "peligro" : "info"}>
              <span role={mensaje.tono === "error" ? "alert" : undefined}>{mensaje.texto}</span>
            </Franja>
          )}
        </div>
        <Bloque
          id="monitor"
          titulo="De qué cliente me ocupo hoy"
          cuenta={fmtNumberAR(aAtender.length)}
          nota={
            aAtender.length > 0
              ? `Primero lo más grave y lo que vence; a la derecha, lo ${hayFiscal ? "facturado" : "emitido en prueba"} este mes`
              : undefined
          }
        >
          {ordenadas.length === 0 ? (
            <Renglon titulo="Ningún cliente necesita que hagas algo hoy." />
          ) : (
            <ul>
              {ordenadas.map((f) => {
                const s = peorSenal(f);
                if (!s) return null;
                const fila = porId.get(f.clienteTenantId);
                const listas = fila?.listasParaEmitir ?? 0;
                const destino = s.resuelve.quien === "estudio" ? urlCliente(f.clienteTenantId, s.resuelve.ruta) : null;
                const puedeEmitir = listas > 0 && !noPuedeEmitir(f);
                const otras = f.senales.length - 1;
                const detalle = [s.detalle, s.accion, otras > 0 ? `y ${fmtNumberAR(otras)} ${otras === 1 ? "cosa más" : "cosas más"}` : null]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <Renglon
                    key={f.clienteTenantId}
                    as="li"
                    folio={<Marca tipo={s.severidad === "critico" ? "anulado" : "atencion"}>{folioDeBandeja(f)}</Marca>}
                    titulo={`${f.alias}: ${s.titulo}`}
                    detalle={detalle}
                    plata={fila ? <Plata valor={fila.montoFacturadoMes} sinCentavos /> : null}
                    tecla={
                      <>
                        {puedeEmitir ? (
                          <Button size="md" disabled={pendiente} onClick={() => emitir(f)}>
                            {pendiente ? "Emitiendo…" : `Emitir ${fmtNumberAR(listas)}`}
                          </Button>
                        ) : destino ? (
                          <a href={destino} target="_blank" rel="noreferrer" className={buttonClasses("outline", "md")}>
                            Abrir su panel
                          </a>
                        ) : null}
                        <MenuMas etiqueta={`Más sobre ${f.alias}`}>
                          {puedeEmitir && destino && (
                            <a href={destino} target="_blank" rel="noreferrer">
                              Abrir su panel
                            </a>
                          )}
                          {s.resuelve.quien === "estudio" && !destino && (
                            <span>Todavía no tiene dirección propia para abrir su panel</span>
                          )}
                          <button type="button" disabled={pendiente} onClick={() => pausar(f)}>
                            Pausar: que no aparezca acá
                          </button>
                        </MenuMas>
                      </>
                    }
                  />
                );
              })}
            </ul>
          )}
        </Bloque>
        {alDia.length > 0 && (
          <details className="border-b border-line">
            <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-strong">
              {fmtNumberAR(alDia.length)} al día
            </summary>
            <p className="pb-3 text-sm text-muted">{alDia.map((f) => f.alias).join(" · ")}</p>
          </details>
        )}
      </div>
    );
  }

  return (
    <section aria-labelledby="monitor-titulo" className="mb-xl">
      {/* (1) Cabecera: lo primero que se mira es cuántos no pueden emitir. */}
      <div className="mb-sm flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 id="monitor-titulo" className="text-lg font-semibold tracking-[-0.02em] text-strong">
          {titular.tono === "peligro" ? <span className="text-danger">{titular.texto}</span> : titular.texto}
        </h2>
        <p className="text-sm text-muted">
          {fmtNumberAR(aAtender.length)} para atender · {fmtNumberAR(alDia.length)} al día
          {resumen.pausados > 0 ? ` · ${fmtNumberAR(resumen.pausados)} en pausa` : ""}
        </p>
      </div>
      {titular.nota && <p className="mb-sm text-sm text-body">{titular.nota}</p>}

      {avisos.length > 0 && (
        <ul className="mb-sm flex flex-col gap-2" aria-label="Estado de la plataforma">
          {avisos.map((a) => (
            <li
              key={a.id}
              role="status"
              className="rounded-xl border border-line bg-info-soft px-4 py-3 text-sm text-info"
            >
              {a.texto}
            </li>
          ))}
        </ul>
      )}

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

      {/* (2) La bandeja: una línea por cliente, con la peor señal. */}
      {aAtender.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface-raised p-5 text-sm text-muted shadow-card">
          Ningún cliente necesita que hagas algo hoy.
        </div>
      ) : (
        <ul className="overflow-hidden rounded-xl border border-line bg-surface-raised shadow-card">
          {aAtender.map((f) => {
            const s = peorSenal(f);
            if (!s) return null;
            const fila = porId.get(f.clienteTenantId);
            const listas = fila?.listasParaEmitir ?? 0;
            const destino = s.resuelve.quien === "estudio" ? urlCliente(f.clienteTenantId, s.resuelve.ruta) : null;
            const otras = f.senales.length - 1;
            return (
              <li
                key={f.clienteTenantId}
                className="flex flex-col gap-3 border-b border-line px-4 py-4 last:border-b-0 sm:px-[22px] lg:flex-row lg:items-center"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-strong">{f.alias}</span>
                    <Badge tone={s.severidad === "critico" ? "danger" : "warning"} dot>
                      {s.titulo}
                    </Badge>
                    {otras > 0 && (
                      <span className="text-xs text-muted">
                        y {fmtNumberAR(otras)} {otras === 1 ? "cosa más" : "cosas más"}
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-sm tabular-nums text-body">{s.detalle}</p>
                  <p className="mt-0.5 text-xs text-muted">{s.accion}</p>
                </div>

                <div className="flex flex-wrap gap-2 lg:shrink-0 lg:justify-end">
                  {s.resuelve.quien === "estudio" &&
                    (destino ? (
                      <a
                        href={destino}
                        target="_blank"
                        rel="noreferrer"
                        className={buttonClasses("outline", "md")}
                      >
                        Abrir su backoffice
                      </a>
                    ) : (
                      <span className="self-center text-xs text-muted">
                        Todavía no tiene URL propia para abrir su backoffice.
                      </span>
                    ))}
                  {listas > 0 && !noPuedeEmitir(f) && (
                    <Button size="md" disabled={pendiente} onClick={() => emitir(f)}>
                      {pendiente ? "Emitiendo…" : `Emitir automáticas (${fmtNumberAR(listas)})`}
                    </Button>
                  )}
                  <Button size="md" variant="subtle" disabled={pendiente} onClick={() => pausar(f)}>
                    Pausar
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* (3) Los que están al día, plegados: están, pero no piden nada. */}
      {alDia.length > 0 && (
        <details className="mt-sm rounded-xl border border-line bg-surface-raised shadow-xs">
          <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-medium text-strong sm:px-[22px]">
            {fmtNumberAR(alDia.length)} al día
          </summary>
          <ul className="border-t border-line px-4 py-3 text-sm text-muted sm:px-[22px]">
            {alDia.map((f) => (
              <li key={f.clienteTenantId} className="py-0.5">
                {f.alias}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
