// CIERRE DEL MES — revisar ocho pasos, congelar el mes y bajar el paquete para el contador.
//
// Abre por defecto el mes que toca cerrar (el anterior al mes en curso). Cada paso dice qué
// se encontró, con el número, y si está pendiente, qué hacer y el botón para hacerlo. Las
// reglas viven en src/lib/cierre-mes/cierre-mes.ts (puro, probado); acá sólo se leen los
// datos y se pintan.

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireApp } from "@/lib/require-app";
import { getCurrentTenantId } from "@/lib/tenant";
import { getNegocioApps } from "@/apps/contexto.server";
import { appDeRuta } from "@/apps/rutas";
import { motivoNoDisponible } from "@/apps/visibles";
import { esMesKey, etiquetaDelMes, mesDelNegocio, mesVecino } from "@/lib/libros/fecha-fiscal";
import {
  TOTAL_PASOS,
  capitalizar,
  estadoDesdeAuditoria,
  evaluarPasos,
  fechaCorta,
  mesParaCerrar,
  pasosListos,
  pendientesAntesDeCongelar,
  sinCallejones,
  type Paso,
} from "@/lib/cierre-mes/cierre-mes";
import { leerAuditoriaCierre, leerHechosCierreMes } from "@/lib/cierre-mes/lectura";
import { PageHeader, buttonClasses } from "@/components/ui";
import { CongelarMes, ReabrirMes } from "./CierreMesForms";

export const dynamic = "force-dynamic";

const RUTA = "/admin/cierre-mes";

const MARCA: Record<Paso["estado"], { texto: string; clase: string; simbolo: string }> = {
  listo: { texto: "Listo", clase: "bg-success-soft text-success", simbolo: "✓" },
  pendiente: { texto: "Pendiente", clase: "bg-warning-soft text-warning", simbolo: "!" },
  "no-aplica": { texto: "No aplica", clase: "bg-surface-sunken text-muted", simbolo: "–" },
};

