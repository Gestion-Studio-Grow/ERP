"use client";

// ============================================================================
// LAS PIEZAS DE «RENGLÓN» QUE SE TOCAN — la tabla densa, el cajón, el diálogo, la paleta, «Más»,
// el aviso con deshacer, deslizar para confirmar y el teclado de peso.
// ============================================================================
//
// Todo es DEMOSTRACIÓN: nada de acá toca un negocio ni la base. Las filas son pedidos del
// laboratorio (datos-de-muestra.ts). La tabla ordena por la URL de la galería (`?orden=`), como en
// una pantalla de verdad.

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Aviso,
  Button,
  Cajon,
  DeslizarParaConfirmar,
  Dialogo,
  Field,
  Marca,
  MenuMas,
  Plata,
  RielDeEstados,
  TecladoNumerico,
  Textarea,
  ordenDesdeUrl,
} from "@/components/ui";
import { Tabla, type ColumnaTabla } from "@/components/ui/Tabla";
import { PaletaDeComandos } from "@/components/ui/PaletaDeComandos";
import type { Comando } from "@/components/ui/comandos-core";
import { PEDIDOS_DEL_LABORATORIO, type PedidoDeMuestra } from "./datos-de-muestra";

const PASOS = ["Pendiente", "Preparado", "Avisado", "Entregado", "Cobrado"];

