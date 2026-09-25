"use client";

// "Cargar comprobante" en el teléfono. Dos caminos:
// - Del bolsillo: tickets ficticios (bolsillo.ts). Se "saca la foto", se ve qué leyó el QR
//   (exacto) y qué leyó la IA (con su confianza), y se completa el formulario corto.
// - QR real: se lee el QR de una factura de verdad (LectorQr) y el desglose de IVA se completa
//   a mano (en el producto lo completa la IA).
//
// Mientras se completa, el motor evalúa el borrador en vivo (`evaluarComprobante`): la persona
// ve antes de agregarlo si recupera IVA, si falta un dato o si el sistema no lo va a dejar
// pasar. Lo que bloquea no se agrega; una factura con leyenda se manda a Cuentas a Pagar.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Badge, Button, Field, Input, Select, cn, fmtCuit } from "@/components/ui";
import {
  claseDesdeTipoArca,
  etiquetaClase,
  formatearFecha,
  formatearPesos,
  ivaDeLinea,
  nombreJurisdiccion,
  type Alicuota,
  type CodigoJurisdiccion,
  type Comprobante,
  type DatosComprobante,
  type EstadoConstatacion,
  type LecturaQr,
  type Persona,
  type TipoGasto,
} from "@/lib/rendiciones";
import { escenarioDemo } from "./escenario";
import { useDemo } from "./contexto";
import {
  CODIGOS_JURISDICCION,
  destinoDe,
  emisorDe,
  evaluarBorrador,
  filasDeDatos,
  importeSinSigno,
  numeroOficial,
  parsearPesos,
  receptorTexto,
  type ResumenRendicion,
} from "./derivados";
import { bolsillo, tipoSugerido, type ComprobanteDelBolsillo } from "./bolsillo";
import FormImputacion, { aImputacion, borradorInicial, opcionesDeMedio, type BorradorImputacion } from "./FormImputacion";
import { ResultadoEvaluacion } from "./DetalleComprobante";
import LectorQr from "./LectorQr";
import { PantallaApp } from "./telefono";
import { Campo, ChipOrigen, FilaDato, IconoBolsillo, IconoCheck, IconoDerivar, IconoQr, ListaValidaciones } from "./piezas";
import { MiniTicket, Ticket } from "./Ticket";

interface PropsCarga {
  persona: Persona;
  resumen: ResumenRendicion;
  onVolver: () => void;
  /** Se agregó (o se mandó a Cuentas a Pagar): vuelve al inicio con este aviso. */
  onListo: (aviso: string) => void;
}

