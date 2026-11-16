"use client";

// La pantalla del torneo (GSG-PLAT-016). Muestra una categoría por vez y, según el permiso del usuario, los botones
// de carga (agente y organizador) y de gestión (organizador). Ocultar botones es comodidad: la seguridad la hace
// cada acción del servidor. Cada 15 s, con la pestaña visible, pregunta la versión; si avanzó, vuelve a leer.

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Badge, Button, EmptyState, Input, Select } from "@/components/ui";
import type { PartidoEnVista } from "@/lib/torneo-wpe/vista";
import { cambiarTorneo, generarTorneo, leerTorneo, leerVersionDelTorneo, type RespuestaLeerTorneo, type RespuestaMutar } from "./actions";

type Leido = Extract<RespuestaLeerTorneo, { ok: true }>;
type Filtro = "pendientes" | "jugados" | "todos";
type Aviso = { tono: "ok" | "error"; texto: string } | null;

const LATIDO_MS = 15_000;

const NIVEL: Record<Leido["nivel"], string> = {
  ver: "Modo jugador: mirás el torneo",
  resultados: "Podés cargar resultados y W.O.",
  gestionar: "Organizador: cargás, corregís y reprogramás",
};

export default function TorneoEnCurso({ inicial }: { inicial: RespuestaLeerTorneo }) {
  const [estado, setEstado] = useState<RespuestaLeerTorneo>(inicial);
  const [filtro, setFiltro] = useState<Filtro>("pendientes");
  const [abierto, setAbierto] = useState<{ id: string; modo: "resultado" | "reprogramar" } | null>(null);
  const [aBorrar, setABorrar] = useState<string | null>(null);
  const [aviso, setAviso] = useState<Aviso>(null);
  const [pendiente, empezar] = useTransition();
  const categoria = estado.ok ? (estado.vista?.categoria ?? null) : null;
  const version = estado.ok ? estado.version : 0;
  const versionRef = useRef(version);
  versionRef.current = version;

  const recargar = useCallback(
    async (cat: string | null) => {
      const r = await leerTorneo(cat);
      setEstado(r);
    },
    [],
  );

  useEffect(() => {
    const id = window.setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      const v = await leerVersionDelTorneo();
      if (v.ok && v.version !== versionRef.current) await recargar(categoria);
    }, LATIDO_MS);
    return () => window.clearInterval(id);
  }, [categoria, recargar]);

  const despues = async (r: RespuestaMutar, okTexto: string) => {
    if (r.ok) {
      setAviso({ tono: "ok", texto: [okTexto, ...r.advertencias].join(" ") });
      setAbierto(null);
    } else {
      setAviso({ tono: "error", texto: r.error });
    }
    if (r.ok || r.motivo === "conflicto") await recargar(categoria);
  };

  const enviar = (comando: Record<string, unknown>, okTexto: string) =>
    empezar(async () => despues(await cambiarTorneo({ comando, version: versionRef.current }), okTexto));

  if (!estado.ok) return <EmptyState title="No se pudo abrir el torneo" description={estado.error} />;

  const { vista, nivel } = estado;
  const puedeCargar = nivel !== "ver";
  const gestiona = nivel === "gestionar";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={gestiona ? "accent" : puedeCargar ? "info" : "neutral"} data-testid="nivel-torneo">
          {NIVEL[nivel]}
        </Badge>
        <span className="text-sm text-muted" data-testid="version-torneo">
          Versión {version}
          {estado.actualizada ? ` · actualizado ${new Date(estado.actualizada).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}` : ""}
        </span>
      </div>

      {aviso ? (
        <p role={aviso.tono === "error" ? "alert" : "status"} data-testid="aviso-torneo" className={aviso.tono === "error" ? "rounded-md border border-danger bg-danger-soft p-3 text-sm" : "rounded-md border border-line bg-success-soft p-3 text-sm"}>
          {aviso.texto}
        </p>
      ) : null}

      {!vista ? (
        <EmptyState
          title="Todavía no hay torneo cargado"
          description={gestiona ? "Generá el torneo de demostración (600 parejas, 13 sedes, el mismo del sitio) para empezar." : "Cuando el organizador lo cargue, lo vas a ver acá."}
          action={
            gestiona ? (
              <Button disabled={pendiente} onClick={() => empezar(async () => despues(await generarTorneo(versionRef.current), "Torneo generado."))}>
                Generar el torneo de demostración
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm">
              Categoría
              <Select value={vista.categoria} onChange={(e) => empezar(() => recargar(e.target.value))} data-testid="categoria-torneo">
                {vista.categorias.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Mostrar
              <Select value={filtro} onChange={(e) => setFiltro(e.target.value as Filtro)}>
                <option value="pendientes">Por jugar</option>
                <option value="jugados">Jugados</option>
                <option value="todos">Todos</option>
              </Select>
            </label>
            <span className="text-sm text-muted">
              {vista.jugados} de {vista.total} partidos jugados en todo el torneo
            </span>
          </div>

          <ul className="flex flex-col gap-2" aria-label={`Partidos de ${vista.categoria}`}>
            {vista.partidos
              .filter((p) => (filtro === "todos" ? true : filtro === "jugados" ? p.resultado !== null : p.resultado === null))
              .map((p) => (
                <li key={p.id} data-testid={`partido-${p.codigo}`} className="rounded-lg border border-line p-3">
                  <FilaPartido p={p} />
                  {(puedeCargar || gestiona) && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {puedeCargar && p.definido && p.resultado === null ? (
                        <Button size="sm" variant="outline" onClick={() => setAbierto({ id: p.id, modo: "resultado" })}>
                          Cargar resultado
                        </Button>
                      ) : null}
                      {gestiona && p.resultado !== null && aBorrar !== p.id ? (
                        <Button size="sm" variant="outline" disabled={pendiente} onClick={() => setABorrar(p.id)}>
                          Borrar resultado
                        </Button>
                      ) : null}
                      {gestiona && p.resultado !== null && aBorrar === p.id ? (
                        <div role="group" aria-label={`Confirmar el borrado de ${p.codigo}`} className="flex flex-wrap items-center gap-2">
                          <span className="text-sm">¿Borrar el resultado de {p.codigo}? Vuelve a quedar por jugar.</span>
                          <Button
                            size="sm"
                            variant="danger"
                            disabled={pendiente}
                            onClick={() => {
                              setABorrar(null);
                              enviar({ tipo: "borrar", partidoId: p.id }, `Resultado de ${p.codigo} borrado.`);
                            }}
                          >
                            Sí, borrar
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setABorrar(null)}>
                            No
                          </Button>
                        </div>
                      ) : null}
                      {gestiona && p.resultado === null && p.sede ? (
                        <Button size="sm" variant="ghost" onClick={() => setAbierto({ id: p.id, modo: "reprogramar" })}>
                          Reprogramar
                        </Button>
                      ) : null}
                    </div>
                  )}
                  {abierto?.id === p.id && abierto.modo === "resultado" ? (
                    <FormResultado p={p} pendiente={pendiente} onCancelar={() => setAbierto(null)} onEnviar={(c, t) => enviar(c, t)} />
                  ) : null}
                  {abierto?.id === p.id && abierto.modo === "reprogramar" ? (
                    <FormReprogramar p={p} sedes={vista.sedes} dias={vista.dias} pendiente={pendiente} onCancelar={() => setAbierto(null)} onEnviar={(c, t) => enviar(c, t)} />
                  ) : null}
                </li>
              ))}
          </ul>
        </>
      )}
    </div>
  );
}

