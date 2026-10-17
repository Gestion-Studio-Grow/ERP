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
// Es solapa `soloDuenos` (solapas-club.ts): esconderla no es seguridad. Lo sensible pide el PIN de quien opera y lo
// vuelve a controlar el motor (o el almacén, en el archivado). Nada se anima: es una pantalla de trabajo.

import type { PropsDeSolapa } from "./solapas-club";
import { JornadaDelClub } from "./config-jornada";
import { LimpiezaGoLive } from "./config-golive";
import { AvisosPorWhatsApp, HorariosDelClub, LinkParaClientes, ReglasDelClub } from "./config-reglas";
import { UsuariosDelClub } from "./config-usuarios";
import { useOperador } from "./usar-almacen";

export default function ConfiguracionDelClub({ almacen, irASolapa }: PropsDeSolapa) {
  const operador = useOperador(almacen);
  const demo = almacen.modo() === "demo";
  return (
    <div className="flex max-w-4xl min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-strong">Configuración</h2>
        <p className="text-sm text-body">Lo del dueño: respaldo y archivado, quién entra, avisos, reglas, precios, horarios y el link para los clientes.</p>
        {!operador && <p className="text-sm font-semibold text-strong">Todavía no entró nadie a operar: para cambiar algo, entrá con tu PIN.</p>}
        {demo && operador?.auth.pin && (
          <p className="text-sm text-body">
            En la demo operás como {operador.usuario.nombre}: tu PIN de ejemplo es <strong className="tabular-nums text-strong">{operador.auth.pin}</strong>.
          </p>
        )}
      </div>
      <JornadaDelClub almacen={almacen} />
      <UsuariosDelClub almacen={almacen} irASolapa={irASolapa} />
      <AvisosPorWhatsApp almacen={almacen} />
      <ReglasDelClub almacen={almacen} />
      <HorariosDelClub almacen={almacen} />
      <LinkParaClientes almacen={almacen} />
      <LimpiezaGoLive almacen={almacen} />
    </div>
  );
}
