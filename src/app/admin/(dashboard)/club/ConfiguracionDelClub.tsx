"use client";

// ============================================================================
// LA CONFIGURACIÓN DEL CLUB — lo del dueño, en una sola solapa (paridad con la consola y los Ajustes del vanilla).
// ============================================================================
//
// En orden: la jornada (lo guardado, respaldo, restaurar y archivar: lo que se usa cada semana y lo que avisa la
// cinta cuando se llena — lleva acá con `irASolapa("configuracion")`), usuarios y accesos, avisos por WhatsApp, reglas
// y precios, horario por día, el link para clientes y la limpieza para el go-live. Cada sección en su archivo
// (config-*.tsx); las reglas, en configuracion-core.ts.
//
// PRIMERA VEZ (jornada real con `config.configurado === false`, config-arranque.tsx):
//   · sin nadie adentro, ClubDemo muestra SÓLO esta solapa y acá se ve SÓLO «Primera vez: armá el club» (los PIN de
//     los dueños y entrar): nada de la jornada, el archivado ni la limpieza, que operan y no hay quien opere. Como
//     ClubDemo no pinta su barra de avisos en ese caso, se pinta acá;
//   · ya adentro, arriba lo que falta y «Abrir el club»; abajo las secciones de siempre para lo opcional (y la jornada,
//     para restaurar el respaldo del sistema de hoy el día de corte), sin el link para clientes ni la limpieza.
// En la demo nunca aparece (la demo está configurada).
//
// Es solapa `soloDuenos` (solapas-club.ts): esconderla no es seguridad. Lo sensible pide el PIN de quien opera y lo
// vuelve a controlar el motor (o el almacén, en el archivado y al restaurar). Ese PIN cuenta en EL tope del equipo (el
// del bloqueo, por `negocio`): trabado no corre, malo suma y sólo un acierto de un dueño lo vuelve a cero. Nada se anima: es una pantalla de trabajo.

import type { EstadoClub } from "@/lib/club/motor.mjs";
import type { PropsDeSolapa } from "./solapas-club";
import { PrimeraVez } from "./config-arranque";
import { JornadaDelClub, SoloEnElPuestoDelDuenio, puestoDeDuenio } from "./config-jornada";
import { Seccion } from "./config-piezas";
import { LimpiezaGoLive } from "./config-golive";
import { AvisosPorWhatsApp, HorariosDelClub, LinkParaClientes, ReglasDelClub } from "./config-reglas";
import { UsuariosDelClub } from "./config-usuarios";
import { AvisosDelClub } from "./piezas";
import { useOperador, useSeleccion } from "./usar-almacen";

const sinConfigurar = (e: EstadoClub) => e.config.configurado === false;
const elNuevo = (_: boolean | undefined, nuevo: boolean) => nuevo;

export default function ConfiguracionDelClub({ almacen, irASolapa, negocio }: PropsDeSolapa) {
  const operador = useOperador(almacen);
  const demo = almacen.modo() === "demo";
  const primeraVez = useSeleccion(almacen, sinConfigurar, elNuevo) && !demo;

  if (primeraVez && !operador) {
    return (
      <div className="flex max-w-4xl min-w-0 flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 data-pantalla className="text-lg font-semibold text-strong">Configuración</h2>
          <p className="text-sm text-body">El club todavía no está configurado en este equipo: falta la configuración inicial.</p>
        </div>
        <PrimeraVez almacen={almacen} negocio={negocio} />
        <AvisosDelClub almacen={almacen} />
      </div>
    );
  }

  return (
    <div className="flex max-w-4xl min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 data-pantalla className="text-lg font-semibold text-strong">Configuración</h2>
        <p className="text-sm text-body">
          {primeraVez
            ? "Lo del dueño: quién entra, avisos, reglas, precios y horarios. Si venís del sistema de hoy, restaurá su respaldo en «Jornada»."
            : "Lo del dueño: respaldo y archivado, quién entra, avisos, reglas, precios, horarios y el link para los clientes."}
        </p>
        {!operador && <p className="text-sm font-semibold text-strong">Todavía no entró nadie a operar: para cambiar algo, entrá con tu PIN.</p>}
        {demo && operador?.auth.pin && (
          <p className="text-sm text-body">
            En la demo operás como {operador.usuario.nombre}: tu PIN de ejemplo es <strong className="tabular-nums text-strong">{operador.auth.pin}</strong>.
          </p>
        )}
      </div>
      {primeraVez && <PrimeraVez almacen={almacen} negocio={negocio} />}
      <JornadaDelClub almacen={almacen} negocio={negocio} />
      <UsuariosDelClub almacen={almacen} irASolapa={irASolapa} negocio={negocio} />
      <AvisosPorWhatsApp almacen={almacen} />
      <ReglasDelClub almacen={almacen} />
      <HorariosDelClub almacen={almacen} />
      {!primeraVez && <LinkParaClientes almacen={almacen} />}
      {!primeraVez &&
        (puestoDeDuenio(almacen) ? (
          <LimpiezaGoLive almacen={almacen} negocio={negocio} />
        ) : (
          <Seccion id="club-config-golive" titulo="Limpieza para el go-live">
            <SoloEnElPuestoDelDuenio que="La limpieza para el go-live" />
          </Seccion>
        ))}
    </div>
  );
}