function FilaPartido({ p }: { p: PartidoEnVista }) {
  const lugar = p.sede ? `${p.sede} · C${p.cancha} · ${p.dia} ${p.hora}` : "Sin programar";
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span className="font-semibold">{p.codigo}</span>
        <span>{p.grupo}</span>
        <span>{lugar}</span>
      </div>
      <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 text-sm">
        <span className={p.ganador === "A" ? "font-semibold" : undefined}>{p.parejaA}</span>
        <span className="row-span-2 font-mono text-base" data-testid={`resultado-${p.codigo}`}>
          {p.resultado ?? "—"}
        </span>
        <span className={p.ganador === "B" ? "font-semibold" : undefined}>{p.parejaB}</span>
      </div>
    </div>
  );
}

type Enviar = (comando: Record<string, unknown>, okTexto: string) => void;

function FormResultado({ p, pendiente, onCancelar, onEnviar }: { p: PartidoEnVista; pendiente: boolean; onCancelar: () => void; onEnviar: Enviar }) {
  const [games, setGames] = useState<string[]>(["", "", "", "", "", ""]);
  const set = (i: number, v: string) => setGames((g) => g.map((x, j) => (j === i ? v.replace(/\D/g, "").slice(0, 1) : x)));
  const sets = [0, 1, 2]
    .map((s) => [games[s * 2], games[s * 2 + 1]])
    .filter(([a, b]) => a !== "" || b !== "")
    .map(([a, b]) => [Number(a || 0), Number(b || 0)]);
  return (
    <form
      className="mt-3 flex flex-col gap-3 rounded-md bg-surface-sunken p-2"
      onSubmit={(e) => {
        e.preventDefault();
        onEnviar({ tipo: "resultado", partidoId: p.id, sets }, `Resultado de ${p.codigo} cargado.`);
      }}
    >
      <fieldset className="flex flex-wrap items-end gap-3">
        <legend className="mb-1 text-sm">Juegos por set (pareja de arriba / pareja de abajo)</legend>
        {[0, 1, 2].map((s) => (
          <div key={s} className="flex items-center gap-1">
            <Input aria-label={`Set ${s + 1}, pareja de arriba`} inputMode="numeric" className="w-12 text-center" value={games[s * 2]} onChange={(e) => set(s * 2, e.target.value)} />
            <span aria-hidden>/</span>
            <Input aria-label={`Set ${s + 1}, pareja de abajo`} inputMode="numeric" className="w-12 text-center" value={games[s * 2 + 1]} onChange={(e) => set(s * 2 + 1, e.target.value)} />
          </div>
        ))}
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={pendiente || sets.length < 2}>
          Guardar resultado
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={pendiente} onClick={() => onEnviar({ tipo: "wo", partidoId: p.id, perdedor: "A" }, `W.O. cargado en ${p.codigo}.`)}>
          W.O.: no vino la de arriba
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={pendiente} onClick={() => onEnviar({ tipo: "wo", partidoId: p.id, perdedor: "B" }, `W.O. cargado en ${p.codigo}.`)}>
          W.O.: no vino la de abajo
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancelar}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function FormReprogramar({
  p,
  sedes,
  dias,
  pendiente,
  onCancelar,
  onEnviar,
}: {
  p: PartidoEnVista;
  sedes: { id: string; nombre: string; canchas: number }[];
  dias: string[];
  pendiente: boolean;
  onCancelar: () => void;
  onEnviar: Enviar;
}) {
  const [sede, setSede] = useState(sedes.find((s) => s.nombre === p.sede)?.id ?? sedes[0]?.id ?? "");
  const [cancha, setCancha] = useState(String(p.cancha ?? 1));
  const [dia, setDia] = useState(p.dia ?? dias[0] ?? "");
  const [hora, setHora] = useState(p.hora ?? "08:00");
  const canchas = sedes.find((s) => s.id === sede)?.canchas ?? 1;
  return (
    <form
      className="mt-3 flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        onEnviar({ tipo: "reprogramar", partidoId: p.id, destino: { sede, cancha: Number(cancha), dia, hora } }, `${p.codigo} reprogramado.`);
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        Sede
        <Select value={sede} onChange={(e) => setSede(e.target.value)}>
          {sedes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </Select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Cancha
        <Select value={cancha} onChange={(e) => setCancha(e.target.value)}>
          {Array.from({ length: canchas }, (_, i) => String(i + 1)).map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Día
        <Select value={dia} onChange={(e) => setDia(e.target.value)}>
          {dias.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </Select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Hora
        <Input type="time" step={1800} value={hora} onChange={(e) => setHora(e.target.value)} className="w-28" />
      </label>
      <Button type="submit" size="sm" disabled={pendiente}>
        Reprogramar
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={onCancelar}>
        Cancelar
      </Button>
    </form>
  );
}
