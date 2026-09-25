"use client";

// Tesorería · conciliación contra la precarga de IVA Simple (RG 5705/2025).
//
// El cruce lo hace el motor (`conciliarConPrecarga`) por CUIT, tipo, punto de venta y número.
// Entran todos los comprobantes cargados en la empresa: los de las rendiciones y los que
// pasaron a Cuentas a Pagar (si no, la precarga los mostraría como "nadie lo rindió").

import { useMemo } from "react";
import { Badge, DataTable, KpiTile, SectionGroup, fmtCuit, type DataTableColumn } from "@/components/ui";
import {
  claseDesdeTipoArca,
  conciliarConPrecarga,
  sumar,
  etiquetaClase,
  formatearFecha,
  formatearPesos,
  type Comprobante,
  type Evaluacion,
  type LineaPrecarga,
} from "@/lib/rendiciones";
import { escenarioDemo as E } from "./escenario";
import { useDemo } from "./contexto";
import { destinoDe, emisorDe, nombreDe, numeroOficial } from "./derivados";

export default function Conciliacion() {
  const { datos, evaluaciones } = useDemo();
  const cargados = useMemo(() => {
    const enRendiciones = new Set(datos.rendiciones.flatMap((r) => r.comprobanteIds));
    return datos.comprobantes.filter((c) => enRendiciones.has(c.id) || datos.enCuentasAPagar.includes(c.id));
  }, [datos.rendiciones, datos.comprobantes, datos.enCuentasAPagar]);
  const resultado = useMemo(
    () => conciliarConPrecarga(cargados, E.precargaIvaSimple, E.empresa.cuit, E.politica.toleranciaCentavos),
    [cargados],
  );
  const porId = new Map(datos.comprobantes.map((c) => [c.id, c]));
  const comprobante = (id: string) => porId.get(id);

  return (
    <div className="space-y-8 pt-6">
      <p className="max-w-3xl text-sm leading-relaxed text-body">
        Desde noviembre de 2025 los responsables inscriptos liquidan con IVA Simple: ARCA precarga lo que la empresa recibió y el
        contribuyente lo valida (RG 5705/2025). Rendí cruza lo rendido contra la precarga que descarga el contador.{" "}
        <span className="font-medium text-strong">Nunca usa la clave fiscal del cliente.</span> En la demo, la precarga es ficticia.
      </p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Coinciden" value={resultado.coinciden.length} sub="Mismo comprobante, mismo importe" />
        <KpiTile label="Rendido y no está" value={resultado.rendidoNoEnPrecarga.length} sub="Tickets o comprobantes dudosos" />
        <KpiTile label="Nadie lo rindió" value={resultado.precargaNoRendida.length} sub="A nombre de la empresa" />
        <KpiTile label="Diferencias de importe" value={resultado.diferenciasImporte.length} sub="Revisar con el proveedor" />
      </div>

      <SectionGroup title="Coinciden" description="Lo rendido figura en la precarga con el mismo importe.">
        <DataTable
          caption="Comprobantes que coinciden con la precarga"
          rows={resultado.coinciden}
          rowKey={(x) => x.comprobanteId}
          columns={[
            columnaComprobante(comprobante),
            { key: "persona", header: "Quién lo rindió", cell: (x) => nombreDe(comprobante(x.comprobanteId)?.legajo ?? "") },
            {
              key: "ivaSimple",
              header: "Qué hacer en IVA Simple",
              cell: (x) => <AccionIvaSimple c={comprobante(x.comprobanteId)} ev={evaluaciones.get(x.comprobanteId)} />,
            },
            { key: "total", header: "Total", align: "right", cell: (x) => <Importe centavos={x.precarga.total} /> },
          ]}
        />
      </SectionGroup>

      <SectionGroup title="Rendido y no está en la precarga" description="Normal si es un ticket no electrónico; si es una factura electrónica que ARCA no tiene, hay que revisarla.">
        <DataTable
          caption="Comprobantes rendidos que no están en la precarga"
          rows={resultado.rendidoNoEnPrecarga}
          rowKey={(x) => x.comprobanteId}
          columns={[
            columnaComprobante(comprobante),
            {
              key: "motivo",
              header: "Por qué",
              cell: (x) =>
                x.motivo === "no_electronico" ? (
                  <Badge tone="neutral">No es electrónico (normal)</Badge>
                ) : x.motivo === "no_es_de_la_empresa" ? (
                  <Badge tone="neutral">No está a nombre de la empresa (no entra en la precarga)</Badge>
                ) : (
                  <Badge tone="danger">No está en la precarga descargada: revisar</Badge>
                ),
            },
            { key: "total", header: "Total", align: "right", cell: (x) => <Importe centavos={comprobante(x.comprobanteId)?.datos.total ?? 0} /> },
          ]}
        />
      </SectionGroup>

      <SectionGroup title="En la precarga a nombre de la empresa y nadie lo rindió" description="Puede ser un gasto que alguien no rindió o una compra que tiene que pasar por Cuentas a Pagar.">
        <DataTable
          caption="Comprobantes de la precarga que nadie rindió"
          rows={resultado.precargaNoRendida}
          rowKey={(l) => `${l.cuitEmisor}-${l.puntoVenta}-${l.numero}`}
          columns={columnasPrecarga}
        />
      </SectionGroup>

      <SectionGroup title="Diferencias de importe" description="El comprobante rendido y el que tiene ARCA no suman lo mismo.">
        <DataTable
          caption="Diferencias de importe contra la precarga"
          rows={resultado.diferenciasImporte}
          rowKey={(x) => x.comprobanteId}
          columns={[
            columnaComprobante(comprobante),
            { key: "rendido", header: "Rendido", align: "right", cell: (x) => <Importe centavos={comprobante(x.comprobanteId)?.datos.total ?? 0} /> },
            { key: "arca", header: "En ARCA", align: "right", cell: (x) => <Importe centavos={x.precarga.total} /> },
            {
              key: "diferencia",
              header: "Diferencia",
              align: "right",
              cell: (x) => <span className="font-semibold tabular-nums text-danger">{formatearPesos(x.diferencia)}</span>,
            },
          ]}
        />
      </SectionGroup>
    </div>
  );
}

