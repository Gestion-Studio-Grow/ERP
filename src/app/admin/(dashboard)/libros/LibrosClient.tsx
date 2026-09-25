"use client";

// Las tres tablas del Libro IVA del mes. Client component sólo por el orden de las columnas
// (DataTable es controlado); los datos llegan armados del servidor y no se recalcula nada.
// En el celular DataTable apila cada fila como tarjeta: sin scroll horizontal.
// Cada fila se identifica por `clave` (el id de la base): lo visible no es único (dos turnos
// del mismo servicio, el mismo día y al mismo precio), y DataTable la usa como `key`.

import { useMemo, useState } from "react";
import { DataTable, EmptyState, fmtMoneyARS, type DataTableColumn, type DataTableSort } from "@/components/ui";
import type { ComprobanteRow, CompraRow, VentaSinComprobanteRow } from "@/lib/libros/libro-iva";

const pct = (f: number) => (f * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 }) + "%";
const plata = (n: number, fuerte = false) => (
  <span className={`tabular-nums ${fuerte ? "font-medium" : ""}`}>{fmtMoneyARS(n)}</span>
);

// Orden del lado del cliente: DataTable avisa qué columna se pidió y acá se reordena.
function useOrden<T>(filas: T[], numericas: ReadonlySet<string>) {
  const [sort, setSort] = useState<DataTableSort>(null);
  const ordenadas = useMemo(() => {
    if (!sort) return filas;
    const { key, direction } = sort;
    const dir = direction === "asc" ? 1 : -1;
    const valor = (x: T) => (x as Record<string, unknown>)[key];
    return [...filas].sort((a, b) =>
      numericas.has(key)
        ? ((valor(a) as number) - (valor(b) as number)) * dir
        : String(valor(a)).localeCompare(String(valor(b)), "es-AR") * dir,
    );
  }, [filas, sort, numericas]);
  return { ordenadas, sort, setSort };
}

const MONTOS = new Set(["neto", "iva", "total"]);
const TOTAL = new Set(["total"]);

const LINK = "inline-flex h-11 items-center text-sm font-medium text-strong underline underline-offset-4";

