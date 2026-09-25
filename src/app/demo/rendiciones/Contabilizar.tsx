"use client";

// Tesorería · "Contabilizar (modo Archivo)".
//
// El lote lo arma el motor (`armarLoteContable`: facturas de lo que recupera IVA, un asiento por
// rendición con lo que no, cancelaciones, altas pendientes y derivaciones) y las planillas las genera el plugin SAP
// (`generarArchivosSap`, cuatro CSV). La pantalla muestra la vista previa en tablas y deja
// descargar los archivos con prefijo DEMO_. Registrar la contabilización es `aplicarAccion`:
// si la rendición tiene líneas bloqueadas, el motor no la deja pasar y dice por qué.

import { useMemo, useState } from "react";
import { AvisoError, Badge, Button, Card, DataTable, EmptyState, KpiTile, SectionGroup, cn, fmtCuit, type DataTableColumn } from "@/components/ui";
import {
  aplicarAccion,
  armarLoteContable,
  formatearFecha,
  formatearPesos,
  type AsientoSap,
  type CancelacionFacturaSap,
  type FacturaProveedorSap,
  type PosicionFacturaSap,
  type Rendicion,
} from "@/lib/rendiciones";
import { generarArchivosSap } from "@/plugins/sap";
import { escenarioDemo as E } from "./escenario";
import { useDemo, useDestacado } from "./contexto";
import { ESTADO_RENDICION, contextoTransicion, destinoDe, emisorDe, legajoTesoreria, nombreDe, oracion, plural } from "./derivados";
import { nombreDemo } from "./descargas";
import { AvisoExito, BotonDescargar } from "./piezas";

