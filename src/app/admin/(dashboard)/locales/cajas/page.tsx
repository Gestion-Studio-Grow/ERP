import { requireApp } from "@/lib/require-app";
import { exigirCasa } from "@/lib/multilocal/casa.server";
import { redDeLaCasaAction } from "@/lib/multilocal/multilocal-actions";
import { direccionDelLocal, type CierreLocal, type LocalConPasada } from "@/lib/multilocal/multilocal-core";
import { Badge, Card, PageContainer, PageHeader, fmtMoneyARS, fmtNumberAR, type BadgeTone } from "@/components/ui";
import { fmtDateTimeAr } from "@/lib/datetime";
import { AbrirLocal, NoEsCasa, NoSePudoLeer, SinLocales, SolapasLocales, dia, ruteoDeLocales } from "../partes";

export const dynamic = "force-dynamic";

// CAJAS DE LOS LOCALES — qué local no cerró, desde qué día, y qué dejó cada cierre.
//
// "Sin cerrar" es la misma regla que el monitoreo del contador (cartera-core.ts): el día más
// viejo con plata movida, después del último cierre y ANTES de hoy (hoy todavía se puede cerrar
// a la noche). La frontera la lee `lastClosedDayTx`, la misma que usa la Caja del local.
// Las diferencias salen de lo que cada cierre dejó escrito en la auditoría del local (esperado,
// contado y diferencia por medio), dichas como las dice la auditoría (cierre-resumen.ts).

const TONO_CIERRE: Record<string, BadgeTone> = {
  CUADRA: "success",
  SOBRANTE: "warning",
  FALTANTE: "danger",
  MIXTO: "danger",
  SIN_DECLARAR: "neutral",
};

const TEXTO_CIERRE: Record<string, string> = {
  CUADRA: "Cuadró",
  SOBRANTE: "Sobró plata",
  FALTANTE: "Faltó plata",
  MIXTO: "Sobró en un medio y faltó en otro",
  SIN_DECLARAR: "Sin conciliar",
};

export default async function CajasDeLosLocalesPage() {
  const user = await requireApp("cajas-de-los-locales");
  const casa = await exigirCasa("multilocal:manage");
  const titulo = "Cajas de los locales";
  if (!casa.ok) {
    return (
      <PageContainer>
        <PageHeader title={titulo} />
        <NoEsCasa error={casa.error} />
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
      {r.red.length === 0 ? (
        <SinLocales />
      ) : (
        <ul className="space-y-4" aria-label="Caja de cada local">
          {orden.map((x) => (
            <li key={x.local.localTenantId}>
              <CajaDeUnLocal x={x} url={direccionDelLocal(x.local.subdomain, ruteo, "/admin/caja/cierre")} />
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
  );
}

/** "0" + día pendiente para los que piden acción (el más viejo primero); "1" + alias para el resto. */
function clave(x: LocalConPasada): string {
  const c = x.dato.caja;
  return c.estado === "abierta" && c.pendienteDesde ? `0${c.pendienteDesde}` : `1${x.local.alias.toLowerCase()}`;
}

function CajaDeUnLocal({ x, url }: { x: LocalConPasada; url: string | null }) {
  const { local, dato } = x;
  const c = dato.caja;
  const cerradoHasta = c.cerradoHasta;
  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-strong break-words">{local.alias}</h2>
          <p className="text-sm text-muted">
            {cerradoHasta ? `Cerrada hasta el ${dia(cerradoHasta)}` : "Todavía no cerró ningún día"}
          </p>
        </div>
        {c.estado === "cerrada-hoy" ? (
          <Badge tone="neutral" dot>Cerró hoy</Badge>
        ) : c.pendienteDesde ? (
          <Badge tone="warning" dot>Sin cerrar desde el {dia(c.pendienteDesde)}</Badge>
        ) : (
          <Badge tone="success" dot>Al día</Badge>
        )}
      </div>

      {c.estado === "abierta" && c.pendienteDesde && (
        <p className="text-sm text-body">
          Tiene plata movida desde el {dia(c.pendienteDesde)} que nadie contó. Hasta que cierre, su libro de
          esos días se puede seguir tocando y la diferencia (si la hay) no aparece en ningún lado.
        </p>
      )}

      <div className="border-t border-line pt-3">
        <p className="text-sm font-medium text-strong">Últimos cierres</p>
        {dato.cierres.length === 0 ? (
          <p className="mt-1 text-sm text-muted">No hay cierres registrados en este local.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {dato.cierres.map((k) => (
              <Cierre key={`${k.dia}-${k.cuando.toISOString()}`} k={k} />
            ))}
          </ul>
        )}
      </div>

      <AbrirLocal url={url} etiqueta="Abrir su cierre del día" />
    </Card>
  );
}

function Cierre({ k }: { k: CierreLocal }) {
  const estado = k.estado ?? "SIN_DECLARAR";
  return (
    <li className="rounded-lg border border-line px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-strong">
          {dia(k.dia)} <span className="font-normal text-muted">· cerrado el {fmtDateTimeAr(k.cuando)}</span>
        </p>
        <Badge tone={TONO_CIERRE[estado] ?? "neutral"}>
          {TEXTO_CIERRE[estado] ?? estado}
          {k.diferencia !== 0 ? ` · ${k.diferencia > 0 ? "+" : "−"}${fmtMoneyARS(Math.abs(k.diferencia))}` : ""}
        </Badge>
      </div>
      <ul className="mt-1 space-y-0.5 text-xs text-muted">
        {k.medios.map((m) => (
          <li key={m}>{m}</li>
        ))}
      </ul>
      {k.nota && <p className="mt-1 text-xs text-body">Nota: {k.nota}</p>}
    </li>
  );
}
