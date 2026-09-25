// ============================================================================
// MOVIMIENTOS DE STOCK — diseño nuevo («Renglón»). Servidor, sin lecturas propias.
// ============================================================================
//
// Los mismos datos que la pantalla de siempre (getMovimientos) y los mismos filtros (un GET). Se
// lee como el libro de la cámara: arriba lo que hay que recontar ya (los productos en negativo),
// después cada día con su rótulo y su cuenta, y en cada renglón la hora, qué pasó, quién y por qué,
// y a la derecha cuánto entró o salió y cuánto quedó. Los días de más atrás quedan plegados con su
// cuenta a la vista: en el celular eran 26.000 px de corrido.

import Link from "next/link";
import type { getMovimientos } from "@/lib/inventario/movimientos-loader";
import { MAX_FILAS } from "@/lib/inventario/movimientos-loader";
import { hrefMovimientos, nombreDelTipo, quienHizo, type FiltrosDeMovimientos } from "@/lib/inventario/movimientos";
import { dateStrInBusinessTz, fmtCalendarDateLabel, fmtTime, todayInBusinessTz } from "@/lib/datetime";
import { formatearCantidad } from "@/lib/pos-peso";
import { Bloque, Renglon, buttonClasses, fmtMoneyARS, fmtNumberAR } from "@/components/ui";
import { agruparPorDia, diasAbiertos, rotuloCercano } from "./libro-core";

type Datos = Awaited<ReturnType<typeof getMovimientos>>;
type Movimiento = Datos["movimientos"][number];

const firmado = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3, signDisplay: "always" });
const enlace = "inline-flex min-h-11 items-center underline-offset-2 hover:underline";

export function CabeceraMovimientos({
  elegido,
  cuantos,
  hayMas,
  veStock,
}: {
  elegido?: { name: string; stock: number; unit: string };
  cuantos: number;
  hayMas: boolean;
  veStock: boolean;
}) {
  return (
    <header data-ui="page-header" className="mb-4">
      <h1 className="text-2xl font-bold text-strong">{elegido ? `Movimientos de ${elegido.name}` : "Movimientos de stock"}</h1>
      <p className="mt-1 text-sm text-muted">
        {elegido && (
          <>
            {"Hay ahora "}
            <strong className="tabular-nums text-strong">{`${formatearCantidad(elegido.stock)} ${elegido.unit}`}</strong>
            {" · "}
          </>
        )}
        {hayMas ? `los ${fmtNumberAR(MAX_FILAS)} más recientes` : `${fmtNumberAR(cuantos)} ${cuantos === 1 ? "movimiento" : "movimientos"}`}
        {veStock && (
          <>
            {" · "}
            <Link href="/admin/inventario" className={`${enlace} font-medium text-accent-ink underline`}>
              Volver a Stock
            </Link>
          </>
        )}
      </p>
    </header>
  );
}

export function ParaRecontar({ negativos, puedeRecontar }: { negativos: Datos["negativos"]; puedeRecontar: boolean }) {
  if (negativos.length === 0) return null;
  return (
    <Bloque
      titulo="En negativo: recontar primero"
      cuenta={`${fmtNumberAR(negativos.length)} ${negativos.length === 1 ? "producto" : "productos"}`}
      className="mb-6"
    >
      <p className="pt-2 text-[13px] text-muted">Se vendió más de lo que el sistema tenía cargado. Contá lo que hay y el stock vuelve a ser el real.</p>
      <ul aria-label="Productos en negativo">
        {negativos.map((p) => (
          <Renglon
            as="li"
            key={p.id}
            titulo={
              <Link href={hrefMovimientos({ producto: p.id })} className={`${enlace} font-medium`}>
                {p.name}
              </Link>
            }
            plata={<span className="font-semibold tabular-nums text-danger">{`${formatearCantidad(p.stock)} ${p.unit}`}</span>}
            tecla={
              puedeRecontar ? (
                <Link href={`/admin/ajustes/recuento?producto=${encodeURIComponent(p.id)}`} className={buttonClasses("outline", "md", "min-h-11")}>
                  Recontar<span className="sr-only"> {p.name}</span>
                </Link>
              ) : undefined
            }
          />
        ))}
      </ul>
    </Bloque>
  );
}

