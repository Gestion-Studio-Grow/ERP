"use client";

// Rol "Quien rinde": la app del teléfono.
//
// A la izquierda (en escritorio), quién rinde y qué mirar en su rendición; a la derecha, el
// teléfono con la app. Adentro: el saldo del anticipo siempre a la vista, los comprobantes con
// su semáforo, el detalle de cada uno, "Cargar comprobante" y "Enviar rendición".
//
// Todo lo que la app afirma sale del motor ya calculado (contexto): la cuadratura, el
// semáforo, los mensajes. La pantalla sólo decide qué botón ofrecer según lo que dijo.

import { useEffect, useRef, useState } from "react";
import { AvisoError, Badge, Button, Card, cn } from "@/components/ui";
import { diasEntre, formatearPesos, type Comprobante, type Persona } from "@/lib/rendiciones";
import { escenarioDemo } from "./escenario";
import { useDemo } from "./contexto";
import type { Vista } from "./estado";
import {
  ESTADO_RENDICION,
  destinoDe,
  emisorDe,
  esEditable,
  etiquetaTipo,
  fechaConDia,
  fechaCorta,
  luzDe,
  mesDe,
  nombreDe,
  nombreDePila,
  personaDe,
  plural,
  quienesRinden,
  rendicionDe,
  ultimoEvento,
  type ResumenRendicion,
} from "./derivados";
import { AvisoExito, Avatar, EncabezadoRol, IconoBasura, IconoCamara, IconoDerivar, IconoEnviar, Semaforo } from "./piezas";
import { MarcoTelefono, PantallaApp } from "./telefono";
import { MiniTicket } from "./Ticket";
import DetalleComprobante from "./DetalleComprobante";
import CargarComprobante from "./CargarComprobante";
import EnviarRendicion from "./EnviarRendicion";

export default function RolRinde() {
  const { datos, vista, resumenes, despachar } = useDemo();
  const [aviso, setAviso] = useState<string | null>(null);
  const persona = personaDe(vista.legajoRinde) ?? quienesRinden[0];
  const rendicion = persona ? rendicionDe(datos.rendiciones, persona.legajo) : undefined;
  const resumen = rendicion ? resumenes.get(rendicion.id) : undefined;

  const elegirPersona = (legajo: string) => {
    setAviso(null);
    despachar({ tipo: "ir", vista: { legajoRinde: legajo, pantallaRinde: "inicio", comprobanteAbierto: null } });
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-12">
      <div className="space-y-6 lg:pt-2">
        <EncabezadoRol
          id="rinde-titulo"
          eyebrow="Quien rinde · en el teléfono"
          titulo="Sacás la foto, el QR se lee solo y el sistema te dice en criollo qué pasa con cada gasto."
          descripcion="El saldo del anticipo siempre a la vista. Lo que no corresponde se frena acá, antes de llegar al jefe o a SAP."
        />
        <SelectorPersona valor={persona?.legajo ?? ""} alCambiar={elegirPersona} />
        {resumen ? <QueMirar resumen={resumen} /> : null}
      </div>
      <div className="flex justify-center lg:justify-end">
        <MarcoTelefono>
          {persona && resumen ? (
            <PantallaRinde persona={persona} resumen={resumen} aviso={aviso} onAviso={setAviso} />
          ) : (
            <PantallaApp>
              <p className="text-sm text-muted">Esta persona no tiene una rendición abierta en el período.</p>
            </PantallaApp>
          )}
        </MarcoTelefono>
      </div>
    </div>
  );
}

