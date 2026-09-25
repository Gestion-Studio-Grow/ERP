"use client";

// Rol "Tesorería": escritorio, perfil Empresa (denso). Cuatro pestañas: el control por riesgo
// con las excepciones, la contabilización en modo Archivo, la conciliación con IVA Simple y el
// archivo para Haberes.
//
// "Tomar control" y "Devolver líneas" son `aplicarAccion`; el riesgo que ordena la cola se arma
// con lo que ya dijo el motor (bloqueos y avisos) más el tope de la política (derivados.ts).

import { useId, useMemo, useState } from "react";
import { AvisoError, Badge, Button, Card, DataTable, KpiTile, SectionGroup, Textarea, cn, fmtCuit, type DataTableColumn } from "@/components/ui";
import { aplicarAccion, etiquetaClase, formatearPesos, type CodigoValidacion, type Comprobante, type Rendicion } from "@/lib/rendiciones";
import { useDemo } from "./contexto";
import type { PestanaTesoreria } from "./estado";
import {
  ESTADO_RENDICION,
  RIESGO,
  TRATAMIENTO,
  contextoTransicion,
  destinoDe,
  emisorDe,
  etiquetaTipo,
  legajoTesoreria,
  luzDe,
  mesDe,
  nombreDe,
  numeroOficial,
  plural,
  riesgoDe,
  ultimoEvento,
  type ResumenRendicion,
} from "./derivados";
import { AvisoExito, Campo, EncabezadoRol, IconoCerrar, Pestanas, Semaforo, idPanel, idPestana, type OpcionPestana } from "./piezas";
import { MiniTicket } from "./Ticket";
import DetalleComprobante from "./DetalleComprobante";
import Contabilizar from "./Contabilizar";
import Conciliacion from "./Conciliacion";
import Haberes from "./Haberes";

const ID = "rendi-tesoreria";
const PESTANAS: OpcionPestana<PestanaTesoreria>[] = [
  { id: "control", texto: "Control" },
  { id: "contabilizar", texto: "Contabilizar" },
  { id: "iva", texto: "IVA Simple" },
  { id: "haberes", texto: "Haberes" },
];

export default function RolTesoreria() {
  const { vista, despachar } = useDemo();
  const pestana = vista.pestanaTesoreria;
  return (
    <div className="space-y-6">
      <EncabezadoRol
        id="tesoreria-titulo"
        eyebrow={`Tesorería · escritorio · opera ${nombreDe(legajoTesoreria)}`}
        titulo="Control por riesgo, excepciones a la vista y los archivos para SAP."
        descripcion="Perfil denso, para trabajar muchas rendiciones por día. Nada se contabiliza si el motor lo bloquea."
      />
      <Pestanas
        etiqueta="Secciones de Tesorería"
        opciones={PESTANAS}
        valor={pestana}
        alCambiar={(p) => despachar({ tipo: "ir", vista: { pestanaTesoreria: p } })}
        idBase={ID}
      />
      <div role="tabpanel" id={idPanel(ID, pestana)} aria-labelledby={idPestana(ID, pestana)}>
        {pestana === "control" ? <ControlTesoreria /> : null}
        {pestana === "contabilizar" ? <Contabilizar /> : null}
        {pestana === "iva" ? <Conciliacion /> : null}
        {pestana === "haberes" ? <Haberes /> : null}
      </div>
    </div>
  );
}

// Primero lo que Tesorería tiene que hacer (aprobadas y en control), después lo que viene en
// camino, lo que todavía está en manos de quien rinde y lo que ya terminó.
const PRIORIDAD: Record<string, number> = {
  aprobada: 0,
  en_control: 0,
  en_aprobacion: 1,
  borrador: 2,
  devuelta: 2,
  rechazada: 3,
  contabilizada: 4,
  cerrada: 4,
};

