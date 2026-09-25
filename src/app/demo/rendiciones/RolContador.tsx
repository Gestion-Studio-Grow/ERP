"use client";

// Rol "Contador": donde se ve la profundidad fiscal.
//
// - Diccionario: el tratamiento de cada tipo de gasto es un DATO que valida el contador del
//   cliente (cuenta, indicadores, qué exige, estado y norma que lo sostiene).
// - Reglas activas: las validaciones que el motor aplicó en el período, con su mensaje y su
//   fuente tal como las devolvió `evaluarComprobante` (acá no se reescribe ninguna norma).
// - Tratamiento por comprobante: el resultado del motor línea por línea, con la versión de la
//   regla que se aplicó.

import { useMemo } from "react";
import { Badge, DataTable, KpiTile, SectionGroup, type DataTableColumn } from "@/components/ui";
import {
  etiquetaClase,
  formatearPesos,
  totalesQueEntran,
  type CampoExigido,
  type CodigoValidacion,
  type Comprobante,
  type Evaluacion,
  type Severidad,
  type TipoGasto,
} from "@/lib/rendiciones";
import { escenarioDemo as E } from "./escenario";
import { useDemo } from "./contexto";
import type { PestanaContador } from "./estado";
import { SEVERIDAD, TRATAMIENTO, destinoDe, emisorDe, etiquetaTipo, etiquetaTrato, nombreDe, numeroOficial, plural } from "./derivados";
import { EncabezadoRol, Pestanas, idPanel, idPestana, type OpcionPestana } from "./piezas";

const ID = "rendi-contador";
const PESTANAS: OpcionPestana<PestanaContador>[] = [
  { id: "diccionario", texto: "Diccionario" },
  { id: "reglas", texto: "Reglas activas" },
  { id: "tratamiento", texto: "Tratamiento por comprobante" },
];

const EXIGE: Record<CampoExigido, string> = {
  dominio: "patente",
  tipoVehiculo: "tipo de vehículo",
  viaje: "viaje",
  asistentes: "con quién",
  origenDestino: "origen y destino",
};

/** Nombre de cada validación para el contador (el mensaje y la fuente los da el motor). */
const REGLA: Record<CodigoValidacion, string> = {
  R1_TIPO_SIN_CLASIFICAR: "Regla 1 · El IVA lo decide el tipo de gasto",
  R1_NO_COMPUTA_POR_LEY: "Regla 1 · Restaurante, hotel o cochera: no computa por ley",
  R2_RECEPTOR_NO_ES_LA_EMPRESA: "Regla 2 · Factura A a nombre de otra CUIT",
  R2_IVA_CONTENIDO_A_CERO: "Regla 2 · IVA contenido de consumidor final",
  R2_PEDI_LA_CUIT: "Regla 2 · Ticket sin la CUIT de la empresa",
  R3_FACTURA_CON_LEYENDA: "Regla 3 · Factura con leyenda o M: a Cuentas a Pagar",
  R4_CONSTATACION_RECHAZADA: "Regla 4 · Constatación rechazada",
  R4_CONSTATACION_PENDIENTE: "Regla 4 · Constatación pendiente: no se contabiliza todavía",
  R4_CUIT_APOCRIFA: "Regla 4 · CUIT apócrifa",
  R4_SIN_CONSTATACION_POSIBLE: "Regla 4 · Controlador fiscal: sin constatación posible",
  R5_EFECTIVO_SOBRE_TOPE: "Regla 5 · Efectivo por encima del tope de la Ley 25.345",
  R7_PERCEPCION_SIN_JURISDICCION: "Regla 7 · Percepción de IIBB sin provincia",
  R8_DERIVAR_A_CXP: "Regla 8 · Proveedor habitual sobre el tope: a Cuentas a Pagar",
  R9_FALTA_JURISDICCION: "Regla 9 · Falta la jurisdicción",
  R9_PROVINCIA_NO_INSCRIPTA: "Regla 9 · Provincia sin inscripción en Ingresos Brutos",
  R10_FALTA_VEHICULO: "Regla 10 · Falta la patente o el tipo de vehículo",
  R10_TOPE_AUTOMOVIL: "Regla 10 · Automóvil: tope de Ganancias",
  R11_CUBIERTO_POR_CONVENIO: "Regla 11 · Ya lo paga el convenio (CCT 40/89)",
  R11_SIN_COMPROBANTE_SOBRE_TOPE: "Regla 11 · Sin comprobante, por encima del tope",
  R11_SIN_COMPROBANTE: "Regla 11 · Sin comprobante: se informa a Haberes",
  V2_CUIT_INVALIDA: "CUIT con dígito verificador inválido",
  V3_PROVEEDOR_FUERA_DEL_MAESTRO: "Proveedor fuera del maestro de SAP",
  V4_B_O_C_CON_IVA_DISCRIMINADO: "Factura B o C con IVA discriminado",
  V6_DUPLICADO: "Comprobante ya rendido en la empresa",
  V6_MISMA_FOTO: "La misma foto dos veces",
  V8_ARITMETICA: "Los importes no suman el total",
  V9_NUMERO_OFICIAL: "Falta el número oficial",
  V12_FUERA_DE_PERIODO: "Fuera del período",
  V13_FALTA_ASISTENTES: "Representación sin asistentes",
  V14_MONEDA_SIN_COTIZACION: "Dólares sin cotización",
};

