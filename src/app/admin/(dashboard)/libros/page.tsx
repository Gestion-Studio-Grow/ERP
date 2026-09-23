// LIBRO IVA del mes — lo que se declara (comprobantes con CAE) y, aparte, lo que sólo es
// control para la contadora (ventas sin comprobante y compras sin factura).
//
// La gobierna el módulo asignado (`requireApp("libro-iva")`): en los negocios del piloto
// con el módulo `libros` se abre; sin él, "App no disponible" dice a quién pedírsela. Antes
// la pantalla decía "Disponible en la edición Empresa" con el motor de perfiles apagado, o
// sea siempre: una pantalla vendida que nadie podía abrir.
//
// El mes es CALENDARIO (del 1 al último día, hora argentina), no "los últimos N días".
//
// A un MONOTRIBUTISTA (emite sólo Factura C) el libro se le oculta: no liquida IVA. Queda a la
// vista una sola cosa, porque el paso 3 del Cierre del mes manda acá: las ventas anuladas que
// tienen factura y ninguna nota de crédito (inflan lo facturado, que es lo que mira su
// categoría). La condición sale de lo emitido (no hay columna todavía); "sin comprobantes" no
// se oculta, porque todavía no se sabe qué es.

import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { getLibroIva } from "@/lib/libros/libro-iva-loader";
import { libroOcultoPara, muestraPosicionIva, type ComprobanteRow } from "@/lib/libros/libro-iva";
import { diaLegible, esMesKey, etiquetaDelMes, mesDelNegocio, mesVecino, nombreDelMes } from "@/lib/libros/fecha-fiscal";
import { AvisoError, EmptyState, PageHeader, buttonClasses, fmtMoneyARS, fmtNumberAR } from "@/components/ui";
import LibrosClient from "./LibrosClient";

export const dynamic = "force-dynamic";

const RUTA = "/admin/libros";

const LINK = "inline-flex h-11 items-center text-sm font-medium text-strong underline underline-offset-4";

/** El aviso de las ventas anuladas con factura y sin nota de crédito, con cuáles son. */
function AvisoAnuladas({ anuladas }: { anuladas: ComprobanteRow[] }) {
  if (anuladas.length === 0) return null;
  const n = anuladas.length;
  return (
    <AvisoError
      tono="aviso"
      className="mb-6"
      titulo={`${fmtNumberAR(n)} ${n === 1 ? "venta anulada tiene" : "ventas anuladas tienen"} factura y ninguna nota de crédito`}
      accion={
        <ul className="w-full list-disc space-y-0.5 pl-5 text-body">
          {anuladas.map((c) => (
            <li key={c.clave} className="tabular-nums">
              {c.tipo} {c.numero} del {diaLegible(c.fecha)} por {fmtMoneyARS(c.total)}
            </li>
          ))}
        </ul>
      }
      comoSeguir="Hasta que se emita la nota de crédito, esa factura sigue sumando a lo facturado del mes. Emitila en ARCA (Comprobantes en línea) y pasale el número a tu contador: el sistema todavía no registra notas de crédito, así que este aviso sigue aunque ya la hayas emitido."
    />
  );
}