function SelectorPersona({ valor, alCambiar }: { valor: string; alCambiar: (legajo: string) => void }) {
  const { datos } = useDemo();
  return (
    <fieldset className="min-w-0 lg:max-w-md">
      <legend className="text-sm font-medium text-strong">¿Quién rinde?</legend>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-1">
        {quienesRinden.map((p) => {
          const r = rendicionDe(datos.rendiciones, p.legajo);
          const activo = p.legajo === valor;
          return (
            <label
              key={p.legajo}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-xl border p-2.5 transition-colors",
                "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus",
                activo ? "border-accent bg-accent-soft" : "border-line bg-surface-raised hover:border-line-strong",
              )}
            >
              <input
                type="radio"
                name="rendi-quien-rinde"
                value={p.legajo}
                checked={activo}
                onChange={() => alCambiar(p.legajo)}
                className="sr-only"
              />
              <Avatar legajo={p.legajo} className="hidden sm:grid" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-strong">
                  <span className="sm:hidden">{nombreDePila(p.legajo)}</span>
                  <span className="hidden sm:inline">{p.nombre}</span>
                </span>
                <span className="block truncate text-xs text-muted">{p.puesto}</span>
              </span>
              {r ? (
                <Badge tone={ESTADO_RENDICION[r.estado].tono} className="hidden lg:inline-flex">
                  {ESTADO_RENDICION[r.estado].texto}
                </Badge>
              ) : null}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Guía para quien presenta la demo: qué tiene de interesante esta rendición, dicho por el motor. */
function QueMirar({ resumen }: { resumen: ResumenRendicion }) {
  const { cuadratura, bloqueados, avisos, evaluaciones, rendicion } = resumen;
  const motivos = [
    ...new Set(evaluaciones.flatMap((e) => e.validaciones.filter((v) => v.severidad === "bloquea").map((v) => v.mensaje))),
  ].slice(0, 3);
  return (
    <Card className="hidden lg:block lg:max-w-md">
      <p className="text-sm font-semibold text-strong">Qué mirar en esta rendición</p>
      <ul className="mt-3 list-disc space-y-2 pl-4 text-sm leading-relaxed text-body marker:text-faint">
        {rendicion.estado === "devuelta" ? <li>Se la devolvieron: puede corregirla y volver a enviarla.</li> : null}
        {!esEditable(rendicion) ? <li>Está {ESTADO_RENDICION[rendicion.estado].texto.toLowerCase()}: no se puede modificar.</li> : null}
        <li>{cuadratura.cuadra ? "Cuadra con el anticipo." : cuadratura.mensaje}</li>
        {bloqueados ? (
          <li>
            {plural(bloqueados, "comprobante bloqueado", "comprobantes bloqueados")}: no se puede enviar hasta resolverlos.
            {motivos.length ? (
              <ul className="mt-1.5 list-[circle] space-y-1 pl-4 text-muted">
                {motivos.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            ) : null}
          </li>
        ) : null}
        {avisos ? <li>{plural(avisos, "aviso", "avisos")}: se puede enviar, y quien aprueba los ve.</li> : null}
        <li>Tocá un comprobante: se ve qué salió del QR, qué leyó la IA y qué cargó la persona.</li>
      </ul>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// La app
// ─────────────────────────────────────────────────────────────────────────────

function PantallaRinde({
  persona,
  resumen,
  aviso,
  onAviso,
}: {
  persona: Persona;
  resumen: ResumenRendicion;
  aviso: string | null;
  onAviso: (aviso: string | null) => void;
}) {
  const { datos, vista, despachar } = useDemo();
  const ir = (cambios: Partial<Vista>) => despachar({ tipo: "ir", vista: cambios });
  const alInicio = () => ir({ pantallaRinde: "inicio", comprobanteAbierto: null });
  const abrir = (comprobanteId: string) => {
    onAviso(null);
    ir({ pantallaRinde: "detalle", comprobanteAbierto: comprobanteId });
  };
  const listo = (texto: string) => {
    onAviso(texto);
    alInicio();
  };

  // En el celular la app es la página: al cambiar de pantalla, se vuelve al principio de la app.
  // (En escritorio cada pantalla trae su propio scroll, que arranca arriba porque se remonta.)
  const clave = `${vista.pantallaRinde}:${vista.comprobanteAbierto ?? ""}`;
  const anterior = useRef(clave);
  useEffect(() => {
    if (anterior.current === clave) return;
    anterior.current = clave;
    if (window.matchMedia("(max-width: 639px)").matches) {
      document.getElementById("rendi-app")?.scrollIntoView({ block: "start" });
    }
  }, [clave]);

  const abierto =
    vista.pantallaRinde === "detalle" && vista.comprobanteAbierto
      ? datos.comprobantes.find((c) => c.id === vista.comprobanteAbierto)
      : undefined;
  const editable = esEditable(resumen.rendicion);

  if (abierto) {
    return <DetalleEnTelefono key={clave} comprobante={abierto} resumen={resumen} onVolver={alInicio} onAviso={onAviso} />;
  }
  if (vista.pantallaRinde === "cargar" && editable) {
    return <CargarComprobante key={clave} persona={persona} resumen={resumen} onVolver={alInicio} onListo={listo} />;
  }
  if (vista.pantallaRinde === "enviar" && editable) {
    return <EnviarRendicion key={clave} resumen={resumen} onVolver={alInicio} onAbrir={abrir} onEnviada={listo} />;
  }
  return (
    <InicioRinde
      key="inicio"
      persona={persona}
      resumen={resumen}
      aviso={aviso}
      onAbrir={abrir}
      onCargar={() => {
        onAviso(null);
        ir({ pantallaRinde: "cargar" });
      }}
      onEnviar={() => {
        onAviso(null);
        ir({ pantallaRinde: "enviar" });
      }}
    />
  );
}

function InicioRinde({
  persona,
  resumen,
  aviso,
  onAbrir,
  onCargar,
  onEnviar,
}: {
  persona: Persona;
  resumen: ResumenRendicion;
  aviso: string | null;
  onAbrir: (id: string) => void;
  onCargar: () => void;
  onEnviar: () => void;
}) {
  const { datos, evaluaciones } = useDemo();
  const r = resumen.rendicion;
  const editable = esEditable(r);
  const devolucion = r.estado === "devuelta" ? ultimoEvento(r, "devolver") : undefined;
  const lineasDevueltas = new Set(devolucion?.comprobanteIds ?? []);
  const enCuentasAPagar = datos.comprobantes.filter((c) => c.rendicionId === r.id && datos.enCuentasAPagar.includes(c.id));

  return (
    <PantallaApp
      acciones={
        editable ? (
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <Button onClick={onCargar}>
              <IconoCamara />
              Cargar comprobante
            </Button>
            <Button variant="outline" onClick={onEnviar} aria-label="Enviar rendición">
              <IconoEnviar />
              Enviar
            </Button>
          </div>
        ) : null
      }
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs text-muted">{escenarioDemo.empresa.razonSocial}</p>
          <p className="text-lg font-semibold tracking-tight text-strong">Hola, {nombreDePila(persona.legajo)}</p>
        </div>
        <Avatar legajo={persona.legajo} />
      </div>

      {aviso ? <AvisoExito>{aviso}</AvisoExito> : null}

      <TarjetaAnticipo resumen={resumen} />

      {devolucion ? (
        <AvisoError
          tono="aviso"
          titulo="Te devolvieron la rendición"
          comoSeguir={`${nombreDe(devolucion.actorLegajo)}: “${devolucion.comentario ?? "sin comentario"}”. Corregí las líneas marcadas y volvé a enviarla.`}
        />
      ) : null}
      {!editable ? <EstadoRendicion resumen={resumen} /> : null}

      <section aria-labelledby="rinde-lista" className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <h3 id="rinde-lista" className="text-sm font-semibold text-strong">
            Rendición de {mesDe(r.periodo)}
          </h3>
          <span className="text-xs tabular-nums text-muted">
            {plural(resumen.comprobantes.length, "comprobante", "comprobantes")} · {formatearPesos(resumen.total)}
          </span>
        </div>
        {resumen.bloqueados || resumen.avisos ? (
          <p className="text-xs text-muted">
            {[
              resumen.bloqueados ? plural(resumen.bloqueados, "bloqueado", "bloqueados") : null,
              resumen.avisos ? plural(resumen.avisos, "aviso", "avisos") : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        ) : null}
        {resumen.comprobantes.length ? (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface-raised">
            {resumen.comprobantes.map((c) => (
              <FilaComprobante
                key={c.id}
                comprobante={c}
                devuelto={lineasDevueltas.has(c.id)}
                onAbrir={() => onAbrir(c.id)}
                luz={luzDe(evaluaciones.get(c.id))}
              />
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-muted">
            Todavía no cargaste comprobantes. Tocá “Cargar comprobante”.
          </p>
        )}
        {enCuentasAPagar.length ? (
          <p className="text-xs leading-relaxed text-muted">
            Pasaron a Cuentas a Pagar: {enCuentasAPagar.map((c) => `${emisorDe(c)} (${formatearPesos(c.datos.total)})`).join(", ")}.
          </p>
        ) : null}
      </section>
    </PantallaApp>
  );
}

function FilaComprobante({
  comprobante: c,
  devuelto,
  luz,
  onAbrir,
}: {
  comprobante: Comprobante;
  devuelto: boolean;
  luz: ReturnType<typeof luzDe>;
  onAbrir: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onAbrir}
        className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
      >
        <MiniTicket datos={c.datos} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-strong">{emisorDe(c)}</span>
          <span className="block truncate text-xs text-muted">
            {etiquetaTipo(c.imputacion.tipoGastoId)} · {fechaCorta(c.datos.fecha)}
          </span>
          {devuelto ? <Badge tone="warning" className="mt-1">Te la devolvieron</Badge> : null}
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-sm font-semibold tabular-nums text-strong">{formatearPesos(c.datos.total)}</span>
          <Semaforo luz={luz} />
        </span>
      </button>
    </li>
  );
}

function TarjetaAnticipo({ resumen }: { resumen: ResumenRendicion }) {
  const { cuadratura: q, rendicion: r } = resumen;
  const anticipos = escenarioDemo.anticipos.filter((a) => r.anticipoIds.includes(a.id));
  if (!anticipos.length) {
    return (
      <Card className="text-sm text-muted">Sin anticipo: lo que cargues va como plata propia, a reintegrar.</Card>
    );
  }
  const vence = anticipos.map((a) => a.vence).sort()[0];
  const dias = diasEntre(escenarioDemo.hoy, vence);
  const deMas = q.diferencia < 0;
  const porRendir = Math.max(0, q.diferencia);
  const avance = q.anticipado > 0 ? Math.min(1, (q.rendido + q.devuelto) / q.anticipado) : 1;
  const plazo = dias > 1 ? `faltan ${dias} días` : dias === 1 ? "vence mañana" : dias === 0 ? "vence hoy" : `venció hace ${-dias} días`;

  return (
    <section aria-labelledby="rinde-anticipo" className="rounded-2xl bg-accent p-4 text-on-accent shadow-card">
      <h3 id="rinde-anticipo" className="text-sm font-semibold">
        {deMas ? "Gastaste de más" : "Tenés por rendir"}
      </h3>
      <p className="mt-0.5 text-[34px] font-bold leading-tight tracking-tight tabular-nums">
        {formatearPesos(deMas ? -q.diferencia : porRendir)}
      </p>
      <p className="text-sm font-medium">
        {deMas ? "Te lo reintegramos con la rendición." : porRendir === 0 ? "Justificaste todo el anticipo." : `Vence el ${fechaConDia(vence)} · ${plazo}`}
      </p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/20" aria-hidden="true">
        <div className="h-full rounded-full bg-current" style={{ width: `${Math.round(avance * 100)}%` }} />
      </div>
      <p className="mt-2 text-xs leading-relaxed">
        Anticipo de {formatearPesos(q.anticipado)} · {anticipos.map((a) => a.motivo).join(" · ")}
      </p>
    </section>
  );
}

function EstadoRendicion({ resumen }: { resumen: ResumenRendicion }) {
  const r = resumen.rendicion;
  const envio = ultimoEvento(r, "enviar");
  const nivel = resumen.niveles[r.nivelActual] ?? [];
  const texto =
    r.estado === "en_aprobacion"
      ? `${envio ? `La mandaste el ${fechaCorta(envio.fecha)}. ` : ""}${nivel.length ? `La tiene ${nivel.map(nombreDe).join(" o ")}.` : "Este nivel no tiene aprobador asignado."}`
      : r.estado === "aprobada"
        ? "Aprobada. Ahora la controla Tesorería."
        : r.estado === "en_control"
          ? "Tesorería la está controlando antes de pasarla a SAP."
          : r.estado === "contabilizada" || r.estado === "cerrada"
            ? "Ya está en SAP."
            : r.estado === "rechazada"
              ? `Rechazada: “${ultimoEvento(r, "rechazar")?.comentario ?? ""}”.`
              : "";
  return (
    <div className="flex items-start gap-3 rounded-xl border border-line bg-surface-raised p-3">
      <Badge tone={ESTADO_RENDICION[r.estado].tono} dot>
        {ESTADO_RENDICION[r.estado].texto}
      </Badge>
      <p className="min-w-0 flex-1 text-sm text-body">{texto} No se puede modificar.</p>
    </div>
  );
}

function DetalleEnTelefono({
  comprobante,
  resumen,
  onVolver,
  onAviso,
}: {
  comprobante: Comprobante;
  resumen: ResumenRendicion;
  onVolver: () => void;
  onAviso: (aviso: string) => void;
}) {
  const { evaluaciones, despachar } = useDemo();
  const [confirmando, setConfirmando] = useState(false);
  const r = resumen.rendicion;
  const evaluacion = evaluaciones.get(comprobante.id);
  const enLaRendicion = r.comprobanteIds.includes(comprobante.id);
  const editable = esEditable(r) && enLaRendicion;
  // Se ofrece "Pasar a Cuentas a Pagar" sólo si el motor lo deriva (una factura con leyenda que
  // además tiene otro bloqueo no va ahí: queda afuera y sólo se puede quitar).
  const aCuentasAPagar = evaluacion ? destinoDe(evaluacion).tipo === "cuentas_a_pagar" : false;

  const quitar = () => {
    despachar({ tipo: "quitar_comprobante", rendicionId: r.id, comprobanteId: comprobante.id });
    onAviso(`Quitaste ${emisorDe(comprobante)} de la rendición.`);
    onVolver();
  };
  const derivar = () => {
    despachar({ tipo: "pasar_a_cuentas_a_pagar", rendicionId: r.id, comprobanteId: comprobante.id });
    onAviso(`${emisorDe(comprobante)} pasó a Cuentas a Pagar: lo paga Tesorería, con la retención que corresponda.`);
    onVolver();
  };

  const acciones = !editable ? null : confirmando ? (
    <div className="space-y-2">
      <p className="text-sm text-strong">¿Lo sacás de la rendición? Se borra de la demo.</p>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={() => setConfirmando(false)}>
          Cancelar
        </Button>
        <Button variant="danger" onClick={quitar}>
          Sí, quitar
        </Button>
      </div>
    </div>
  ) : aCuentasAPagar ? (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
      <Button onClick={derivar}>
        <IconoDerivar />
        Pasar a Cuentas a Pagar
      </Button>
      <Button variant="ghost" onClick={() => setConfirmando(true)} aria-label="Quitar de la rendición">
        <IconoBasura />
        Quitar
      </Button>
    </div>
  ) : (
    <Button variant="outline" className="w-full" onClick={() => setConfirmando(true)}>
      <IconoBasura />
      Quitar de la rendición
    </Button>
  );

  return (
    <PantallaApp titulo={emisorDe(comprobante)} onVolver={onVolver} acciones={acciones}>
      {!enLaRendicion ? (
        <p className="rounded-lg bg-surface-sunken px-3 py-2 text-xs text-muted">Este comprobante ya no está en la rendición.</p>
      ) : null}
      <DetalleComprobante comprobante={comprobante} evaluacion={evaluacion} modo="rinde" />
    </PantallaApp>
  );
}
