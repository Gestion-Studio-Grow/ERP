// Monitor de monotributo de la cartera (C3): un renglón por cliente monotributista, lo más urgente
// arriba. Por cliente: lo facturado en los últimos 12 meses contra el tope de su categoría y el de
// la siguiente, el semáforo y la próxima recategorización. Sin categoría cargada, pide cargarla
// (nunca asume la A). La cuenta y las reglas viven en src/lib/monotributo-core.ts.

import { Badge, type BadgeTone } from "@/components/ui";
import { Bloque, Renglon } from "@/components/ui/Renglon";
import { Plata } from "@/components/ui/Plata";
import { monitorMonotributoAction } from "@/lib/monotributo-actions";
import type { FilaMonotributo, Semaforo } from "@/lib/monotributo-core";
import CategoriaMonotributo from "./CategoriaMonotributo";

const SEMAFORO: Record<Semaforo, { texto: string; tono: BadgeTone }> = {
  excedido: { texto: "Excedido", tono: "danger" },
  sin_categoria: { texto: "Sin categoría", tono: "warning" },
  cerca: { texto: "Cerca del tope", tono: "warning" },
  bien: { texto: "Bien", tono: "success" },
};

function diaLegible(dia: string): string {
  const [y, m, d] = dia.split("-");
  return `${d}/${m}/${y}`;
}

function Fila({ f }: { f: FilaMonotributo }) {
  const s = SEMAFORO[f.semaforo];
  const porcentaje = f.proporcion != null ? ` · ${Math.round(f.proporcion * 100)} % del tope` : ""; // no-es-plata: porcentaje
  return (
    <Renglon
      as="li"
      folio={
        <Badge tone={s.tono} dot>
          {s.texto}
        </Badge>
      }
      titulo={
        <>
          {f.alias}
          <span className="text-muted"> · {f.categoria ? `Categoría ${f.categoria}` : "sin categoría"}</span>
        </>
      }
      detalle={
        <>
          <span className="block font-medium text-strong">{f.titulo}{porcentaje}</span>
          <span className="block">{f.detalle}</span>
          {f.topePropio != null && (
            <span className="block">
              Tope de la {f.categoria}: <Plata valor={f.topePropio} sinCentavos />
              {f.siguiente ? (
                <>
                  {" "}· tope de la {f.siguiente.letra}: <Plata valor={f.siguiente.tope} sinCentavos />
                </>
              ) : (
                " · es la última categoría"
              )}
            </span>
          )}
          <span className="block">{f.accion}</span>
          {f.alCierre && (
            <span className={`block font-medium ${f.alCierre.cuadroFaltante ? "text-danger" : "text-strong"}`}>
              {f.alCierre.texto}
            </span>
          )}
        </>
      }
      plata={<Plata valor={f.ingresos.ingresos} sinCentavos />}
      tecla={<CategoriaMonotributo clienteTenantId={f.clienteTenantId} alias={f.alias} actual={f.categoria} />}
    />
  );
}

export default async function MonitorMonotributo() {
  const r = await monitorMonotributoAction();
  if (!r.ok) {
    return (
      <Bloque titulo="Monotributo de la cartera" className="mb-xl">
        <p role="alert" className="py-3 text-sm text-danger">
          {r.error}
        </p>
      </Bloque>
    );
  }

  const rec = r.recategorizacion;
  const cuandoRecategoriza = rec.enCurso
    ? `Recategorización de ${rec.mes} en curso: vence el ${diaLegible(rec.vence)} y se mira lo facturado en los 12 meses al ${diaLegible(rec.cierreDelPeriodo)}.`
    : `Próxima recategorización: vence el ${diaLegible(rec.vence)}, con lo facturado en los 12 meses al ${diaLegible(rec.cierreDelPeriodo)}. Si ARCA prorroga, vale la fecha nueva.`;
  const excedidos = r.filas.filter((f) => f.semaforo === "excedido").length;

  return (
    <Bloque
      id="monotributo"
      titulo="Monotributo de la cartera"
      cuenta={
        r.filas.length === 0
          ? undefined
          : `${r.filas.length} ${r.filas.length === 1 ? "cliente" : "clientes"}${excedidos ? ` · ${excedidos} ${excedidos === 1 ? "excedido" : "excedidos"}` : ""}`
      }
      className="mb-xl"
    >
      <div className="space-y-1 py-2 text-[13px] text-muted">
        <p>{cuandoRecategoriza}</p>
        {r.cuadroRecategorizacion && (
          <p>
            ARCA recategoriza con el cuadro de categorías vigente desde el {diaLegible(r.cuadroRecategorizacion.desde)},
            no con el que se va.
            {!r.cuadroRecategorizacion.cargado && (
              <strong className="font-medium text-danger">
                {" "}Ese cuadro todavía no está cargado: no te damos la letra de cada cliente hasta que lo esté.
                Pedíselo a Soporte GSG.
              </strong>
            )}
          </p>
        )}
        <p>
          Cuenta lo facturado desde el sistema en los últimos 12 meses, con CAE, menos las notas de crédito. Lo que
          el cliente facture por afuera no está sumado. La categoría también depende de la superficie, la energía
          eléctrica y los alquileres: eso lo sabés vos.
        </p>
        <p>
          Topes de ingresos brutos vigentes del {diaLegible(r.tabla.vigenciaDesde)} al{" "}
          {diaLegible(r.tabla.vigenciaHasta)}.
          {r.tabla.provisional && (
            <strong className="font-medium text-strong">
              {" "}Provisional a confirmar: cotejalos con el cuadro de categorías de ARCA.
            </strong>
          )}
          {!r.tabla.vigenteHoy && (
            <strong className="font-medium text-danger"> Esta tabla ya no es la vigente: puede estar desactualizada.</strong>
          )}
        </p>
        {r.sinCondicionIva > 0 && (
          <p>
            {r.sinCondicionIva === 1
              ? "1 cliente de la cartera no tiene cargada su condición frente al IVA: si es monotributista, no aparece acá."
              : `${r.sinCondicionIva} clientes de la cartera no tienen cargada su condición frente al IVA: si son monotributistas, no aparecen acá.`}
          </p>
        )}
      </div>
      {r.filas.length === 0 ? (
        <p className="py-3 text-sm text-body">
          No hay clientes monotributistas en tu cartera. Cuando sumes uno con condición «Monotributo», aparece acá con lo
          que lleva facturado.
        </p>
      ) : (
        <ul>
          {r.filas.map((f) => (
            <Fila key={f.clienteTenantId} f={f} />
          ))}
        </ul>
      )}
    </Bloque>
  );
}
