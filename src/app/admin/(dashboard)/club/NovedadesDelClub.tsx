"use client";

// ============================================================================
// NOVEDADES Y REDES — la difusión por WhatsApp, las bajas, el historial y el calendario de redes (sólo dueños).
// ============================================================================
//
// Arriba se arma la novedad (tipo, a quiénes, título y texto) con la vista previa del mensaje tal como llega y a
// cuántos les llega. «Preparar el envío» abre los dos caminos: la lista de difusión de WhatsApp Business (copiar el
// mensaje y descargar los contactos) o uno por uno (cada nombre abre WhatsApp con su mensaje y queda tildado). Nada se
// manda solo: lo manda una persona desde el WhatsApp del club. Después, quién pidió la BAJA, el historial y el
// calendario de redes del mes. El Studio de redes (la placa con la marca del club y el caption) se abre desde la
// novedad que se está armando («Hacer la imagen en el Studio») y desde el calendario, como el vanilla; baja en su
// propio chunk (`import()` dinámico) recién al tocarlo: studio-de-redes.tsx, lo puro en studio-core.ts.
// Todo cambia con `almacen.comando`, re-aplicable en otro puesto (aviso abajo y «Deshacer» de lo que se puede deshacer). Las reglas están en
// novedades-core.ts; quién opera, en operador-del-club.ts.

import { useCallback, useEffect, useId, useRef, useState, type ComponentType } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Field";
import { cn } from "@/components/ui/cn";
import { destinatarios, mensajeDifusion } from "@/lib/club/motor.mjs";
import type { Ahora, EstadoClub, Fecha } from "@/lib/club/motor.mjs";
import type { Almacen } from "./almacen";
import {
  BORRADOR_VACIO,
  DESHACIBLES_NOVEDADES,
  LARGO_TEXTO,
  LARGO_TITULO,
  MARCA_ESTADO,
  OPCIONES_AUDIENCIA,
  OPCIONES_CANAL,
  OPCIONES_ESTADO_CONTENIDO,
  OPCIONES_TIPO,
  armarBajas,
  armarCalendario,
  armarEnvio,
  armarHistorial,
  csvDeLaDifusion,
  datosDePublicacion,
  mesDe,
  mesVecino,
  type AccionNovedades,
  type Borrador,
  type DatosPublicacion,
  type DesenlaceNovedades,
  type DiaDelCalendario,
} from "./novedades-core";
import type { PropsDeSolapa } from "./solapas-club";
import type { PropsDelStudio } from "./studio-de-redes";
import { piezaDeLaDifusion, type PiezaDelStudio } from "./studio-core";
import { porFirma, useOperador, useSeleccion } from "./usar-almacen";
import { TextoWhatsApp } from "./WhatsAppDelClub";

type Hacer = (a: AccionNovedades) => DesenlaceNovedades;

const tarjeta = "flex min-w-0 flex-col gap-3 rounded-lg border border-line bg-surface-raised p-4";
const etiqueta = "text-sm font-medium text-strong";
const titulo2 = "text-lg font-semibold text-strong";
const mismo = <T,>(_previa: T | undefined, nueva: T) => nueva;

function useHacer(almacen: Almacen): Hacer {
  return useCallback((a: AccionNovedades) => almacen.comando("novedades", [a], { deshacible: DESHACIBLES_NOVEDADES.has(a.tipo) }), [almacen]);
}

// ───────────── armar la novedad ─────────────

type AbrirStudio = (pieza: PiezaDelStudio | null) => void;

// ───────────── el Studio de redes (baja recién cuando se abre) ─────────────

let moduloDelStudio: Promise<{ default: ComponentType<PropsDelStudio> }> | null = null;
const cargarStudio = () => (moduloDelStudio ??= import("./studio-de-redes").catch((e) => ((moduloDelStudio = null), Promise.reject(e))));

