"use client";

// ============================================================================
// TIENDA — los pedidos que encargan los jugadores para retirar y pagar en el club.
// ============================================================================
//
// Solapa de fábrica de la recepción (ClubDemo.tsx, en su propio chunk como las otras). Es «Pedidos de la tienda
// para retirar» del club vanilla:
//   · cargar un pedido pegando el mensaje de WhatsApp que mandó el cliente (con su código T-XXXX);
//   · cada pedido para retirar con lo que lleva y cuatro salidas: entregar cobrando (elige el medio), pasarlo a la
//     cuenta de cargos de un cliente, avisarle por WhatsApp que está listo, o cancelarlo;
//   · abajo, los últimos resueltos y cómo terminaron.
// Las reglas (stock, caja, cuentas) son del motor; qué se deshace, de `SE_DESHACE_TIENDA` (tienda-core.ts).
// Lo que se despliega en una tarjeta es uno a la vez. Nada se anima.

import { memo, useCallback, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Field";
import { Marca } from "@/components/ui/Marca";
import { pesos } from "@/lib/club/motor.mjs";
import type { EstadoClub } from "@/lib/club/motor.mjs";
import type { Almacen } from "./almacen";
import type { MedioCaja } from "./cuenta-core";
import { ComoPaga } from "./piezas";
import { SE_DESHACE_TIENDA, armarTienda, ejecutarTienda, fichasParaElPedido, mensajeDeEjemplo, type AccionTienda, type VistaPedido } from "./tienda-core";
import { porFirma, useSeleccion } from "./usar-almacen";
import { BotonWhatsApp } from "./WhatsAppDelClub";

type Abierto = { id: string; modo: "entregar" | "cuenta" } | null;

// El modo no cambia en la vida del almacén (demo o jornada real): un selector por modo, estable entre renders.
const seleccionarTiendaDemo = (e: EstadoClub) => armarTienda(e, "demo");
const seleccionarTiendaReal = (e: EstadoClub) => armarTienda(e, "real");

function CargarDeWhatsApp({ almacen, hacer }: { almacen: Almacen; hacer: (a: AccionTienda) => boolean }) {
  const [texto, setTexto] = useState("");
  const id = useId();
  const ayuda = useId();
  return (
    <section aria-labelledby={`${id}-t`} className="flex flex-col gap-2 rounded-lg border border-line bg-surface-raised p-4">
      <h2 id={`${id}-t`} className="font-semibold text-strong">
        Cargar un pedido de WhatsApp
      </h2>
      <form
        className="flex flex-col gap-2"
        onSubmit={(ev) => {
          ev.preventDefault();
          if (hacer({ tipo: "pegar", texto })) setTexto("");
        }}
      >
        <label htmlFor={id} className="text-sm font-medium text-strong">
          Mensaje del cliente
        </label>
        <Textarea id={id} rows={4} value={texto} onChange={(e) => setTexto(e.target.value)} aria-describedby={ayuda} />
        <p id={ayuda} className="text-xs text-muted">
          Pegalo entero, como llegó: empieza con «Hola Break Point Pádel, quiero encargar…» y trae el código del pedido.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="solid" size="md">
            Cargar el pedido
          </Button>
          {almacen.modo() === "demo" && (
            <Button
              type="button"
              variant="ghost"
              size="md"
              onClick={() => {
                // Sólo en la demo: un mensaje como el de la tienda, armado sobre una copia (no carga nada).
                const m = mensajeDeEjemplo(almacen.copia(), almacen.ahora());
                if (m) setTexto(m);
                else almacen.informar({ ok: false, mensaje: "No hay productos en la tienda para armar un ejemplo." });
              }}
            >
              Pegar un mensaje de ejemplo
            </Button>
          )}
        </div>
      </form>
    </section>
  );
}

function ACuentaDe({ almacen, pedido, hacer, onVolver }: { almacen: Almacen; pedido: VistaPedido; hacer: (a: AccionTienda) => boolean; onVolver: () => void }) {
  const [busca, setBusca] = useState("");
  const id = useId();
  const fichas = fichasParaElPedido(almacen.estado(), busca);
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3">
      <label htmlFor={id} className="text-sm font-medium text-strong">
        ¿A la cuenta de quién? Buscá por nombre o celular
      </label>
      <Input id={id} value={busca} autoComplete="off" autoFocus onChange={(e) => setBusca(e.target.value)} />
      {fichas.length === 0 ? (
        <p className="text-sm text-muted">Sin resultados.</p>
      ) : (
        <ul aria-label="Fichas de clientes" className="grid grid-cols-1 gap-1">
          {fichas.map((f) => (
            <li key={f.id}>
              <Button type="button" variant="ghost" size="md" className="w-full justify-between!" onClick={() => hacer({ tipo: "aCuenta", pedidoId: pedido.id, clienteId: f.id })}>
                <span className="truncate">{f.nombre}</span>
                <span className="text-xs text-muted">{f.detalle}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted">Queda en su cuenta de cargos (se cobra con lo demás, o pasa a su cuenta corriente): no entra a la caja.</p>
      <div>
        <Button variant="ghost" size="md" onClick={onVolver}>
          Volver
        </Button>
      </div>
    </div>
  );
}

function Entregar({ pedido, hacer, onVolver }: { pedido: VistaPedido; hacer: (a: AccionTienda) => boolean; onVolver: () => void }) {
  const [medio, setMedio] = useState<MedioCaja>("efectivo");
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3">
      <ComoPaga medio={medio} onElegir={(m) => setMedio(m as MedioCaja)} />
      <p className="text-xs text-muted">Se cobra al precio de hoy y se descuenta del stock.</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="solid" size="md" onClick={() => hacer({ tipo: "entregar", pedidoId: pedido.id, medio })}>
          Cobrar y entregar {pesos(pedido.total)}
        </Button>
        <Button variant="ghost" size="md" onClick={onVolver}>
          Volver
        </Button>
      </div>
    </div>
  );
}

const TarjetaDePedido = memo(function TarjetaDePedido({
  pedido,
  abierto,
  onAbrir,
  almacen,
  hacer,
}: {
  pedido: VistaPedido;
  abierto: "entregar" | "cuenta" | null;
  onAbrir: (a: Abierto) => void;
  almacen: Almacen;
  hacer: (a: AccionTienda) => boolean;
}) {
  const titulo = useId();
  const volver = () => onAbrir(null);
  return (
    <li aria-labelledby={titulo} className="flex flex-col gap-2 rounded-lg border border-line bg-surface-raised p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id={titulo} className="font-semibold text-strong">
          {pedido.codigo} · {pedido.nombre}
        </h3>
        <span className="font-semibold tabular-nums text-strong">{pesos(pedido.total)}</span>
      </div>
      <p className="text-xs text-muted">{[pedido.tel, pedido.cuando ? `encargado ${pedido.cuando}` : null].filter(Boolean).join(" · ")}</p>
      <ul className="text-sm text-body">
        {pedido.lineas.map((l, i) => (
          <li key={i} className="flex justify-between gap-2 tabular-nums">
            <span>{l.texto}</span>
            <span>{pesos(l.importe)}</span>
          </li>
        ))}
      </ul>
      {abierto === "entregar" ? (
        <Entregar pedido={pedido} hacer={hacer} onVolver={volver} />
      ) : abierto === "cuenta" ? (
        <ACuentaDe almacen={almacen} pedido={pedido} hacer={hacer} onVolver={volver} />
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button variant="solid" size="md" onClick={() => onAbrir({ id: pedido.id, modo: "entregar" })}>
            Entregar y cobrar
          </Button>
          <Button variant="outline" size="md" onClick={() => onAbrir({ id: pedido.id, modo: "cuenta" })}>
            A la cuenta de…
          </Button>
          <BotonWhatsApp enlace={pedido.avisoListo} nombreAccesible={`Avisar que está listo por WhatsApp a ${pedido.nombre}`}>
            Avisar que está listo
          </BotonWhatsApp>
          <Button variant="danger" size="md" onClick={() => hacer({ tipo: "cancelar", pedidoId: pedido.id })}>
            Cancelar
          </Button>
        </div>
      )}
    </li>
  );
});

export default function TiendaDelClub({ almacen }: { almacen: Almacen }) {
  const { pendientes, resueltos } = useSeleccion(almacen, almacen.modo() === "real" ? seleccionarTiendaReal : seleccionarTiendaDemo, porFirma);
  const [abierto, setAbierto] = useState<Abierto>(null);
  const titulo = useRef<HTMLHeadingElement>(null);
  const hacer = useCallback(
    (a: AccionTienda) => {
      const d = almacen.ejecutar((e, ahora, auth) => ejecutarTienda(e, a, ahora, auth), { deshacible: SE_DESHACE_TIENDA[a.tipo] });
      if (d.ok) {
        setAbierto(null);
        // La tarjeta resuelta se va: el foco vuelve a la lista (no se pierde en el cuerpo de la página).
        if (a.tipo !== "pegar") requestAnimationFrame(() => titulo.current?.focus());
      }
      return d.ok;
    },
    [almacen],
  );
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <section aria-labelledby="club-tienda-pendientes" className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="club-tienda-pendientes" ref={titulo} tabIndex={-1} className="text-lg font-semibold text-strong focus-visible:outline-2 focus-visible:outline-focus">
            Pedidos para retirar ({pendientes.length})
          </h2>
          <p className="text-sm text-muted">Se retiran y se pagan en el club. El stock se descuenta al entregar.</p>
        </div>
        {pendientes.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line-strong p-4 text-sm text-muted">
            No hay pedidos para retirar. Cuando un cliente encargue desde la tienda, pegá acá su mensaje de WhatsApp.
          </p>
        ) : (
          <ul role="list" className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {pendientes.map((p) => (
              <TarjetaDePedido key={p.id} pedido={p} abierto={abierto?.id === p.id ? abierto.modo : null} onAbrir={setAbierto} almacen={almacen} hacer={hacer} />
            ))}
          </ul>
        )}
        {resueltos.length > 0 && (
          <details className="rounded-lg border border-line bg-surface-raised p-3">
            <summary className="flex min-h-11 cursor-pointer items-center rounded-md text-sm font-medium text-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">Últimos resueltos ({resueltos.length})</summary>
            <ul className="flex flex-col text-sm">
              {resueltos.map((p) => (
                <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-2 border-t border-line py-2 first:border-t-0">
                  <span className="min-w-0 text-body">
                    {p.codigo} · {p.nombre} · <span className="tabular-nums">{pesos(p.total)}</span>
                  </span>
                  <span className="flex items-baseline gap-2">
                    <Marca tipo={p.marca.tipo}>{p.marca.texto}</Marca>
                    <span className="text-xs text-muted">{p.detalle}</span>
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
      <div className="lg:sticky lg:top-4 lg:self-start">
        <CargarDeWhatsApp almacen={almacen} hacer={hacer} />
      </div>
    </div>
  );
}
