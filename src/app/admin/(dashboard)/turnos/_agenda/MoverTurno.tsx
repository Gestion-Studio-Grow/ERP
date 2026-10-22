"use client";

// ============================================================================
// MOVER Y AVISAR — pasar un turno a otro día, hora o profesional, y avisarle a la clienta.
// ============================================================================
//
// Reemplaza a `RescheduleForm` (select de profesional + fecha + horario) en el cajón del turno:
//   · Cajón (`MoverTurno`): [Mover] → chips de profesional (las que hacen el servicio) · chips de
//     días con cuántos huecos tiene cada uno · los huecos · [Mover y avisar por WhatsApp] o
//     [Mover sin avisar]. En el celular, ⋯ → Abrir el turno → Mover: 4 toques.
//   · Arrastre en la grilla (`ConfirmarMover`): al soltar, «¿Mover a jue 24 16:30 con Caro?»
//     [Mover y avisar por WhatsApp] [Mover sin avisar] [No]: 2 toques.
//
// Las dos terminan en `rescheduleAppointment`, la reprogramación de siempre: el MISMO turno (nunca
// uno nuevo), con el choque re-validado en el servidor (`assertSlotAvailable`, transacción del
// negocio). Si el servidor dice que no, el motivo se lee en la pantalla (role="alert") y el turno
// queda donde estaba.
//
// «Avisar»: la ventana de WhatsApp se abre en el mismo toque (si se abriera después de esperar al
// servidor, el navegador la bloquea) y recién se completa con el mensaje cuando el servidor dijo
// que sí; si dijo que no, se cierra. Si el navegador igual la bloqueó, queda el enlace a mano.

import { useEffect, useRef, useState, useTransition } from "react";
import { rescheduleAppointment } from "@/lib/actions";
import { huecosParaMover, type ProfesionalParaMover } from "@/lib/turnos/mover-actions";
import { Button, Chip, Hoja } from "@/components/ui";
import { dateStrInBusinessTz, fmtTime } from "@/lib/datetime";
import { waLinkClienta } from "@/lib/whatsapp-cta";
import { useToast } from "../../ToastProvider";
import { esRedireccionDeNext } from "../errores";
import { fechaCorta, type TurnoDelDia } from "../agenda-core";
import { mensajeMover } from "@/lib/turnos/mensajes-whatsapp";
import { diasParaMover, preguntaDeMover, type Destino } from "./mover-core";

type ResultadoDeMover = { ok: true; avisoPendiente: string | null } | { ok: false; error: string };

/** Mueve el turno (y, si se pide, abre el WhatsApp con el aviso). Una sola acción, la de siempre. */
export function useMoverTurno() {
  const { showSuccess } = useToast();
  const [pendiente, empezar] = useTransition();

  const mover = (t: Pick<TurnoDelDia, "id" | "clienta" | "telefono" | "servicio" | "inicio">, d: Destino, avisar: boolean) =>
    new Promise<ResultadoDeMover>((listo) =>
      empezar(async () => {
        const wa = avisar
          ? waLinkClienta(t.telefono, mensajeMover({ clienta: t.clienta, servicios: t.servicio, inicio: d.inicio, profesional: d.profesional, inicioAnterior: t.inicio }))
          : null;
        // En el mismo toque, antes de esperar: si no, el navegador la toma por una ventana emergente.
        const ventana = wa ? window.open("", "_blank") : null;
        const fd = new FormData();
        fd.set("appointmentId", t.id);
        fd.set("startsAt", d.inicio);
        fd.set("professionalId", d.profesionalId);
        try {
          const r = await rescheduleAppointment(fd);
          if (!r.ok) {
            ventana?.close();
            listo({ ok: false, error: r.error });
            return;
          }
        } catch (err) {
          ventana?.close();
          if (esRedireccionDeNext(err)) throw err;
          listo({
            ok: false,
            error: "No volvió respuesta del servidor. Recargá la agenda y fijate si el turno ya quedó en el horario nuevo antes de volver a intentar.",
          });
          return;
        }
        if (ventana && wa) {
          ventana.opener = null;
          ventana.location.href = wa;
        }
        showSuccess(`Listo: ${t.clienta} quedó el ${fechaCorta(dateStrInBusinessTz(new Date(d.inicio)))} a las ${fmtTime(d.inicio)} con ${d.profesional}.`);
        listo({ ok: true, avisoPendiente: wa && !ventana ? wa : null });
      }),
    );

  return { mover, pendiente };
}

