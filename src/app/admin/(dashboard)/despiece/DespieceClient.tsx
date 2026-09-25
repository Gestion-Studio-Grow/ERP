"use client";

import { useMemo, useState } from "react";
import { registrarDespiece, type EstadoDespiece } from "@/lib/carniceria/despiece-actions";
import { planDelDespiece, type MetodoDeCosteo } from "@/lib/carniceria/despiece";
import { leerCantidad, leerImporte, cantidadParaFormulario, importeParaFormulario } from "@/lib/pos-peso";
import { useEnvio } from "@/lib/inventario/envio";
import { AvisoError, Badge, Bloque, Input, LineaDeCuenta, Marca, Plata, Renglon, Select, buttonClasses, fmtMoneyARS } from "@/components/ui";

export interface RunView {
  id: string;
  code: number;
  inputName: string;
  inputWeightKg: number;
  inputCost: number;
  totalOutputKg: number;
  mermaKg: number;
  mermaPct: number;
  costPerSellableKg: number | null;
  createdAtLabel: string;
  outputs: { name: string; weightKg: number }[];
}

/** Un producto que puede ser pieza o corte: se cuenta en kilos. Lo arma la página. */
export type ProductoDeDespiece = {
  id: string;
  name: string;
  stock: number;
  /** Precio de venta por kilo, para costear el corte (null = no se vende por kilo). */
  precioPorKg: number | null;
  /** Costo vigente por kilo (para proponer el costo de la pieza), o null. */
  costoPorKg: number | null;
};

type OutRow = { name: string; weight: string; productId: string };

const pct = (n: number) => `${Math.round(n * 100)}%`;
const kgFmt = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 });
const filaVacia = (): OutRow => ({ name: "", weight: "", productId: "" });

const EXPLICACION: Record<MetodoDeCosteo, string> = {
  "valor-de-venta":
    "El costo de la pieza se reparte por lo que vale cada corte a precio de venta: el lomo carga más que el osobuco. Lo que sale sin precio (hueso, grasa) no carga costo.",
  "por-kilo": "Ningún corte tiene precio de venta cargado: el costo se reparte parejo por kilo. Cargá los precios en el catálogo para repartirlo por valor.",
  "sin-costo": "Sin costo de la pieza, los cortes entran al stock sin costo.",
};

/**
 * `renglon` (diseño nuevo): el formulario sin cajas (cada parte con su título sobre la raya), la
 * vista previa como una cuenta (kilos, merma, costo) con un renglón por corte, y el historial como
 * renglones. Mismos campos, misma regla (`planDelDespiece`), misma acción.
 */