// Tarjeta de resumen (número grande + contexto). `tone` tiñe el saldo.
function Stat({ label, value, hint, tone = "neutral" }: { label: string; value: string; hint?: string; tone?: "neutral" | "danger" | "success" }) {
  const toneClass = tone === "danger" ? "text-danger" : tone === "success" ? "text-success" : "text-strong";
  return (
    <div className="rounded-lg border border-line p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className={`text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export default async function LibrosPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  await requireApp("libro-iva");
  const actual = mesDelNegocio();
  const { mes: pedido } = await searchParams;
  // Un ?mes inválido o futuro cae al mes en curso: no hay libro de un mes que no empezó.
  const mes = esMesKey(pedido) && pedido <= actual ? pedido : actual;
  const libro = await getLibroIva(mes);
  const r = libro.resumen;
  const conIva = muestraPosicionIva(r.condicion);
  const anterior = mesVecino(mes, -1);
  const siguiente = mesVecino(mes, 1);
  const etiqueta = etiquetaDelMes(mes);
  const anuladas = libro.comprobantes.filter((c) => c.anuladaSinNotaDeCredito);

  const navMes = (
    <nav aria-label="Mes" className="mb-6 flex flex-wrap items-center gap-3">
      <Link href={`${RUTA}?mes=${anterior}`} rel="prev" className={buttonClasses("outline", "md")}>
        <span className="capitalize">← {etiquetaDelMes(anterior)}</span>
      </Link>
      <span className="text-sm font-medium capitalize text-strong">{etiqueta}</span>
      {siguiente <= actual && (
        <Link href={`${RUTA}?mes=${siguiente}`} rel="next" className={buttonClasses("outline", "md")}>
          <span className="capitalize">{etiquetaDelMes(siguiente)} →</span>
        </Link>
      )}
    </nav>
  );

  if (libroOcultoPara(r.condicion)) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <PageHeader title="Libro IVA" description="Tu negocio emite Factura C: no liquida IVA." />
        {navMes}
        <AvisoAnuladas anuladas={anuladas} />
        <EmptyState
          title="El Libro IVA no corresponde a tu negocio"
          description="Emitís Factura C (monotributo), que no discrimina IVA: no hay débito, crédito ni saldo que llevar. Lo facturado y lo vendido sin comprobante de cada mes van en el paquete del Cierre del mes para tu contador."
          action={
            <a href="/admin/cierre-mes" className={LINK}>
              Ir al Cierre del mes
            </a>
          }
        />
      </main>
    );
  }

  // Sin comprobantes en el mes no hay saldo que dar: '—' con el motivo, igual que el botón
  // del Inicio. Un $0 diría "no debés nada", y lo único seguro es que no se facturó.
  const sinComprobantesEnElMes = r.comprobantesCount === 0;

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="Libro IVA"
        description={`El IVA de ${etiqueta}: los comprobantes emitidos y, aparte, lo vendido sin comprobante y las compras, como control para tu contador.`}
        actions={
          <a href={`${RUTA}/export?mes=${mes}`} className={buttonClasses("outline", "md", "whitespace-nowrap")}>
            Descargar el mes (CSV)
          </a>
        }
      />

      {navMes}

      {conIva ? (
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Comprobantes (neto)"
            value={fmtMoneyARS(r.comprobantesNeto)}
            hint={`${fmtNumberAR(r.comprobantesCount)} ${r.comprobantesCount === 1 ? "comprobante" : "comprobantes"} con CAE`}
          />
          <Stat label="IVA débito" value={fmtMoneyARS(r.ivaDebito)} hint="El IVA de los comprobantes emitidos" />
          <Stat label="IVA crédito" value={fmtMoneyARS(r.ivaCredito)} hint="Sin facturas de proveedor cargadas no hay crédito" />
          {sinComprobantesEnElMes ? (
            <Stat label="IVA a pagar" value="—" hint={`Todavía no hay comprobantes con CAE de ${nombreDelMes(mes)}.`} />
          ) : (
            <Stat
              label={r.ivaSaldo >= 0 ? "IVA a pagar" : "IVA a favor"}
              value={fmtMoneyARS(Math.abs(r.ivaSaldo))}
              tone={r.ivaSaldo > 0 ? "danger" : "success"}
              hint="Débito menos crédito. Tu contador suma el crédito de tus facturas de compra."
            />
          )}
        </div>
      ) : (
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Stat
            label="Comprobantes emitidos"
            value={fmtMoneyARS(r.comprobantesTotal)}
            hint={`${fmtNumberAR(r.comprobantesCount)} ${r.comprobantesCount === 1 ? "comprobante" : "comprobantes"} con CAE`}
          />
          <Stat
            label="Vendido sin comprobante"
            value={fmtMoneyARS(r.sinComprobanteTotal)}
            hint={`${fmtNumberAR(r.sinComprobanteCount)} ${r.sinComprobanteCount === 1 ? "venta" : "ventas"}, como control`}
          />
        </div>
      )}

      {!conIva && (
        <p className="mb-6 rounded-lg border border-line bg-surface-sunken px-4 py-3 text-sm text-body">
          Todavía no hay comprobantes con CAE, así que no se puede saber si tu negocio liquida IVA. Cuando emitas el
          primero, esta pantalla lo va a mostrar.
        </p>
      )}

      <AvisoAnuladas anuladas={anuladas} />

      <LibrosClient
        comprobantes={libro.comprobantes}
        ventasSinComprobante={libro.ventasSinComprobante}
        compras={libro.compras}
        conIva={conIva}
      />
    </main>
  );
}