/** Las dos teclas de siempre: avisar (si tiene celular) o mover sin avisar. */
function TeclasDeMover({
  turno,
  destino,
  onListo,
  onNo,
}: {
  turno: TurnoDelDia;
  destino: Destino;
  onListo: (avisoPendiente: string | null) => void;
  onNo?: () => void;
}) {
  const { mover, pendiente } = useMoverTurno();
  const [error, setError] = useState("");
  const [avisando, setAvisando] = useState<boolean | null>(null);
  const tieneCelular = waLinkClienta(turno.telefono) !== null;
  const hacer = async (avisar: boolean) => {
    setError("");
    setAvisando(avisar);
    const r = await mover(turno, destino, avisar);
    setAvisando(null);
    if (!r.ok) setError(r.error);
    else onListo(r.avisoPendiente);
  };
  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="border-l-2 border-danger pl-3 text-sm text-danger">
          {error} El turno quedó donde estaba.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {tieneCelular && (
          <Button type="button" disabled={pendiente} estado={pendiente && avisando ? "cargando" : undefined} onClick={() => void hacer(true)}>
            Mover y avisar por WhatsApp
          </Button>
        )}
        <Button
          type="button"
          variant={tieneCelular ? "outline" : "solid"}
          disabled={pendiente}
          estado={pendiente && avisando === false ? "cargando" : undefined}
          onClick={() => void hacer(false)}
        >
          {tieneCelular ? "Mover sin avisar" : "Mover"}
        </Button>
        {onNo && (
          <Button type="button" variant="ghost" disabled={pendiente} onClick={onNo}>
            No
          </Button>
        )}
      </div>
      {!tieneCelular && <p className="text-xs text-muted">No tiene un celular válido para avisarle: corregilo en su ficha.</p>}
    </div>
  );
}

/** Si el navegador bloqueó la ventana de WhatsApp: el enlace, a mano. */
function AvisoPendiente({ href }: { href: string }) {
  return (
    <p role="status" className="text-sm text-body">
      El navegador no abrió WhatsApp solo.{" "}
      <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-medium text-accent underline underline-offset-2">
        Mandarle el aviso por WhatsApp
      </a>
    </p>
  );
}

// ── Al soltar en la grilla ───────────────────────────────────────────────────

export function ConfirmarMover({ turno, destino, onCerrar }: { turno: TurnoDelDia | null; destino: Destino | null; onCerrar: () => void }) {
  const [aviso, setAviso] = useState<string | null>(null);
  const abierta = !!turno && !!destino;
  const cerrar = () => {
    setAviso(null);
    onCerrar();
  };
  return (
    <Hoja
      abierta={abierta || aviso !== null}
      onCerrar={cerrar}
      titulo={aviso ? "Listo, quedó movido" : destino ? preguntaDeMover(destino) : ""}
      descripcion={turno ? `${turno.clienta} · ${turno.servicio} · hoy está a las ${fmtTime(turno.inicio)} con ${turno.profesional}` : undefined}
    >
      <div className="pt-2">
        {aviso ? (
          <AvisoPendiente href={aviso} />
        ) : (
          turno &&
          destino && (
            <TeclasDeMover
              key={`${turno.id}-${destino.profesionalId}-${destino.inicio}`}
              turno={turno}
              destino={destino}
              onNo={cerrar}
              onListo={(pendiente) => {
                if (pendiente) setAviso(pendiente);
                else cerrar();
              }}
            />
          )
        )}
      </div>
    </Hoja>
  );
}

// ── En el cajón del turno ────────────────────────────────────────────────────

type Carga =
  | { fase: "buscando" }
  | { fase: "lista"; profesionales: ProfesionalParaMover[]; huecos: Record<string, string[]> }
  | { fase: "error"; error: string };