export default async function CierreMesPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const user = await requireApp("cierre-del-mes");
  const ahora = new Date();
  const actual = mesDelNegocio(ahora);
  const { mes: pedido } = await searchParams;
  // Sólo meses que ya terminaron; cualquier otra cosa abre el que toca cerrar.
  const mes = esMesKey(pedido) && pedido < actual ? pedido : mesParaCerrar(ahora);
  const tenantId = await getCurrentTenantId();
  const negocio = await getNegocioApps(user.role);
  const [hechos, filas] = await Promise.all([
    leerHechosCierreMes(prisma, tenantId, mes, { esMostrador: negocio.esMostrador }),
    leerAuditoriaCierre(prisma, tenantId, mes),
  ]);
  const estado = estadoDesdeAuditoria(filas);
  // Un botón a una app que este negocio no puede abrir sería un callejón: se saca y se dice.
  const pasos = sinCallejones(evaluarPasos(hechos, estado), (href) => {
    const app = appDeRuta(href.split("?")[0]);
    return app && motivoNoDisponible(app, negocio) !== null ? app.nombre : null;
  });
  const listos = pasosListos(pasos);
  const pendientes = pendientesAntesDeCongelar(pasos);
  const bloqueante = pasos.find((p) => p.bloquea && p.estado === "pendiente") ?? null;
  const etiqueta = etiquetaDelMes(mes);
  const Etiqueta = capitalizar(etiqueta);
  const anterior = mesVecino(mes, -1);
  const siguiente = mesVecino(mes, 1);
  const hrefPaquete = `${RUTA}/paquete?mes=${mes}`;

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="Cierre del mes"
        description={`Revisá los ${TOTAL_PASOS} pasos de ${etiqueta}, congelá el mes y bajá el paquete para tu contador: libro de caja, ventas con y sin comprobante, compras, cuentas corrientes y stock, en un solo archivo.`}
      />

      <nav aria-label="Mes" className="mb-6 flex flex-wrap items-center gap-3">
        <Link href={`${RUTA}?mes=${anterior}`} rel="prev" className={buttonClasses("outline", "md")}>
          <span className="capitalize">← {etiquetaDelMes(anterior)}</span>
        </Link>
        <span className="text-sm font-medium capitalize text-strong">{etiqueta}</span>
        {siguiente < actual && (
          <Link href={`${RUTA}?mes=${siguiente}`} rel="next" className={buttonClasses("outline", "md")}>
            <span className="capitalize">{etiquetaDelMes(siguiente)} →</span>
          </Link>
        )}
      </nav>

      {/* Estado del mes, en una línea. */}
      <section
        aria-label="Estado del mes"
        className={`mb-6 rounded-xl border px-4 py-4 sm:px-5 ${estado.congelado ? "border-success/30 bg-success-soft" : "border-line bg-surface-raised"}`}
      >
        <p className="text-lg font-semibold text-strong">
          {estado.congelado ? `${Etiqueta} está congelado` : `${Etiqueta} está abierto`}
          <span className="ml-2 text-sm font-normal text-muted">
            {listos} de {TOTAL_PASOS} pasos listos
          </span>
        </p>
        <p className="mt-1 text-sm text-body">
          {estado.congelado && estado.congeladoEl
            ? `Lo congeló ${estado.congeladoPor} el ${fechaCorta(estado.congeladoEl)}. La caja de esos días no acepta cambios: una corrección de plata va con la fecha de hoy.`
            : estado.reabiertoEl
              ? `Lo reabrió ${estado.reabiertoPor} el ${fechaCorta(estado.reabiertoEl)}: “${estado.motivoReapertura ?? ""}”. Cuando esté corregido, congelalo de nuevo.`
              : "Revisá los pasos de abajo. Cuando estén listos (o sepas por qué no), congelá el mes."}
        </p>
      </section>

      <ol className="mb-8 overflow-hidden rounded-xl border border-line bg-surface-raised shadow-card">
        {pasos.map((p, i) => {
          const marca = MARCA[p.estado];
          return (
            <li key={p.id} className="flex flex-col gap-3 border-b border-line px-4 py-4 last:border-b-0 sm:flex-row sm:items-center sm:px-5">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <span
                  aria-hidden
                  className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-sm font-semibold ${marca.clase}`}
                >
                  {marca.simbolo}
                </span>
                <div className="min-w-0">
                  <p className="font-medium text-strong">
                    {i + 1}. {p.titulo}{" "}
                    <span className={`ml-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${marca.clase}`}>{marca.texto}</span>
                  </p>
                  <p className="mt-1 text-sm text-body">{p.detalle}</p>
                </div>
              </div>
              {p.estado === "pendiente" && p.accion && (
                <Link href={p.accion.href} className={buttonClasses("outline", "md", "self-start sm:self-center")}>
                  {p.accion.texto}
                </Link>
              )}
              {p.id === "paquete" && estado.congelado && (
                // <a> y no <Link>: Link precarga, y cada carga del archivo queda registrada como
                // "descargado por". Una precarga no es una descarga.
                <a href={hrefPaquete} download className={buttonClasses("solid", "md", "self-start sm:self-center")}>
                  Descargar el paquete (CSV)
                </a>
              )}
            </li>
          );
        })}
      </ol>

      {estado.congelado ? (
        <ReabrirMes mes={mes} etiqueta={Etiqueta} puedeReabrir={user.role === "OWNER"} />
      ) : (
        <>
          <CongelarMes
            mes={mes}
            etiqueta={Etiqueta}
            bloqueo={bloqueante ? bloqueante.detalle : null}
            pendientes={pendientes.map((p) => p.titulo)}
          />
          <p className="mt-4 text-sm text-muted">
            ¿Tu contador necesita algo antes?{" "}
            <a href={hrefPaquete} download className="inline-flex h-11 items-center font-medium text-strong underline underline-offset-4">
              Bajá un borrador del paquete
            </a>
            . Dice que es borrador: los números todavía pueden cambiar.
          </p>
        </>
      )}

      {filas.length > 0 && (
        <section aria-labelledby="cierre-historial" className="mt-8">
          <h2 id="cierre-historial" className="mb-2 text-base font-semibold text-strong">
            Lo que pasó con {etiqueta}
          </h2>
          <ul className="space-y-1 text-sm text-body">
            {[...filas].reverse().map((f, i) => {
              const c = (f.changes ?? {}) as { por?: string; motivo?: string; borrador?: boolean };
              const que =
                f.action === "cierre-mes.congelar"
                  ? "congeló el mes"
                  : f.action === "cierre-mes.reabrir"
                    ? `lo reabrió: “${c.motivo ?? ""}”`
                    : c.borrador
                      ? "bajó un borrador del paquete"
                      : "descargó el paquete";
              return (
                <li key={`${f.action}-${f.createdAt.toISOString()}-${i}`}>
                  <span className="tabular-nums text-muted">{fechaCorta(f.createdAt)}</span> · {c.por ?? "alguien del negocio"} {que}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}
