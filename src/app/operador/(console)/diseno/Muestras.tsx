// ============================================================================
// LAS PIEZAS DE «RENGLÓN» EN SUS ESTADOS — lo que no necesita tocarse (servidor).
// ============================================================================
//
// Una isla por modo (claro / oscuro) con el acento del negocio elegido. Cada bloque dice qué pieza
// es y de dónde se importa. Los datos de ejemplo son del laboratorio (datos-de-muestra.ts).

import {
  Atajos,
  Bloque,
  Button,
  Chip,
  EmptyState,
  Field,
  Franja,
  Icono,
  Input,
  LineaDeEstado,
  Marca,
  Plata,
  Renglon,
  RielDeEstados,
  Rotulo,
  Seccion,
  Segmented,
  Switch,
} from "@/components/ui";
import { PEDIDOS_DEL_LABORATORIO } from "./datos-de-muestra";

/** El marco de cada muestra de la vitrina (no es una pieza del sistema: la pieza es `Seccion` de ui). */
function Muestra({ titulo, pieza, children }: { titulo: string; pieza: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 first:mt-0">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-line-strong pb-2">
        <h2 className="text-[15px] font-semibold text-strong">{titulo}</h2>
        <code className="text-[12px] text-muted">{pieza}</code>
      </div>
      {children}
    </section>
  );
}

const ROLES = [
  ["--lienzo", "Lienzo · el fondo"],
  ["--hoja", "Hoja · filas, campos, lo que flota"],
  ["--hundido", "Hundido · cabeceras de tabla, chips"],
  ["--linea", "Línea · la raya de 1 px"],
  ["--linea-2", "Línea fuerte · total, foco de fila"],
  ["--tinta", "Tinta · 7:1"],
  ["--tinta-2", "Tinta 2 · secundario"],
  ["--accent", "Acento · la tecla, el foco, lo elegido"],
] as const;

