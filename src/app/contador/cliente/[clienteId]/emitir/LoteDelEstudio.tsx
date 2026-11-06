"use client";

// ============================================================================
// El LOTE de la consola del contador: varias facturas del cliente a consumidor final de una vez
// (las ventas del día, los abonos de un mes que no están cargados como abono). Se pega una por línea
// —«detalle ; total», o dos columnas de una planilla— y se emiten en orden con la MISMA acción del
// facturador común (emitirParaClienteAction: cliente activo de SU cartera).
//
// Cada línea viaja con su propia clave de emisión, que se conserva para el MISMO texto mientras la
// pantalla está abierta: si el lote se corta por un error y se vuelve a tocar «Emitir», las que ya
// salieron no se mandan de nuevo, y una que quedó a medias devuelve la misma factura (no otro CAE).
// ============================================================================

import { useMemo, useRef, useState, useTransition } from "react";
import { Badge, Button, Field, Segmented, Select, fmtMoneyARS } from "@/components/ui";
import { OPCIONES_ALICUOTA, OPCIONES_CONCEPTO, type AlicuotaFacturita, type ConceptoFacturita } from "@/lib/facturita-core";
import { nuevaClaveEmision } from "@/lib/facturita-atajos";
import { CONSUMIDOR_FINAL, letraPrevista, lineasDelLote, MAX_LINEAS_DEL_LOTE, type ResultadoEmisionManual } from "@/lib/facturacion/facturador-core";
import { sinJerga } from "@/lib/facturacion/estados-ux";
import { emitirParaClienteAction } from "@/lib/facturacion/emitir-manual-actions";

type Salida = { texto: string; ok: boolean };