export default function DespieceClient({ runs, products, renglon = false }: { runs: RunView[]; products: ProductoDeDespiece[]; renglon?: boolean }) {
  const caja = (vieja: string) => (renglon ? "" : vieja);
  const tituloDeParte = renglon
    ? "border-b border-line-strong pb-2 text-[15px] font-semibold text-strong"
    : "text-base font-medium text-strong";
  const [piezaId, setPiezaId] = useState("");
  const [inputWeight, setInputWeight] = useState("");
  const [inputCost, setInputCost] = useState("");
  const [rows, setRows] = useState<OutRow[]>([filaVacia(), filaVacia()]);
  const porId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const { estado, enviar, enviando } = useEnvio<EstadoDespiece>(async (prev, fd) => {
    const r = await registrarDespiece(prev, fd);
    if (r?.ok) {
      setPiezaId("");
      setInputWeight("");
      setInputCost("");
      setRows([filaVacia(), filaVacia()]);
    }
    return r;
  }, null);

  const setRow = (i: number, patch: Partial<OutRow>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, filaVacia()]);
  const removeRow = (i: number) => setRows((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : rs));

  // Al elegir el producto, el nombre del corte se completa si está vacío.
  const onPickProduct = (i: number, id: string) => {
    const name = porId.get(id)?.name ?? "";
    setRow(i, { productId: id, name: rows[i].name || name });
  };

  const pieza = porId.get(piezaId) ?? null;
  const kilos = leerCantidad(inputWeight);
  const costo = leerImporte(inputCost);
  const pesos = rows.map((r) => leerCantidad(r.weight));
  const hayIlegible = kilos.estado === "invalida" || costo.estado === "invalida" || pesos.some((p) => p.estado === "invalida");
  // Un corte a medias (nombre sin kilos o kilos sin nombre) lo rechaza el servidor: se avisa acá.
  const aMedias = rows.findIndex((r, i) => (r.name.trim() !== "") !== (pesos[i].estado === "ok" && pesos[i].valor > 0) && pesos[i].estado !== "invalida");

  // Vista previa EN VIVO con la MISMA regla que usa el servidor al registrar (`planDelDespiece`).
  const plan =
    !pieza || kilos.estado !== "ok"
      ? null
      : planDelDespiece({
          pieza: { productId: pieza.id, nombre: pieza.name, kilo: true, stock: pieza.stock },
          kilos: kilos.valor,
          costoTipeado: costo.estado === "ok" ? costo.valor : null,
          costoVigentePiezaPorKg: pieza.costoPorKg,
          cortes: rows.map((r, i) => {
            const prod = porId.get(r.productId);
            const p = pesos[i];
            return {
              name: r.name.trim(),
              weightKg: p.estado === "ok" ? p.valor : 0,
              producto: prod ? { id: prod.id, nombre: prod.name, kilo: true, precioPorKg: prod.precioPorKg } : null,
            };
          }),
        });

  return (
    <div className="space-y-10">
      <form onSubmit={enviar} className="space-y-5">
        {estado?.ok === false && <AvisoError titulo="No se registró el despiece" comoSeguir={estado.error} />}
        {estado?.ok && (
          <p role="status" className="rounded-md border border-success/30 bg-success-soft px-3 py-2 text-sm text-strong">
            {estado.mensaje}
          </p>
        )}

        <section className={caja("rounded-lg border border-line bg-surface-sunken p-4")}>
          <h2 className={`${tituloDeParte} mb-1`}>Pieza que entra</h2>
          <p className={renglon ? "mb-3 text-[13px] text-muted" : "text-xs text-muted mb-3"}>Sale del stock al registrar: tiene que estar cargada (Recibir mercadería).</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="d-pieza" className="text-xs font-medium text-muted">Pieza</label>
              <Select id="d-pieza" name="inputProductId" required value={piezaId} onChange={(e) => setPiezaId(e.target.value)}>
                <option value="">Elegí la pieza…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — hay {kgFmt.format(p.stock)} kg
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="d-inputWeight" className="text-xs font-medium text-muted">Peso de la pieza (kg)</label>
              <Input
                id="d-inputWeight"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                required
                value={inputWeight}
                aria-invalid={kilos.estado === "invalida" ? true : undefined}
                onChange={(e) => setInputWeight(e.target.value)}
                placeholder="ej: 112,5"
              />
              {kilos.estado === "ok" && <input type="hidden" name="inputWeightKg" value={cantidadParaFormulario(kilos.valor)} />}
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="d-inputCost" className="text-xs font-medium text-muted">Costo total de la pieza ($)</label>
              <Input
                id="d-inputCost"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={inputCost}
                aria-invalid={costo.estado === "invalida" ? true : undefined}
                onChange={(e) => setInputCost(e.target.value)}
                placeholder={pieza?.costoPorKg ? `vacío: ${fmtMoneyARS(pieza.costoPorKg)} el kilo` : "ej: 900.000"}
              />
              {costo.estado === "ok" && <input type="hidden" name="inputCost" value={importeParaFormulario(costo.valor)} />}
              <span className="text-xs text-faint">Si lo dejás vacío, se usa el costo de su última compra.</span>
            </div>
          </div>
        </section>

        <section className={caja("rounded-lg border border-line p-4")}>
          <div className={renglon ? "mb-2 flex flex-wrap items-end justify-between gap-2 border-b border-line-strong pb-2" : "flex flex-wrap items-center justify-between gap-2 mb-3"}>
            <h2 className={renglon ? "text-[15px] font-semibold text-strong" : "text-base font-medium text-strong"}>Cortes obtenidos</h2>
            <button type="button" onClick={addRow} className="chip-btn max-sm:min-h-11! min-h-11">+ Agregar corte</button>
          </div>
          <p className={renglon ? "mb-1 text-[13px] text-muted" : "text-xs text-muted mb-3"}>
            Elegí el producto para que el corte sume al stock. Hueso y grasa se cargan sin producto: cuentan para el
            rendimiento y no cargan costo.
          </p>
          <div className={renglon ? "divide-y divide-line border-b border-line" : "space-y-3"}>
            {rows.map((r, i) => (
              <div key={i} className={renglon ? "grid grid-cols-1 items-end gap-2 py-3 sm:grid-cols-[1fr_1fr_120px_auto]" : "grid grid-cols-1 sm:grid-cols-[1fr_1fr_120px_auto] gap-2 items-end"}>
                <div className="flex flex-col gap-1">
                  <label htmlFor={`d-prod-${i}`} className="text-xs font-medium text-muted">Producto</label>
                  <Select id={`d-prod-${i}`} name="outputProductId" value={r.productId} onChange={(e) => onPickProduct(i, e.target.value)}>
                    <option value="">Sin producto (no suma stock)</option>
                    {products
                      .filter((p) => p.id !== piezaId)
                      .map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                  </Select>
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor={`d-name-${i}`} className="text-xs font-medium text-muted">Nombre del corte</label>
                  <Input id={`d-name-${i}`} name="outputName" value={r.name} maxLength={80} onChange={(e) => setRow(i, { name: e.target.value })} placeholder="ej: Asado de tira" />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor={`d-kg-${i}`} className="text-xs font-medium text-muted">Kilos</label>
                  <Input
                    id={`d-kg-${i}`}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={r.weight}
                    aria-invalid={pesos[i].estado === "invalida" ? true : undefined}
                    onChange={(e) => setRow(i, { weight: e.target.value })}
                    placeholder="kg"
                  />
                  {/* Viaja la forma canónica (punto decimal): el servidor la vuelve a leer igual. */}
                  <input type="hidden" name="outputWeight" value={pesos[i].estado === "ok" ? cantidadParaFormulario(pesos[i].valor) : r.weight} />
                </div>
                <button type="button" onClick={() => removeRow(i)} className="chip-btn max-sm:min-h-11! chip-btn-danger min-h-11" aria-label={`Quitar el corte ${i + 1}`}>
                  Quitar
                </button>
              </div>
            ))}
          </div>
          {hayIlegible && (
            <p role="alert" className="mt-2 text-xs text-danger">Hay un número que no se entiende. Escribí los kilos con coma (12,5) y la plata como 900.000.</p>
          )}
          {!hayIlegible && aMedias !== -1 && (
            <p aria-live="polite" className="mt-2 text-xs text-warning">
              Al corte {aMedias + 1} le falta {rows[aMedias].name.trim() ? "el peso" : "el nombre"}. Completalo o quitalo.
            </p>
          )}
        </section>

        {/* Vista previa: los mismos números y el mismo "no se puede" que el servidor. */}
        {plan && !plan.ok && (
          <p role="alert" className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-strong">
            {plan.error}
          </p>
        )}
        {plan?.ok && renglon && (
          <section aria-live="polite" aria-labelledby="despiece-previa">
            <h3 id="despiece-previa" className="border-b border-line-strong pb-2 text-[15px] font-semibold text-strong">
              Así queda
            </h3>
            <LineaDeCuenta concepto="Kilos obtenidos" importe={<span className="tabular-nums">{kgFmt.format(plan.analisis.totalOutputKg)} kg</span>} />
            <LineaDeCuenta
              concepto="Merma"
              detalle="lo que entró y no salió como corte"
              importe={<span className="tabular-nums">{kgFmt.format(plan.analisis.mermaKg)} kg · {pct(plan.analisis.mermaPct)}</span>}
            />
            <LineaDeCuenta concepto="Sale del stock" importe={<span className="tabular-nums">{kgFmt.format(-plan.salida.qty)} kg</span>} />
            <LineaDeCuenta concepto="Costo de la pieza" importe={plan.costoPieza != null ? <Plata valor={plan.costoPieza} /> : "—"} />
            <p className="py-2 text-[13px] text-muted">{EXPLICACION[plan.analisis.metodoDeCosteo]}</p>
            <ul data-parte="renglones">
              {plan.analisis.outputs.map((o, i) => (
                <Renglon
                  key={i}
                  as="li"
                  folio={<span className="tabular-nums">rinde {pct(o.yieldPct)}</span>}
                  titulo={o.name}
                  detalle={`${kgFmt.format(o.weightKg)} kg`}
                  plata={
                    o.costPerKg != null ? (
                      <span className="whitespace-nowrap">
                        <Plata valor={o.costPerKg} /> <span className="text-[13px] text-muted">el kilo</span>
                      </span>
                    ) : (
                      <span className="text-[13px] text-muted">sin costo</span>
                    )
                  }
                />
              ))}
            </ul>
          </section>
        )}
        {plan?.ok && !renglon && (
          <section aria-live="polite" className="rounded-lg border border-line bg-surface-raised p-4">
            <h3 className="text-sm font-medium text-strong mb-3">Vista previa</h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
              <div>
                <p className="text-xs text-muted">Kilos obtenidos</p>
                <p className="text-lg font-semibold tabular-nums text-strong">{kgFmt.format(plan.analisis.totalOutputKg)} kg</p>
              </div>
              <div>
                <p className="text-xs text-muted">Merma</p>
                <p className="text-lg font-semibold tabular-nums text-warning">
                  {kgFmt.format(plan.analisis.mermaKg)} kg <span className="text-sm">({pct(plan.analisis.mermaPct)})</span>
                </p>
              </div>
              <div>
                <p className="text-xs text-muted">Costo de la pieza</p>
                <p className="text-lg font-semibold tabular-nums text-strong">{plan.costoPieza != null ? fmtMoneyARS(plan.costoPieza) : "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Sale del stock</p>
                <p className="text-lg font-semibold tabular-nums text-strong">{kgFmt.format(-plan.salida.qty)} kg</p>
              </div>
            </div>
            <p className="mb-3 text-xs text-muted">{EXPLICACION[plan.analisis.metodoDeCosteo]}</p>
            <ul className="divide-y divide-line text-sm">
              {plan.analisis.outputs.map((o, i) => (
                <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-1.5">
                  <span className="text-body">
                    {o.name} <span className="text-xs text-muted">· {kgFmt.format(o.weightKg)} kg · rinde {pct(o.yieldPct)}</span>
                  </span>
                  <span className="tabular-nums text-body">
                    {o.costPerKg != null ? `${fmtMoneyARS(o.costPerKg)} el kilo` : "sin costo"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div>
          <button
            type="submit"
            disabled={enviando || hayIlegible || aMedias !== -1 || !plan || !plan.ok}
            className={buttonClasses("solid", "md", "disabled:opacity-50")}
          >
            {enviando ? "Registrando…" : "Registrar despiece"}
          </button>
          <p className="mt-2 text-xs text-muted">
            {plan
              ? "Al registrar: sale la pieza del stock, entra cada corte que elegiste con su costo por kilo, y queda el despiece con su rendimiento."
              : "Elegí la pieza y cargá su peso para ver la vista previa y registrar."}
          </p>
        </div>
      </form>

      {/* Historial */}
      {renglon ? (
        <Bloque id="despiece-hist" titulo="Despieces registrados" cuenta={runs.length > 0 ? runs.length : undefined}>
          {runs.length === 0 ? (
            <p data-ui="vacio" className="border-b border-line py-4 text-sm text-body">Todavía no registraste ningún despiece.</p>
          ) : (
            <ul data-parte="renglones">
              {runs.map((r) => (
                <Renglon
                  key={r.id}
                  as="li"
                  folio={`#${r.code} · ${r.createdAtLabel}`}
                  titulo={r.inputName}
                  detalle={
                    <>
                      <span className="tabular-nums">
                        {kgFmt.format(r.inputWeightKg)} kg → {kgFmt.format(r.totalOutputKg)} kg ·{" "}
                        {r.mermaKg < 0 ? (
                          <Marca tipo="atencion">salió más de lo que entró ({kgFmt.format(-r.mermaKg)} kg)</Marca>
                        ) : (
                          `merma ${kgFmt.format(r.mermaKg)} kg (${pct(r.mermaPct)})`
                        )}
                      </span>
                      <span className="block">{r.outputs.map((o) => `${o.name} ${kgFmt.format(o.weightKg)} kg`).join(" · ")}</span>
                    </>
                  }
                  plata={
                    r.costPerSellableKg != null ? (
                      <span className="whitespace-nowrap">
                        <Plata valor={r.costPerSellableKg} /> <span className="text-[13px] text-muted">el kilo</span>
                      </span>
                    ) : (
                      "—"
                    )
                  }
                />
              ))}
            </ul>
          )}
        </Bloque>
      ) : (
        <section aria-labelledby="despiece-hist">
          <h2 id="despiece-hist" className="text-lg font-medium text-strong mb-3">Despieces registrados</h2>
          {runs.length === 0 ? (
            <p className="text-sm text-muted">Todavía no registraste ningún despiece.</p>
          ) : (
            <div className="space-y-3">
              {runs.map((r) => (
                <div key={r.id} className="rounded-lg border border-line p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                    <div>
                      <span className="text-sm font-semibold text-strong">#{r.code} · {r.inputName}</span>
                      <span className="ml-2 text-xs text-faint">{r.createdAtLabel}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-sm tabular-nums">
                      <span className="text-muted">{kgFmt.format(r.inputWeightKg)} kg →</span>
                      <span className="text-body">{kgFmt.format(r.totalOutputKg)} kg</span>
                      <Badge tone={r.mermaKg < 0 ? "danger" : "warning"}>merma {kgFmt.format(r.mermaKg)} kg ({pct(r.mermaPct)})</Badge>
                      {r.costPerSellableKg != null && <Badge tone="neutral">{fmtMoneyARS(r.costPerSellableKg)} el kilo promedio</Badge>}
                    </div>
                  </div>
                  <p className="text-xs text-muted">{r.outputs.map((o) => `${o.name} ${kgFmt.format(o.weightKg)} kg`).join(" · ")}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
