"use client";

// ============================================================================
// RECIBIR MERCADERÍA — «el remito en la mano» (diseño nuevo, «Renglón»).
// ============================================================================
//
// El momento: el repartidor espera en la puerta con el remito, la mercadería está en el piso y
// hay que cortar la cadena de frío rápido. La pantalla copia el papel que se tiene en la mano:
// arriba de quién viene y el número de remito; en el medio los renglones como los trae el remito
// (producto, cantidad, costo por unidad, importe); abajo, pegado al pulgar, el total y el botón,
// con la frase de lo que falta si todavía no se puede registrar. Lo que estaba corto aparece como
// teclas para sumar un renglón de un toque (sin buscar).
//
// Lo que viaja a la acción es EXACTAMENTE lo de la pantalla de siempre (`ComprasForm`): los mismos
// nombres de campo, la cantidad y el costo en la forma canónica, `useEnvio` contra el doble toque
// y el vaciado sólo si salió bien. Las reglas están en `recibir-core.ts` (probadas).

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { recibirMercaderia, type EstadoRecepcion } from "./actions";
import { AvisoError, BuscadorCombo, Input, Plata, Seccion, Segmented, buttonClasses, fmtCuit } from "@/components/ui";
import { cantidadParaFormulario, importeParaFormulario } from "@/lib/pos-peso";
import { useEnvio } from "@/lib/inventario/envio";
import {
  leerRenglones,
  queFaltaParaRegistrar,
  renglonVacio,
  renglonesQueEntran,
  totalDelRemito,
  unidadDelRenglon,
  type MedioDeCompra,
  type ProductoRecibible,
  type ProveedorElegible,
  type RenglonTipeado,
} from "./recibir-core";

const cantidadFmt = new Intl.NumberFormat("es-AR", {
  maximumFractionDigits: 3,
});

