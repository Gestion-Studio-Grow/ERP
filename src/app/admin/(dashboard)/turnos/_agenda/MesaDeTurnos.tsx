"use client";

// ============================================================================
// LA MESA DE TURNOS — el renglón de un turno, su cajón y la hoja de cobro («Renglón»).
// ============================================================================
//
// Lo comparten el libro del día (la agenda) y «Todos los turnos» (la lista): un turno se ve y se
// opera igual en los dos lados. La mesa guarda qué turno está abierto (en la URL: `?turno=<id>`,
// así Atrás lo cierra y un enlace lo abre), qué hoja de cobro está arriba y si está abierta la hoja
// de cancelar / «no vino»; los renglones piden abrir el cajón o las hojas con `useMesa()`.
//
// Cobrar es 2 toques: la tecla del renglón («Cobrar $9.000») abre la hoja y el MEDIO ya cobra. Un
// Reservado al que se le pasó la hora se cobra igual, sin «Confirmar» antes (viaja con `vino=on`).
//
// `?turno=<id>&hoja=terminar` (CH-019, «Atender ahora» → al dar el turno): abre ESE turno directo en
// la hoja de terminar y cobrar (sin el cajón debajo). Al cerrarla se saca de la URL, así no vuelve.
//
// «Deshacer» (CH-026): cuando la hoja de cancelar / «no vino» termina bien, queda un aviso con
// [Deshacer] unos segundos (`AvisoDeshacerCierre`, Deshacer.tsx): el turno vuelve a Reservado si
// el hueco sigue libre; si no, el servidor dice por qué.

