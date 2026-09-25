import { requireApp } from "@/lib/require-app";
import { exigirCasa } from "@/lib/multilocal/casa.server";
import { redDeLaCasaAction } from "@/lib/multilocal/multilocal-actions";
import { direccionDelLocal, type LocalConPasada } from "@/lib/multilocal/multilocal-core";
import { Badge, PageContainer, PageHeader, fmtNumberAR } from "@/components/ui";
import { AbrirLocal, LocalesSinLeer, NoEsCasa, NoSePudoLeer, SinLocales, SolapasLocales, ruteoDeLocales } from "../partes";
import { CajaDeUnLocal, ResumenDeCajas } from "./partes-cajas";
import { disenoNuevo } from "@/lib/diseno/diseno.server";
import { CabeceraCajas, TablaCajas } from "./CajasRenglon";

export const dynamic = "force-dynamic";

// CAJAS DE LOS LOCALES — qué local no cerró, desde qué día, y qué dejó cada cierre.
//
// "Sin cerrar" es la misma regla que el monitoreo del contador (cartera-core.ts): el día más
// viejo con plata movida, después del último cierre y ANTES de hoy (hoy todavía se puede cerrar
// a la noche). La frontera la lee `lastClosedDayTx`, la misma que usa la Caja del local.
// Las diferencias salen de lo que cada cierre dejó escrito en la auditoría del local (esperado,
// contado y diferencia por medio), dichas como las dice la auditoría (cierre-resumen.ts).
//
// En el celular, arriba va una fila por local (ResumenDeCajas) y abajo la tarjeta de cada uno,
// con el último cierre a la vista y los anteriores a pedido (partes-cajas.tsx).

export default async function CajasDeLosLocalesPage() {
  const user = await requireApp("cajas-de-los-locales");
  const casa = await exigirCasa("multilocal:manage");
  const titulo = "Cajas de los locales";
  if (!casa.ok) {
    return (
      <PageContainer>
        <PageHeader title={titulo} />
        <NoEsCasa error={casa.error} noSeLeyo={casa.noSeLeyo} />
      </PageContainer>
    );
  }
  const r = await redDeLaCasaAction();
  if (!r.ok) {
    return (
      <PageContainer>
        <PageHeader title={titulo} />
        <NoSePudoLeer error={r.error} />
      </PageContainer>
    );
  }

  // Primero los que piden acción: sin cerrar, del día más viejo al más nuevo.
  const orden = [...r.red].sort((a, b) => clave(a).localeCompare(clave(b)));
  const ruteo = ruteoDeLocales();
  const n = r.resumen.cajasSinCerrar;
  // DISEÑO NUEVO («Renglón»): un renglón por local con la diferencia del último cierre a la derecha.
  if (await disenoNuevo()) {
    return (
      <main data-ui="pagina" className="mx-auto w-full px-4 py-6">
        <CabeceraCajas casa={r.casa} locales={r.red.length} sinCerrar={n} />
        <SolapasLocales activa="cajas-de-los-locales" role={user.role} />
        <LocalesSinLeer sinLeer={r.sinLeer} ruta="/admin/locales/cajas" />
        {r.red.length === 0 ? (
          r.sinLeer.length === 0 && <SinLocales />
        ) : (
          <TablaCajas
            red={orden}
            accion={(x) => (
              <AbrirLocal url={direccionDelLocal(x.local.subdomain, ruteo, "/admin/caja/cierre")} etiqueta="Abrir su cierre del día" />
            )}
          />
        )}
      </main>
    );
  }
  return (
    <PageContainer>
      <PageHeader
        title={titulo}
        badge={<Badge tone="accent">{r.casa}</Badge>}
        description={
          r.red.length === 0
            ? undefined
            : n === 0
              ? "Todas las cajas están cerradas hasta ayer. Abajo, lo que dejó cada cierre."
              : `${fmtNumberAR(n)} ${n === 1 ? "local tiene" : "locales tienen"} la caja sin cerrar de días anteriores. Cada cierre lo hace el local desde su pantalla de Caja.`
        }
      />
      <SolapasLocales activa="cajas-de-los-locales" role={user.role} />
      <LocalesSinLeer sinLeer={r.sinLeer} ruta="/admin/locales/cajas" />
      {r.red.length === 0 ? (
        r.sinLeer.length === 0 && <SinLocales />
      ) : (
        <>
          {orden.length > 1 && <ResumenDeCajas red={orden} />}
          <ul className="space-y-4" aria-label="Caja de cada local">
            {orden.map((x) => (
              <li key={x.local.localTenantId}>
                <CajaDeUnLocal
                  x={x}
                  accion={
                    <AbrirLocal
                      url={direccionDelLocal(x.local.subdomain, ruteo, "/admin/caja/cierre")}
                      etiqueta="Abrir su cierre del día"
                    />
                  }
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </PageContainer>
  );
}

/** "0" + día pendiente para los que piden acción (el más viejo primero); "1" + alias para el resto. */
function clave(x: LocalConPasada): string {
  const c = x.dato.caja;
  return c.estado === "abierta" && c.pendienteDesde ? `0${c.pendienteDesde}` : `1${x.local.alias.toLowerCase()}`;
}