export default function LoteDelEstudio({
  clienteId,
  condicionEmisor,
  hoy,
  alEmitir,
}: {
  clienteId: string;
  condicionEmisor: string | null;
  hoy: string;
  alEmitir: (cuantas: number) => void;
}) {
  const [texto, setTexto] = useState("");
  const [concepto, setConcepto] = useState<ConceptoFacturita>("productos");
  const [alicuota, setAlicuota] = useState<AlicuotaFacturita>("21");
  const [salidas, setSalidas] = useState<Record<string, Salida>>({});
  const [pendiente, startTransition] = useTransition();
  const claves = useRef(new Map<string, string>());

  const lineas = useMemo(
    () => lineasDelLote(texto, { hoy, condicionEmisor, concepto, alicuota }),
    [texto, hoy, condicionEmisor, concepto, alicuota],
  );
  const listas = lineas.filter((l) => l.pedido);
  const conError = lineas.length - listas.length;
  const firma = (n: number, pedido: unknown) => `${n}:${JSON.stringify(pedido)}`;
  const porEmitir = listas.filter((l) => !salidas[firma(l.n, l.pedido)]?.ok);
  const suma = porEmitir.reduce((s, l) => s + (l.total ?? 0), 0);
  // Todo el lote va a consumidor final: la letra es la misma para todas (la decide el sistema).
  const letra = letraPrevista(condicionEmisor, CONSUMIDOR_FINAL);

  const emitir = () =>
    startTransition(async () => {
      let hechas = 0;
      for (const l of porEmitir) {
        const f = firma(l.n, l.pedido);
        const clave = claves.current.get(f) ?? nuevaClaveEmision();
        claves.current.set(f, clave);
        let r: ResultadoEmisionManual;
        try {
          r = await emitirParaClienteAction(clienteId, { ...l.pedido!, claveEmision: clave });
        } catch {
          r = { ok: false, error: "No se pudo emitir. Tocá «Emitir» de nuevo: las que ya salieron no se repiten." };
        }
        const salida: Salida = r.ok
          ? {
              ok: true,
              texto:
                r.estado.estado === "autorizada"
                  ? `Factura${r.estado.letra ? ` ${r.estado.letra}` : ""} ${r.estado.numero ?? ""}${r.estado.dePrueba ? " (de prueba)" : ""}`.trim()
                  : "Guardada, esperando a ARCA",
            }
          : { ok: false, texto: r.error };
        if (r.ok && !r.repetida) hechas += 1;
        setSalidas((s) => ({ ...s, [f]: salida }));
        // Un error que no es de la línea (sin datos fiscales, sin conexión) corta el lote: no tiene
        // sentido seguir pidiendo lo mismo 30 veces.
        if (!r.ok && !r.invoiceId) break;
      }
      if (hechas > 0) alEmitir(hechas);
    });

  return (
    <section aria-labelledby="lote-titulo" className="flex flex-col gap-4">
      <h2 id="lote-titulo" className="text-base font-semibold text-strong">
        Varias a consumidor final, de una vez
      </h2>
      <p className="m-0 text-sm text-muted">
        Una por línea: el detalle, un «;» y el total. También podés pegar dos columnas de una planilla. Hasta{" "}
        {MAX_LINEAS_DEL_LOTE} por lote.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Segmented
          name="lote-concepto"
          leyenda="Son"
          leyendaVisible
          opciones={OPCIONES_CONCEPTO.map((o) => ({ valor: o.id, etiqueta: o.nombre }))}
          value={concepto}
          onChange={(e) => setConcepto((e.target as unknown as HTMLInputElement).value as ConceptoFacturita)}
          lleno
        />
        {condicionEmisor === "RESPONSABLE_INSCRIPTO" && (
          <Field label="Alícuota de IVA" htmlFor="lote-alicuota">
            <Select id="lote-alicuota" className="h-11 w-full" value={alicuota} onChange={(e) => setAlicuota(e.target.value as AlicuotaFacturita)}>
              {OPCIONES_ALICUOTA.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nombre}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>
      {concepto !== "productos" && (
        <p className="m-0 text-sm text-muted">Con servicios, cada una sale con el mes en curso y el pago a 10 días.</p>
      )}
      <Field label="Las facturas" htmlFor="lote-texto" required>
        <textarea
          id="lote-texto"
          rows={6}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={"Clase de yoga de noviembre; 18.000\nMembresía mensual; 25.000"}
          className="w-full rounded-md border border-line bg-surface px-3 py-2 font-mono text-sm text-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        />
      </Field>

      {lineas.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-sm" aria-label="Revisá antes de emitir">
            <caption className="sr-only">Cada línea con su letra y lo que hay que corregir</caption>
            <thead className="bg-surface-sunken text-left text-xs text-muted">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">#</th>
                <th scope="col" className="px-3 py-2 font-medium">Detalle</th>
                <th scope="col" className="px-3 py-2 font-medium">Letra</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Total</th>
                <th scope="col" className="px-3 py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {lineas.map((l) => {
                const s = l.pedido ? salidas[firma(l.n, l.pedido)] : undefined;
                return (
                  <tr key={l.n} data-testid="lote-fila" data-ok={l.error ? "no" : "si"} className="border-t border-line align-top">
                    <td className="px-3 py-2 tabular-nums text-muted">{l.n}</td>
                    <td className="min-w-40 px-3 py-2 text-strong [overflow-wrap:anywhere]">{l.descripcion || "—"}</td>
                    <td className="px-3 py-2 font-semibold text-strong">{l.error ? "—" : letra ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-strong">{l.total != null ? fmtMoneyARS(l.total) : "—"}</td>
                    <td className="min-w-40 px-3 py-2">
                      {l.error ? (
                        <span className="text-danger">{sinJerga(l.error)}</span>
                      ) : s ? (
                        <Badge tone={s.ok ? "success" : "danger"} dot>
                          {s.ok ? s.texto : sinJerga(s.texto)}
                        </Badge>
                      ) : (
                        <span className="text-success">Lista</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <Button onClick={emitir} disabled={pendiente || porEmitir.length === 0 || condicionEmisor === null} estado={pendiente ? "cargando" : undefined}>
          {pendiente
            ? "Emitiendo…"
            : porEmitir.length > 0
              ? `${porEmitir.length === 1 ? "Emitir la correcta" : `Emitir las ${porEmitir.length} correctas`} · ${fmtMoneyARS(suma)}`
              : "Emitir"}
        </Button>
        <p className="m-0 text-sm text-muted" aria-live="polite">
          {condicionEmisor === null
            ? "Faltan los datos fiscales del cliente (CUIT y punto de venta)."
            : lineas.length === 0
              ? "Pegá o escribí al menos una línea."
              : [
                  listas.length > 0 && porEmitir.length === 0
                    ? conError > 0
                      ? `Listo: salieron las ${listas.length} que estaban bien.`
                      : "Listo: salieron todas."
                    : null,
                  conError > 0
                    ? `${conError === 1 ? "Una línea tiene" : `${conError} líneas tienen`} algo para corregir: no sale hasta arreglarla.`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" ")}
        </p>
      </div>
    </section>
  );
}
