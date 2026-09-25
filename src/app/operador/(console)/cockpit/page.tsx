// TABLERO DE LA PLATAFORMA (consola GSG, ADR-021). Sólo lectura: ¿anda todo?, en una mirada.
//
// La idea viene del tablero eléctrico: cada servicio es una llave. Arriba = anda en real, al
// medio = en prueba, abajo = apagado o caído. Todo lo demás es renglón callado: la base, los
// negocios vistos desde la plataforma y las notas que se escriben a mano en el código, que se
// muestran como tales y nunca como estado vivo (src/lib/cockpit/plan.ts no se actualiza solo).
//
// Qué NO repite: el «listo para abrir» por negocio vive en Negocios (bandeja «Para atender»); acá
// sólo va la cuenta y el camino. Las palabras salen de tablero-core.ts (puro, con tests).
//
// Reversibilidad: la ruta es aditiva; el enlace del menú está detrás de COCKPIT_ENABLED. Los datos
// se refrescan por sondeo suave (AutoRefresh) y la medición de la base está en pausa por defecto.

import Link from "next/link";
import { cargarCockpit } from "@/lib/cockpit/datos";
import { ANOTADO_EL } from "@/lib/cockpit/plan";
import { modoDesdeEnv } from "@/plugins/arca";
import { modoCobrosDesdeEnv } from "@/lib/mercadopago-cobros-dispatch";
import { Bloque, LineaDeEstado, Marca, Renglon, atributosBoton } from "@/components/ui";
import { cargarAperturas } from "../aperturas.server";
import AutoRefresh from "./AutoRefresh";
import {
  MARCA_DE_TAREA,
  estadoGeneral,
  lecturaDeBase,
  llavesDeServicios,
  notasAMano,
  resumenDeNegocios,
  type Llave,
} from "./tablero-core";

export const dynamic = "force-dynamic";

