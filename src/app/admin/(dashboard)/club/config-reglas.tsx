"use client";

// ============================================================================
// AVISOS, REGLAS, HORARIOS Y LINK PARA CLIENTES — lo que el dueño ajusta del club.
// ============================================================================
//
// Cada formulario arranca con lo guardado y se vuelve a armar si lo guardado cambia (p. ej. con «Deshacer»): va con
// `key` = la firma de lo guardado. Todo se valida antes de llamar al motor (configuracion-core.ts) y se aplica entero
// o nada; el aviso de abajo dice qué pasó y deja deshacer (no lleva PIN: lo controla el permiso `configurar`).
// Avisos y «Reglas y precios» mueven plata o permisos (alias de cobro, celular de las aprobaciones, precios, seña,
// fondo, quién firma la caja): sólo se cambian desde el puesto del dueño (login OWNER del ERP), igual que lo que el
// servidor deja pasar (G8, src/lib/club/delicado.ts `CONFIG_DELICADA`, CERT-B4 vuelta 4 F5). En otro puesto, el
// formulario no se ofrece: lo que se guardara ahí el servidor lo volvería a dejar como estaba.

import { useCallback, useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Field";
import type { EstadoClub } from "@/lib/club/motor.mjs";
import type { Almacen } from "./almacen";
import { Campo, etiquetaDelClub } from "./formulario-del-club";
import {
  ABRE_DESDE,
  ABRE_HASTA,
  CIERRA_DESDE,
  CIERRA_HASTA,
  DIAS_DE_LA_SEMANA,
  LARGOS_DE_FIRMA,
  REGLAS,
  contactosDe,
  etiquetaTarifa,
  linkParaClientes,
  nombreDelDia,
  notaDelCelular,
  opcionesDeHora,
  valoresDeReglas,
  type ValoresReglas,
} from "./configuracion-core";
import { Seccion, sinDesborde, useHacerConfig } from "./config-piezas";
import { SoloEnElPuestoDelDuenio, puestoDeDuenio } from "./config-jornada";
import { enlaceWhatsApp } from "./whatsapp-core";
import { BotonWhatsApp } from "./WhatsAppDelClub";
import { porFirma, useSeleccion } from "./usar-almacen";
import { LIMITES_BLOQUEO } from "@/lib/club/motor.mjs";

// ───────────── avisos por WhatsApp ─────────────

interface VistaAvisos {
  duenos: { id: string; nombre: string; tel: string }[];
  club: string;
  alias: string;
  firma: string;
}
function seleccionarAvisos(e: EstadoClub): VistaAvisos {
  const c = contactosDe(e);
  const duenos = e.usuarios.filter((u) => u.rol === "duenio" && u.activo !== false).map((u) => ({ id: u.id, nombre: u.nombre, tel: c[u.id] ?? "" }));
  const club = c.club ?? "";
  const alias = e.config.cobro?.alias ?? "";
  return { duenos, club, alias, firma: JSON.stringify([duenos, club, alias]) };
}

function FormularioAvisos({ v, almacen }: { v: VistaAvisos; almacen: Almacen }) {
  const hacer = useHacerConfig(almacen);
  const [celulares, setCelulares] = useState<Record<string, string>>(() => Object.fromEntries(v.duenos.map((d) => [d.id, d.tel])));
  const [club, setClub] = useState(v.club);
  const [alias, setAlias] = useState(v.alias);
  return (
    <form
      aria-label="Avisos por WhatsApp"
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        hacer({ tipo: "avisos", celulares, club, alias });
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {v.duenos.map((d) => (
          <Campo
            key={d.id}
            label={`Celular de ${d.nombre} (le llegan los pedidos de crédito)`}
            type="tel"
            inputMode="tel"
            placeholder="11 2345-6789"
            value={celulares[d.id] ?? ""}
            onChange={(e) => setCelulares({ ...celulares, [d.id]: e.target.value })}
            ayuda={notaDelCelular(d.tel) ?? undefined}
          />
        ))}
        <Campo label="WhatsApp del club (recepción)" type="tel" inputMode="tel" placeholder="11 2345-6789" value={club} onChange={(e) => setClub(e.target.value)} ayuda={notaDelCelular(v.club) ?? undefined} />
        <Campo label="Alias para la seña (va en la confirmación del turno)" placeholder="club.breakpoint" maxLength={20} value={alias} onChange={(e) => setAlias(e.target.value)} />
      </div>
      <p className="text-sm text-body">Sin número, WhatsApp abre para elegir el chat. Los números van con el código de área, sin el 0 ni el 15.</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start">
        <Button type="submit" variant="solid" size="md">
          Guardar avisos
        </Button>
        <BotonWhatsApp enlace={enlaceWhatsApp(v.club, "Hola! Probando los avisos del club desde el sistema.", almacen.modo())} nombreAccesible="Probar el WhatsApp del club (abre WhatsApp)">
          Probar el WhatsApp del club
        </BotonWhatsApp>
      </div>
    </form>
  );
}

export function AvisosPorWhatsApp({ almacen }: { almacen: Almacen }) {
  const v = useSeleccion(almacen, seleccionarAvisos, porFirma);
  return (
    <Seccion id="club-config-avisos" titulo="Avisos por WhatsApp" bajada="El celular de cada dueño (ahí le llegan los pedidos de crédito), el WhatsApp del club y el alias para cobrar la seña.">
      {puestoDeDuenio(almacen) ? <FormularioAvisos key={v.firma} v={v} almacen={almacen} /> : <SoloEnElPuestoDelDuenio que="Los celulares de los dueños y el alias para cobrar la seña" />}
    </Seccion>
  );
}

// ───────────── reglas y precios ─────────────

interface VistaReglas {
  valores: ValoresReglas;
  tarifas: string[];
  firma: string;
}
function seleccionarReglas(e: EstadoClub): VistaReglas {
  const valores = valoresDeReglas(e);
  const tarifas = e.config.tarifas.map(etiquetaTarifa);
  return { valores, tarifas, firma: JSON.stringify([valores, tarifas]) };
}

function FormularioReglas({ v, almacen }: { v: VistaReglas; almacen: Almacen }) {
  const hacer = useHacerConfig(almacen);
  const [d, setD] = useState<ValoresReglas>(v.valores);
  const ids = { firma: useId(), nombre: useId() };
  return (
    <form
      aria-label="Reglas y precios"
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        hacer({ tipo: "reglas", ...d });
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {v.tarifas.map((etiqueta, i) => (
          <Campo key={etiqueta} label={etiqueta} inputMode="numeric" importe value={d.tarifas[i] ?? ""} onChange={(e) => setD({ ...d, tarifas: d.tarifas.map((t, k) => (k === i ? e.target.value : t)) })} />
        ))}
        <Campo label="Fondo de caja (el cambio que queda en el cajón)" inputMode="numeric" importe value={d.fondo} onChange={(e) => setD({ ...d, fondo: e.target.value })} />
        {REGLAS.map((r) => (
          <Campo
            key={r.clave}
            label={r.etiqueta}
            inputMode="numeric"
            ayuda={r.ayuda}
            placeholder={r.clave === "minutosAntesParaEntrar" ? "Sin límite" : undefined}
            value={d.politica[r.clave]}
            onChange={(e) => setD({ ...d, politica: { ...d.politica, [r.clave]: e.target.value } })}
          />
        ))}
        <Campo
          label="Bloquear la pantalla tras (minutos sin uso)"
          inputMode="numeric"
          ayuda={`De ${LIMITES_BLOQUEO[0]} a ${LIMITES_BLOQUEO[1]}. 0 = sólo al apagarse la pantalla.`}
          value={d.bloqueoMin}
          onChange={(e) => setD({ ...d, bloqueoMin: e.target.value })}
        />
        {/* B4-C4 (D-16): quién firma la caja; B4-C5: el nombre de «Jugador N» al cobrar. */}
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor={ids.firma} className={etiquetaDelClub}>
            PIN que firma cierres, retiros y egresos
          </label>
          <Select id={ids.firma} value={d.largoPinFirma ?? ""} aria-describedby={`${ids.firma}-ayuda`} onChange={(e) => setD({ ...d, largoPinFirma: e.target.value })}>
            {LARGOS_DE_FIRMA.map((n) => (
              <option key={n} value={String(n)}>
                {n === Math.max(...LARGOS_DE_FIRMA) ? `${n} dígitos (sólo dueños)` : `${n} dígitos (también recepción)`}
              </option>
            ))}
          </Select>
          <p id={`${ids.firma}-ayuda`} className="text-sm text-body">
            Con el de recepción, recepción cierra y saca plata sin un dueño.
          </p>
        </div>
        <label htmlFor={ids.nombre} className="flex min-h-11 cursor-pointer items-center gap-2 self-end text-sm font-medium text-strong">
          <input id={ids.nombre} type="checkbox" checked={!!d.pedirNombreJugador} onChange={(e) => setD({ ...d, pedirNombreJugador: e.target.checked })} className="size-5 accent-[var(--accent)]" />
          Pedir nombre o teléfono de «Jugador 2, 3 y 4» al cobrar
        </label>
      </div>
      <p className="text-sm text-body">Los precios valen para los turnos nuevos. Las faltas se cobran enteras (al titular o repartidas en el grupo).</p>
      <Button type="submit" variant="solid" size="md" className="self-start max-sm:h-auto max-sm:min-h-11 max-sm:w-full max-sm:py-2 max-sm:whitespace-normal">
        Guardar reglas y precios
      </Button>
    </form>
  );
}

export function ReglasDelClub({ almacen }: { almacen: Almacen }) {
  const v = useSeleccion(almacen, seleccionarReglas, porFirma);
  return (
    <Seccion id="club-config-reglas" titulo="Reglas y precios" bajada="Cambian en vivo lo que ve recepción: seña, tolerancia, faltas, precios por hora, el fondo de caja y quién firma la caja.">
      {puestoDeDuenio(almacen) ? <FormularioReglas key={v.firma} v={v} almacen={almacen} /> : <SoloEnElPuestoDelDuenio que="Las reglas, los precios, el fondo de caja y quién firma la caja" />}
    </Seccion>
  );
}

// ───────────── horarios por día ─────────────

interface VistaHorarios {
  dias: { dia: number; abre: number; cierra: number }[];
  paso: number;
  firma: string;
}
function seleccionarHorarios(e: EstadoClub): VistaHorarios {
  const dias = DIAS_DE_LA_SEMANA.map((dia) => ({ dia, abre: e.config.horarios[dia]?.abre ?? e.config.apertura, cierra: e.config.horarios[dia]?.cierra ?? e.config.cierre }));
  return { dias, paso: e.config.paso, firma: JSON.stringify([dias, e.config.paso]) };
}

function FormularioHorarios({ v, almacen }: { v: VistaHorarios; almacen: Almacen }) {
  const hacer = useHacerConfig(almacen);
  const [dias, setDias] = useState(v.dias);
  const id = useId();
  const abre = opcionesDeHora(ABRE_DESDE, ABRE_HASTA, v.paso);
  const cierra = opcionesDeHora(CIERRA_DESDE, CIERRA_HASTA, v.paso);
  const poner = (dia: number, campo: "abre" | "cierra", valor: number) => setDias(dias.map((d) => (d.dia === dia ? { ...d, [campo]: valor } : d)));
  return (
    <form
      aria-label="Horario por día"
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        hacer({ tipo: "horarios", dias });
      }}
    >
      <div className="grid grid-cols-[minmax(0,6rem)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 text-sm">
        <span className="font-medium text-strong">Día</span>
        <span className="font-medium text-strong">Abre</span>
        <span className="font-medium text-strong">Cierra</span>
        {dias.map((d) => (
          <div key={d.dia} className="contents">
            <span id={`${id}-${d.dia}`} className="text-strong">
              {nombreDelDia(d.dia)}
            </span>
            <Select aria-label={`Abre los ${nombreDelDia(d.dia).toLowerCase()}`} value={d.abre} onChange={(e) => poner(d.dia, "abre", Number(e.target.value))}>
              {abre.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.etiqueta}
                </option>
              ))}
            </Select>
            <Select aria-label={`Cierra los ${nombreDelDia(d.dia).toLowerCase()}`} value={d.cierra} onChange={(e) => poner(d.dia, "cierra", Number(e.target.value))}>
              {cierra.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.etiqueta}
                </option>
              ))}
            </Select>
          </div>
        ))}
      </div>
      <p className="text-sm text-body">«(+1)» es la madrugada del día siguiente: se cierra hasta las 02:00. Si un turno ya reservado queda afuera, el aviso lo dice.</p>
      <Button type="submit" variant="solid" size="md" className="self-start max-sm:h-auto max-sm:min-h-11 max-sm:w-full max-sm:py-2 max-sm:whitespace-normal">
        Guardar horarios
      </Button>
    </form>
  );
}