import { createContext, useContext, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { completeAppointment, confirmarTurno } from "@/lib/actions";
import { Button, Hoja, Marca, Plata, Renglon, hrefConParametros } from "@/components/ui";
import { MenuMas } from "@/components/ui/MenuMas";
import { dateStrInBusinessTz, fmtShortDate, fmtTime } from "@/lib/datetime";
import { waLinkClienta } from "@/lib/whatsapp-cta";
import { useToast } from "../../ToastProvider";
import {
  estaResuelto,
  fechaCorta,
  marcaDelTurno,
  minutosEntre,
  pasoDelTurno,
  pesos,
  textoSeniaPedida,
  verboDelPaso,
  yaEmpezo,
  type CierreSinPrestar,
  type Paso,
  type Permisos,
  type TurnoDelDia,
} from "../agenda-core";
import { aFormData, camposDelTurno, camposDeTerminar, leerResultado } from "./campos";
import CancelarONoVino, { type CierreAbierto } from "./CancelarONoVino";
import CobrarTurno from "./CobrarTurno";
import TerminarTurno from "./TerminarTurno";
import TurnoCajon from "./TurnoCajon";
import AvisoDeshacerCierre from "./Deshacer";
import { MediosDePago } from "./medios";

type HojaAbierta = { turnoId: string; que: "cobrar" | "terminar" } | null;

type Mesa = {
  permisos: Permisos;
  reloj: Date;
  fichaDe: ((clienteId: string) => string) | null;
  abrir: (id: string) => void;
  hoja: (h: NonNullable<HojaAbierta>) => void;
  /** Abre la hoja de cancelar / «no vino» de un turno. */
  cerrarSinPrestar: (turnoId: string, accion: CierreSinPrestar) => void;
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
  const router = useRouter();
  const reloj = new Date(ahora);
  const idAbierto = params.get("turno");
  const [hojaPedida, setHoja] = useState<HojaAbierta>(null);
  // `?hoja=terminar` (CH-019): ESE turno abre directo en la hoja de terminar y cobrar (en cuanto está
  // en la lista: la grilla lo recibe recién montada). Al cerrarla se saca `hoja` de la URL y no vuelve.
  const [hojaDescartada, setHojaDescartada] = useState<string | null>(null);
  const pedidoDeHoja =
    params.get("hoja") === "terminar" && idAbierto && turnos.some((t) => t.id === idAbierto) ? idAbierto : null;
  const hojaDeLaUrl = !hojaPedida && !!pedidoDeHoja && hojaDescartada !== pedidoDeHoja;
  const hoja: HojaAbierta = hojaPedida ?? (hojaDeLaUrl && pedidoDeHoja ? { turnoId: pedidoDeHoja, que: "terminar" } : null);
  // Con la hoja de la URL arriba, el cajón del mismo turno no se abre debajo (dos veces lo mismo).
  const abierto = idAbierto && !hojaDeLaUrl ? (turnos.find((t) => t.id === idAbierto) ?? null) : null;
  const cerrarHoja = () => {
    setHoja(null);
    if (hojaDeLaUrl && pedidoDeHoja) {
      setHojaDescartada(pedidoDeHoja);
      window.history.replaceState(null, "", hrefConParametros(window.location.pathname, new URLSearchParams(window.location.search), { hoja: null, turno: null }));
    }
  };
  const [cierre, setCierre] = useState<CierreAbierto | null>(null);
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
  const turnoDelCierre = cierre ? (turnos.find((t) => t.id === cierre.turnoId) ?? null) : null;
  const cerrarSinPrestar = (turnoId: string, accion: CierreSinPrestar) => setCierre({ turnoId, accion });
  const cobraLaHoja = !!turnoDeLaHoja && permisos.cobrar && turnoDeLaHoja.veredicto.ok;
  // Lo recién cancelado / marcado «no vino», con su [Deshacer] (CH-026).
  const [deshacer, setDeshacer] = useState<{ turnoId: string; clienta: string; que: CierreSinPrestar; mensaje: string } | null>(null);


  return (
    <Contexto.Provider value={{ permisos, reloj, fichaDe, abrir, hoja: setHoja, cerrarSinPrestar, cambiarUrl }}>
      <MediosDePago medios={permisos.medios}>
      {children}

      <TurnoCajon
        turno={abierto}
        permisos={permisos}
        ahora={ahora}
        hrefFicha={fichaDe}
        onCerrar={cerrar}
        onCerrarSinPrestar={(accion) => abierto && cerrarSinPrestar(abierto.id, accion)}
      />

      <CancelarONoVino
        turno={turnoDelCierre}
        accion={cierre?.accion ?? "cancelar"}
        ahora={reloj}
        puedeDevolver={!!turnoDelCierre && permisos.cobrar && turnoDelCierre.veredicto.ok}
        onCerrar={() => setCierre(null)}
        conDeshacer
        onListo={(mensaje) => {
          // Hecho: se cierra la hoja y, si el turno estaba abierto en el cajón, también el cajón.
          const delCajon = !!abierto && abierto.id === cierre?.turnoId;
          if (cierre && turnoDelCierre) setDeshacer({ turnoId: cierre.turnoId, clienta: turnoDelCierre.clienta, que: cierre.accion, mensaje });
          setCierre(null);
          if (delCajon) cerrar();
        }}
      />

      {deshacer && (
        <AvisoDeshacerCierre
          key={deshacer.turnoId}
          turnoId={deshacer.turnoId}
          clienta={deshacer.clienta}
          que={deshacer.que === "no-vino" ? "no-vino" : "cancelacion"}
          mensaje={deshacer.mensaje}
          onTermina={() => setDeshacer(null)}
          onDeshecho={() => router.refresh()}
        />
      )}

      <Hoja
        abierta={!!turnoDeLaHoja}
        onCerrar={cerrarHoja}
        titulo={
          turnoDeLaHoja
            ? `${
                hoja?.que === "terminar"
                  ? turnoDeLaHoja.saldo > 0 && cobraLaHoja
                    ? "Cobrar"
                    : turnoDeLaHoja.estado === "PENDING"
                      ? "Vino"
                      : "Terminar"
                  : turnoDeLaHoja.sugerido.tipo === "senia"
                    ? "Cobrar la seña"
                    : "Cobrar"
              } · ${turnoDeLaHoja.clienta}`
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
            onListo={cerrarHoja}
            onQuedaDebiendo={turnoDeLaHoja.cuentaACobrar ? cerrarHoja : undefined}
          />
        )}
        {turnoDeLaHoja && hoja?.que === "terminar" && (
          <TerminarTurno
            key={turnoDeLaHoja.id}
            turnoId={turnoDeLaHoja.id}
            clienta={turnoDeLaHoja.clienta}
            estado={turnoDeLaHoja.estado}
            saldo={turnoDeLaHoja.saldo}
            puedeCobrar={cobraLaHoja}
            motivoSinCobro={turnoDeLaHoja.veredicto.ok ? undefined : turnoDeLaHoja.veredicto.motivo}
            onListo={cerrarHoja}
          />
        )}
      </Hoja>
      </MediosDePago>
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
        const r = leerResultado(await accion(fd));
        if (!r.ok) showError(r.error);
        else {
          showSuccess(ok);
          if (r?.aviso) showError(r.aviso);
        }
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
            onClick={() => directo(completeAppointment, aFormData(camposDeTerminar({ turnoId: t.id, saldo: 0, cobro: null, estado: t.estado })), `Terminado: ${t.clienta}.`)}
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
    case "vino":
      // Saldado: un toque lo cierra (como «Terminar» sin saldo). Con saldo que cobra otra
      // persona, la hoja dice por qué y ofrece sólo «Terminar y dejar el saldo».
      if (paso.saldo <= 0) {
        return (
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={`Vino: ${t.clienta}, ${fmtTime(t.inicio)}`}
            disabled={pendiente}
            estado={pendiente ? "cargando" : undefined}
            onClick={() =>
              directo(completeAppointment, aFormData(camposDeTerminar({ turnoId: t.id, saldo: 0, cobro: null, estado: t.estado })), `Vino: ${t.clienta}.`)
            }
          >
            Vino ✓
          </Button>
        );
      }
      return (
        <Button type="button" variant="outline" size="sm" aria-label={`Vino: ${t.clienta}, ${fmtTime(t.inicio)}`} onClick={() => hoja({ turnoId: t.id, que: "terminar" })}>
          Vino ✓
        </Button>
      );
    case "cobrar":
      if (paso.vino) {
        // Reservado pasado: «Cobrar $X» abre la hoja de cierre; el medio cobra y lo cierra.
        return (
          <Button type="button" size="sm" aria-label={etiqueta} onClick={() => hoja({ turnoId: t.id, que: "terminar" })}>
            Cobrar {pesos(paso.monto)}
          </Button>
        );
      }
      return (
        <Button type="button" size="sm" aria-label={etiqueta} onClick={() => hoja({ turnoId: t.id, que: "cobrar" })}>
          Cobrar {pesos(paso.monto)}
        </Button>
      );
    case "cobrar-senia":
      return (
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label={etiqueta}
          onClick={() => hoja({ turnoId: t.id, que: "cobrar" })}
        >
          Seña {pesos(paso.monto)}
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
  const { permisos, reloj, fichaDe, abrir, cerrarSinPrestar } = useMesa();
  const paso = pasoDelTurno(t, permisos, reloj);
  const marca = marcaDelTurno(t, reloj);
  const pedida = textoSeniaPedida(t, reloj);
  const resuelto = estaResuelto(t);
  const wa = waLinkClienta(t.telefono);
  const vivo = t.estado === "PENDING" || t.estado === "CONFIRMED";
  // «No vino» recién desde la hora del turno (CH-014); cancelar, quien gestiona la agenda. Los dos
  // abren la hoja con la consecuencia: nunca un toque suelto.
  const noVino = vivo && permisos.terminar && yaEmpezo(t, reloj);
  const cancela = vivo && permisos.gestionar;
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
          {pedida && <span className="ml-2">{pedida}</span>}
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
            {noVino && (
              <button type="button" aria-haspopup="dialog" onClick={() => cerrarSinPrestar(t.id, "no-vino")}>
                No vino
              </button>
            )}
            {cancela && (
              <button type="button" aria-haspopup="dialog" onClick={() => cerrarSinPrestar(t.id, "cancelar")}>
                Cancelar el turno
              </button>
            )}
          </MenuMas>
        </>
      }
    />
  );
}
