"use client";

// ============================================================================
// VENTAS DEL DÍA — la tabla densa y la venta entera en un cajón (diseño nuevo «Renglón»).
// ============================================================================
//
// Para qué se abre esta pantalla: encontrar UNA venta (la pesada mal hecha, el ticket que el
// cliente pide de nuevo) y hacer algo con ella. Un renglón por venta —hora y número, qué se vendió,
// cómo se pagó, el total en su columna— y el cajón con el ticket, la factura y «Anular…».
// Anular va en dos pasos y con motivo (AnularDelPedido: la misma acción y los mismos campos de la
// bandeja de siempre). ↑↓ o j/k mueven, Enter abre.

import { useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Tabla, type ColumnaTabla } from "@/components/ui/Tabla";
import { MenuMas } from "@/components/ui/MenuMas";
import { Cajon } from "@/components/ui/Cajon";
import { Button, Marca, Plata, Rotulo, hrefConParametros } from "@/components/ui";
import { etiquetaDeMedio } from "@/lib/caja/medio-cobro";
import TicketVenta from "../vender/TicketVenta";
import type { VentaTicket } from "../vender/reglas-venta";
import AnularDelPedido from "../pedidos/AnularDelPedido";
import FacturarVenta from "./FacturarVenta";
import type { FacturaDeVenta } from "./factura";

export type FilaDeVenta = {
  venta: VentaTicket;
  hora: string;
  canal: "COUNTER" | "ONLINE";
  notas: string[];
  factura: FacturaDeVenta | null;
  anular: { motivoObligatorio: boolean } | null;
};

function queSeVendio(v: VentaTicket): string {
  const nombres = v.lineas.map((l) => l.nombre);
  if (nombres.length <= 2) return nombres.join(", ") || "Sin líneas";
  return `${nombres.slice(0, 2).join(", ")} y ${nombres.length - 2} más`;
}

function comoSePago(v: VentaTicket): string {
  return v.aCuenta ? "A cuenta" : etiquetaDeMedio(v.medio);
}