function ControlTesoreria() {
  const { datos, resumenes, vista, despachar } = useDemo();
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const filas = useMemo(
    () =>
      [...resumenes.values()]
        .map((res) => ({ res, riesgo: riesgoDe(res) }))
        .sort(
          (a, b) =>
            PRIORIDAD[a.res.rendicion.estado] - PRIORIDAD[b.res.rendicion.estado] || b.riesgo.puntaje - a.riesgo.puntaje,
        ),
    [resumenes],
  );
  const seleccion = vista.rendicionTesoreria ? resumenes.get(vista.rendicionTesoreria) : undefined;
  const elegir = (id: string | null) => despachar({ tipo: "ir", vista: { rendicionTesoreria: id } });

  const tomarControl = (res: ResumenRendicion) => {
    const resultado = aplicarAccion(res.rendicion, "tomar_control", contextoTransicion(res, legajoTesoreria));
    if (!resultado.ok) {
      setAviso({ ok: false, texto: resultado.motivo });
      return;
    }
    despachar({ tipo: "transicion", rendicion: resultado.rendicion });
    elegir(res.rendicion.id);
    setAviso({ ok: true, texto: `Tomaste el control de la rendición de ${nombreDe(res.rendicion.legajo)}.` });
  };

  const paraTomar = filas.filter((f) => f.res.rendicion.estado === "aprobada").length;
  const enControl = filas.filter((f) => f.res.rendicion.estado === "en_control").length;
  const sinRendir = filas
    .filter((f) => !["contabilizada", "cerrada", "rechazada"].includes(f.res.rendicion.estado))
    .reduce((s, f) => s + Math.max(0, f.res.cuadratura.diferencia), 0);
  const excepciones = useExcepciones();

  type Fila = (typeof filas)[number];
  const columnas: DataTableColumn<Fila>[] = [
    {
      key: "persona",
      header: "Persona",
      cell: ({ res }) => (
        <span>
          <span className="block font-medium text-strong">{nombreDe(res.rendicion.legajo)}</span>
          <span className="block text-xs text-muted">
            <span className="font-mono">{res.rendicion.id}</span> · {mesDe(res.rendicion.periodo)}
          </span>
        </span>
      ),
    },
    {
      key: "estado",
      header: "Estado",
      cell: ({ res }) => <Badge tone={ESTADO_RENDICION[res.rendicion.estado].tono}>{ESTADO_RENDICION[res.rendicion.estado].texto}</Badge>,
    },
    { key: "total", header: "Total", align: "right", cell: ({ res }) => <span className="tabular-nums">{formatearPesos(res.total)}</span> },
    { key: "lineas", header: "Líneas", align: "right", cell: ({ res }) => <span className="tabular-nums">{res.comprobantes.length}</span> },
    {
      key: "riesgo",
      header: "Riesgo",
      cell: ({ riesgo }) => (
        <span className="flex flex-col items-start gap-1">
          <Badge tone={RIESGO[riesgo.nivel].tono} dot>
            {RIESGO[riesgo.nivel].texto}
          </Badge>
          {riesgo.motivos.length ? <span className="text-xs text-muted">{riesgo.motivos.join(" · ")}</span> : null}
        </span>
      ),
    },
    {
      key: "accion",
      header: <span className="sr-only">Acción</span>,
      align: "right",
      cell: ({ res }) =>
        res.rendicion.estado === "aprobada" ? (
          <Button size="sm" onClick={() => tomarControl(res)}>
            Tomar control
          </Button>
        ) : (
          <Button size="sm" variant={res.rendicion.estado === "en_control" ? "outline" : "ghost"} onClick={() => elegir(res.rendicion.id)}>
            {res.rendicion.estado === "en_control" ? "Controlar" : "Ver"}
          </Button>
        ),
    },
  ];

  return (
    <div className="space-y-8 pt-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Para tomar control" value={paraTomar} sub="Aprobadas por el jefe" />
        <KpiTile label="En control" value={enControl} sub="Revisión antes de SAP" />
        <KpiTile label="Excepciones" value={excepciones.total} sub="Cuentas a Pagar · altas · apócrifas" />
        <KpiTile label="Anticipos sin justificar" value={formatearPesos(sinRendir)} sub="Todavía en manos de la gente" />
      </div>

      {aviso ? (
        aviso.ok ? <AvisoExito>{aviso.texto}</AvisoExito> : <AvisoError titulo="No se pudo" comoSeguir={aviso.texto} />
      ) : null}

      <SectionGroup title="Cola de control" description="Primero lo que te toca; adentro, ordenado por riesgo: bloqueos, avisos e importes grandes.">
        <DataTable caption="Cola de control de Tesorería" columns={columnas} rows={filas} rowKey={(f) => f.res.rendicion.id} />
      </SectionGroup>

      {seleccion ? (
        <DetalleControl
          key={seleccion.rendicion.id}
          resumen={seleccion}
          onCerrar={() => elegir(null)}
          onTomarControl={() => tomarControl(seleccion)}
          onAviso={setAviso}
        />
      ) : null}

      <SectionGroup title="Excepciones" description="Lo que no sigue el camino normal de una rendición, en toda la empresa.">
        <Excepciones grupos={excepciones} rendiciones={datos.rendiciones} />
      </SectionGroup>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Control de una rendición
// ─────────────────────────────────────────────────────────────────────────────

function DetalleControl({
  resumen: res,
  onCerrar,
  onTomarControl,
  onAviso,
}: {
  resumen: ResumenRendicion;
  onCerrar: () => void;
  onTomarControl: () => void;
  onAviso: (aviso: { ok: boolean; texto: string }) => void;
}) {
  const id = useId();
  const { evaluaciones, despachar } = useDemo();
  const r = res.rendicion;
  const control = ultimoEvento(r, "tomar_control");
  const senaladas = new Set(control?.comprobanteIds ?? []);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [devolviendo, setDevolviendo] = useState(false);
  const [lineas, setLineas] = useState<string[]>(() => [...senaladas]);
  const [comentario, setComentario] = useState("");
  const [error, setError] = useState<string | null>(null);
  const originalCompleto = res.comprobantes.length > 0 && res.comprobantes.every((c) => c.originalRecibido);
  const comprobanteAbierto = res.comprobantes.find((c) => c.id === abierto);

  const devolver = () => {
    if (!lineas.length) {
      setError("Marcá al menos una línea para devolver.");
      return;
    }
    const resultado = aplicarAccion(r, "devolver", contextoTransicion(res, legajoTesoreria, { comentario: comentario.trim(), comprobanteIds: lineas }));
    if (!resultado.ok) {
      setError(resultado.motivo);
      return;
    }
    despachar({ tipo: "transicion", rendicion: resultado.rendicion });
    onAviso({ ok: true, texto: `Devolviste ${plural(lineas.length, "línea", "líneas")} a ${nombreDe(r.legajo)}: la ve en el teléfono con tu comentario.` });
    setDevolviendo(false);
  };

  const columnas: DataTableColumn<Comprobante>[] = [
    ...(devolviendo
      ? [
          {
            key: "devolver",
            header: <span className="sr-only">Devolver</span>,
            cell: (c: Comprobante) => (
              <input
                type="checkbox"
                aria-label={`Devolver ${emisorDe(c)}`}
                checked={lineas.includes(c.id)}
                onChange={() => setLineas((xs) => (xs.includes(c.id) ? xs.filter((x) => x !== c.id) : [...xs, c.id]))}
                className="size-4 accent-accent"
              />
            ),
          },
        ]
      : []),
    {
      key: "comprobante",
      header: "Comprobante",
      cell: (c) => (
        <span className="flex items-center gap-3">
          <MiniTicket datos={c.datos} className="hidden sm:flex" />
          <span className="min-w-0">
            <span className="block font-medium text-strong">{emisorDe(c)}</span>
            <span className="block text-xs text-muted">
              {etiquetaClase(c.datos.clase)} {numeroOficial(c.datos)}
            </span>
            {senaladas.has(c.id) ? <Badge tone="danger" className="mt-1">Señalada al tomar el control</Badge> : null}
          </span>
        </span>
      ),
    },
    { key: "tipo", header: "Tipo de gasto", cell: (c) => etiquetaTipo(c.imputacion.tipoGastoId) },
    { key: "total", header: "Total", align: "right", cell: (c) => <span className="tabular-nums">{formatearPesos(c.datos.total)}</span> },
    {
      key: "trato",
      header: "Destino",
      cell: (c) => {
        const ev = evaluaciones.get(c.id);
        if (!ev) return "—";
        const destino = destinoDe(ev);
        return (
          <span className="flex flex-col items-start gap-1">
            <Semaforo luz={luzDe(ev)} />
            <span className="text-xs text-muted">
              {destino.entra ? `${TRATAMIENTO[ev.tratamiento].texto} · ${destino.texto}` : destino.texto}
            </span>
            {destino.motivo ? <span className="max-w-[18rem] text-xs text-body">{destino.motivo}</span> : null}
          </span>
        );
      },
    },
    {
      key: "credito",
      header: "Crédito fiscal",
      align: "right",
      cell: (c) => {
        const ev = evaluaciones.get(c.id);
        // Sólo lo que entra al lote recupera IVA en la rendición.
        return ev && destinoDe(ev).entra ? (
          <span className="tabular-nums">{formatearPesos(ev.creditoFiscal)}</span>
        ) : (
          <span className="text-muted">—</span>
        );
      },
    },
    {
      key: "ver",
      header: <span className="sr-only">Detalle</span>,
      align: "right",
      cell: (c) => (
        <Button size="sm" variant="ghost" aria-expanded={abierto === c.id} onClick={() => setAbierto(abierto === c.id ? null : c.id)}>
          {abierto === c.id ? "Ocultar" : "Ver"}
        </Button>
      ),
    },
  ];

  return (
    <Card className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id={`${id}-titulo`} className="text-lg font-semibold text-strong">
            {nombreDe(r.legajo)} · {mesDe(r.periodo)}
          </h3>
          <p className="text-sm text-muted">
            <span className="font-mono">{r.id}</span> · {res.persona?.puesto} · {formatearPesos(res.total)} ·{" "}
            <Badge tone={ESTADO_RENDICION[r.estado].tono}>{ESTADO_RENDICION[r.estado].texto}</Badge>
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onCerrar} aria-label="Cerrar el control de esta rendición">
          <IconoCerrar />
        </Button>
      </div>

      <p className={cn("rounded-lg px-3 py-2.5 text-sm text-strong", res.cuadratura.cuadra ? "bg-success-soft" : "bg-danger-soft")}>
        {res.cuadratura.mensaje}
      </p>
      {control?.comentario ? (
        <p className="rounded-lg border border-line bg-surface-sunken px-3 py-2.5 text-sm text-body">
          <span className="font-medium text-strong">{nombreDe(control.actorLegajo)}, al tomar el control:</span> “{control.comentario}”
        </p>
      ) : null}

      <DataTable caption={`Comprobantes de la rendición de ${nombreDe(r.legajo)}`} columns={columnas} rows={res.comprobantes} rowKey={(c) => c.id} />

      {comprobanteAbierto ? (
        <div className="rounded-xl border border-line p-4 sm:p-6">
          <DetalleComprobante comprobante={comprobanteAbierto} evaluacion={evaluaciones.get(comprobanteAbierto.id)} modo="control" />
        </div>
      ) : null}

      {r.estado === "aprobada" ? (
        <Button onClick={onTomarControl}>Tomar control</Button>
      ) : r.estado === "en_control" ? (
        <div className="space-y-4">
          <label className="flex items-center gap-3 text-sm text-strong">
            <input
              type="checkbox"
              checked={originalCompleto}
              onChange={(e) => despachar({ tipo: "marcar_original", rendicionId: r.id, recibido: e.target.checked })}
              className="size-4 accent-accent"
            />
            Recibí los originales en papel (sobre <span className="font-mono">{r.id}</span>)
          </label>
          {devolviendo ? (
            <div className="space-y-3 rounded-xl border border-line bg-surface-sunken p-4">
              <p className="text-sm font-medium text-strong">Marcá en la tabla las líneas que vuelven a {nombreDe(r.legajo)} y decile qué corregir.</p>
              <Campo id={`${id}-comentario`} etiqueta="Comentario" obligatorio error={error ?? undefined}>
                {(control) => <Textarea {...control} value={comentario} onChange={(e) => setComentario(e.target.value)} />}
              </Campo>
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="ghost" onClick={() => setDevolviendo(false)}>
                  Cancelar
                </Button>
                <Button onClick={devolver}>Devolver {plural(lineas.length, "línea", "líneas")}</Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setDevolviendo(true)}>
                Devolver líneas
              </Button>
              <Button variant="ghost" onClick={() => despachar({ tipo: "ir", vista: { pestanaTesoreria: "contabilizar" } })}>
                Ir a contabilizar
              </Button>
            </div>
          )}
        </div>
      ) : null}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Excepciones
// ─────────────────────────────────────────────────────────────────────────────

function useExcepciones() {
  const { datos, evaluaciones } = useDemo();
  return useMemo(() => {
    const tiene = (c: Comprobante, codigo: CodigoValidacion) => evaluaciones.get(c.id)?.validaciones.some((v) => v.codigo === codigo);
    const vaPorCuentasAPagar = (c: Comprobante) => {
      const ev = evaluaciones.get(c.id);
      return Boolean(ev && destinoDe(ev).tipo === "cuentas_a_pagar");
    };
    // Lo que la persona ya mandó a Cuentas a Pagar y lo que el motor deriva (R3 sin otro bloqueo, R8).
    const cuentasAPagar = datos.comprobantes.filter((c) => datos.enCuentasAPagar.includes(c.id) || vaPorCuentasAPagar(c));
    const altas = datos.comprobantes.filter((c) => tiene(c, "V3_PROVEEDOR_FUERA_DEL_MAESTRO") && !datos.enCuentasAPagar.includes(c.id));
    const apocrifas = datos.comprobantes.filter((c) => tiene(c, "R4_CUIT_APOCRIFA"));
    return { cuentasAPagar, altas, apocrifas, total: cuentasAPagar.length + altas.length + apocrifas.length };
  }, [datos.comprobantes, datos.enCuentasAPagar, evaluaciones]);
}

function Excepciones({ grupos, rendiciones }: { grupos: ReturnType<typeof useExcepciones>; rendiciones: Rendicion[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <GrupoExcepcion
        titulo="Derivadas a Cuentas a Pagar"
        explicacion="Facturas con leyenda o de proveedores habituales por encima del tope: no se pagan por rendición, se retiene si corresponde."
        items={grupos.cuentasAPagar}
        codigo={["R3_FACTURA_CON_LEYENDA", "R8_DERIVAR_A_CXP"]}
        rendiciones={rendiciones}
      />
      <GrupoExcepcion
        titulo="Proveedor fuera del maestro"
        explicacion="Rendí propone el alta con CUIT y razón social; la hace el dueño del maestro de proveedores en SAP."
        items={grupos.altas}
        codigo={["V3_PROVEEDOR_FUERA_DEL_MAESTRO"]}
        rendiciones={rendiciones}
        conCuit
      />
      <GrupoExcepcion
        titulo="CUIT apócrifa"
        explicacion="ARCA marca la CUIT como emisora de facturas apócrifas: no se contabiliza y la línea se devuelve."
        items={grupos.apocrifas}
        codigo={["R4_CUIT_APOCRIFA"]}
        rendiciones={rendiciones}
        conCuit
      />
    </div>
  );
}

function GrupoExcepcion({
  titulo,
  explicacion,
  items,
  codigo,
  rendiciones,
  conCuit,
}: {
  titulo: string;
  explicacion: string;
  items: Comprobante[];
  codigo: CodigoValidacion[];
  rendiciones: Rendicion[];
  conCuit?: boolean;
}) {
  const { datos, evaluaciones } = useDemo();
  const id = useId();
  return (
    <section aria-labelledby={id} className="rounded-xl border border-line bg-surface-raised p-4">
      <h4 id={id} className="flex items-center justify-between gap-2 text-sm font-semibold text-strong">
        {titulo}
        <Badge tone={items.length ? "warning" : "neutral"}>{items.length}</Badge>
      </h4>
      <p className="mt-1 text-xs leading-relaxed text-muted">{explicacion}</p>
      {items.length ? (
        <ul className="mt-3 divide-y divide-line">
          {items.map((c) => {
            const r = rendiciones.find((x) => x.id === c.rendicionId);
            const mensaje = evaluaciones.get(c.id)?.validaciones.find((v) => codigo.includes(v.codigo))?.mensaje;
            const dondeEsta = datos.enCuentasAPagar.includes(c.id)
              ? "ya está en Cuentas a Pagar"
              : r
                ? `rendición ${ESTADO_RENDICION[r.estado].texto.toLowerCase()}${r.estado === "borrador" ? " (todavía no la envió)" : ""}`
                : "";
            return (
              <li key={c.id} className="py-2.5">
                <p className="flex items-start justify-between gap-3 text-sm">
                  <span className="min-w-0 font-medium text-strong">{emisorDe(c)}</span>
                  <span className="shrink-0 tabular-nums text-strong">{formatearPesos(c.datos.total)}</span>
                </p>
                {conCuit && c.datos.cuitEmisor ? <p className="text-xs tabular-nums text-muted">CUIT {fmtCuit(c.datos.cuitEmisor)}</p> : null}
                <p className="text-xs text-muted">
                  {nombreDe(c.legajo)} · {dondeEsta}
                </p>
                {mensaje ? <p className="mt-1 text-xs text-body">{mensaje}</p> : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted">Nada por ahora.</p>
      )}
    </section>
  );
}