export default function MoverTurno({
  turno,
  ahora,
  abiertoAlEmpezar = false,
  onListo,
}: {
  turno: TurnoDelDia;
  ahora: string;
  /** Arranca desplegado y buscando (la hoja de «Quiere cambiar» de Mañana: ya se eligió mover). */
  abiertoAlEmpezar?: boolean;
  /** Se movió (o se cerró el panel): quien lo monta cierra su hoja y recarga. */
  onListo?: (movido: boolean) => void;
}) {
  const [abierto, setAbierto] = useState(abiertoAlEmpezar);
  const [profesionalId, setProfesionalId] = useState(turno.profesionalId);
  const hoy = dateStrInBusinessTz(new Date(ahora));
  const dias = diasParaMover(hoy, dateStrInBusinessTz(new Date(turno.inicio)));
  const [dia, setDia] = useState<string>(() => {
    const delTurno = dateStrInBusinessTz(new Date(turno.inicio));
    return delTurno >= hoy ? delTurno : hoy;
  });
  const [carga, setCarga] = useState<Carga>({ fase: "buscando" });
  const [elegido, setElegido] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [, empezar] = useTransition();

  const buscar = (profesional: string) => {
    setCarga({ fase: "buscando" });
    setElegido("");
    empezar(async () => {
      try {
        const r = await huecosParaMover(turno.id, dias, profesional);
        if (!r.ok) setCarga({ fase: "error", error: r.error });
        else setCarga({ fase: "lista", profesionales: r.profesionales, huecos: r.huecos[profesional] ?? {} });
      } catch (err) {
        if (esRedireccionDeNext(err)) throw err;
        setCarga({ fase: "error", error: "No pude buscar los horarios libres. Revisá la conexión y probá de nuevo." });
      }
    });
  };

  // Desplegado desde el principio: la primera búsqueda sale al montar.
  const primeraBusqueda = useRef(false);
  useEffect(() => {
    if (!abiertoAlEmpezar || primeraBusqueda.current) return;
    primeraBusqueda.current = true;
    buscar(profesionalId);
    // Sólo al montar: después busca cada tecla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!abierto) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          setAbierto(true);
          buscar(profesionalId);
        }}
      >
        Mover
      </Button>
    );
  }

  const ahoraMs = new Date(ahora).getTime();
  const libres = (d: string) => (carga.fase === "lista" ? (carga.huecos[d] ?? []).filter((h) => new Date(h).getTime() > ahoraMs) : []);
  const profesionales = carga.fase === "lista" ? carga.profesionales : [];
  const nombre = profesionales.find((p) => p.id === profesionalId)?.nombre ?? turno.profesional;
  const huecosDelDia = libres(dia);
  const destino: Destino | null = elegido ? { profesionalId, profesional: nombre, inicio: elegido } : null;

  return (
    <div role="group" aria-label="Mover el turno" className="w-full space-y-4 border-l-2 border-line-strong pl-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-strong">Mover el turno</p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setAbierto(false);
            onListo?.(false);
          }}
        >
          Cerrar
        </Button>
      </div>

      {aviso && <AvisoPendiente href={aviso} />}

      {profesionales.length > 1 && (
        <div role="group" aria-label="Con quién" className="flex flex-wrap gap-2">
          {profesionales.map((p) => (
            <Chip
              key={p.id}
              prendido={p.id === profesionalId}
              onClick={() => {
                if (p.id === profesionalId) return;
                setProfesionalId(p.id);
                buscar(p.id);
              }}
            >
              {p.nombre}
              {p.box ? ` · ${p.box}` : ""}
            </Chip>
          ))}
        </div>
      )}

      <div role="group" aria-label="Qué día" className="flex flex-wrap gap-2">
        {dias.map((d) => (
          <Chip
            key={d}
            prendido={d === dia}
            conteo={carga.fase === "lista" ? libres(d).length : undefined}
            aria-label={`${fechaCorta(d)}${carga.fase === "lista" ? `: ${libres(d).length} horarios libres` : ""}`}
            onClick={() => {
              setDia(d);
              setElegido("");
            }}
          >
            {d === hoy ? "Hoy" : fechaCorta(d)}
          </Chip>
        ))}
      </div>

      <div role="group" aria-label="Horarios libres" aria-busy={carga.fase === "buscando"}>
        {carga.fase === "buscando" && <p className="text-sm text-muted">Buscando horarios libres…</p>}
        {carga.fase === "error" && (
          <p role="alert" className="text-sm text-danger">
            {carga.error}
          </p>
        )}
        {carga.fase === "lista" && huecosDelDia.length === 0 && (
          <p className="text-sm text-muted">
            {nombre} no tiene lugar ese día para {turno.servicio}. Probá otro día{profesionales.length > 1 ? " u otra profesional" : ""}.
          </p>
        )}
        {huecosDelDia.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {huecosDelDia.map((h) => (
              <Chip key={h} prendido={h === elegido} onClick={() => setElegido(h)} className="tabular-nums">
                {fmtTime(h)}
              </Chip>
            ))}
          </div>
        )}
      </div>

      {destino && (
        <div className="space-y-2">
          <p className="text-sm text-body">{preguntaDeMover(destino)}</p>
          <TeclasDeMover
            key={`${destino.profesionalId}-${destino.inicio}`}
            turno={turno}
            destino={destino}
            onListo={(pendiente) => {
              setElegido("");
              setAviso(pendiente);
              if (!pendiente) {
                setAbierto(false);
                onListo?.(true);
              }
            }}
          />
        </div>
      )}
    </div>
  );
}
