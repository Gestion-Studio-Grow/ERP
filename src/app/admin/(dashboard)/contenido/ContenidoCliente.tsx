"use client";

// La pantalla de Contenido del lado del navegador: aviso del día, creador, agenda y la publicación abierta.
// Guarda en la base con las server actions; si la tabla no está (Gate 2), en este equipo (almacén local por negocio).
import { useEffect, useMemo, useState } from "react";
import {
  CANALES,
  ESTADOS,
  crearAlmacenLocal,
  plantillaPorId,
  recordatoriosDelDia,
  type Canal,
  type EstadoPublicacion,
  type MarcaDeLaPlaca,
  type Publicacion,
} from "@/lib/contenido";
import { Button, Field, Hoja, Input, Select, buttonClasses } from "@/components/ui";
import { borrarDeAgenda, cambiarEstadoEnAgenda, guardarEnAgenda } from "./acciones";
import type { RespuestaContenido } from "./acciones-core";
import { Creador } from "./Creador";
import { Calendario } from "./Calendario";
import { PlacaCanvas } from "./PlacaCanvas";
import { Copiar } from "./Copiar";
import { compartirPorWhatsApp } from "./fechas";

type Inicial = { modo: "base"; publicaciones: Publicacion[] } | { modo: "demo" };

const idNuevo = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);
const fechaCorta = (f: string) => f.split("-").reverse().slice(0, 2).join("/");