export function HorariosDelClub({ almacen }: { almacen: Almacen }) {
  const v = useSeleccion(almacen, seleccionarHorarios, porFirma);
  return (
    <Seccion id="club-config-horarios" titulo="Horario por día">
      <FormularioHorarios key={v.firma} v={v} almacen={almacen} />
    </Seccion>
  );
}

// ───────────── link para clientes ─────────────

const elTexto = (_: string | undefined, nuevo: string) => nuevo;

export function LinkParaClientes({ almacen }: { almacen: Almacen }) {
  const [origen] = useState(() => (typeof window !== "undefined" ? window.location.origin : ""));
  const seleccionar = useCallback((e: EstadoClub) => linkParaClientes(e, origen), [origen]);
  const link = useSeleccion(almacen, seleccionar, elTexto);
  const id = useId();
  const [copiado, setCopiado] = useState("");
  const copiar = () => {
    const listo = () => setCopiado("Link copiado. Pegalo en WhatsApp o en tus redes.");
    const aMano = () => {
      (document.getElementById(id) as HTMLInputElement | null)?.select();
      setCopiado("No se pudo copiar solo: quedó seleccionado, copialo a mano.");
    };
    if (!navigator.clipboard) return aMano();
    navigator.clipboard.writeText(link).then(listo, aMano);
  };
  return (
    <Seccion
      id="club-config-link"
      titulo="Link para clientes"
      bajada="Con este link el cliente ve los horarios, los precios y la tienda, y te pide el turno o el encargo por WhatsApp. Lo cargás acá. Si cambian los precios o los productos, copialo de nuevo."
    >
      <div className="flex flex-col gap-1">
        <label htmlFor={id} className="text-sm font-medium text-strong">
          Link del turnero para mandar a los clientes
        </label>
        <input id={id} readOnly value={link} className="h-11 w-full min-w-0 rounded-md border border-line-strong bg-surface px-3 text-sm text-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus" onFocus={(e) => e.target.select()} />
      </div>
      <Button variant="solid" size="md" className="self-start max-sm:h-auto max-sm:min-h-11 max-sm:w-full max-sm:py-2 max-sm:whitespace-normal" onClick={copiar}>
        Copiar link para clientes
      </Button>
      <p role="status" className={`text-sm text-body ${sinDesborde}`}>
        {copiado}
      </p>
      <p className="text-sm text-body">Lleva el WhatsApp del club que cargaste arriba. El link abre el turnero de esta misma dirección: copialo desde la dirección del club.</p>
    </Seccion>
  );
}