export default function LibrosClient({
  comprobantes,
  ventasSinComprobante,
  compras,
  conIva,
  plegado = false,
}: {
  comprobantes: ComprobanteRow[];
  ventasSinComprobante: VentaSinComprobanteRow[];
  compras: CompraRow[];
  /** Responsable Inscripto: se muestran neto, alícuota e IVA. En monotributo, sólo el total. */
  conIva: boolean;
  /**
   * Diseño nuevo: cada libro plegado, con su cuenta y su total en la línea que lo abre (las ventas
   * sin comprobante de un mes son cientos de renglones: desplegadas medían 70.000 px en un celular).
   * Sin esto, la pantalla de siempre, tal cual.
   */
  plegado?: boolean;
}) {
  const c = useOrden(comprobantes, MONTOS);
  const v = useOrden(ventasSinComprobante, TOTAL);
  const k = useOrden(compras, TOTAL);

  const columnasIva: DataTableColumn<ComprobanteRow>[] = [
    { key: "neto", header: "Neto", sortable: true, align: "right", cell: (r) => plata(r.neto) },
    {
      key: "alicuotas",
      header: "Alíc.",
      align: "right",
      cell: (r) => <span className="tabular-nums">{r.alicuotas.map((a) => pct(a.alicuota)).join(" y ")}</span>,
    },
    { key: "iva", header: "IVA", sortable: true, align: "right", cell: (r) => plata(r.iva) },
  ];

  const colsComprobantes: DataTableColumn<ComprobanteRow>[] = [
    { key: "fecha", header: "Fecha", sortable: true, cell: (r) => r.fecha },
    { key: "tipo", header: "Tipo", cell: (r) => r.tipo },
    { key: "numero", header: "Número", cell: (r) => <span className="tabular-nums">{r.numero}</span> },
    { key: "doc", header: "Cliente", cell: (r) => r.doc },
    ...(conIva ? columnasIva : []),
    { key: "total", header: "Total", sortable: true, align: "right", cell: (r) => plata(r.total, true) },
    {
      key: "obs",
      header: "",
      cell: (r) =>
        r.anuladaSinNotaDeCredito ? (
          <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning">
            Venta anulada: falta la nota de crédito
          </span>
        ) : null,
    },
  ];

  const colsSinComprobante: DataTableColumn<VentaSinComprobanteRow>[] = [
    { key: "fecha", header: "Fecha", sortable: true, cell: (r) => r.fecha },
    { key: "tipo", header: "Tipo", cell: (r) => r.tipo },
    { key: "numero", header: "Referencia", cell: (r) => r.numero },
    { key: "cliente", header: "Cliente", cell: (r) => r.cliente },
    { key: "total", header: "Total", sortable: true, align: "right", cell: (r) => plata(r.total, true) },
  ];

  const colsCompras: DataTableColumn<CompraRow>[] = [
    { key: "fecha", header: "Fecha", sortable: true, cell: (r) => r.fecha },
    { key: "proveedor", header: "Proveedor", cell: (r) => r.proveedor },
    { key: "doc", header: "Documento", cell: (r) => r.doc },
    { key: "numero", header: "Número", cell: (r) => r.numero },
    { key: "total", header: "Total", sortable: true, align: "right", cell: (r) => plata(r.total, true) },
  ];

  if (plegado) {
    const suma = (xs: readonly { total: number }[]) => xs.reduce((t, x) => t + x.total, 0);
    const libros = [
      {
        id: "libro-comprobantes",
        titulo: "Comprobantes emitidos",
        nota: "con CAE: es lo que se declara",
        n: comprobantes.length,
        total: suma(comprobantes),
        abierto: comprobantes.length > 0 && comprobantes.length <= 30,
        tabla: (
          <DataTable
            caption="Comprobantes emitidos del mes"
            columns={colsComprobantes}
            rows={c.ordenadas}
            rowKey={(r) => r.clave}
            sort={c.sort}
            onSortChange={c.setSort}
            emptyState={<p className="px-4 py-3 text-sm text-muted">No hay comprobantes con CAE este mes: las facturas se emiten desde Facturación.</p>}
          />
        ),
      },
      {
        id: "libro-sin-comprobante",
        titulo: "Ventas sin comprobante",
        nota: "control: no se declaran ni llevan IVA calculado",
        n: ventasSinComprobante.length,
        total: suma(ventasSinComprobante),
        abierto: false,
        tabla: (
          <DataTable
            caption="Ventas sin comprobante del mes"
            columns={colsSinComprobante}
            rows={v.ordenadas}
            rowKey={(r) => r.clave}
            sort={v.sort}
            onSortChange={v.setSort}
            emptyState={<p className="px-4 py-3 text-sm text-muted">Todo lo cobrado este mes tiene comprobante.</p>}
          />
        ),
      },
      {
        id: "libro-compras",
        titulo: "Compras",
        nota: "control: sin la factura del proveedor no dan crédito fiscal",
        n: compras.length,
        total: suma(compras),
        abierto: false,
        tabla: (
          <DataTable
            caption="Compras del mes"
            columns={colsCompras}
            rows={k.ordenadas}
            rowKey={(r) => r.clave}
            sort={k.sort}
            onSortChange={k.setSort}
            emptyState={<p className="px-4 py-3 text-sm text-muted">No hay compras cargadas este mes.</p>}
          />
        ),
      },
    ];
    return (
      <div>
        {libros.map((l) => (
          <details key={l.id} className="group border-b border-line" open={l.abierto}>
            <summary className="grid min-h-12 cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto_1.5rem] items-baseline gap-x-4 py-2.5">
              <span className="min-w-0">
                <span id={l.id} className="font-semibold text-strong">
                  {l.titulo}
                </span>
                <span className="block text-[13px] text-muted">
                  {l.n} {l.n === 1 ? "renglón" : "renglones"} · {l.nota}
                </span>
              </span>
              <span className="text-right font-semibold tabular-nums">{plata(l.total)}</span>
              <span aria-hidden className="text-center text-muted transition-transform group-open:rotate-90">
                ›
              </span>
            </summary>
            <div className="pb-4">{l.tabla}</div>
          </details>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section aria-labelledby="libro-comprobantes">
        <h2 id="libro-comprobantes" className="mb-1 text-lg font-semibold text-strong">
          Comprobantes emitidos
        </h2>
        <p className="mb-3 text-sm text-muted">Con CAE de ARCA. Es lo que se declara.</p>
        <DataTable
          caption="Comprobantes emitidos del mes"
          columns={colsComprobantes}
          rows={c.ordenadas}
          rowKey={(r) => r.clave}
          sort={c.sort}
          onSortChange={c.setSort}
          emptyState={
            <EmptyState
              title="No hay comprobantes con CAE este mes"
              description="Las facturas se emiten desde Facturación. Si tu negocio todavía no factura desde el sistema, este bloque queda vacío."
              action={
                <a href="/admin/facturacion" className={LINK}>
                  Ir a Facturación
                </a>
              }
            />
          }
        />
      </section>

      <section aria-labelledby="libro-sin-comprobante">
        <h2 id="libro-sin-comprobante" className="mb-1 text-lg font-semibold text-strong">
          Ventas sin comprobante <span className="text-sm font-normal text-muted">(control)</span>
        </h2>
        <p className="mb-3 text-sm text-muted">
          Pedidos y turnos cobrados que no tienen factura con CAE. No se declaran ni llevan IVA calculado: son para
          que tu contador sepa qué se vendió sin facturar.
        </p>
        <DataTable
          caption="Ventas sin comprobante del mes"
          columns={colsSinComprobante}
          rows={v.ordenadas}
          rowKey={(r) => r.clave}
          sort={v.sort}
          onSortChange={v.setSort}
          emptyState={<EmptyState title="Todo lo cobrado este mes tiene comprobante" />}
        />
      </section>

      <section aria-labelledby="libro-compras">
        <h2 id="libro-compras" className="mb-1 text-lg font-semibold text-strong">
          Compras <span className="text-sm font-normal text-muted">(control)</span>
        </h2>
        <p className="mb-3 text-sm text-muted">
          Se cargan sin la factura del proveedor, y sin ella no dan crédito fiscal. Pasale a tu contador las facturas
          de compra para que sume el crédito.
        </p>
        <DataTable
          caption="Compras del mes"
          columns={colsCompras}
          rows={k.ordenadas}
          rowKey={(r) => r.clave}
          sort={k.sort}
          onSortChange={k.setSort}
          emptyState={<EmptyState title="No hay compras cargadas este mes" />}
        />
      </section>
    </div>
  );
}