export function ContenidoCliente({ marca, hoy, slug, inicial }: { marca: MarcaDeLaPlaca; hoy: string; slug: string; inicial: Inicial }) {
  const [modo, setModo] = useState<"base" | "demo">(inicial.modo);
  const [pubs, setPubs] = useState<Publicacion[]>(inicial.modo === "base" ? inicial.publicaciones : []);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const local = useMemo(() => (typeof window === "undefined" ? null : crearAlmacenLocal(window.localStorage, slug)), [slug]);
  useEffect(() => {
    // localStorage sólo existe en el navegador: se lee después de montar (en el server no hay), como useBolsaGuardada.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (modo === "demo" && local) setPubs(local.listar());
  }, [modo, local]);

  /** Aplica la respuesta del servidor; si dice «demo» (no hay tabla), se pasa al almacén local y se reintenta ahí. */
  const aplicar = (r: RespuestaContenido, enDemo: () => Publicacion[] | undefined): string | null => {
    if (!r.ok) return r.error;
    if (r.modo === "base") {
      setPubs(r.publicaciones);
      return null;
    }
    setModo("demo");
    const lista = enDemo();
    if (lista) setPubs(lista);
    return null;
  };

  const ejecutar = async (enBase: () => Promise<RespuestaContenido>, enDemo: () => Publicacion[] | undefined): Promise<string | null> => {
    setError(null);
    try {
      if (modo === "demo") {
        const lista = enDemo();
        if (lista) setPubs(lista);
        return null;
      }
      return aplicar(await enBase(), enDemo);
    } catch (e) {
      return e instanceof Error && e.message ? e.message : "No se pudo guardar. Probá de nuevo.";
    }
  };

  const guardar = (pub: Publicacion) =>
    ejecutar(
      () => guardarEnAgenda(pub),
      () => local?.guardar({ ...pub, id: pub.id || idNuevo() }),
    );
  const cambiarEstado = async (id: string, estado: EstadoPublicacion) =>
    setError(await ejecutar(() => cambiarEstadoEnAgenda(id, estado), () => local?.cambiarEstado(id, estado)));
  const borrar = async (id: string) => {
    const err = await ejecutar(() => borrarDeAgenda(id), () => local?.borrar(id));
    setError(err);
    if (!err) setAbierta(null);
  };

  const deHoy = recordatoriosDelDia(pubs, hoy);
  const pub = pubs.find((p) => p.id === abierta) ?? null;

  return (
    <div className="grid gap-6">
      {modo === "demo" && (
        <p role="status" className="rounded-md border border-warning bg-warning-soft px-3 py-2 text-sm text-strong">
          ⚠ Modo demo: lo agendado queda en este equipo (en este navegador). Cuando GSG habilite la agenda en la base, se guarda para todo el equipo.
        </p>
      )}

      {deHoy.length > 0 && (
        <section aria-labelledby="para-hoy" className="rounded-lg border border-accent bg-accent-soft p-4">
          <h2 id="para-hoy" className="text-base font-semibold text-strong">
            ◷ Para publicar hoy ({deHoy.length})
          </h2>
          <ul className="mt-2 grid gap-2">
            {deHoy.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2 rounded-md bg-surface-raised p-2">
                <span className="min-w-0 flex-1 text-sm text-strong">
                  <strong>{p.hora}</strong> · {CANALES[p.canal]} · {p.titulo}
                </span>
                <Button type="button" size="sm" onClick={() => cambiarEstado(p.id, "publicado")}>
                  ✔ Marcar publicada
                </Button>
                <a
                  href={compartirPorWhatsApp(p.caption.whatsapp || p.caption.instagram)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonClasses("outline", "sm")}
                >
                  Abrir WhatsApp
                </a>
                <Button type="button" variant="ghost" size="sm" onClick={() => setAbierta(p.id)}>
                  Ver
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <Creador marca={marca} hoy={hoy} onAgendar={guardar} />
      <Calendario publicaciones={pubs} hoy={hoy} onAbrir={setAbierta} />

      {pub && (
        <Hoja abierta onCerrar={() => setAbierta(null)} titulo={pub.titulo}>
          <Detalle key={pub.id} pub={pub} marca={marca} onGuardar={guardar} onEstado={cambiarEstado} onBorrar={borrar} />
        </Hoja>
      )}
    </div>
  );
}

function Detalle({
  pub,
  marca,
  onGuardar,
  onEstado,
  onBorrar,
}: {
  pub: Publicacion;
  marca: MarcaDeLaPlaca;
  onGuardar: (p: Publicacion) => Promise<string | null>;
  onEstado: (id: string, e: EstadoPublicacion) => void;
  onBorrar: (id: string) => void;
}) {
  const [fecha, setFecha] = useState(pub.fecha);
  const [hora, setHora] = useState(pub.hora);
  const [canal, setCanal] = useState<Canal>(pub.canal);
  const [msg, setMsg] = useState("");
  const variante = plantillaPorId(pub.plantilla)?.variante ?? "bloque";

  return (
    <div className="grid gap-4">
      <p className="text-sm text-body">
        {ESTADOS[pub.estado].simbolo} {ESTADOS[pub.estado].etiqueta} · {fechaCorta(pub.fecha)} {pub.hora} · {CANALES[pub.canal]}
      </p>
      <div className="mx-auto w-full max-w-60">
        <PlacaCanvas pieza={{ variante, formato: pub.formato, campos: pub.campos }} marca={marca} etiqueta={`Placa: ${pub.campos.titulo}`} />
      </div>
      <div className="grid gap-1">
        <p className="text-sm font-semibold text-strong">Instagram</p>
        <p className="whitespace-pre-wrap text-sm text-body">{pub.caption.instagram}</p>
        <Copiar texto={pub.caption.instagram} que="texto de Instagram" />
      </div>
      <div className="grid gap-1">
        <p className="text-sm font-semibold text-strong">WhatsApp</p>
        <p className="whitespace-pre-wrap text-sm text-body">{pub.caption.whatsapp}</p>
        <Copiar texto={pub.caption.whatsapp} que="texto de WhatsApp" />
      </div>

      <fieldset className="grid gap-3 rounded-md border border-line p-3 sm:grid-cols-3">
        <legend className="px-1 text-sm font-semibold text-strong">Cambiar el día</legend>
        <Field label="Día" htmlFor="det-fecha">
          <Input id="det-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </Field>
        <Field label="Hora" htmlFor="det-hora">
          <Input id="det-hora" type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
        </Field>
        <Field label="Dónde" htmlFor="det-canal">
          <Select id="det-canal" value={canal} onChange={(e) => setCanal(e.target.value as Canal)}>
            {(Object.keys(CANALES) as Canal[]).map((c) => (
              <option key={c} value={c}>
                {CANALES[c]}
              </option>
            ))}
          </Select>
        </Field>
        <div className="sm:col-span-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={async () => setMsg((await onGuardar({ ...pub, fecha, hora, canal })) ?? "Guardado ✔")}
          >
            Guardar cambios
          </Button>
          <span aria-live="polite" className="ml-2 text-xs text-muted">
            {msg}
          </span>
        </div>
      </fieldset>

      <div className="flex flex-wrap gap-2">
        {(Object.keys(ESTADOS) as EstadoPublicacion[])
          .filter((e) => e !== pub.estado)
          .map((e) => (
            <Button key={e} type="button" variant={e === "publicado" ? "solid" : "outline"} size="sm" onClick={() => onEstado(pub.id, e)}>
              {ESTADOS[e].simbolo} Pasar a {ESTADOS[e].etiqueta.toLowerCase()}
            </Button>
          ))}
        <Button type="button" variant="danger" size="sm" className="ml-auto" onClick={() => onBorrar(pub.id)}>
          Borrar
        </Button>
      </div>
    </div>
  );
}