function horaCriolla(iso: string): string {
  try {
    return new Intl.DateTimeFormat("es-AR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZone: "America/Argentina/Buenos_Aires",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

const REFERENCIA = "Arriba: en real · al medio: en prueba · abajo: apagado o caído";

// La perilla de la llave: el color acompaña, la palabra de abajo es la que manda.
const PERILLA: Record<Llave["posicion"], string> = {
  arriba: "top-0.5 bg-success",
  medio: "top-1/2 -translate-y-1/2 bg-warning",
  abajo: "bottom-0.5 bg-danger",
};

function LlaveDelTablero({ llave }: { llave: Llave }) {
  return (
    <li className="flex flex-col items-center gap-1.5 px-1 py-3 text-center">
      <span
        aria-hidden
        className="relative block h-12 w-7 rounded-[3px] border-2 border-line-strong bg-surface-sunken"
      >
        <span className={`absolute inset-x-0.5 h-4 rounded-[2px] ${PERILLA[llave.posicion]}`} />
      </span>
      <span className="text-[13px] font-semibold leading-tight text-strong">{llave.nombre}</span>
      <span
        className={`text-[12px] leading-tight ${
          llave.caida ? "font-semibold text-danger" : llave.paraMirar ? "text-warning" : "text-muted"
        }`}
      >
        {llave.estado}
      </span>
    </li>
  );
}

export default async function TableroPage() {
  const [d, aperturas] = await Promise.all([cargarCockpit(), cargarAperturas()]);

  const llaves = llavesDeServicios(d.componentes, { arca: modoDesdeEnv(), cobros: modoCobrosDesdeEnv() });
  const base = lecturaDeBase(d.neon);
  const general = estadoGeneral(llaves, base);
  const negocios = resumenDeNegocios(d.tenants);
  const conPendientes = aperturas.filter((a) => !a.listo).length;
  const notas = notasAMano(d.alertas);
  const enReal = llaves.filter((l) => l.posicion === "arriba").length;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-strong">Tablero de la plataforma</h1>
        <LineaDeEstado
          datos={[
            <Marca key="g" tipo={general.tipo}>
              {general.frase}
            </Marca>,
            general.paraMirar.length > 0 ? `para mirar: ${general.paraMirar.join(", ")}` : null,
            `leído a las ${horaCriolla(d.ts)}`,
            <AutoRefresh key="r" seconds={30} />,
          ]}
        />
        <p className="mt-2 max-w-prose text-[13px] text-muted">
          Sólo lectura: muestra cómo está la plataforma, no datos de los clientes, y no cambia nada.
          Publicar, aplicar cambios a la base y cambiar claves siguen siendo decisión tuya.
        </p>
      </header>

      <Bloque
        id="servicios"
        titulo="Servicios"
        cuenta={`${enReal} de ${llaves.length} andando en real`}
        nota={<span className="hidden lg:inline">{REFERENCIA}</span>}
      >
        <ul className="grid grid-cols-3 border-b border-line sm:grid-cols-6" aria-label="Llaves de la plataforma">
          {llaves.map((l) => (
            <LlaveDelTablero key={l.id} llave={l} />
          ))}
        </ul>
        <p className="py-2 text-[12px] text-muted lg:hidden">{REFERENCIA}</p>
        <div>
          {llaves.map((l) => (
            <Renglon
              key={l.id}
              folio={<Marca tipo={l.caida ? "anulado" : l.paraMirar ? "atencion" : "hecho"}>{l.estado}</Marca>}
              titulo={l.nombre}
              detalle={l.dice}
            />
          ))}
        </div>
      </Bloque>

      <Bloque id="base" titulo="Base de datos" cuenta={<Marca tipo={base.tipo}>{base.estado}</Marca>}>
        <p className="py-3 text-[14px] text-body">{base.dice}</p>
        {base.numeros && (
          <dl className="grid grid-cols-1 border-t border-line sm:grid-cols-3">
            {base.numeros.map((n) => (
              <div
                key={n.que}
                className="flex items-baseline justify-between gap-3 border-b border-line py-2 sm:block sm:border-b-0"
              >
                <dt className="text-[13px] text-muted">{n.que}</dt>
                <dd className="font-mono text-[18px] tabular-nums text-strong">{n.valor}</dd>
              </div>
            ))}
          </dl>
        )}
      </Bloque>

      <Bloque
        id="negocios"
        titulo="Negocios"
        cuenta={negocios.total}
        nota={
          <Link href="/operador" className="inline-flex min-h-11 items-center text-accent underline-offset-2 hover:underline">
            Ver la lista
          </Link>
        }
      >
        <LineaDeEstado
          className="py-2"
          datos={[
            `${negocios.produccion} en producción`,
            `${negocios.prueba} en prueba`,
            negocios.suspendidos > 0 ? `${negocios.suspendidos} suspendidos` : null,
          ]}
        />
        <div>
          {negocios.conProblema.map((p) => (
            <Renglon
              key={p.id}
              folio={<Marca tipo="atencion">Para mirar</Marca>}
              titulo={p.nombre}
              detalle={p.que}
              tecla={
                <Link
                  href={`/operador/tenants/${p.id}`}
                  {...atributosBoton("outline", "sm")}
                  className="inline-flex items-center whitespace-nowrap"
                >
                  Abrir ficha<span className="sr-only"> de {p.nombre}</span>
                </Link>
              }
            />
          ))}
          <Renglon
            folio={
              <Marca tipo={conPendientes > 0 ? "pendiente" : "hecho"}>
                {conPendientes > 0 ? `${conPendientes} de ${aperturas.length}` : "Todos"}
              </Marca>
            }
            titulo={conPendientes > 0 ? "Con pendientes para abrir" : "Listos para abrir"}
            detalle="Lo que le falta a cada uno sale de sus datos reales: precios, contacto, facturación, link y personas."
            tecla={
              conPendientes > 0 ? (
                <Link
                  href="/operador?estado=pendientes"
                  {...atributosBoton("outline", "sm")}
                  className="inline-flex items-center whitespace-nowrap"
                >
                  Ver cuáles
                </Link>
              ) : undefined
            }
          />
        </div>
      </Bloque>

      <Bloque id="a-mano" titulo="Anotado a mano" cuenta={notas.length} nota={`Anotado el ${ANOTADO_EL.split("-").reverse().join("/")} · no se actualiza solo`}>
        <p className="py-2 text-[13px] text-muted">
          Estas notas están escritas en el código del sistema, no se leen de ningún lado: pueden estar
          viejas. Antes de actuar, confirmá que siguen pendientes.
        </p>
        <div>
          {notas.map((n) => (
            <Renglon
              key={n.id}
              folio={
                <Marca tipo={n.urgente ? "atencion" : "pendiente"}>
                  {n.urgente ? "Antes de cobrar" : "Pendiente"}
                </Marca>
              }
              titulo={n.titulo}
              detalle={
                <>
                  {n.detalle} <span className="text-strong">Lo hacés vos:</span> {n.queHacesVos}
                </>
              }
            />
          ))}
        </div>
      </Bloque>

      <details className="border-t border-line-strong">
        <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-[15px] font-semibold text-strong">
          Plan de trabajo y quién decide qué
          <span className="text-[13px] font-normal text-muted">· anotado a mano</span>
        </summary>
        <ol className="mt-1">
          {d.plan.map((t) => (
            <Renglon
              as="li"
              key={t.id}
              folio={<Marca tipo={MARCA_DE_TAREA[t.estado].tipo}>{MARCA_DE_TAREA[t.estado].palabra}</Marca>}
              titulo={t.titulo}
            />
          ))}
        </ol>
        <dl className="mt-4 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
          {d.flujo.map((p) => (
            <div key={p.id} className="flex items-baseline gap-3 border-b border-line py-2">
              <dt className="w-32 shrink-0 text-[13px] font-semibold text-strong">{p.actor}</dt>
              <dd className="text-[13px] text-muted">{p.hace}</dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}