export default function Contabilizar() {
  const { datos, evaluaciones, resumenes, despachar } = useDemo();
  const destacado = useDestacado("generar-archivos");
  const [generado, setGenerado] = useState(false);
  const [resultados, setResultados] = useState<Record<string, { ok: boolean; texto: string }>>({});

  const enLote = useMemo(
    () => datos.rendiciones.filter((r) => r.estado === "en_control" || r.estado === "contabilizada"),
    [datos.rendiciones],
  );
  const lote = useMemo(
    () =>
      armarLoteContable({
        rendiciones: enLote,
        comprobantes: datos.comprobantes,
        evaluaciones: [...evaluaciones.values()],
        personas: E.personas,
        parametros: E.parametrosSap,
        fechaContabilizacion: E.hoy,
      }),
    [enLote, datos.comprobantes, evaluaciones],
  );
  const archivos = useMemo(() => generarArchivosSap(lote), [lote]);
  const porId = useMemo(() => new Map(datos.comprobantes.map((c) => [c.id, c])), [datos.comprobantes]);

  // Lo que no entra al lote, según el motor (`destinoEnLote`): lo que queda afuera, con su motivo
  // (bloqueos, incluida una factura con leyenda que además tiene otro bloqueo), y lo que va por
  // Cuentas a Pagar. La pantalla no decide nada de esto: sólo lo lista.
  const noEntran = enLote.flatMap((r) =>
    (resumenes.get(r.id)?.comprobantes ?? []).flatMap((c) => {
      const ev = evaluaciones.get(c.id);
      if (!ev) return [];
      const destino = destinoDe(ev);
      return destino.entra ? [] : [{ c, destino }];
    }),
  );

  const aplicar = (r: Rendicion, accion: "contabilizar" | "cerrar") => {
    const res = resumenes.get(r.id);
    if (!res) return;
    const resultado = aplicarAccion(r, accion, contextoTransicion(res, legajoTesoreria));
    if (resultado.ok) despachar({ tipo: "transicion", rendicion: resultado.rendicion });
    setResultados((prev) => ({
      ...prev,
      [r.id]: resultado.ok
        ? { ok: true, texto: accion === "contabilizar" ? `${r.id} quedó contabilizada.` : `${r.id} quedó cerrada: saldo de ${nombreDe(r.legajo)} en cero.` }
        : { ok: false, texto: resultado.motivo },
    }));
  };

  if (!enLote.length) {
    return (
      <EmptyState
        className="mt-6"
        title="No hay rendiciones en control"
        description="Tomá el control de una rendición aprobada en la pestaña Control; después se contabiliza acá."
        action={
          <Button variant="outline" onClick={() => despachar({ tipo: "ir", vista: { pestanaTesoreria: "control" } })}>
            Ir a Control
          </Button>
        }
      />
    );
  }

  const razonSocial = (comprobanteId: string) => {
    const c = porId.get(comprobanteId);
    return c ? emisorDe(c) : comprobanteId;
  };

  return (
    <div className="space-y-8 pt-6">
      <Card className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <h3 className="text-base font-semibold text-strong">Contabilizar en SAP · modo Archivo</h3>
            <p className="mt-1 text-sm leading-relaxed text-body">
              En modo API esto va directo a SAP; en la demo se generan las planillas de carga.
            </p>
            <p className="mt-1 text-xs text-muted">
              Sociedad {E.parametrosSap.sociedad} · factura {E.parametrosSap.claseDocFactura} · asiento {E.parametrosSap.claseDocAsiento} · fecha de
              contabilización {formatearFecha(E.hoy)}. Cuentas y claves: provisionales a confirmar con el cliente.
            </p>
          </div>
          <Button data-recorrido="generar-archivos" className={cn(destacado && "rendi-destacado")} onClick={() => setGenerado(true)}>
            Generar archivos para SAP
          </Button>
        </div>
        <ul className="flex flex-wrap gap-2 text-sm">
          {enLote.map((r) => (
            <li key={r.id} className="flex items-center gap-2 rounded-lg border border-line px-3 py-1.5">
              <span className="font-mono text-xs">{r.id}</span>
              <span className="text-strong">{nombreDe(r.legajo)}</span>
              <Badge tone={ESTADO_RENDICION[r.estado].tono}>{ESTADO_RENDICION[r.estado].texto}</Badge>
            </li>
          ))}
        </ul>
      </Card>

      {generado ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiTile label="Facturas que recuperan IVA" value={lote.facturas.length} sub="Una por comprobante" />
            <KpiTile label="Gastos que van en un asiento" value={lote.asientos.length} sub={plural(lote.asientos.length, "asiento", "asientos") + " · uno por rendición"} />
            <KpiTile label="Cancelaciones" value={lote.cancelaciones.length} sub="Contra la cuenta puente" />
            <KpiTile label="Altas de proveedores" value={lote.altasPendientes.length} sub="Propuestas al maestro" />
          </div>

          <div className="flex flex-wrap gap-2">
            <BotonDescargar variant="solid" nombre={nombreDemo("facturas-proveedor", E.periodo)} contenido={archivos.facturas}>
              Facturas de proveedor
            </BotonDescargar>
            <BotonDescargar nombre={nombreDemo("asientos", E.periodo)} contenido={archivos.asientos}>
              Asientos
            </BotonDescargar>
            <BotonDescargar nombre={nombreDemo("cancelaciones-tesoreria", E.periodo)} contenido={archivos.cancelaciones}>
              Cancelaciones para Tesorería
            </BotonDescargar>
            <BotonDescargar nombre={nombreDemo("altas-proveedores", E.periodo)} contenido={archivos.altas}>
              Altas de proveedores
            </BotonDescargar>
          </div>

          {noEntran.length ? (
            <AvisoError
              tono="aviso"
              titulo="No entra en el lote"
              comoSeguir={
                <span className="block space-y-1">
                  {noEntran.map(({ c, destino }) => (
                    <span key={c.id} className="block">
                      {emisorDe(c)} ({formatearPesos(c.datos.total)}):{" "}
                      {destino.tipo === "cuentas_a_pagar"
                        ? "va por Cuentas a Pagar, no por la rendición."
                        : oracion(destino.motivo ?? "está bloqueado")}
                    </span>
                  ))}
                </span>
              }
            />
          ) : null}

          <SectionGroup title="Facturas que recuperan IVA" description="Una factura de proveedor por comprobante, contra cuenta de mayor, con el número oficial en la referencia.">
            <TablaFacturas facturas={lote.facturas} razonSocial={razonSocial} />
            <TablaPosiciones facturas={lote.facturas} />
          </SectionGroup>

          <SectionGroup title="Gastos que van en un asiento" description="Un asiento por rendición: lo que no recupera IVA va a gasto con el IVA adentro, contra la cuenta puente del anticipo.">
            {lote.asientos.length ? (
              lote.asientos.map((a) => <TablaAsiento key={a.idAsiento} asiento={a} />)
            ) : (
              <p className="text-sm text-muted">No hay gastos que vayan en un asiento en este lote.</p>
            )}
          </SectionGroup>

          <SectionGroup
            title="Cancelaciones para Tesorería"
            description="Cada factura queda abierta a nombre del proveedor y se cancela contra la cuenta puente con la misma asignación. En modo Archivo es la instrucción para compensar en SAP."
          >
            <TablaCancelaciones cancelaciones={lote.cancelaciones} razonSocial={razonSocial} />
          </SectionGroup>

          <SectionGroup title="Altas de proveedores propuestas" description="Proveedores que no están en el maestro de SAP: Rendí propone el alta y la hace el dueño del maestro.">
            {lote.altasPendientes.length ? (
              <DataTable
                caption="Altas de proveedores propuestas"
                rows={lote.altasPendientes}
                rowKey={(a) => a.comprobanteId}
                columns={[
                  { key: "cuit", header: "CUIT", cell: (a) => <span className="tabular-nums">{fmtCuit(a.cuit)}</span> },
                  { key: "razon", header: "Razón social", cell: (a) => a.razonSocial },
                  { key: "comprobante", header: "Comprobante", cell: (a) => <span className="font-mono text-xs">{a.comprobanteId}</span> },
                ]}
              />
            ) : (
              <p className="text-sm text-muted">Todos los proveedores del lote ya están en el maestro.</p>
            )}
          </SectionGroup>

          <SectionGroup title="Después de la carga en SAP" description="Cuando SAP confirma los documentos, se registra acá. Con líneas bloqueadas, el sistema no deja registrar.">
            <ul className="space-y-3">
              {enLote.map((r) => (
                <li key={r.id} className="space-y-2 rounded-xl border border-line bg-surface-raised p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-strong">
                      <span className="font-mono text-xs">{r.id}</span> · {nombreDe(r.legajo)} ·{" "}
                      <Badge tone={ESTADO_RENDICION[r.estado].tono}>{ESTADO_RENDICION[r.estado].texto}</Badge>
                    </p>
                    {r.estado === "en_control" ? (
                      <Button size="sm" variant="outline" onClick={() => aplicar(r, "contabilizar")}>
                        Registrar contabilización
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => aplicar(r, "cerrar")}>
                        Cerrar (saldo en cero)
                      </Button>
                    )}
                  </div>
                  {resultados[r.id] ? (
                    resultados[r.id].ok ? (
                      <AvisoExito>{resultados[r.id].texto}</AvisoExito>
                    ) : (
                      <AvisoError titulo="El sistema no la deja pasar" comoSeguir={resultados[r.id].texto} />
                    )
                  ) : null}
                </li>
              ))}
            </ul>
          </SectionGroup>
        </>
      ) : (
        <p className="text-sm text-muted">
          {plural(enLote.length, "rendición lista", "rendiciones listas")} para armar el lote. Tocá “Generar archivos para SAP”.
        </p>
      )}
    </div>
  );
}