/** El Studio abierto (o nada) y cómo abrirlo. Guardar agenda la publicación con el motor, como «+ Publicación». */
function useStudio(almacen: Almacen, hacer: Hacer): { abrir: AbrirStudio; abriendo: boolean; studio: React.ReactNode } {
  const [abierto, setAbierto] = useState<{ Studio: ComponentType<PropsDelStudio>; pieza: PiezaDelStudio | null } | null>(null);
  const [abriendo, setAbriendo] = useState(false);
  const abrir = useCallback<AbrirStudio>(
    (pieza) => {
      setAbriendo(true);
      cargarStudio()
        .then((m) => setAbierto({ Studio: m.default, pieza }))
        .catch(() => almacen.informar({ ok: false, mensaje: "No se pudo abrir el Studio. Revisá la conexión y probá de nuevo." }))
        .finally(() => setAbriendo(false));
    },
    [almacen],
  );
  const studio = abierto && (
    <abierto.Studio
      pieza={abierto.pieza}
      hoy={almacen.ahora().fecha}
      onGuardar={(datos) => hacer({ tipo: "guardarPublicacion", id: null, datos })}
      onCerrar={() => setAbierto(null)}
    />
  );
  return { abrir, abriendo, studio };
}

function ArmarNovedad({ almacen, hacer, onPreparada, onStudio, abriendo }: { almacen: Almacen; hacer: Hacer; onPreparada: (id: string) => void; onStudio: AbrirStudio; abriendo: boolean }) {
  const [b, setB] = useState<Borrador>(BORRADOR_VACIO);
  const id = useId();
  // Sólo la audiencia cambia a cuántos les llega: tipear el título no recorre los turnos.
  const contar = useCallback((e: EstadoClub, a: Ahora) => destinatarios(e, b.audiencia, a).length, [b.audiencia]);
  const cuantos = useSeleccion(almacen, contar, mismo);
  const poner = (campo: keyof Borrador) => (ev: { target: { value: string } }) => setB((x) => ({ ...x, [campo]: ev.target.value }));
  const previa = mensajeDifusion({ titulo: b.titulo.trim() || "Título de la novedad", texto: b.texto.trim() }, "Juan");
  return (
    <section aria-labelledby={`${id}-t`} className={tarjeta}>
      <h2 data-pantalla id={`${id}-t`} className={titulo2}>
        Novedades del club · difusión por WhatsApp
      </h2>
      <form
        className="flex flex-col gap-3"
        onSubmit={(ev) => {
          ev.preventDefault();
          const r = hacer({ tipo: "preparar", borrador: b });
          if (r.ok && r.difusionId) {
            setB(BORRADOR_VACIO);
            onPreparada(r.difusionId);
          }
        }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor={`${id}-tipo`} className={etiqueta}>
              Tipo
            </label>
            <Select id={`${id}-tipo`} value={b.tipo} onChange={poner("tipo")}>
              {OPCIONES_TIPO.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.etiqueta}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor={`${id}-aud`} className={etiqueta}>
              A quiénes
            </label>
            <Select id={`${id}-aud`} value={b.audiencia} onChange={poner("audiencia")}>
              {OPCIONES_AUDIENCIA.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.etiqueta}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex min-w-0 flex-col gap-1 sm:col-span-2">
            <label htmlFor={`${id}-titulo`} className={etiqueta}>
              Título
            </label>
            <Input id={`${id}-titulo`} autoComplete="off" maxLength={LARGO_TITULO} placeholder="Ej.: Torneo de categorías el sábado 25" value={b.titulo} onChange={poner("titulo")} />
          </div>
          <div className="flex min-w-0 flex-col gap-1 sm:col-span-2">
            <label htmlFor={`${id}-texto`} className={etiqueta}>
              Texto
            </label>
            <Textarea id={`${id}-texto`} rows={4} maxLength={LARGO_TEXTO} placeholder="Qué, cuándo, cuánto sale y cómo anotarse." value={b.texto} onChange={poner("texto")} />
          </div>
        </div>
        <p className="text-sm text-body" aria-live="polite">
          {cuantos > 0 ? (
            <>
              Le llega a <strong className="text-strong">{cuantos === 1 ? "1 cliente" : `${cuantos} clientes`}</strong> con celular que no pidieron la baja. Así se ve:
            </>
          ) : (
            "No le llega a nadie: no hay clientes con celular (y sin la baja) en ese grupo. Elegí otro."
          )}
        </p>
        <TextoWhatsApp texto={previa} etiqueta="Así le llega (con su nombre)" />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="solid" size="md" disabled={cuantos === 0} className="max-sm:w-full">
            Preparar el envío
          </Button>
          <Button type="button" variant="outline" size="md" aria-busy={abriendo || undefined} onClick={() => onStudio(piezaDeLaDifusion(b))} className="max-sm:w-full">
            {abriendo ? "Abriendo el Studio…" : "Hacer la imagen en el Studio"}
          </Button>
        </div>
      </form>
    </section>
  );
}

// ───────────── el envío ─────────────

function descargar(nombre: string, texto: string) {
  const url = URL.createObjectURL(new Blob([texto], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: nombre });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function EnvioDeLaNovedad({ almacen, difusionId, hacer, onListo }: { almacen: Almacen; difusionId: string; hacer: Hacer; onListo: () => void }) {
  const modo = almacen.modo();
  const seleccionar = useCallback((e: EstadoClub) => armarEnvio(e, difusionId, modo), [difusionId, modo]);
  const v = useSeleccion(almacen, seleccionar, porFirma);
  const id = useId();
  const titulo = useRef<HTMLHeadingElement>(null);
  useEffect(() => titulo.current?.focus(), [difusionId]);
  if (!v) return null;
  const copiar = () => {
    const ok = () => almacen.informar({ ok: true, mensaje: "Mensaje copiado: pegalo en la lista de difusión." });
    const mal = () => almacen.informar({ ok: false, mensaje: "No se pudo copiar: seleccionalo a mano del recuadro." });
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(v.mensaje).then(ok, mal);
    else mal();
  };
  const csv = () => {
    const c = csvDeLaDifusion(almacen.estado(), v.id, almacen.ahora().fecha);
    if (!c) return;
    descargar(c.archivo, c.texto);
    almacen.informar({ ok: true, mensaje: c.cuantos === 1 ? "1 contacto descargado." : `${c.cuantos} contactos descargados.` });
  };
  return (
    <section aria-labelledby={`${id}-t`} className={cn(tarjeta, "border-accent")}>
      <h2 id={`${id}-t`} ref={titulo} tabIndex={-1} className={cn(titulo2, "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus")}>
        Mandar «{v.titulo}» · {v.enviados} de {v.total}
      </h2>
      <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-body">
        <li>
          <strong className="text-strong">Lista de difusión</strong> (WhatsApp Business → Nueva difusión): descargá los contactos, agendalos y pegá el
          mensaje. Les llega sólo a quienes tienen agendado el número del club.
        </li>
        <li>
          <strong className="text-strong">Uno por uno</strong>: tocá cada nombre; abre WhatsApp con el mensaje listo y queda tildado.
        </li>
      </ol>
      <TextoWhatsApp texto={v.mensaje} etiqueta="El mensaje para la lista de difusión" />
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="md" onClick={copiar} className="max-sm:w-full">
          Copiar el mensaje
        </Button>
        <Button variant="outline" size="md" onClick={csv} className="max-sm:w-full">
          Descargar contactos (CSV)
        </Button>
        <Button variant="ghost" size="md" onClick={onListo} className="max-sm:w-full">
          Listo
        </Button>
      </div>
      <h3 className="font-semibold text-strong">Uno por uno</h3>
      {v.nota && (
        <p id={`${id}-nota`} className="text-xs text-muted">
          {v.nota}
        </p>
      )}
      <ul aria-label="Uno por uno" className="flex flex-wrap gap-2">
        {v.contactos.map((c) => (
          <li key={c.clienteId} className="max-sm:w-full">
            {c.enlace ? (
              <ButtonLink
                href={c.enlace.href}
                target="_blank"
                rel="noopener noreferrer"
                variant={c.hecho ? "outline" : "solid"}
                size="md"
                aria-label={c.hecho ? `${c.nombre}: ya le mandaste` : `Mandarle a ${c.nombre}`}
                aria-describedby={v.nota ? `${id}-nota` : undefined}
                className="max-sm:w-full"
                onClick={() => hacer({ tipo: "enviado", difusionId: v.id, clienteId: c.clienteId })}
              >
                {c.hecho ? `✔ ${c.nombre}` : c.nombre}
              </ButtonLink>
            ) : (
              <span className="inline-flex min-h-11 items-center rounded-md border border-dashed border-line-strong px-3 text-sm text-body">
                {c.nombre} · pidió la baja
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ───────────── el historial ─────────────

const seleccionarHistorial = (e: EstadoClub) => armarHistorial(e);

function HistorialDeNovedades({ almacen, abierta, onSeguir }: { almacen: Almacen; abierta: string | null; onSeguir: (id: string) => void }) {
  const h = useSeleccion(almacen, seleccionarHistorial, porFirma);
  const id = useId();
  return (
    <section aria-labelledby={`${id}-t`} className={tarjeta}>
      <h2 id={`${id}-t`} className={titulo2}>
        Lo que se mandó
      </h2>
      {h.filas.length === 0 ? (
        <p className="text-sm text-body">Todavía no se armó ninguna novedad.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {h.filas.map((f) => (
            <li key={f.id} className="flex flex-col gap-2 rounded-md border border-line p-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="min-w-0 text-sm">
                <span className="block font-semibold text-strong">«{f.titulo}»</span>
                <span className="block text-body">
                  {f.tipo} · {f.audiencia} · {f.cuando} · {f.autor}
                </span>
                <span className="block text-body tabular-nums">
                  {f.enviados} de {f.total} enviados{f.enviados >= f.total ? " ✔" : ""}
                </span>
              </span>
              {f.id !== abierta && f.enviados < f.total && (
                <Button variant="outline" size="md" onClick={() => onSeguir(f.id)} aria-label={`Seguir mandando «${f.titulo}»`} className="max-sm:w-full">
                  Seguir mandando
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ───────────── las bajas ─────────────

function BajasDeNovedades({ almacen, hacer }: { almacen: Almacen; hacer: Hacer }) {
  const [busca, setBusca] = useState("");
  const seleccionar = useCallback((e: EstadoClub) => armarBajas(e, busca), [busca]);
  const v = useSeleccion(almacen, seleccionar, porFirma);
  const id = useId();
  return (
    <section aria-labelledby={`${id}-t`} className={tarjeta}>
      <h2 id={`${id}-t`} className={titulo2}>
        ¿Alguien respondió BAJA?
      </h2>
      <p className="text-sm text-body">Cada mensaje termina con «respondé BAJA». Al que la pide, dale de baja acá: no le llega más ninguna novedad.</p>
      <div className="flex max-w-sm flex-col gap-1">
        <label htmlFor={`${id}-b`} className={etiqueta}>
          Buscar al cliente (nombre o teléfono)
        </label>
        <Input id={`${id}-b`} type="search" autoComplete="off" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>
      {busca.trim() !== "" &&
        (v.candidatos.length === 0 ? (
          <p className="text-sm text-body">No hay nadie con eso que esté recibiendo novedades.</p>
        ) : (
          <ul aria-label="Reciben novedades" className="flex flex-col gap-2">
            {v.candidatos.map((c) => (
              <li key={c.id} className="flex flex-col gap-2 rounded-md border border-line p-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-sm text-strong">
                  {c.nombre} <span className="text-body tabular-nums">{c.tel}</span>
                </span>
                <Button variant="outline" size="md" onClick={() => hacer({ tipo: "baja", clienteId: c.id, volver: false })} aria-label={`Darle de baja a ${c.nombre}`} className="max-sm:w-full">
                  Darle de baja
                </Button>
              </li>
            ))}
          </ul>
        ))}
      <h3 className="font-semibold text-strong">No reciben novedades ({v.deBaja.length})</h3>
      {v.deBaja.length === 0 ? (
        <p className="text-sm text-body">Nadie pidió la baja.</p>
      ) : (
        <ul aria-label="No reciben novedades" className="flex flex-col gap-2">
          {v.deBaja.map((c) => (
            <li key={c.id} className="flex flex-col gap-2 rounded-md border border-line p-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm text-strong">{c.nombre}</span>
              <Button variant="ghost" size="md" onClick={() => hacer({ tipo: "baja", clienteId: c.id, volver: true })} aria-label={`Volver a mandarle novedades a ${c.nombre}`} className="max-sm:w-full">
                Volver a mandarle
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ───────────── el calendario de redes ─────────────

const FONDO_ESTADO = { idea: "bg-surface-sunken", programado: "bg-info-soft", publicado: "bg-success-soft" } as const;
const DIAS_SEMANA = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
type Editor = { id: string | null; fecha: Fecha; desde: string | null } | null;

/** `vista`: la agenda del celular y el calendario se pintan los dos (uno oculto por CSS): cada uno con sus propios ids. */
function Publicaciones({ dia, vista, onAbrir }: { dia: DiaDelCalendario; vista: "lista" | "mes"; onAbrir: (id: string, desde: string) => void }) {
  return (
    <>
      {dia.publicaciones.map((p) => (
        <button
          key={p.id}
          type="button"
          id={`pub-${vista}-${p.id}`}
          aria-label={p.descripcion}
          onClick={() => onAbrir(p.id, `pub-${vista}-${p.id}`)}
          className={cn(
            "flex min-h-11 w-full min-w-11 items-center gap-1 rounded-md border border-line px-2 text-left text-xs text-strong",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
            FONDO_ESTADO[p.estado],
          )}
        >
          <span aria-hidden>{MARCA_ESTADO[p.estado]}</span>
          <span className="tabular-nums">{p.hora}</span>
          <span className="truncate">{p.titulo}</span>
        </button>
      ))}
    </>
  );
}

function EditorDePublicacion({ almacen, editor, hacer, onCerrar }: { almacen: Almacen; editor: NonNullable<Editor>; hacer: Hacer; onCerrar: () => void }) {
  const [d, setD] = useState<DatosPublicacion>(() => datosDePublicacion(almacen.estado(), editor.id, editor.fecha));
  const id = useId();
  // Al abrir, el foco va a «De qué se trata» (Input no reenvía `ref`: se busca por su id).
  useEffect(() => document.getElementById(`${id}-titulo`)?.focus(), [id]);
  const poner = (campo: keyof DatosPublicacion) => (ev: { target: { value: string } }) => setD((x) => ({ ...x, [campo]: ev.target.value }));
  const campo = (clave: keyof DatosPublicacion, texto: string, control: React.ReactNode) => (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={`${id}-${clave}`} className={etiqueta}>
        {texto}
      </label>
      {control}
    </div>
  );
  return (
    <section
      aria-labelledby={`${id}-t`}
      className={cn(tarjeta, "border-accent")}
      onKeyDown={(ev) => {
        if (ev.key === "Escape") {
          ev.stopPropagation();
          onCerrar();
        }
      }}
    >
      <h3 id={`${id}-t`} className="font-semibold text-strong">
        {editor.id ? "Publicación" : "Nueva publicación"}
      </h3>
      <form
        className="flex flex-col gap-3"
        onSubmit={(ev) => {
          ev.preventDefault();
          if (hacer({ tipo: "guardarPublicacion", id: editor.id, datos: d }).ok) onCerrar();
        }}
      >
        {campo("titulo", "De qué se trata", <Input id={`${id}-titulo`} autoComplete="off" maxLength={120} placeholder="Ej.: Torneo relámpago del sábado" value={d.titulo} onChange={poner("titulo")} />)}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {campo("fecha", "Fecha", <Input id={`${id}-fecha`} type="date" value={d.fecha} onChange={poner("fecha")} />)}
          {campo("hora", "Hora", <Input id={`${id}-hora`} type="time" value={d.hora} onChange={poner("hora")} />)}
          {campo(
            "canal",
            "Canal",
            <Select id={`${id}-canal`} value={d.canal} onChange={poner("canal")}>
              {OPCIONES_CANAL.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.etiqueta}
                </option>
              ))}
            </Select>,
          )}
          {campo(
            "estado",
            "Estado",
            <Select id={`${id}-estado`} value={d.estado} onChange={poner("estado")}>
              {OPCIONES_ESTADO_CONTENIDO.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.etiqueta}
                </option>
              ))}
            </Select>,
          )}
        </div>
        {campo("texto", "Texto o guion", <Textarea id={`${id}-texto`} rows={4} maxLength={2000} value={d.texto} onChange={poner("texto")} />)}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="solid" size="md" className="max-sm:w-full">
            Guardar
          </Button>
          <Button type="button" variant="outline" size="md" onClick={onCerrar} className="max-sm:w-full">
            Cancelar
          </Button>
          {editor.id && (
            <Button
              type="button"
              variant="danger"
              size="md"
              className="max-sm:w-full"
              onClick={() => {
                if (hacer({ tipo: "borrarPublicacion", id: editor.id! }).ok) onCerrar();
              }}
            >
              Borrar
            </Button>
          )}
        </div>
      </form>
    </section>
  );
}

function CalendarioDeRedes({ almacen, hacer, onStudio, abriendo }: { almacen: Almacen; hacer: Hacer; onStudio: AbrirStudio; abriendo: boolean }) {
  const hoy = almacen.ahora().fecha;
  const [mes, setMes] = useState(() => mesDe(hoy));
  const [editor, setEditor] = useState<Editor>(null);
  const seleccionar = useCallback((e: EstadoClub, a: Ahora) => armarCalendario(e, mes, a.fecha), [mes]);
  const c = useSeleccion(almacen, seleccionar, porFirma);
  const id = useId();
  const abrir = (pubId: string | null, fecha: Fecha, desde: string) => setEditor({ id: pubId, fecha, desde });
  const cerrar = () => {
    const volver = editor?.desde;
    setEditor(null);
    requestAnimationFrame(() => (volver ? document.getElementById(volver) : null)?.focus());
  };
  const conPublicaciones = c.dias.filter((d) => d.publicaciones.length);
  return (
    <section aria-labelledby={`${id}-t`} className={tarjeta}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${id}-t`} className={titulo2}>
          Contenido · {c.titulo}
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="md" onClick={() => setMes((m) => mesVecino(m, -1))} aria-label="Mes anterior">
            ‹
          </Button>
          <Button variant="outline" size="md" onClick={() => setMes(mesDe(hoy))}>
            Hoy
          </Button>
          <Button variant="outline" size="md" onClick={() => setMes((m) => mesVecino(m, 1))} aria-label="Mes siguiente">
            ›
          </Button>
          <Button id={`${id}-nueva`} variant="solid" size="md" onClick={() => abrir(null, mes === mesDe(hoy) ? hoy : `${mes}-01`, `${id}-nueva`)}>
            + Publicación
          </Button>
        </div>
      </div>
      <p className="text-sm text-body">Calendario de redes y WhatsApp del club. {c.resumen}</p>
      {editor && <EditorDePublicacion key={`${editor.id ?? "nueva"}-${editor.fecha}`} almacen={almacen} editor={editor} hacer={hacer} onCerrar={cerrar} />}

      {/* En el celular, la agenda del mes (sólo los días con algo); de la tablet para arriba, el calendario. */}
      <div className="sm:hidden">
        {conPublicaciones.length === 0 ? (
          <p className="text-sm text-body">No hay publicaciones este mes.</p>
        ) : (
          <ul aria-label={`Publicaciones de ${c.titulo}`} className="flex flex-col gap-3">
            {conPublicaciones.map((d) => (
              <li key={d.fecha} className="flex flex-col gap-1">
                <span className={cn("text-sm font-semibold", d.hoy ? "text-accent-ink" : "text-strong")}>
                  {d.numero}/{Number(mes.slice(5))}
                  {d.hoy ? " · hoy" : ""}
                </span>
                <Publicaciones dia={d} vista="lista" onAbrir={(pid, desde) => abrir(pid, d.fecha, desde)} />
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="hidden sm:block">
        <div aria-hidden className="grid grid-cols-7 gap-1 pb-1 text-center text-xs font-medium text-muted">
          {DIAS_SEMANA.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <ol aria-label={`Días de ${c.titulo}`} className="grid grid-cols-7 gap-1">
          {Array.from({ length: c.vacias }, (_, i) => (
            <li key={`v${i}`} aria-hidden className="min-h-24" />
          ))}
          {c.dias.map((d) => (
            <li key={d.fecha} className={cn("flex min-h-24 min-w-0 flex-col gap-1 rounded-md border p-1", d.hoy ? "border-accent" : "border-line")} aria-current={d.hoy ? "date" : undefined}>
              <span className="flex items-center justify-between gap-1">
                <span className={cn("pl-1 text-sm tabular-nums", d.hoy ? "font-semibold text-strong" : "text-body")}>{d.numero}</span>
                <button
                  type="button"
                  id={`${id}-mas-${d.numero}`}
                  aria-label={`Agendar una publicación el ${d.numero}/${Number(mes.slice(5))}`}
                  onClick={() => abrir(null, d.fecha, `${id}-mas-${d.numero}`)}
                  className="inline-flex size-11 items-center justify-center rounded-md text-lg text-body hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  +
                </button>
              </span>
              <Publicaciones dia={d} vista="mes" onAbrir={(pid, desde) => abrir(pid, d.fecha, desde)} />
            </li>
          ))}
        </ol>
      </div>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-body">
        {OPCIONES_ESTADO_CONTENIDO.map((o) => (
          <span key={o.valor} className="inline-flex items-center gap-1">
            <span aria-hidden className={cn("inline-flex size-5 items-center justify-center rounded border border-line", FONDO_ESTADO[o.valor])}>
              {MARCA_ESTADO[o.valor]}
            </span>
            {o.etiqueta}
          </span>
        ))}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="md" aria-busy={abriendo || undefined} onClick={() => onStudio(null)} className="max-sm:w-full">
          {abriendo ? "Abriendo el Studio…" : "Abrir el Studio de redes (imágenes y textos)"}
        </Button>
      </div>
    </section>
  );
}

// ───────────── la solapa ─────────────

export default function NovedadesDelClub({ almacen }: PropsDeSolapa) {
  useOperador(almacen); // repinta si cambia quién opera (PIN)
  const hacer = useHacer(almacen);
  const [abierta, setAbierta] = useState<string | null>(null);
  const { abrir, abriendo, studio } = useStudio(almacen, hacer);
  return (
    <div className="flex flex-col gap-4">
      <ArmarNovedad almacen={almacen} hacer={hacer} onPreparada={setAbierta} onStudio={abrir} abriendo={abriendo} />
      {abierta && <EnvioDeLaNovedad key={abierta} almacen={almacen} difusionId={abierta} hacer={hacer} onListo={() => setAbierta(null)} />}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <HistorialDeNovedades almacen={almacen} abierta={abierta} onSeguir={setAbierta} />
        <BajasDeNovedades almacen={almacen} hacer={hacer} />
      </div>
      <CalendarioDeRedes almacen={almacen} hacer={hacer} onStudio={abrir} abriendo={abriendo} />
      {studio}
    </div>
  );
}