/** La tabla densa con selección, lote, orden en la URL y teclado. */
export function TablaViva({ sufijo }: { sufijo: string }) {
  const params = useSearchParams();
  const [aviso, setAviso] = useState<string | null>(null);
  const [preparados, setPreparados] = useState<Set<number>>(() => new Set());
  const [abierto, setAbierto] = useState<PedidoDeMuestra | null>(null);
  const orden = ordenDesdeUrl(params.get("orden"), ["total", "cliente"]);
  const clave = orden?.key;
  const direccion = orden?.direction;
  const filas = useMemo(() => {
    const f = [...PEDIDOS_DEL_LABORATORIO];
    const signo = direccion === "asc" ? 1 : -1;
    if (clave === "total") f.sort((a, b) => (a.total - b.total) * signo);
    if (clave === "cliente") f.sort((a, b) => a.cliente.localeCompare(b.cliente, "es") * signo);
    return f;
  }, [clave, direccion]);

  const preparar = (p: PedidoDeMuestra) => {
    setPreparados((s) => new Set(s).add(p.code));
    setAviso(`#${p.code} marcado como preparado (demostración: no toca ningún pedido).`);
  };

  const columnas: ColumnaTabla<PedidoDeMuestra>[] = [
    { clave: "folio", titulo: "#", movil: "folio", celda: (p) => `#${p.code} · ${p.cuando}` },
    {
      clave: "cliente",
      titulo: "Cliente",
      movil: "asunto",
      ordenable: true,
      celda: (p) => (
        <button type="button" className="min-h-11 text-left font-semibold hover:underline" onClick={() => setAbierto(p)}>
          {p.cliente}
        </button>
      ),
    },
    { clave: "entrega", titulo: "Retiro / envío", celda: (p) => `${p.canal} · ${p.envio ? "envío" : "retira"} · ${p.lineas} líneas` },
    { clave: "total", titulo: "Total", alinear: "derecha", movil: "plata", ordenable: true, celda: (p) => <Plata valor={p.total} /> },
    {
      clave: "estado",
      titulo: "Estado",
      movil: "oculta",
      celda: (p) => {
        const hechos = preparados.has(p.code) ? 2 : 1;
        return (
          <span className="inline-flex items-center gap-2">
            <RielDeEstados pasos={PASOS} hechos={hechos} />
            {preparados.has(p.code) ? (
              <Marca tipo="medias">Preparado</Marca>
            ) : p.estado === "CONFIRMED" ? (
              <Marca tipo="atencion">Confirmado, sin cobrar</Marca>
            ) : (
              <Marca tipo="pendiente">Pendiente</Marca>
            )}
          </span>
        );
      },
    },
    {
      clave: "paso",
      titulo: "Siguiente paso",
      alinear: "derecha",
      movil: "tecla",
      celda: (p) => (
        <span className="inline-flex items-center gap-1">
          <Button size="sm" variant={p.estado === "CONFIRMED" ? "solid" : "outline"} onClick={() => preparar(p)} disabled={preparados.has(p.code)}>
            {p.estado === "CONFIRMED" ? "Cobrar" : "Preparar"}
          </Button>
          <MenuMas etiqueta={`Más acciones del pedido #${p.code}`}>
            <button type="button" onClick={() => setAviso(`Pesar y ajustar #${p.code} (demostración).`)}>
              Pesar y ajustar
            </button>
            <button type="button" data-peligro onClick={() => setAviso(`Anular #${p.code} pide motivo (demostración).`)}>
              Anular…
            </button>
          </MenuMas>
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <Tabla
        titulo={`Pedidos abiertos del laboratorio (${sufijo})`}
        filas={filas}
        clave={(p) => String(p.code)}
        columnas={columnas}
        seleccion
        teclado={sufijo === "claro"}
        lote={(claves, limpiar) => (
          <>
            <Button
              size="sm"
              onClick={() => {
                setPreparados((s) => new Set([...s, ...claves.map(Number)]));
                setAviso(`${claves.length} marcados como preparados (demostración).`);
                limpiar();
              }}
            >
              Marcar preparados
            </Button>
            <Button size="sm" variant="outline" onClick={() => setAviso(`Se abrirían ${claves.length} mensajes de WhatsApp, uno por uno (demostración).`)}>
              Avisar por WhatsApp
            </Button>
          </>
        )}
        teclas={[{ letra: "p", que: "preparar", hacer: preparar, aplica: (p) => !preparados.has(p.code) }]}
        cuenta={`${filas.length} de ${filas.length} abiertos`}
        vacio="No hay pedidos abiertos."
      />
      {aviso && (
        <div className="flex">
          <Aviso mensaje={aviso} tono="info" onTermina={() => setAviso(null)} />
        </div>
      )}
      <Cajon
        abierto={abierto !== null}
        onCerrar={() => setAbierto(null)}
        titulo={abierto ? `Pedido #${abierto.code} · ${abierto.cliente}` : ""}
        descripcion={abierto ? `${abierto.canal} · ${abierto.envio ? "envío" : "retira"} · ${abierto.cuando}` : undefined}
        pie={
          <>
            <Button variant="ghost" onClick={() => setAbierto(null)}>
              Cerrar
            </Button>
            <Button onClick={() => abierto && preparar(abierto)}>Preparar</Button>
          </>
        }
      >
        <p className="text-sm text-body">
          El cajón muestra la ficha al costado sin perder la lista (en el celular sube desde abajo). Total{" "}
          {abierto && <Plata valor={abierto.total} />}.
        </p>
      </Cajon>
    </div>
  );
}

/** El diálogo de lo irreversible: centrado, con motivo y el verbo en el botón. */
export function DialogoVivo() {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  return (
    <div>
      <Button variant="danger" onClick={() => setAbierto(true)}>
        Anular el pedido #478…
      </Button>
      <Dialogo
        abierto={abierto}
        onCerrar={() => setAbierto(false)}
        titulo="Anular el pedido #478"
        descripcion="Parrilla QA La Brasa · $234.800 · confirmado, sin cobrar"
        pie={
          <>
            <Button variant="ghost" onClick={() => setAbierto(false)}>
              Volver
            </Button>
            <Button variant="danger" estado={motivo.trim() ? "confirmar" : undefined} disabled={!motivo.trim()} onClick={() => setAbierto(false)}>
              Anular el pedido #478
            </Button>
          </>
        }
      >
        <Field label="Motivo" htmlFor="dialogo-motivo" hint="Queda en la Auditoría. Demostración: no se anula nada.">
          <Textarea id="dialogo-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </Field>
      </Dialogo>
    </div>
  );
}

const COMANDOS_DE_MUESTRA: Comando[] = [
  { id: "a-vender", grupo: "acciones", nombre: "Vender", segunda: "Vender", href: "/operador/diseno", icono: "vender", alias: ["cobrar"] },
  { id: "a-cerrar", grupo: "acciones", nombre: "Cerrar el día", segunda: "Cierre del día", href: "/operador/diseno", icono: "cierre", alias: ["arqueo"] },
  { id: "a-merma", grupo: "acciones", nombre: "Cargar una merma", segunda: "Mermas", href: "/operador/diseno", icono: "ajustes" },
  { id: "p-caja", grupo: "apps", nombre: "Caja del día", segunda: "Caja", href: "/operador/diseno", icono: "caja" },
  { id: "p-catalogo", grupo: "apps", nombre: "Catálogo", segunda: "Catálogo y precios", href: "/operador/diseno", icono: "catalogo" },
  { id: "p-cajas", grupo: "apps", nombre: "Cajas de los locales", segunda: "Mis locales", href: "/operador/diseno", icono: "cierre" },
];

/** La paleta de Ctrl/⌘K con comandos de muestra (en el panel salen del servidor). */
export function PaletaViva() {
  const [abierta, setAbierta] = useState(false);
  return (
    <div>
      <Button variant="outline" onClick={() => setAbierta(true)}>
        Abrir «¿Qué querés hacer?»
      </Button>
      <PaletaDeComandos abierta={abierta} onCerrar={() => setAbierta(false)} comandos={COMANDOS_DE_MUESTRA} />
    </div>
  );
}

export function DeslizarVivo() {
  const [cerrado, setCerrado] = useState(false);
  return (
    <div className="max-w-md space-y-2">
      <DeslizarParaConfirmar
        texto="Deslizá para cerrar el día"
        etiqueta="Cerrar el día"
        textoHecho="Día cerrado (demostración: no se cerró nada)"
        onConfirmar={() => setCerrado(true)}
      />
      {cerrado && (
        <Button variant="ghost" size="sm" onClick={() => window.location.reload()}>
          Volver a probar
        </Button>
      )}
    </div>
  );
}

export function TecladoVivo() {
  return (
    <TecladoNumerico
      modo="peso"
      etiqueta="Peso de la etiqueta"
      inicial="1280"
      ayuda="Tipeá los números de la etiqueta de la balanza: la coma la ponemos nosotros."
    />
  );
}

export function AvisoQuieto() {
  const [deshecho, setDeshecho] = useState(false);
  return (
    <div className="flex">
      <Aviso
        mensaje={deshecho ? "Volvió Vacío al ticket." : "Se sacó Vacío (1,280 kg) del ticket."}
        tono={deshecho ? "info" : "exito"}
        onDeshacer={deshecho ? undefined : () => setDeshecho(true)}
        duracion={3_600_000}
      />
    </div>
  );
}