export default function CargarComprobante(props: PropsCarga) {
  const { datos } = useDemo();
  const [camino, setCamino] = useState<{ tipo: "elegir" } | { tipo: "bolsillo"; item: ComprobanteDelBolsillo } | { tipo: "qr" }>({
    tipo: "elegir",
  });
  const volverAElegir = () => setCamino({ tipo: "elegir" });

  if (camino.tipo === "bolsillo") return <CargaBolsillo key={camino.item.id} item={camino.item} {...props} onVolver={volverAElegir} />;
  if (camino.tipo === "qr") return <CargaQr {...props} onVolver={volverAElegir} />;

  return (
    <PantallaApp titulo="Cargar comprobante" onVolver={props.onVolver}>
      <section aria-labelledby="bolsillo-titulo" className="space-y-3">
        <div>
          <h3 id="bolsillo-titulo" className="flex items-center gap-2 text-sm font-semibold text-strong">
            <IconoBolsillo /> Del bolsillo
          </h3>
          <p className="mt-1 text-sm text-muted">Elegí un ticket y sacale una foto: el QR se lee solo y la IA completa lo que falta.</p>
        </div>
        <ul className="space-y-2">
          {bolsillo.map((item) => {
            const yaCargado = datos.comprobantes.some((c) => c.hashImagen === item.hashImagen);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setCamino({ tipo: "bolsillo", item })}
                  className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface-raised p-3 text-left transition-colors hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  <MiniTicket datos={item.datos} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-strong">{item.titulo}</span>
                    <span className="block text-xs leading-snug text-muted">{item.pista}</span>
                    {yaCargado ? <Badge className="mt-1">Ya lo cargaste</Badge> : null}
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-strong">{formatearPesos(item.datos.total)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="qr-real-titulo" className="space-y-2 rounded-xl border border-dashed border-line-strong p-4">
        <h3 id="qr-real-titulo" className="flex items-center gap-2 text-sm font-semibold text-strong">
          <IconoQr /> Probar con un QR real
        </h3>
        <p className="text-sm text-muted">¿Tenés una factura electrónica a mano? Leé su QR con la cámara o pegá su contenido. Todo queda en este navegador.</p>
        <Button variant="outline" size="sm" onClick={() => setCamino({ tipo: "qr" })}>
          Leer un QR
        </Button>
      </section>
    </PantallaApp>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Borrador + evaluación en vivo (compartido por los dos caminos)
// ─────────────────────────────────────────────────────────────────────────────

interface BaseComprobante {
  datos: DatosComprobante;
  origenCampos: Comprobante["origenCampos"];
  confianzaIa?: Comprobante["confianzaIa"];
  constatacion: EstadoConstatacion;
  cuitApocrifa: Comprobante["cuitApocrifa"];
  hashImagen?: string;
}

function useCarga({
  base,
  persona,
  resumen,
  sugerencia,
  onListo,
}: {
  base: BaseComprobante;
  persona: Persona;
  resumen: ResumenRendicion;
  sugerencia: { jurisdiccion?: CodigoJurisdiccion; origen?: CodigoJurisdiccion; destino?: CodigoJurisdiccion };
  onListo: (aviso: string) => void;
}) {
  const { datos, despachar } = useDemo();
  const r = resumen.rendicion;
  const opciones = useMemo(() => opcionesDeMedio(r, persona.legajo), [r, persona.legajo]);
  const [borrador, setBorrador] = useState<BorradorImputacion>(() =>
    borradorInicial(persona, base.datos.fecha, opciones, sugerencia),
  );
  const comprobante: Comprobante = useMemo(
    () => ({
      id: "borrador",
      rendicionId: r.id,
      legajo: persona.legajo,
      ...base,
      imputacion: aImputacion(borrador, persona, opciones),
    }),
    [base, borrador, opciones, persona, r.id],
  );
  const evaluacion = useMemo(
    () => evaluarBorrador(comprobante, datos.comprobantes, r.periodo),
    [comprobante, datos.comprobantes, r.periodo],
  );

  const descripcion = `${emisorDe(comprobante)} (${formatearPesos(comprobante.datos.total)})`;
  return {
    borrador,
    cambiar: (cambios: Partial<BorradorImputacion>) => setBorrador((b) => ({ ...b, ...cambios })),
    opciones,
    comprobante,
    evaluacion,
    agregar: () => {
      despachar({ tipo: "agregar_comprobante", rendicionId: r.id, comprobante });
      onListo(`Listo: agregaste ${descripcion} a la rendición.`);
    },
    mandarACuentasAPagar: () => {
      despachar({ tipo: "nuevo_a_cuentas_a_pagar", rendicionId: r.id, comprobante });
      onListo(`${descripcion} fue a Cuentas a Pagar: no se paga por rendición.`);
    },
  };
}

type Carga = ReturnType<typeof useCarga>;

function FormularioCarga({ carga, persona, sugerido }: { carga: Carga; persona: Persona; sugerido?: TipoGasto }) {
  const id = useId();
  const { datos } = useDemo();
  return (
    <>
      <section aria-labelledby={`${id}-form`} className="space-y-3">
        <h3 id={`${id}-form`} className="text-sm font-semibold text-strong">
          Completá lo que sabés vos
        </h3>
        <FormImputacion
          idBase={`${id}-imputacion`}
          valor={carga.borrador}
          alCambiar={carga.cambiar}
          persona={persona}
          opcionesMedio={carga.opciones}
          fecha={carga.comprobante.datos.fecha}
          comprobantes={datos.comprobantes}
          sugerido={sugerido}
        />
      </section>
      {carga.evaluacion ? (
        <section aria-labelledby={`${id}-vista`} className="space-y-2.5">
          <h3 id={`${id}-vista`} className="text-sm font-semibold text-strong">
            Así lo va a tratar el sistema
          </h3>
          <ResultadoEvaluacion evaluacion={carga.evaluacion} modo="rinde" />
          <ListaValidaciones validaciones={carga.evaluacion.validaciones} />
        </section>
      ) : null}
    </>
  );
}

function AccionesCarga({ carga }: { carga: Carga }) {
  const ev = carga.evaluacion;
  if (!ev) return null;
  // A Cuentas a Pagar sólo si el motor lo deriva: una factura con leyenda que además tiene otro
  // bloqueo (p. ej. CUIT apócrifa) no va a ningún lado.
  if (ev.bloqueado && destinoDe(ev).tipo === "cuentas_a_pagar") {
    return (
      <Button className="w-full" onClick={carga.mandarACuentasAPagar}>
        <IconoDerivar />
        Mandar a Cuentas a Pagar
      </Button>
    );
  }
  if (ev.bloqueado) {
    return (
      <div className="space-y-1.5">
        <Button className="w-full" disabled aria-describedby="rendi-carga-motivo">
          Agregar a la rendición
        </Button>
        <p id="rendi-carga-motivo" className="text-center text-xs text-muted">
          Así no se puede agregar: mirá arriba qué lo bloquea.
        </p>
      </div>
    );
  }
  return (
    <Button className="w-full" onClick={carga.agregar}>
      <IconoCheck />
      Agregar a la rendición
    </Button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Del bolsillo: foto → lectura → confirmar
// ─────────────────────────────────────────────────────────────────────────────

function CargaBolsillo({ item, persona, resumen, onVolver, onListo }: PropsCarga & { item: ComprobanteDelBolsillo }) {
  const [foto, setFoto] = useState(false);
  const tituloLectura = useRef<HTMLHeadingElement>(null);
  const base: BaseComprobante = useMemo(
    () => ({
      datos: item.datos,
      origenCampos: item.origenCampos,
      confianzaIa: item.confianzaIa,
      constatacion: item.constatacion,
      cuitApocrifa: item.cuitApocrifa,
      hashImagen: item.hashImagen,
    }),
    [item],
  );
  const carga = useCarga({ base, persona, resumen, sugerencia: item.sugerencia, onListo });
  const sugerido = tipoSugerido(item, escenarioDemo.diccionario);

  // Al sacar la foto, el botón desaparece: el foco pasa a la lectura, que es lo nuevo.
  useEffect(() => {
    if (foto) tituloLectura.current?.focus();
  }, [foto]);

  return (
    <PantallaApp
      titulo={foto ? "Revisá y confirmá" : "Sacale una foto"}
      onVolver={onVolver}
      acciones={foto ? <AccionesCarga carga={carga} /> : null}
    >
      <div className={cn("rendi-visor relative rounded-2xl px-5 py-6", foto && "rendi-escaneo")}>
        <span className="rendi-esquinas" aria-hidden="true" />
        <div className="mx-auto max-w-[280px]">
          <Ticket datos={item.datos} semilla={item.id} renglones={item.renglones} domicilio={item.domicilio} conQr={item.tieneQr} />
        </div>
      </div>

      {!foto ? (
        <div className="flex flex-col items-center gap-3 py-1">
          <p className="text-center text-sm text-muted">Encuadrá el comprobante dentro de las esquinas.</p>
          <button type="button" onClick={() => setFoto(true)} aria-label="Sacar la foto" className="rendi-obturador" />
        </div>
      ) : (
        <>
          <section aria-labelledby={`lectura-${item.id}`} className="rendi-aparece space-y-2">
            <h3 id={`lectura-${item.id}`} ref={tituloLectura} tabIndex={-1} className="text-sm font-semibold text-strong outline-none">
              Lo que leyó el teléfono
            </h3>
            <p className="text-xs leading-relaxed text-muted">
              {item.tieneQr
                ? "El QR de ARCA trae los datos exactos. No trae el neto ni el IVA: eso lo leyó la IA de la foto."
                : "Este ticket no tiene QR: la IA leyó todo de la foto. Lo resaltado conviene revisarlo."}
            </p>
            <dl className="divide-y divide-line rounded-xl border border-line bg-surface-raised px-3">
              {filasDeDatos(item.datos, item.origenCampos, item.confianzaIa).map((f) => (
                <FilaDato key={f.clave} etiqueta={f.etiqueta} origen={f.origen} confianza={f.confianza}>
                  {f.valor}
                </FilaDato>
              ))}
            </dl>
          </section>
          <div className="rendi-aparece-2 space-y-5">
            <FormularioCarga carga={carga} persona={persona} sugerido={sugerido} />
          </div>
        </>
      )}
    </PantallaApp>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// QR real: lectura exacta → desglose a mano → confirmar
// ─────────────────────────────────────────────────────────────────────────────

function CargaQr(props: PropsCarga) {
  const [lectura, setLectura] = useState<LecturaQr | null>(null);
  if (!lectura) {
    return (
      <PantallaApp titulo="Leer un QR real" onVolver={props.onVolver}>
        <LectorQr legajo={props.persona.legajo} onLeido={setLectura} />
      </PantallaApp>
    );
  }
  return (
    <ConfirmarQr
      key={`${lectura.cuitEmisor}-${lectura.puntoVenta}-${lectura.numero}`}
      lectura={lectura}
      {...props}
      onVolver={() => setLectura(null)}
    />
  );
}

const ALICUOTAS: Alicuota[] = [21, 10.5, 27, 5, 2.5, 0];

interface Desglose {
  razonSocial: string;
  neto: string;
  alicuota: string;
  internos: string;
  percepcion: string;
  jurisdiccionPercepcion: CodigoJurisdiccion | "";
  ivaContenido: string;
  leyenda: DatosComprobante["leyendaA"];
}

function ConfirmarQr({ lectura, persona, resumen, onVolver, onListo }: PropsCarga & { lectura: LecturaQr }) {
  const id = useId();
  const clase = claseDesdeTipoArca(lectura.tipoComprobanteArca) ?? "factura_b";
  const discrimina = clase === "factura_a" || clase === "factura_m" || clase === "tique_factura_a";
  const [d, setD] = useState<Desglose>({
    razonSocial: "",
    neto: "",
    alicuota: "21",
    internos: "",
    percepcion: "",
    jurisdiccionPercepcion: "",
    ivaContenido: "",
    leyenda: "ninguna",
  });
  const cambiar = (cambios: Partial<Desglose>) => setD((x) => ({ ...x, ...cambios }));

  const neto = parsearPesos(d.neto);
  const internos = parsearPesos(d.internos);
  const percepcion = parsearPesos(d.percepcion);
  const ivaContenido = parsearPesos(d.ivaContenido);
  const alicuota = Number(d.alicuota) as Alicuota;

  const base: BaseComprobante = useMemo(() => {
    const cuitReceptor = lectura.tipoDocReceptor === 80 && lectura.nroDocReceptor !== "0" ? lectura.nroDocReceptor : undefined;
    const datos: DatosComprobante = {
      clase,
      leyendaA: clase === "factura_a" ? d.leyenda : "ninguna",
      fecha: lectura.fecha,
      cuitEmisor: lectura.cuitEmisor,
      razonSocialEmisor: d.razonSocial.trim() || undefined,
      puntoVenta: lectura.puntoVenta,
      numero: lectura.numero,
      cae: lectura.codAut,
      cuitReceptor,
      lineasIva: discrimina && neto ? [{ alicuota, neto, iva: ivaDeLinea(neto, alicuota) }] : [],
      ivaContenido: !discrimina && ivaContenido ? ivaContenido : undefined,
      percepciones: percepcion ? [{ regimen: "iibb", jurisdiccion: d.jurisdiccionPercepcion || undefined, importe: percepcion }] : [],
      noGravado: 0,
      exento: 0,
      impuestosInternos: internos ?? 0,
      total: lectura.importeTotal,
      moneda: lectura.moneda === "DOL" ? "USD" : "ARS",
      cotizacion: lectura.moneda === "DOL" ? lectura.cotizacion : undefined,
      esControladorFiscal: false,
    };
    return {
      datos,
      origenCampos: {
        clase: "qr",
        fecha: "qr",
        cuitEmisor: "qr",
        puntoVenta: "qr",
        numero: "qr",
        total: "qr",
        moneda: "qr",
        cae: "qr",
        cuitReceptor: "qr",
        razonSocialEmisor: "persona",
        lineasIva: "persona",
        ivaContenido: "persona",
        percepciones: "persona",
        impuestosInternos: "persona",
        leyendaA: "persona",
      },
      // Sin conexión a ARCA en la demo: la constatación y el control de apócrifas quedan pendientes.
      constatacion: "pendiente",
      cuitApocrifa: "sin_consultar",
    };
  }, [lectura, clase, discrimina, d.leyenda, d.razonSocial, d.jurisdiccionPercepcion, neto, alicuota, ivaContenido, percepcion, internos]);

  const carga = useCarga({ base, persona, resumen, sugerencia: {}, onListo });
  const esDeLaEmpresa = base.datos.cuitReceptor === escenarioDemo.empresa.cuit;

  return (
    <PantallaApp titulo="Revisá y confirmá" onVolver={onVolver} acciones={<AccionesCarga carga={carga} />}>
      <section aria-labelledby={`${id}-leido`} className="space-y-2">
        <h3 id={`${id}-leido`} className="text-sm font-semibold text-strong">
          Leído del QR
        </h3>
        <dl className="divide-y divide-line rounded-xl border border-line bg-surface-raised px-3">
          <FilaDato etiqueta="Tipo" origen="qr">{`${etiquetaClase(clase)} (código ${lectura.tipoComprobanteArca})`}</FilaDato>
          <FilaDato etiqueta="Fecha" origen="qr">{formatearFecha(lectura.fecha)}</FilaDato>
          <FilaDato etiqueta="CUIT del emisor" origen="qr">{fmtCuit(lectura.cuitEmisor)}</FilaDato>
          <FilaDato etiqueta="Número" origen="qr">{numeroOficial(lectura)}</FilaDato>
          <FilaDato etiqueta="Total" origen="qr">
            {lectura.moneda === "DOL" ? `USD ${importeSinSigno(lectura.importeTotal)} (cotización ${lectura.cotizacion})` : formatearPesos(lectura.importeTotal)}
          </FilaDato>
          <FilaDato etiqueta="A nombre de" origen="qr">
            {lectura.tipoDocReceptor === 96 ? `DNI ${lectura.nroDocReceptor}` : receptorTexto(base.datos.cuitReceptor)}
          </FilaDato>
          <FilaDato etiqueta={lectura.tipoCodAut === "A" ? "CAEA" : "CAE"} origen="qr">{lectura.codAut}</FilaDato>
        </dl>
        {!esDeLaEmpresa ? (
          <p className="text-xs leading-relaxed text-muted">
            No está a nombre de {escenarioDemo.empresa.razonSocial} (la empresa ficticia de la demo): el sistema va a avisar que no recupera IVA. Con un QR tuyo, es lo esperable.
          </p>
        ) : null}
      </section>

      <section aria-labelledby={`${id}-desglose`} className="space-y-3">
        <div>
          <h3 id={`${id}-desglose`} className="text-sm font-semibold text-strong">
            El desglose
          </h3>
          <p className="mt-1 flex items-start gap-2 rounded-lg bg-accent-soft px-3 py-2 text-xs leading-relaxed text-accent-ink">
            En el producto, la IA completa el desglose de IVA; en la demo completalo a mano.
          </p>
        </div>
        <Campo id={`${id}-razon`} etiqueta="Emisor (razón social)" ayuda="El QR trae el CUIT, no el nombre.">
          {(control) => <Input {...control} value={d.razonSocial} onChange={(e) => cambiar({ razonSocial: e.target.value })} autoComplete="off" />}
        </Campo>
        {discrimina ? (
          <>
            <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
              <CampoPesos id={`${id}-neto`} etiqueta="Neto gravado" valor={d.neto} alCambiar={(neto) => cambiar({ neto })} requerido />
              <Field label="Alícuota" htmlFor={`${id}-alicuota`}>
                <Select id={`${id}-alicuota`} value={d.alicuota} onChange={(e) => cambiar({ alicuota: e.target.value })}>
                  {ALICUOTAS.map((a) => (
                    <option key={a} value={String(a)}>
                      {String(a).replace(".", ",")} %
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <p className="-mt-1 text-xs text-muted" aria-live="polite">
              IVA {String(alicuota).replace(".", ",")} %: <span className="font-medium tabular-nums text-strong">{neto ? formatearPesos(ivaDeLinea(neto, alicuota)) : "—"}</span>
            </p>
            <div className="grid grid-cols-2 gap-3">
              <CampoPesos id={`${id}-internos`} etiqueta="Impuestos internos" valor={d.internos} alCambiar={(internos) => cambiar({ internos })} />
              <CampoPesos id={`${id}-percepcion`} etiqueta="Percepción IIBB" valor={d.percepcion} alCambiar={(p) => cambiar({ percepcion: p })} />
            </div>
            {percepcion ? (
              <Field label="Provincia de la percepción" htmlFor={`${id}-jur-percepcion`}>
                <Select
                  id={`${id}-jur-percepcion`}
                  value={d.jurisdiccionPercepcion}
                  onChange={(e) => cambiar({ jurisdiccionPercepcion: e.target.value as CodigoJurisdiccion | "" })}
                >
                  <option value="">Elegí la provincia</option>
                  {CODIGOS_JURISDICCION.map((j) => (
                    <option key={j} value={j}>
                      {nombreJurisdiccion(j)}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
            {clase === "factura_a" ? (
              <Field label="¿Qué leyenda trae la factura?" htmlFor={`${id}-leyenda`}>
                <Select id={`${id}-leyenda`} value={d.leyenda} onChange={(e) => cambiar({ leyenda: e.target.value as Desglose["leyenda"] })}>
                  <option value="ninguna">Ninguna</option>
                  <option value="operacion_sujeta_a_retencion">&ldquo;Operación sujeta a retención&rdquo;</option>
                  <option value="pago_en_cbu_informada">&ldquo;Pago en CBU informada&rdquo;</option>
                </Select>
              </Field>
            ) : null}
          </>
        ) : (
          <CampoPesos
            id={`${id}-iva-contenido`}
            etiqueta="IVA contenido (si figura en el ticket)"
            valor={d.ivaContenido}
            alCambiar={(v) => cambiar({ ivaContenido: v })}
          />
        )}
      </section>

      <FormularioCarga carga={carga} persona={persona} />
      <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
        Origen de los datos: <ChipOrigen origen="qr" /> del QR, <ChipOrigen origen="persona" /> lo cargaste vos.
      </p>
    </PantallaApp>
  );
}

function CampoPesos({
  id,
  etiqueta,
  valor,
  alCambiar,
  requerido,
}: {
  id: string;
  etiqueta: string;
  valor: string;
  alCambiar: (v: string) => void;
  requerido?: boolean;
}) {
  const invalido = parsearPesos(valor) === null;
  return (
    <Campo id={id} etiqueta={etiqueta} obligatorio={requerido} error={invalido ? "Escribí un importe, por ejemplo 12.700,50" : undefined}>
      {(control) => (
        <Input {...control} inputMode="decimal" value={valor} onChange={(e) => alCambiar(e.target.value)} placeholder="0,00" autoComplete="off" />
      )}
    </Campo>
  );
}