export function Muestras({ sufijo }: { sufijo: string }) {
  const [p478, p473, p472] = [PEDIDOS_DEL_LABORATORIO[3], PEDIDOS_DEL_LABORATORIO[4], PEDIDOS_DEL_LABORATORIO[5]];
  return (
    <div>
      <Muestra titulo="La letra: Archivo, una familia con dos anchos" pieza="src/design/fuentes.ts">
        <div className="space-y-3">
          <Rotulo>Rótulo · versales condensadas</Rotulo>
          <p className="text-[22px] font-bold text-strong [font-stretch:90%]">Pedidos para preparar</p>
          <p className="text-sm text-body">Texto de lectura: lo que se escribe para que se entienda a la primera, sin párrafos de más.</p>
          <p className="text-[13px] text-muted [font-stretch:85%] tabular-nums">#478 · 20:09 · folio condensado</p>
          <p className="flex flex-wrap items-baseline gap-4">
            <Plata valor={36608} /> <Plata valor={-13153.5} /> <Plata valor={234800} sinCentavos />
          </p>
        </div>
      </Muestra>

      <Muestra titulo="El color por rol (el gris toma el matiz del negocio)" pieza="src/design/tokens.ts">
        <ul className="grid gap-1 sm:grid-cols-2">
          {ROLES.map(([v, que]) => (
            <li key={v} className="flex min-h-9 items-center gap-3 border-b border-line text-[13px]">
              <span aria-hidden className="size-6 shrink-0 rounded border border-line-strong" style={{ background: `var(${v})` }} />
              <code className="text-muted">{v}</code>
              <span className="text-body">{que}</span>
            </li>
          ))}
        </ul>
      </Muestra>

      <Muestra titulo="Teclas: cuatro pesos, sin sombra" pieza="Button">
        <div className="flex flex-wrap items-center gap-2">
          <Button icono={<Icono nombre="efectivo" />} atajo="F2">
            Cobrar $36.608
          </Button>
          <Button variant="outline">Preparar</Button>
          <Button variant="ghost">Ver el detalle</Button>
          <Button variant="danger">Anular…</Button>
          <Button variant="danger" estado="confirmar">
            Tocá de nuevo para anular
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap items-start gap-2">
          <Button estado="cargando">Cobrando…</Button>
          <Button estado="listo">Cobrar</Button>
          <Button estado="error" motivo="Sin señal: probá de nuevo">
            Cobrar
          </Button>
          <Button disabled>Elegí cómo pagó</Button>
        </div>
      </Muestra>

      <Muestra titulo="Campos, selección y filtros" pieza="Field · Input · Segmented · Chip · Switch">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Cliente" htmlFor={`m-cliente-${sufijo}`} hint="Nombre o teléfono">
            <Input id={`m-cliente-${sufijo}`} defaultValue="Catalina Rodríguez" />
          </Field>
          <Field label="Pagó con" htmlFor={`m-plata-${sufijo}`} error="Faltan $2.500">
            <Input id={`m-plata-${sufijo}`} importe inputMode="decimal" defaultValue="45.446" aria-invalid />
          </Field>
        </div>
        <div className="mt-4 space-y-3">
          <Segmented
            name={`medio-${sufijo}`}
            leyenda="Cómo pagó"
            defaultValue="efectivo"
            opciones={[
              { valor: "efectivo", etiqueta: "Efectivo" },
              { valor: "mp", etiqueta: "Mercado Pago" },
              { valor: "transferencia", etiqueta: "Transferencia" },
            ]}
          />
          <div className="flex flex-wrap gap-2">
            <Chip prendido conteo={10}>
              Abiertos
            </Chip>
            <Chip conteo={7}>Pendientes</Chip>
            <Chip conteo={1}>Entregados sin cobrar</Chip>
          </div>
          <Switch etiqueta="Avisar por WhatsApp al preparar" detalle="Se abre el mensaje armado; lo mandás vos." defaultChecked />
        </div>
      </Muestra>

      <Muestra titulo="Marcas de estado: forma + palabra" pieza="Marca · RielDeEstados">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Marca tipo="hecho">Cobrado</Marca>
          <Marca tipo="pendiente">Pendiente</Marca>
          <Marca tipo="medias">Preparado</Marca>
          <Marca tipo="atencion">Entregado, sin cobrar</Marca>
          <Marca tipo="anulado">Anulado</Marca>
          <span className="inline-flex items-center gap-2">
            <RielDeEstados pasos={["Pendiente", "Preparado", "Avisado", "Entregado", "Cobrado"]} hechos={2} />
            <Marca tipo="medias">Preparado</Marca>
          </span>
        </div>
      </Muestra>

      <Muestra titulo="El renglón y el bloque (datos del laboratorio, MAGRA 24/09)" pieza="Renglon · Bloque · Seccion · LineaDeEstado">
        <LineaDeEstado datos={[<strong key="c">Caja cerrada</strong>, "11 pedidos abiertos", "agosto sin cerrar"]} />
        <Bloque titulo="Para atender hoy" cuenta={3} nota="Cada cosa se va cuando la resolvés" className="mt-4">
          <Renglon
            folio={`#${p478.code} · ${p478.cuando.slice(6)}`}
            titulo={p478.cliente}
            detalle={`${p478.lineas} líneas · mostrador · confirmado, sin cobrar`}
            plata={<Plata valor={p478.total} />}
            tecla={<Button size="sm">Cobrar</Button>}
          />
          <Renglon
            folio={`#${p473.code} · ${p473.cuando.slice(6)}`}
            titulo={p473.cliente}
            detalle={`${p473.lineas} líneas · retira`}
            plata={<Plata valor={p473.total} />}
            tecla={<Button size="sm" variant="outline">Preparar</Button>}
          />
          <Renglon
            folio={`#${p472.code} · ayer`}
            titulo={p472.cliente}
            detalle={`${p472.lineas} líneas · envío`}
            plata={<Plata valor={p472.total} />}
            tecla={<Button size="sm" variant="outline">Preparar</Button>}
          />
        </Bloque>
        <Seccion titulo="Lo que llegó" nota="2 renglones" className="mt-6">
          <Renglon titulo="Vacío envasado" detalle="12,4 kg · del remito 0003-00012877" />
          <Renglon titulo="Bondiola" detalle="6,1 kg · del remito 0003-00012877" />
        </Seccion>
      </Muestra>

      <Muestra titulo="La cifra grande, en cqi del contenedor (nunca en vw)" pieza="Plata tamano=grande">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded border border-line p-3 [container-type:inline-size]">
            <Rotulo>Total a cobrar</Rotulo>
            <Plata valor={35149} tamano="grande" sinCentavos />
          </div>
          <div className="w-44 rounded border border-line p-3 [container-type:inline-size]">
            <Rotulo>Caja angosta · 7 cifras</Rotulo>
            <Plata valor={28011630} tamano="grande" sinCentavos />
          </div>
        </div>
      </Muestra>

      <Muestra titulo="Franjas (fijas arriba, no flotan)" pieza="Franja">
        <div className="space-y-2">
          <Franja>Modo prueba de ARCA: lo que emitas no es una factura válida.</Franja>
          <Franja tono="atencion">Sin señal. Lo que ves puede no estar al día hasta que vuelva.</Franja>
          <Franja tono="peligro">El día 23/09 quedó sin cerrar.</Franja>
        </div>
      </Muestra>

      <Muestra titulo="Vacío y carga: una frase, y el esqueleto con la forma real" pieza="EmptyState · esqueleto">
        <EmptyState title="No hay pedidos abiertos." description="Los de la tienda y los que tomes por teléfono aparecen acá." />
        <div className="mt-3 space-y-2" aria-hidden>
          <div data-ui="esqueleto" className="h-4 w-2/3 rounded bg-surface-sunken" />
          <div data-ui="esqueleto" className="h-4 w-1/2 rounded bg-surface-sunken" />
        </div>
      </Muestra>

      <Muestra titulo="Atajos a la vista (sólo en la PC)" pieza="Atajos">
        <Atajos
          atajos={[
            { teclas: ["/"], que: "buscar" },
            { teclas: ["F2"], que: "cobrar" },
            { teclas: ["↑", "↓"], que: "mover" },
            { teclas: ["x"], que: "seleccionar" },
          ]}
        />
      </Muestra>
    </div>
  );
}