export function LibroDeMovimientos({ datos, filtros, elegido }: { datos: Datos; filtros: FiltrosDeMovimientos; elegido: boolean }) {
  const hoy = todayInBusinessTz();
  const dias = agruparPorDia(datos.movimientos, (m) => dateStrInBusinessTz(new Date(m.createdAt)));
  const abiertos = diasAbiertos(dias);

  if (dias.length === 0) {
    return (
      <p className="border-b border-line py-4 text-sm text-muted">
        {"No hay movimientos con estos filtros. Probá con otro rango de fechas o sacá el tipo. "}
        <Link href="/admin/inventario/movimientos" className={`${enlace} font-medium text-accent-ink underline`}>
          Ver todos los movimientos
        </Link>
      </p>
    );
  }

  return (
    <section aria-label="Movimientos, día por día" className="mt-6">
      {dias.map((d, i) => {
        const cercano = rotuloCercano(d.dia, hoy);
        const largo = fmtCalendarDateLabel(d.dia);
        return (
          <details key={d.dia} open={i < abiertos} className="group border-b border-line-strong">
            <summary className="flex min-h-11 cursor-pointer items-baseline gap-3 py-2">
              <span className="text-[15px] font-semibold text-strong first-letter:uppercase">{cercano ? `${cercano} · ${largo}` : largo}</span>
              <span className="text-[13px] text-muted">{`${fmtNumberAR(d.filas.length)} ${d.filas.length === 1 ? "movimiento" : "movimientos"}`}</span>
              <span aria-hidden className="ml-auto text-[13px] text-muted group-open:hidden">
                Ver
              </span>
            </summary>
            <ul aria-label={`Movimientos del ${largo}`} className="border-t border-line">
              {d.filas.map((m) => (
                <RenglonDeMovimiento key={m.id} m={m} datos={datos} filtros={filtros} elegido={elegido} />
              ))}
            </ul>
          </details>
        );
      })}
      {datos.hayMas && (
        <p className="mt-3 text-[13px] text-muted">
          {`Se ven los ${fmtNumberAR(MAX_FILAS)} más recientes. Achicá las fechas o elegí un producto para ver los anteriores.`}
        </p>
      )}
    </section>
  );
}

function RenglonDeMovimiento({ m, datos, filtros, elegido }: { m: Movimiento; datos: Datos; filtros: FiltrosDeMovimientos; elegido: boolean }) {
  const unidad = m.product?.unit ?? "";
  const origen = m.orderId
    ? datos.pedidos.has(m.orderId)
      ? `pedido #${datos.pedidos.get(m.orderId)}`
      : "un pedido"
    : m.purchaseId
      ? datos.compras.has(m.purchaseId)
        ? `compra #${datos.compras.get(m.purchaseId)}`
        : "una compra"
      : null;
  const detalle = [
    m.reason,
    quienHizo(m.createdBy, datos.nombres),
    origen,
    datos.conCostos && m.unitCost != null && m.unitCost > 0 ? `costo ${fmtMoneyARS(m.unitCost)}/${unidad}` : null,
  ].filter(Boolean);
  return (
    <Renglon
      as="li"
      className="py-1.5"
      folio={<span className="block w-12 tabular-nums">{fmtTime(m.createdAt)}</span>}
      titulo={
        <span className="break-words">
          <span className="font-medium">{nombreDelTipo(m.type)}</span>
          {!elegido && m.product && (
            <>
              {" · "}
              <Link href={hrefMovimientos({ ...filtros, producto: m.productId })} className={enlace}>
                {m.product.name}
              </Link>
            </>
          )}
        </span>
      }
      detalle={<span className="break-words">{detalle.join(" · ")}</span>}
      plata={
        <span className="block tabular-nums">
          {m.qty === 0 ? (
            <span className="text-muted">sin diferencia</span>
          ) : (
            <span className={m.qty > 0 ? "font-semibold text-success" : "font-semibold text-danger"}>{`${firmado.format(m.qty)} ${unidad}`}</span>
          )}
          <span className="block text-[13px] text-muted">{`quedó ${formatearCantidad(m.balanceAfter)} ${unidad}`}</span>
        </span>
      }
    />
  );
}