export default function RecibirRenglon({
  productos,
  proveedores,
  formal,
  conCostos,
  cuentaCorriente,
  proveedorInicial,
  cortos,
  palabra,
}: {
  productos: ProductoRecibible[];
  proveedores: ProveedorElegible[];
  formal: boolean;
  conCostos: boolean;
  cuentaCorriente: { venceSugerido: string; dias: number } | null;
  /** `?proveedor=` ya validado contra la lista (desde la ficha del proveedor). */
  proveedorInicial: string;
  /** Ids de lo que está bajo el mínimo, en el orden en que conviene sumarlo. */
  cortos: string[];
  /** «corte» en la carnicería, «producto» en el resto. */
  palabra: string;
}) {
  const [kind, setKind] = useState<"COMPRA" | "REPOSICION">("COMPRA");
  const [pago, setPago] = useState<MedioDeCompra>("");
  const [vence, setVence] = useState(cuentaCorriente?.venceSugerido ?? "");
  const [factura, setFactura] = useState("");
  const [renglones, setRenglones] = useState<RenglonTipeado[]>([renglonVacio(1)]);
  const [proxima, setProxima] = useState(2);
  const [supplierId, setSupplierId] = useState(proveedorInicial);
  const [vuelta, setVuelta] = useState(0);
  const focoPendiente = useRef<string | null>(null);

  const { estado, enviar, enviando } = useEnvio<EstadoRecepcion>(async (prev, fd) => {
    const r = await recibirMercaderia(prev, fd);
    if (r?.ok) {
      setRenglones([renglonVacio(1)]);
      setProxima(2);
      setPago("");
      setVence(cuentaCorriente?.venceSugerido ?? "");
      setFactura("");
      setKind("COMPRA");
      setSupplierId("");
      setVuelta((v) => v + 1);
    }
    return r;
  }, null);

  useEffect(() => {
    if (!focoPendiente.current) return;
    document.getElementById(focoPendiente.current)?.focus();
    focoPendiente.current = null;
  });

  const porId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);
  const opcionesProducto = useMemo(
    () =>
      productos.map((p) => ({
        id: p.id,
        etiqueta: p.name,
        detalle: `hay ${cantidadFmt.format(p.stock)} ${unidadDelRenglon(p.unit)}`,
      })),
    [productos],
  );
  const opcionesProveedor = useMemo(
    () =>
      proveedores.map((p) => ({
        id: p.id,
        etiqueta: p.name,
        detalle: p.taxId ? `CUIT ${fmtCuit(p.taxId)}` : undefined,
      })),
    [proveedores],
  );

  const esCompra = kind === "COMPRA";
  const conMaestro = proveedores.length > 0;
  const aCuenta = esCompra && pago === "CUENTA_CORRIENTE";
  const leidos = leerRenglones(renglones, porId, conCostos);
  const total = totalDelRemito(leidos);
  const entran = renglonesQueEntran(leidos);
  const falta = queFaltaParaRegistrar({
    esCompra,
    conCostos,
    medio: pago,
    conMaestro,
    proveedorId: supplierId,
    leidos,
  });
  const yaCargados = new Set(renglones.map((r) => r.productId));
  const cortosLibres = cortos.filter((id) => !yaCargados.has(id) && porId.has(id));

  function cambiar(key: number, parte: Partial<RenglonTipeado>) {
    setRenglones((rs) => rs.map((r) => (r.key === key ? { ...r, ...parte } : r)));
  }
  function sumarRenglon(productId = "") {
    const key = proxima;
    setProxima((k) => k + 1);
    setRenglones((rs) => {
      // Si el último está vacío, se usa ése: no quedan renglones en blanco de más.
      const ultimo = rs[rs.length - 1];
      if (productId && ultimo && !ultimo.productId && !ultimo.qtyText && !ultimo.costText) {
        return [...rs.slice(0, -1), { ...ultimo, productId }];
      }
      return [...rs, renglonVacio(key, productId)];
    });
    return key;
  }
  function sumarCorto(productId: string) {
    const ultimo = renglones[renglones.length - 1];
    const reusa = ultimo && !ultimo.productId && !ultimo.qtyText && !ultimo.costText;
    const key = sumarRenglon(productId);
    focoPendiente.current = `cant-${reusa ? ultimo.key : key}`;
  }
  function sacar(key: number) {
    setRenglones((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : [renglonVacio(rs[0]?.key ?? 1)]));
  }

  const campoProveedor = conMaestro ? (
    <div className="min-w-0">
      <label htmlFor={`proveedor-${vuelta}`} className="mb-1.5 block text-sm font-medium text-strong">
        {esCompra ? "De quién viene" : "De quién viene (si viene de alguien)"}
      </label>
      <BuscadorCombo
        key={`prov-${vuelta}`}
        id={`proveedor-${vuelta}`}
        ariaLabel="Proveedor"
        opciones={opcionesProveedor}
        valor={supplierId}
        onElegir={setSupplierId}
        placeholder="Buscá por nombre o CUIT…"
      />
      <input type="hidden" name="supplierId" value={supplierId} />
      {supplierId && (
        <button
          type="button"
          onClick={() => setSupplierId("")}
          className="mt-1 min-h-11 text-sm text-muted underline underline-offset-2"
        >
          Sin proveedor
        </button>
      )}
    </div>
  ) : (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-sm font-medium text-strong">
        {formal ? "Razón social del proveedor" : esCompra ? "De quién viene" : "De quién viene (si viene de alguien)"}
      </span>
      <Input
        key={`prov-${vuelta}`}
        name="supplier"
        placeholder={formal ? "Ej.: Distribuidora Norte S.A." : "Nombre del proveedor"}
      />
    </label>
  );

  const unidadesSumadas = (() => {
    const porUnidad = new Map<string, number>();
    for (const r of entran) {
      const u = unidadDelRenglon(r.producto!.unit);
      porUnidad.set(u, (porUnidad.get(u) ?? 0) + r.cantidad);
    }
    return [...porUnidad].map(([u, c]) => `${cantidadFmt.format(c)} ${u}`).join(" + ");
  })();

  return (
    <form onSubmit={enviar} className="space-y-8">
      {estado?.ok === false && <AvisoError titulo="No se registró la entrada" comoSeguir={estado.error} />}
      {estado?.ok && (
        <p
          role="status"
          className="flex flex-wrap items-center gap-x-3 border-y border-line-strong py-3 text-sm text-strong"
        >
          <span>{estado.mensaje}</span>
          {estado.deudaId && (
            <Link
              href={`/admin/cuentas-a-pagar/${estado.deudaId}`}
              className="inline-flex min-h-11 items-center font-medium text-accent underline underline-offset-2"
            >
              Ver la deuda
            </Link>
          )}
        </p>
      )}

      {/* 1 · Del remito: qué entra, de quién y con qué papel. */}
      <Seccion nivel="h2" id="del-remito" titulo="Del remito" className="space-y-4">
        <Segmented
          name="kind"
          leyenda="Qué entra"
          opciones={[
            { valor: "COMPRA", etiqueta: "Compra a proveedor" },
            { valor: "REPOSICION", etiqueta: "Reposición interna" },
          ]}
          value={kind}
          onChange={(e) => setKind(((e.nativeEvent.target as HTMLInputElement | null)?.value ?? "") as typeof kind)}
          lleno
          className="sm:w-auto sm:inline-flex"
        />
        <p className="text-sm text-muted">
          {esCompra
            ? conCostos
              ? "Suma stock y deja el costo de compra."
              : "Suma stock. El costo lo carga la dueña o el dueño."
            : "Un recuento o una devolución interna: suma stock, el costo es opcional y no mueve la caja."}
        </p>
        <div className="grid gap-4 sm:grid-cols-2" key={`cab-${vuelta}`}>
          {campoProveedor}
          {formal ? (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-strong">CUIT</span>
              <Input name="cuit" placeholder="30-71234567-1" inputMode="numeric" />
            </label>
          ) : (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-strong">N° de remito o nota</span>
              <Input name="notes" placeholder="Ej.: remito 0001-00042, entrega parcial" autoComplete="off" />
            </label>
          )}
          {formal && (
            <>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-strong">N° de orden de compra</span>
                <Input name="orderNumber" placeholder="Ej.: A-0042" autoComplete="off" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-strong">N° de remito o nota</span>
                <Input name="notes" placeholder="Ej.: remito 0001-00042" autoComplete="off" />
              </label>
            </>
          )}
        </div>
      </Seccion>

      {/* 2 · Lo que llegó: los renglones como vienen en el papel. */}
      <Seccion
        nivel="h2"
        id="lo-que-llego"
        titulo="Lo que llegó"
        className="space-y-3"
        nota={entran.length === 1 ? "1 renglón" : `${entran.length} renglones`}
      >
        {/* Cabecera de columnas, sólo en la PC (en el celular cada campo lleva su rótulo). */}
        <div
          aria-hidden
          className={`hidden gap-3 bg-surface-sunken px-2 py-1.5 text-xs font-medium uppercase tracking-wide text-muted sm:grid ${
            conCostos
              ? "sm:grid-cols-[minmax(0,1fr)_8.5rem_9.5rem_7.5rem_2.75rem]"
              : "sm:grid-cols-[minmax(0,1fr)_8.5rem_2.75rem]"
          }`}
        >
          <span>{palabra}</span>
          <span className="text-right">Cantidad</span>
          {conCostos && <span className="text-right">Costo por unidad</span>}
          {conCostos && <span className="text-right">Importe</span>}
          <span />
        </div>

        <ol className="m-0 list-none divide-y divide-line p-0">
          {leidos.map((r, i) => {
            const u = r.producto ? unidadDelRenglon(r.producto.unit) : "";
            return (
              <li
                key={r.key}
                className={`grid grid-cols-2 items-start gap-x-3 gap-y-2 py-3 sm:items-center sm:gap-y-0 ${
                  conCostos
                    ? "sm:grid-cols-[minmax(0,1fr)_8.5rem_9.5rem_7.5rem_2.75rem]"
                    : "sm:grid-cols-[minmax(0,1fr)_8.5rem_2.75rem]"
                }`}
              >
                <div className="col-span-2 min-w-0 sm:col-span-1">
                  <label htmlFor={`prod-${r.key}`} className="mb-1 block text-xs font-medium text-muted sm:sr-only">
                    {palabra} · renglón {i + 1}
                  </label>
                  <BuscadorCombo
                    id={`prod-${r.key}`}
                    ariaLabel={`${palabra}, renglón ${i + 1}`}
                    opciones={opcionesProducto}
                    valor={r.productId}
                    onElegir={(id) => {
                      cambiar(r.key, { productId: id });
                      focoPendiente.current = `cant-${r.key}`;
                    }}
                    placeholder="Buscá por nombre…"
                  />
                </div>
                <label className="block min-w-0">
                  <span className="mb-1 block text-xs font-medium text-muted sm:sr-only">Cantidad{u && ` (${u})`}</span>
                  <span className="relative block">
                    <Input
                      id={`cant-${r.key}`}
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={r.qtyText}
                      aria-invalid={r.cantidadMal || undefined}
                      disabled={!r.producto}
                      placeholder={r.producto ? "0" : "—"}
                      onChange={(e) => cambiar(r.key, { qtyText: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        e.preventDefault();
                        if (conCostos) document.getElementById(`costo-${r.key}`)?.focus();
                        else if (r.cantidad > 0) focoPendiente.current = `prod-${sumarRenglon()}`;
                      }}
                      className="pr-9 text-right tabular-nums"
                    />
                    <span
                      aria-hidden
                      className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-muted"
                    >
                      {u}
                    </span>
                  </span>
                </label>
                {conCostos && (
                  <label className="block min-w-0">
                    <span className="mb-1 block text-xs font-medium text-muted sm:sr-only">
                      Costo por {u || "unidad"}
                      {!esCompra && " (opcional)"}
                    </span>
                    <span className="relative block">
                      <span
                        aria-hidden
                        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted"
                      >
                        $
                      </span>
                      <Input
                        id={`costo-${r.key}`}
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        value={r.costText}
                        aria-invalid={r.costoMal || undefined}
                        disabled={!r.producto}
                        placeholder={r.producto ? "0" : "—"}
                        onChange={(e) => cambiar(r.key, { costText: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key !== "Enter") return;
                          e.preventDefault();
                          if (r.cantidad > 0) focoPendiente.current = `prod-${sumarRenglon()}`;
                        }}
                        className="pl-6 text-right tabular-nums"
                      />
                    </span>
                  </label>
                )}
                <div
                  className={`${conCostos ? "col-span-2 sm:col-span-2" : "col-span-2 sm:col-span-1"} flex min-h-11 items-center justify-end gap-2 sm:justify-end`}
                >
                  {conCostos && (
                    <span className="mr-auto text-sm text-muted sm:hidden">{r.importe > 0 ? "Importe" : ""}</span>
                  )}
                  {conCostos && (
                    <span className="min-w-[7.5rem] text-right text-sm text-strong">
                      {r.importe > 0 ? <Plata valor={r.importe} /> : <span className="text-muted">—</span>}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => sacar(r.key)}
                    aria-label={r.producto ? `Sacar ${r.producto.name}` : `Sacar el renglón ${i + 1}`}
                    className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-xl leading-none text-muted hover:text-danger"
                  >
                    ×
                  </button>
                </div>
                {r.producto && !r.cantidadMal && (
                  <p className="col-span-2 -mt-1 text-xs text-muted sm:col-span-full sm:mt-1">
                    Hay {cantidadFmt.format(r.producto.stock)} {u}
                    {r.cantidad > 0 && ` · queda en ${cantidadFmt.format(r.producto.stock + r.cantidad)} ${u}`}
                  </p>
                )}
                {(r.cantidadMal || r.costoMal) && (
                  <p role="alert" className="col-span-2 text-sm text-danger sm:col-span-full sm:mt-1">
                    {r.cantidadMal
                      ? "Eso no es una cantidad. Escribila con coma si tiene decimales (12,5)."
                      : "Eso no es un costo. Escribilo como 6.543 o 6.543,50."}
                  </p>
                )}
                {r.producto && r.cantidad > 0 && (
                  <>
                    <input type="hidden" name="productId" value={r.productId} />
                    <input type="hidden" name="quantity" value={cantidadParaFormulario(r.cantidad)} />
                    <input type="hidden" name="unitCost" value={r.costo > 0 ? importeParaFormulario(r.costo) : ""} />
                  </>
                )}
              </li>
            );
          })}
        </ol>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              focoPendiente.current = `prod-${sumarRenglon()}`;
            }}
            className={buttonClasses("outline", "md")}
          >
            Otro renglón
          </button>
          {cortosLibres.length > 0 && (
            <>
              <span className="ml-1 text-sm text-muted">Estaba corto:</span>
              {cortosLibres.map((id) => {
                const p = porId.get(id)!;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => sumarCorto(id)}
                    className="chip-btn min-h-11 text-sm"
                    title={`Hay ${cantidadFmt.format(p.stock)} ${unidadDelRenglon(p.unit)}, mínimo ${cantidadFmt.format(p.lowStockAt)}`}
                  >
                    {p.name}
                    <span className="ml-1.5 tabular-nums text-muted">
                      {cantidadFmt.format(p.stock)} {unidadDelRenglon(p.unit)}
                    </span>
                  </button>
                );
              })}
            </>
          )}
        </div>
      </Seccion>

      {/* 3 · Cómo se pagó: sólo una compra, y sólo para quien ve el costo. */}
      {esCompra && conCostos && (
        <Seccion nivel="h2" id="como-se-pago" titulo="Cómo se pagó" className="space-y-3">
          <Segmented
            name="pago"
            leyenda="Cómo se pagó"
            opciones={[
              { valor: "EFECTIVO", etiqueta: "Efectivo" },
              { valor: "MP", etiqueta: "Transferencia o MP" },
              { valor: "TARJETA", etiqueta: "Tarjeta" },
              ...(cuentaCorriente ? [{ valor: "CUENTA_CORRIENTE", etiqueta: "A cuenta" }] : []),
            ]}
            value={pago}
            onChange={(e) => setPago(((e.nativeEvent.target as HTMLInputElement | null)?.value ?? "") as MedioDeCompra)}
            lleno
            className="flex-wrap [&>label]:basis-[calc(50%-2px)] sm:flex-nowrap sm:[&>label]:basis-0"
          />
          <p className="text-sm text-muted">
            {aCuenta
              ? "Hoy no sale plata de la caja: queda como deuda con el proveedor en Cuentas a pagar y sale cuando la pagues."
              : "Sale de la caja por esa columna. Si se elige mal, el arqueo del día cierra con faltante en una y sobrante en la otra."}
          </p>
          {aCuenta && cuentaCorriente && (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-strong">Vence</span>
                <Input type="date" name="vence" value={vence} onChange={(e) => setVence(e.target.value)} />
                <span className="mt-1 block text-sm text-muted">
                  Propuesto a {cuentaCorriente.dias} días. Vacío si no tiene vencimiento.
                </span>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-strong">N° de factura (si la trajo)</span>
                <Input
                  name="factura"
                  value={factura}
                  maxLength={40}
                  autoComplete="off"
                  onChange={(e) => setFactura(e.target.value)}
                  placeholder="Ej.: A 0001-00012345"
                />
              </label>
            </div>
          )}
        </Seccion>
      )}

      {/* El pie del remito: pegado abajo en el celular (arriba de la barra), al final en la PC. */}
      <div className="sticky bottom-[var(--alto-barra-inferior,0px)] z-10 -mx-4 border-t-2 border-double border-line-strong bg-surface px-4 pt-3 pb-[max(0.75rem,calc(env(safe-area-inset-bottom)_-_var(--alto-barra-inferior,0px)))] sm:static sm:z-auto sm:mx-0 sm:px-0 sm:pb-0">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-muted tabular-nums">
              {entran.length === 0
                ? "Nada cargado"
                : `${entran.length === 1 ? "1 renglón" : `${entran.length} renglones`} · ${unidadesSumadas}`}
            </p>
            {conCostos && (
              <p className="text-2xl font-semibold leading-tight text-strong">
                <Plata valor={total} />
              </p>
            )}
          </div>
          <button
            type="submit"
            disabled={falta !== null || enviando}
            aria-describedby="recibir-falta"
            className={`${buttonClasses("solid", "lg")} shrink-0 disabled:opacity-50`}
          >
            {enviando ? "Registrando…" : esCompra ? "Registrar compra" : "Registrar reposición"}
          </button>
        </div>
        <p id="recibir-falta" aria-live="polite" className="mt-1 min-h-5 text-sm text-muted">
          {falta ?? ""}
          {falta && pago === "CUENTA_CORRIENTE" && !conMaestro && (
            <>
              {" "}
              <Link href="/admin/proveedores" className="font-medium text-accent underline underline-offset-2">
                Ir a Proveedores
              </Link>
            </>
          )}
        </p>
      </div>
    </form>
  );
}
