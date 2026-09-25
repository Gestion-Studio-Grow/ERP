"use client";

// ============================================================================
// LA MESA DE TURNOS — el renglón de un turno, su cajón y la hoja de cobro («Renglón»).
// ============================================================================
//
// Lo comparten el libro del día (la agenda) y «Todos los turnos» (la lista): un turno se ve y se
// opera igual en los dos lados. La mesa guarda qué turno está abierto (en la URL: `?turno=<id>`,
// así Atrás lo cierra y un enlace lo abre) y qué hoja de cobro está arriba; los renglones piden
// abrir el cajón o la hoja con `useMesa()`.

import { createContext, useContext, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { completeAppointment, confirmarTurno } from "@/lib/actions";
import { Button, Hoja, Marca, Plata, Renglon, hrefConParametros } from "@/components/ui";
import { MenuMas } from "@/components/ui/MenuMas";
import { dateStrInBusinessTz, fmtShortDate, fmtTime } from "@/lib/datetime";
import { waLinkClienta } from "@/lib/whatsapp-cta";
import { useToast } from "../../ToastProvider";
import { estaResuelto, fechaCorta, marcaDelTurno, minutosEntre, pasoDelTurno, pesos, verboDelPaso, type Paso, type Permisos, type TurnoDelDia } from "../agenda-core";
import { aFormData, camposDelTurno, camposDeTerminar } from "./campos";
import CobrarTurno from "./CobrarTurno";
import TerminarTurno from "./TerminarTurno";
import TurnoCajon from "./TurnoCajon";

type HojaAbierta = { turnoId: string; que: "cobrar" | "terminar" } | null;

type Mesa = {
  permisos: Permisos;
  reloj: Date;
  fichaDe: ((clienteId: string) => string) | null;
  abrir: (id: string) => void;
  hoja: (h: NonNullable<HojaAbierta>) => void;
  cambiarUrl: (cambios: Record<string, string | null>, modo?: "reemplazar" | "empujar") => void;
};

const Contexto = createContext<Mesa | null>(null);

export function useMesa(): Mesa {
  const m = useContext(Contexto);
  if (!m) throw new Error("useMesa fuera de <MesaDeTurnos>");
  return m;
}

export default function MesaDeTurnos({
  turnos,
  permisos,
  ahora,
  hrefFicha,
  children,
}: {
  /** Todos los turnos que se pueden abrir desde esta pantalla. */
  turnos: TurnoDelDia[];
  permisos: Permisos;
  ahora: string;
  hrefFicha: string | null;
  children: React.ReactNode;
}) {
  const ruta = usePathname();
  const params = useSearchParams();
  const reloj = new Date(ahora);
  const idAbierto = params.get("turno");
  const abierto = idAbierto ? (turnos.find((t) => t.id === idAbierto) ?? null) : null;
  const [hoja, setHoja] = useState<HojaAbierta>(null);
  const empujado = useRef(false);

  const cambiarUrl = (cambios: Record<string, string | null>, modo: "reemplazar" | "empujar" = "reemplazar") => {
    const href = hrefConParametros(ruta, new URLSearchParams(window.location.search), cambios);
    if (modo === "empujar") window.history.pushState(null, "", href);
    else window.history.replaceState(null, "", href);
  };
  const abrir = (id: string) => {
    empujado.current = true;
    cambiarUrl({ turno: id }, "empujar");
  };
  const cerrar = () => {
    if (empujado.current) {
      empujado.current = false;
      window.history.back();
    } else cambiarUrl({ turno: null });
  };
  const fichaDe = hrefFicha ? (id: string) => `${hrefFicha}${encodeURIComponent(id)}` : null;
  const turnoDeLaHoja = hoja ? turnos.find((t) => t.id === hoja.turnoId) : undefined;

  return (
    <Contexto.Provider value={{ permisos, reloj, fichaDe, abrir, hoja: setHoja, cambiarUrl }}>
      {children}

      <TurnoCajon turno={abierto} permisos={permisos} ahora={ahora} hrefFicha={fichaDe} onCerrar={cerrar} />

      <Hoja
        abierta={!!turnoDeLaHoja}
        onCerrar={() => setHoja(null)}
        titulo={
          turnoDeLaHoja
            ? `${hoja?.que === "terminar" ? "Terminar" : turnoDeLaHoja.sugerido.tipo === "senia" ? "Cobrar la seña" : "Cobrar"} · ${turnoDeLaHoja.clienta}`
            : ""
        }
        descripcion={turnoDeLaHoja ? `${fmtTime(turnoDeLaHoja.inicio)} · ${turnoDeLaHoja.servicio} · ${turnoDeLaHoja.profesional}` : undefined}
      >
        {turnoDeLaHoja && hoja?.que === "cobrar" && (
          <CobrarTurno
            key={turnoDeLaHoja.id}
            turnoId={turnoDeLaHoja.id}
            clienta={turnoDeLaHoja.clienta}
            sugerido={turnoDeLaHoja.sugerido}
            saldo={turnoDeLaHoja.saldo}
            onListo={() => setHoja(null)}
          />
        )}
        {turnoDeLaHoja && hoja?.que === "terminar" && (
          <TerminarTurno
            key={turnoDeLaHoja.id}
            turnoId={turnoDeLaHoja.id}
            clienta={turnoDeLaHoja.clienta}
            saldo={turnoDeLaHoja.saldo}
            puedeCobrar={permisos.cobrar && turnoDeLaHoja.veredicto.ok}
            motivoSinCobro={turnoDeLaHoja.veredicto.ok ? undefined : turnoDeLaHoja.veredicto.motivo}
            onListo={() => setHoja(null)}
          />
        )}
      </Hoja>
    </Contexto.Provider>
  );
}

function TeclaDelTurno({ t, paso }: { t: TurnoDelDia; paso: Paso }) {
  const { hoja } = useMesa();
  const { showError, showSuccess } = useToast();
  const [pendiente, empezar] = useTransition();
  const verbo = verboDelPaso(paso);
  if (!verbo) return null;

  const directo = (accion: (fd: FormData) => Promise<unknown>, fd: FormData, ok: string) =>
    empezar(async () => {
      try {
        const r = (await accion(fd)) as { ok?: boolean; error?: string } | undefined;
        if (r && r.ok === false) showError(r.error ?? "No se pudo.");
        else showSuccess(ok);
      } catch {
        showError("No se pudo. Probá de nuevo; si sigue, avisá.");
      }
    });

  const etiqueta = `${verbo}: ${t.clienta}, ${fmtTime(t.inicio)}`;
  switch (paso.tipo) {
    case "confirmar":
      return (
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={etiqueta}
          disabled={pendiente}
          estado={pendiente ? "cargando" : undefined}
          onClick={() => directo(confirmarTurno, aFormData(camposDelTurno(t.id)), `Confirmado: ${t.clienta}, ${fmtTime(t.inicio)}.`)}
        >
          Confirmar
        </Button>
      );
    case "terminar":
      if (paso.saldo <= 0) {
        return (
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={etiqueta}
            disabled={pendiente}
            estado={pendiente ? "cargando" : undefined}
            onClick={() => directo(completeAppointment, aFormData(camposDeTerminar({ turnoId: t.id, saldo: 0, cobro: null })), `Terminado: ${t.clienta}.`)}
          >
            Terminar
          </Button>
        );
      }
      return (
        <Button type="button" size="sm" aria-label={etiqueta} onClick={() => hoja({ turnoId: t.id, que: "terminar" })}>
          {paso.conCobro ? `Cobrar ${pesos(paso.saldo)}` : "Terminar"}
        </Button>
      );
    case "cobrar":
    case "cobrar-senia":
      return (
        <Button
          type="button"
          size="sm"
          variant={paso.tipo === "cobrar" ? "solid" : "outline"}
          aria-label={etiqueta}
          onClick={() => hoja({ turnoId: t.id, que: "cobrar" })}
        >
          {paso.tipo === "cobrar-senia" ? `Seña ${pesos(paso.monto)}` : `Cobrar ${pesos(paso.monto)}`}
        </Button>
      );
    default:
      return null;
  }
}

/**
 * El renglón de un turno: [hora] [clienta · servicio · profesional · box · marca] [plata] [tecla ⋯].
 * `conFecha` pone el día en el folio (la lista de todos los turnos mezcla días).
 */
export function RenglonDelTurno({ t, conFecha = false }: { t: TurnoDelDia; conFecha?: boolean }) {
  const { permisos, reloj, fichaDe, abrir } = useMesa();
  const paso = pasoDelTurno(t, permisos, reloj);
  const marca = marcaDelTurno(t, reloj);
  const resuelto = estaResuelto(t);
  const wa = waLinkClienta(t.telefono);
  return (
    <Renglon
      as="li"
      folio={
        conFecha ? (
          <span className="tabular-nums">
            <span className="block font-semibold text-strong">
              {fechaCorta(dateStrInBusinessTz(new Date(t.inicio))).split(" ")[0]} {fmtShortDate(t.inicio).slice(0, 5)}
            </span>
            <span className="block">{fmtTime(t.inicio)}</span>
          </span>
        ) : (
          <span className="text-[15px] font-semibold tabular-nums text-strong">{fmtTime(t.inicio)}</span>
        )
      }
      titulo={
        <button
          type="button"
          data-abrir
          onClick={() => abrir(t.id)}
          aria-label={`${t.clienta}, ${conFecha ? `${fmtShortDate(t.inicio)} ` : ""}${fmtTime(t.inicio)}: abrir el turno`}
          className="min-h-11 text-left underline-offset-2 hover:underline lg:min-h-0"
        >
          {resuelto ? <s className="text-muted decoration-1">{t.clienta}</s> : t.clienta}
        </button>
      }
      detalle={
        <>
          {t.servicio} · {minutosEntre(t.inicio, t.fin)}′ · {t.profesional}
          {t.box ? ` · ${t.box}` : ""}{" "}
          <Marca tipo={marca.tipo} className="ml-1 align-baseline">
            {marca.texto}
          </Marca>
        </>
      }
      plata={
        t.estado === "NO_SHOW" ? (
          <span className="text-sm text-muted">—</span>
        ) : (
          <Plata valor={t.precio} sinCentavos={Number.isInteger(t.precio)} tono={t.saldo <= 0 && t.cobrado > 0 ? "cobrado" : undefined} />
        )
      }
      tecla={
        <>
          <TeclaDelTurno t={t} paso={paso} />
          <MenuMas etiqueta={`Más acciones del turno de ${t.clienta}`}>
            <button type="button" onClick={() => abrir(t.id)}>
              Abrir el turno
            </button>
            {wa && (
              <a href={wa} target="_blank" rel="noopener noreferrer">
                Escribirle por WhatsApp
              </a>
            )}
            {fichaDe && t.clienteId && <Link href={fichaDe(t.clienteId)}>Ver su ficha</Link>}
          </MenuMas>
        </>
      }
    />
  );
}