function Importe({ centavos }: { centavos: number }) {
  return <span className="tabular-nums">{formatearPesos(centavos)}</span>;
}

function columnaComprobante<T extends { comprobanteId: string }>(
  comprobante: (id: string) => Comprobante | undefined,
): DataTableColumn<T> {
  return {
    key: "comprobante",
    header: "Comprobante",
    cell: (x) => {
      const c = comprobante(x.comprobanteId);
      if (!c) return <span className="font-mono text-xs">{x.comprobanteId}</span>;
      return (
        <span>
          <span className="block text-strong">{emisorDe(c)}</span>
          <span className="block text-xs text-muted">
            {etiquetaClase(c.datos.clase)} {numeroOficial(c.datos)} · {formatearFecha(c.datos.fecha)}
          </span>
        </span>
      );
    },
  };
}

const columnasPrecarga: DataTableColumn<LineaPrecarga>[] = [
  {
    key: "emisor",
    header: "Emisor",
    cell: (l) => (
      <span>
        <span className="block text-strong">{l.razonSocialEmisor}</span>
        <span className="block text-xs tabular-nums text-muted">CUIT {fmtCuit(l.cuitEmisor)}</span>
      </span>
    ),
  },
  {
    key: "comprobante",
    header: "Comprobante",
    cell: (l) => {
      const clase = claseDesdeTipoArca(l.tipoComprobanteArca);
      return `${clase ? etiquetaClase(clase) : `Tipo ${l.tipoComprobanteArca}`} ${numeroOficial(l)}`;
    },
  },
  { key: "fecha", header: "Fecha", cell: (l) => formatearFecha(l.fecha) },
  { key: "total", header: "Total", align: "right", cell: (l) => <Importe centavos={l.total} /> },
];

/**
 * Lo que el contador hace con cada línea de la precarga que coincide: validar el crédito que computa,
 * o ajustar el IVA que la precarga trae y que la ley no deja computar (restaurante, hotel). Es su
 * trabajo de cada mes, y el agrupado en un asiento no lo esconde: acá queda por comprobante.
 */
function AccionIvaSimple({ c, ev }: { c: Comprobante | undefined; ev: Evaluacion | undefined }) {
  if (!c || !ev) return null;
  // El destino lo da el motor (`destinoEnLote`): una factura con leyenda y otro bloqueo no va por
  // Cuentas a Pagar, y lo que todavía no entra al lote (p. ej. constatación pendiente) se espera.
  const destino = destinoDe(ev);
  if (destino.tipo === "cuentas_a_pagar") {
    return <Badge tone="info">Va por Cuentas a Pagar: se valida al registrarla ahí</Badge>;
  }
  if (ev.bloqueado) {
    return <Badge tone="danger">Bloqueado en Rendí: no validar hasta resolverlo</Badge>;
  }
  if (!destino.entra) {
    return <Badge tone="warning">Todavía no entra al lote: esperar para validar</Badge>;
  }
  if (ev.tratamiento === "computable") {
    return <Badge tone="success">Validar · crédito {formatearPesos(ev.creditoFiscal)}</Badge>;
  }
  const ivaDiscriminado = sumar(...c.datos.lineasIva.map((l) => l.iva));
  if (ivaDiscriminado > 0) {
    return <Badge tone="warning">No computa: ajustar {formatearPesos(ivaDiscriminado)} de IVA</Badge>;
  }
  return <Badge tone="neutral">Validar sin crédito</Badge>;
}