const importe = (c: number) => <span className="tabular-nums">{formatearPesos(c)}</span>;
const codigo = (texto: string) => <span className="font-mono text-xs">{texto}</span>;

function TablaFacturas({ facturas, razonSocial }: { facturas: FacturaProveedorSap[]; razonSocial: (id: string) => string }) {
  const columnas: DataTableColumn<FacturaProveedorSap>[] = [
    { key: "id", header: "ID", cell: (f) => codigo(f.idFactura) },
    {
      key: "proveedor",
      header: "Proveedor",
      cell: (f) => (
        <span>
          <span className="block text-strong">{razonSocial(f.comprobanteId)}</span>
          <span className="block text-xs text-muted">N.º SAP {f.emisor}</span>
        </span>
      ),
    },
    { key: "referencia", header: "Referencia", cell: (f) => codigo(f.referencia) },
    { key: "fecha", header: "Fecha doc.", cell: (f) => formatearFecha(f.fechaDocumento) },
    { key: "bruto", header: "Importe bruto", align: "right", cell: (f) => importe(f.importeBruto) },
    { key: "asignacion", header: "Asignación", cell: (f) => codigo(f.asignacion) },
  ];
  return facturas.length ? (
    <DataTable caption="Facturas de proveedor del lote" columns={columnas} rows={facturas} rowKey={(f) => f.idFactura} />
  ) : (
    <p className="text-sm text-muted">No hay facturas que recuperen IVA en este lote.</p>
  );
}