export default function RolContador() {
  const { vista, despachar } = useDemo();
  const pestana = vista.pestanaContador;
  return (
    <div className="space-y-6">
      <EncabezadoRol
        id="contador-titulo"
        eyebrow="Contador · web"
        titulo="El tratamiento fiscal es un dato: lo valida el contador, y cada línea guarda qué regla se le aplicó."
        descripcion={`Versión vigente del diccionario y las reglas: ${E.reglaVersion}. Todo figura como provisorio hasta que el contador del cliente lo valide.`}
      />
      <Pestanas
        etiqueta="Secciones del contador"
        opciones={PESTANAS}
        valor={pestana}
        alCambiar={(p) => despachar({ tipo: "ir", vista: { pestanaContador: p } })}
        idBase={ID}
      />
      <div role="tabpanel" id={idPanel(ID, pestana)} aria-labelledby={idPestana(ID, pestana)} className="pt-6">
        {pestana === "diccionario" ? <Diccionario /> : null}
        {pestana === "reglas" ? <Reglas /> : null}
        {pestana === "tratamiento" ? <TratamientoPorComprobante /> : null}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Diccionario
// ─────────────────────────────────────────────────────────────────────────────

const COLUMNAS_DICCIONARIO: DataTableColumn<TipoGasto>[] = [
  {
    key: "tipo",
    header: "Tipo de gasto",
    cell: (t) => (
      <span>
        <span className="block font-medium text-strong">{t.etiqueta}</span>
        <span className="block text-xs text-muted">{t.sinonimos.slice(0, 4).join(", ")}</span>
      </span>
    ),
  },
  { key: "tratamiento", header: "Tratamiento", cell: (t) => <Badge tone={TRATAMIENTO[t.tratamientoBase].tono}>{TRATAMIENTO[t.tratamientoBase].texto}</Badge> },
  { key: "cuenta", header: "Cuenta", cell: (t) => <span className="font-mono text-xs">{t.cuentaMayor}</span> },
  {
    key: "indicadores",
    header: "Indicadores IVA",
    cell: (t) => (
      <span className="font-mono text-xs">
        {t.indicadorIvaComputable ? `computa ${t.indicadorIvaComputable} · ` : ""}no computa {t.indicadorIvaNoComputable}
      </span>
    ),
  },
  {
    key: "exige",
    header: "Exige",
    cell: (t) => {
      const marcas = [
        ...t.exige.map((e) => EXIGE[e]),
        t.cubiertoPorConvenioCamioneros ? "control de convenio" : null,
        t.admiteSinComprobante ? "admite sin comprobante" : null,
      ].filter((x): x is string => Boolean(x));
      return marcas.length ? (
        <span className="flex flex-wrap gap-1">
          {marcas.map((m) => (
            <Badge key={m}>{m}</Badge>
          ))}
        </span>
      ) : (
        <span className="text-xs text-muted">—</span>
      );
    },
  },
  {
    key: "estado",
    header: "Estado",
    cell: (t) =>
      t.estado === "validado_contador" ? <Badge tone="success">Validado por el contador</Badge> : <Badge tone="warning">Provisorio</Badge>,
  },
  { key: "fuente", header: "Fuente normativa", cell: (t) => <span className="text-xs leading-relaxed">{t.fuente}</span> },
];

function Diccionario() {
  const validados = E.diccionario.filter((t) => t.estado === "validado_contador").length;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Tipos de gasto" value={E.diccionario.length} sub="Lista cerrada: nadie inventa uno" />
        <KpiTile label="Recuperan IVA" value={E.diccionario.filter((t) => t.tratamientoBase === "computable").length} sub="Si el comprobante acompaña" />
        <KpiTile label="Provisorios" value={E.diccionario.length - validados} sub="A validar por el contador" />
        <KpiTile label="Validados" value={validados} sub="Con firma del contador" />
      </div>
      <p className="max-w-3xl text-sm leading-relaxed text-body">
        El tipo de gasto fija lo máximo que permite la ley; el comprobante puede bajar ese tratamiento, nunca subirlo. Un gasto sin tipo
        no pasa: la herramienta no adivina el tratamiento del IVA.
      </p>
      <DataTable caption="Diccionario de tipos de gasto" columns={COLUMNAS_DICCIONARIO} rows={E.diccionario} rowKey={(t) => t.id} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Reglas activas (lo que devolvió el motor en el período)
// ─────────────────────────────────────────────────────────────────────────────

interface ReglaAplicada {
  codigo: CodigoValidacion;
  severidad: Severidad;
  mensaje: string;
  fuente?: string;
  comprobantes: number;
}

function Reglas() {
  const { evaluaciones } = useDemo();
  const aplicadas = useMemo(() => {
    const porCodigo = new Map<CodigoValidacion, ReglaAplicada>();
    for (const ev of evaluaciones.values()) {
      for (const v of ev.validaciones) {
        const previa = porCodigo.get(v.codigo);
        if (previa) previa.comprobantes += 1;
        else porCodigo.set(v.codigo, { codigo: v.codigo, severidad: v.severidad, mensaje: v.mensaje, fuente: v.fuente, comprobantes: 1 });
      }
    }
    const orden: Record<Severidad, number> = { bloquea: 0, advierte: 1, informa: 2 };
    return [...porCodigo.values()].sort((a, b) => orden[a.severidad] - orden[b.severidad] || a.codigo.localeCompare(b.codigo));
  }, [evaluaciones]);
  const sinCasos = (Object.keys(REGLA) as CodigoValidacion[]).filter((c) => !aplicadas.some((a) => a.codigo === c));

  const columnas: DataTableColumn<ReglaAplicada>[] = [
    {
      key: "regla",
      header: "Regla",
      cell: (r) => (
        <span>
          <span className="block font-medium text-strong">{REGLA[r.codigo]}</span>
          <span className="block font-mono text-xs text-muted">{r.codigo}</span>
        </span>
      ),
    },
    { key: "efecto", header: "Qué hace", cell: (r) => <Badge tone={SEVERIDAD[r.severidad].tono}>{SEVERIDAD[r.severidad].texto}</Badge> },
    { key: "mensaje", header: "Lo que lee quien rinde (ejemplo)", cell: (r) => <span className="text-sm">{r.mensaje}</span> },
    { key: "fuente", header: "Fuente", cell: (r) => <span className="text-xs leading-relaxed">{r.fuente ?? "Control interno del producto"}</span> },
    { key: "casos", header: "Comprobantes", align: "right", cell: (r) => <span className="tabular-nums">{r.comprobantes}</span> },
  ];

  return (
    <div className="space-y-6">
      <SectionGroup title="Se aplicaron en el período" description="Mensajes y fuentes tal como los devolvió el motor para los comprobantes cargados.">
        <DataTable caption="Reglas que el motor aplicó en el período" columns={columnas} rows={aplicadas} rowKey={(r) => r.codigo} />
      </SectionGroup>
      <SectionGroup title="También vigila" description="Validaciones del motor que no se dieron con los comprobantes de este período.">
        <ul className="flex flex-wrap gap-2">
          {sinCasos.map((c) => (
            <li key={c}>
              <Badge>{REGLA[c]}</Badge>
            </li>
          ))}
        </ul>
      </SectionGroup>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tratamiento por comprobante
// ─────────────────────────────────────────────────────────────────────────────

function TratamientoPorComprobante() {
  const { datos, evaluaciones } = useDemo();
  const filas = useMemo(() => {
    const enRendiciones = new Set(datos.rendiciones.flatMap((r) => r.comprobanteIds));
    return datos.comprobantes
      .filter((c) => enRendiciones.has(c.id) || datos.enCuentasAPagar.includes(c.id))
      .map((c) => ({ c, ev: evaluaciones.get(c.id) }))
      .filter((x): x is { c: Comprobante; ev: Evaluacion } => Boolean(x.ev));
  }, [datos.rendiciones, datos.comprobantes, datos.enCuentasAPagar, evaluaciones]);
  // Sólo lo que entra al lote suma: lo bloqueado y lo derivado a Cuentas a Pagar no se contabiliza acá.
  const totales = useMemo(() => totalesQueEntran(filas.map((x) => x.ev)), [filas]);
  const siEntra = (ev: Evaluacion, importe: number) =>
    destinoDe(ev).entra ? <span className="tabular-nums">{formatearPesos(importe)}</span> : <span className="text-muted">—</span>;

  const columnas: DataTableColumn<{ c: Comprobante; ev: Evaluacion }>[] = [
    {
      key: "comprobante",
      header: "Comprobante",
      cell: ({ c }) => (
        <span>
          <span className="block font-medium text-strong">{emisorDe(c)}</span>
          <span className="block text-xs text-muted">
            {etiquetaClase(c.datos.clase)} {numeroOficial(c.datos)} · {nombreDe(c.legajo)}
          </span>
        </span>
      ),
    },
    { key: "tipo", header: "Tipo de gasto", cell: ({ c }) => etiquetaTipo(c.imputacion.tipoGastoId) },
    {
      key: "tratamiento",
      header: "Tratamiento",
      cell: ({ ev }) => {
        const destino = destinoDe(ev);
        const trato = etiquetaTrato(ev);
        return (
          <span className="flex flex-col items-start gap-1">
            <Badge tone={trato.tono}>{trato.texto}</Badge>
            {destino.entra ? <span className="text-xs text-muted">{destino.texto}</span> : null}
            {destino.motivo ? <span className="max-w-[18rem] text-xs text-muted">{destino.motivo}</span> : null}
          </span>
        );
      },
    },
    { key: "total", header: "Total", align: "right", cell: ({ c }) => <span className="tabular-nums">{formatearPesos(c.datos.total)}</span> },
    { key: "credito", header: "Crédito fiscal", align: "right", cell: ({ ev }) => siEntra(ev, ev.creditoFiscal) },
    { key: "percepciones", header: "Percepciones", align: "right", cell: ({ ev }) => siEntra(ev, ev.percepcionesComputables) },
    { key: "gasto", header: "Va a gasto", align: "right", cell: ({ ev }) => siEntra(ev, ev.costo) },
    {
      key: "cuenta",
      header: "Cuenta · IVA",
      cell: ({ ev }) =>
        destinoDe(ev).entra ? (
          <span className="font-mono text-xs">
            {ev.cuentaMayor ?? "—"} · {ev.indicadorIva ?? "—"}
          </span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
  ];
  const noEntran = filas.filter((x) => !destinoDe(x.ev).entra).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile
          label="Comprobantes del período"
          value={filas.length}
          sub={noEntran ? `${plural(noEntran, "no entra", "no entran")} al lote` : "Todos entran al lote"}
        />
        <KpiTile label="Crédito fiscal" value={formatearPesos(totales.creditoFiscal)} sub="IVA que se recupera, de lo que entra al lote" />
        <KpiTile label="Percepciones" value={formatearPesos(totales.percepciones)} sub="IVA e IIBB que se computan" />
        <KpiTile label="Va a gasto" value={formatearPesos(totales.gasto)} sub="Con el IVA que no computa adentro" />
      </div>
      <DataTable caption="Tratamiento fiscal de cada comprobante del período" columns={columnas} rows={filas} rowKey={(x) => x.c.id} />
      <p className="text-xs text-muted">
        Cada línea guarda la versión de las reglas con la que se evaluó: <span className="font-mono">{E.reglaVersion}</span>.
      </p>
    </div>
  );
}