export default function TablaDeVentas({ filas, negocio, vacio }: { filas: FilaDeVenta[]; negocio: string; vacio: React.ReactNode }) {
  const params = useSearchParams();
  const ruta = usePathname();
  const empujado = useRef(false);
  // Se llegó por «Anular…»: la anulación se abre desplegada; por el ticket, queda plegada.
  const [paraAnular, setParaAnular] = useState(false);
  const idAbierta = params.get("venta");
  const abierta = idAbierta ? (filas.find((f) => f.venta.id === idAbierta) ?? null) : null;

  const cambiar = (id: string | null, modo: "empujar" | "reemplazar") => {
    const href = hrefConParametros(ruta, new URLSearchParams(window.location.search), { venta: id });
    if (modo === "empujar") window.history.pushState(null, "", href);
    else window.history.replaceState(null, "", href);
  };
  const abrir = (id: string, anular = false) => {
    setParaAnular(anular);
    empujado.current = true;
    cambiar(id, "empujar");
  };
  const cerrar = () => {
    if (empujado.current) {
      empujado.current = false;
      window.history.back();
    } else cambiar(null, "reemplazar");
  };

  const columnas: ColumnaTabla<FilaDeVenta>[] = [
    {
      clave: "numero",
      titulo: "#",
      movil: "folio",
      celda: (f) => (
        <span className="tabular-nums">
          #{f.venta.code} · {f.hora}
        </span>
      ),
    },
    {
      clave: "que",
      titulo: "Qué se vendió",
      movil: "asunto",
      celda: (f) => (
        <button
          type="button"
          onClick={() => abrir(f.venta.id)}
          className={`max-w-full truncate text-left font-semibold hover:underline ${f.venta.anulada ? "text-muted line-through" : "text-strong"}`}
        >
          {queSeVendio(f.venta)}
        </button>
      ),
    },
    {
      clave: "como",
      titulo: "Cómo",
      movil: "detalle",
      celda: (f) => (
        <span className="inline-flex flex-wrap items-center gap-x-2">
          {f.venta.anulada ? <Marca tipo="anulado">Anulada</Marca> : <span>{comoSePago(f.venta)}</span>}
          <span className="text-muted">
            {f.canal === "ONLINE" ? "pedido" : "mostrador"}
            {f.venta.cliente ? ` · ${f.venta.cliente}` : ""}
          </span>
        </span>
      ),
    },
    {
      clave: "marcas",
      titulo: "Ajustes",
      movil: "oculta",
      celda: (f) => (
        <span className="inline-flex flex-wrap gap-x-2">
          {f.venta.descuento > 0 && <Marca tipo="info">Descuento</Marca>}
          {f.venta.lineas.some((l) => l.aMano) && <Marca tipo="atencion">Precio a mano</Marca>}
        </span>
      ),
    },
    ...(filas.some((f) => f.factura)
      ? [
          {
            clave: "factura",
            titulo: "Factura",
            movil: "oculta",
            celda: (f: FilaDeVenta) =>
              f.factura ? (
                <Marca
                  tipo={
                    f.factura.estado === "facturada"
                      ? "hecho"
                      : f.factura.estado === "rechazada"
                        ? "anulado"
                        : f.factura.estado === "en-tramite"
                          ? "medias"
                          : "pendiente"
                  }
                >
                  {f.factura.texto}
                </Marca>
              ) : null,
          } satisfies ColumnaTabla<FilaDeVenta>,
        ]
      : []),
    {
      clave: "total",
      titulo: "Total",
      alinear: "derecha",
      movil: "plata",
      celda: (f) => <Plata valor={f.venta.total} className={f.venta.anulada ? "text-muted line-through" : undefined} />,
    },
    {
      clave: "tecla",
      titulo: "",
      alinear: "derecha",
      movil: "tecla",
      celda: (f) => (
        <span className="inline-flex items-center justify-end gap-0.5">
          <Button size="sm" variant="outline" onClick={() => abrir(f.venta.id)} aria-label={`Ver el ticket de la venta #${f.venta.code}`}>
            Ticket
          </Button>
          {(f.anular || f.factura) && !f.venta.anulada && (
            <MenuMas etiqueta={`Más acciones de la venta #${f.venta.code}`}>
              {f.factura && (
                <button type="button" onClick={() => abrir(f.venta.id)}>
                  Facturar…
                </button>
              )}
              {f.anular && (
                <button type="button" data-peligro onClick={() => abrir(f.venta.id, true)}>
                  Anular…
                </button>
              )}
            </MenuMas>
          )}
        </span>
      ),
    },
  ];

  return (
    <section aria-label="Ventas" data-tablero="ventas">
      <Tabla<FilaDeVenta>
        titulo="Ventas"
        filas={filas}
        clave={(f) => f.venta.id}
        columnas={columnas}
        vacio={vacio}
        cuenta={filas.length === 1 ? "1 venta" : `${filas.length} ventas`}
        // Tocar el renglón o Enter con el foco abre la venta en el cajón.
        onAbrir={(f) => abrir(f.venta.id)}
        className="[&_tbody_tr]:cursor-pointer"
      />
      {abierta && (
        <Cajon
          abierto
          onCerrar={cerrar}
          titulo={`Venta #${abierta.venta.code}`}
          descripcion={`${abierta.hora} · ${abierta.canal === "ONLINE" ? "pedido" : "mostrador"} · ${abierta.venta.anulada ? "anulada" : comoSePago(abierta.venta)}`}
        >
          <div className="flex flex-col gap-6">
            <TicketVenta venta={abierta.venta} negocio={negocio} />
            {abierta.notas.length > 0 && (
              <section aria-label="Lo que hay que saber de esta venta">
                <Rotulo as="h3" className="mb-1">
                  Lo que hay que saber
                </Rotulo>
                <ul className="space-y-1 text-sm text-body">
                  {abierta.notas.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              </section>
            )}
            {abierta.factura && !abierta.venta.anulada && (
              <section aria-label="Factura">
                <Rotulo as="h3" className="mb-2">
                  Factura
                </Rotulo>
                <FacturarVenta orderId={abierta.venta.id} inicial={abierta.factura} />
              </section>
            )}
            {abierta.anular && !abierta.venta.anulada && (
              <details className="group" open={paraAnular}>
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between border-b border-line text-sm font-semibold text-danger">
                  Anular la venta…
                  <span aria-hidden className="text-muted group-open:rotate-90">
                    ›
                  </span>
                </summary>
                <div className="pt-3">
                  <AnularDelPedido
                    id={abierta.venta.id}
                    code={abierta.venta.code}
                    cobrado
                    aCuenta={abierta.venta.aCuenta === true}
                    total={abierta.venta.total}
                    motivoObligatorio={abierta.anular.motivoObligatorio}
                    sustantivo="venta"
                    onHecho={cerrar}
                  />
                </div>
              </details>
            )}
          </div>
        </Cajon>
      )}
    </section>
  );
}