function TablaPosiciones({ facturas }: { facturas: FacturaProveedorSap[] }) {
  const filas = facturas.flatMap((f) => f.posiciones.map((p, i) => ({ f, p, clave: `${f.idFactura}-${i}` })));
  if (!filas.length) return null;
  const columnas: DataTableColumn<{ f: FacturaProveedorSap; p: PosicionFacturaSap; clave: string }>[] = [
    { key: "factura", header: "Factura", cell: ({ f }) => codigo(f.idFactura) },
    { key: "cuenta", header: "Cuenta", cell: ({ p }) => codigo(p.cuentaMayor) },
    { key: "importe", header: "Importe", align: "right", cell: ({ p }) => importe(p.importe) },
    { key: "indicador", header: "Ind. IVA", cell: ({ p }) => codigo(p.indicadorIva || "—") },
    { key: "cc", header: "Centro de costo", cell: ({ p }) => codigo(p.centroCosto) },
    { key: "personal", header: "N.º personal", cell: ({ p }) => codigo(p.numeroPersonal) },
    { key: "texto", header: "Texto", cell: ({ p }) => <span className="text-xs">{p.texto}</span> },
  ];
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-strong">Posiciones</p>
      <DataTable caption="Posiciones de las facturas de proveedor" columns={columnas} rows={filas} rowKey={(x) => x.clave} />
    </div>
  );
}

function TablaAsiento({ asiento }: { asiento: AsientoSap }) {
  const debe = asiento.posiciones.reduce((s, p) => s + p.debe, 0);
  const haber = asiento.posiciones.reduce((s, p) => s + p.haber, 0);
  const columnas: DataTableColumn<AsientoSap["posiciones"][number] & { clave: string }>[] = [
    { key: "cuenta", header: "Cuenta", cell: (p) => codigo(p.cuentaMayor) },
    { key: "texto", header: "Texto", cell: (p) => <span className="text-xs">{p.texto}</span> },
    { key: "cc", header: "Centro de costo", cell: (p) => codigo(p.centroCosto ?? "—") },
    { key: "asignacion", header: "Asignación", cell: (p) => codigo(p.asignacion) },
    { key: "debe", header: "Debe", align: "right", cell: (p) => (p.debe ? importe(p.debe) : "") },
    { key: "haber", header: "Haber", align: "right", cell: (p) => (p.haber ? importe(p.haber) : "") },
  ];
  return (
    <div className="space-y-2">
      <p className="text-sm text-strong">
        {codigo(asiento.idAsiento)} · {asiento.texto} · referencia {codigo(asiento.referencia)}
      </p>
      <DataTable
        caption={`Posiciones del asiento ${asiento.idAsiento}`}
        columns={columnas}
        rows={asiento.posiciones.map((p, i) => ({ ...p, clave: `${asiento.idAsiento}-${i}` }))}
        rowKey={(p) => p.clave}
      />
      <p className={cn("text-xs font-medium", debe === haber ? "text-success" : "text-danger")}>
        Debe {formatearPesos(debe)} · Haber {formatearPesos(haber)} · {debe === haber ? "balancea" : "no balancea"}
      </p>
    </div>
  );
}

function TablaCancelaciones({ cancelaciones, razonSocial }: { cancelaciones: CancelacionFacturaSap[]; razonSocial: (id: string) => string }) {
  if (!cancelaciones.length) return <p className="text-sm text-muted">No hay facturas para cancelar en este lote.</p>;
  const columnas: DataTableColumn<CancelacionFacturaSap>[] = [
    { key: "factura", header: "Factura", cell: (c) => codigo(c.idFactura) },
    { key: "proveedor", header: "Proveedor", cell: (c) => razonSocial(c.comprobanteId) },
    { key: "referencia", header: "Referencia", cell: (c) => codigo(c.referencia) },
    { key: "importe", header: "Importe", align: "right", cell: (c) => importe(c.importe) },
    { key: "contrapartida", header: "Contrapartida", cell: (c) => codigo(c.cuentaContrapartida) },
    { key: "asignacion", header: "Asignación", cell: (c) => codigo(c.asignacion) },
  ];
  return <DataTable caption="Cancelaciones de facturas para Tesorería" columns={columnas} rows={cancelaciones} rowKey={(c) => c.idFactura} />;
}
