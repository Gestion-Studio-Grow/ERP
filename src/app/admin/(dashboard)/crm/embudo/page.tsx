import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { EmptyState, buttonClasses, atributosBoton } from "@/components/ui";
import { ETIQUETA_ETAPA, diasDesde, type Etapa } from "@/lib/crm-comercial/motor";
import { listarOportunidades, personasDelCrm } from "@/lib/crm-comercial/acciones";
import { abrirCrm, Marco, NoSePudo } from "../comun";
import { CERRADAS, COLUMNAS, dia, opcionesDePase, plata, ponderadoDe, puedeEn, textoPonderado } from "../crm-core";
import { Tablero, type Columna, type Tarjeta } from "./Tablero";

export const dynamic = "force-dynamic";

// CRM COMERCIAL · «Embudo»: una columna por etapa con su monto ponderado; cada tarjeta con el próximo paso y
// los días sin movimiento (diseño §4.2). En el celular se ve una etapa por vez (selector); en la PC, 4 en fila
// con scroll DENTRO del tablero (la página nunca se corre de costado).

export default async function EmbudoPage() {
  const { miembro, bloqueo } = await abrirCrm(await requireApp("crm-comercial"));
  const descripcion = "Las oportunidades abiertas por etapa. Arrastrá una tarjeta o usá «Mover».";
  if (!miembro) return <Marco vista="embudo" miembro={null} descripcion={descripcion}>{bloqueo}</Marco>;

  const [l, p] = await Promise.all([listarOportunidades(), personasDelCrm()]);
  if (!l.ok) return <Marco vista="embudo" miembro={miembro} descripcion={descripcion}><NoSePudo motivo={l.motivo} faltaMigracion={l.faltaMigracion} /></Marco>;
  const comerciales = p.ok ? p.personas.filter((x) => x.activo && (x.rol === "COMERCIAL" || x.rol === "DIRECCION")).map((x) => ({ userId: x.userId, nombre: x.nombre })) : [];
  const ahora = new Date();

  const abiertas = l.filas.filter((f) => (COLUMNAS as readonly string[]).includes(f.etapa));
  const columnas: Columna[] = COLUMNAS.map((e) => {
    const pond = ponderadoDe(abiertas.filter((f) => f.etapa === e));
    return { etapa: e, etiqueta: ETIQUETA_ETAPA[e], ponderado: textoPonderado(pond), sinMonto: pond.sinMonto };
  });
  const tarjetas: Tarjeta[] = abiertas.map((f) => ({
    id: f.id,
    etapa: f.etapa,
    version: f.version,
    titulo: [f.marca ?? (f.tipo === "CONSULTA" ? "Consulta sin marca" : "Sin marca"), f.evento].filter(Boolean).join(" · "),
    tipo: f.tipo,
    proximoPaso: f.proximoPaso,
    proximoPasoTexto: f.proximoPasoEl ? dia(f.proximoPasoEl) : null,
    vencido: !!f.proximoPasoEl && f.proximoPasoEl.getTime() < ahora.getTime() && f.etapa !== "DORMIDA",
    diasEnEtapa: f.diasEnEtapa,
    diasSinMovimiento: diasDesde(f.ultimaActividadEl, ahora),
    sinSeguimiento: f.sinSeguimiento,
    puntaje: f.puntaje,
    monto: f.monto != null ? plata(f.monto, f.moneda) : null,
    ponderado: f.montoPonderado != null ? `${plata(f.montoPonderado, f.moneda)} (${f.probabilidad} %)` : null,
    pasePropuesto: f.pasePropuesto ? (ETIQUETA_ETAPA[f.pasePropuesto as Etapa] ?? f.pasePropuesto) : null,
    opciones: opcionesDePase(miembro, f),
  }));
  const cerradas = CERRADAS.map((e) => ({ etapa: e, n: l.filas.filter((f) => f.etapa === e).length })).filter((x) => x.n > 0);
  const total = ponderadoDe(abiertas);

  return (
    <Marco vista="embudo" miembro={miembro} descripcion={descripcion} ancho="max-w-[1240px]">
      {l.filas.length === 0 ? (
        <EmptyState
          title="Todavía no hay oportunidades"
          description={miembro.rol === "PUESTO" ? "Ves las que cargaste o las que tenés en curso." : "Cargá una consulta que entró o un prospecto."}
          action={puedeEn(miembro, "proponer_oportunidad") ? <Link href="/admin/crm/nueva" className={buttonClasses("solid", "md")} {...atributosBoton("solid", "md")}>Cargar una oportunidad</Link> : undefined}
        />
      ) : (
        <>
          <p className="text-sm text-muted">
            {abiertas.length} abiertas · ponderado total <span className="tabular-nums text-strong">{textoPonderado(total)}</span>
            {cerradas.length > 0 && <> · cerradas: {cerradas.map((c) => `${ETIQUETA_ETAPA[c.etapa]} ${c.n}`).join(", ")}</>}
          </p>
          <Tablero columnas={columnas} tarjetas={tarjetas} comerciales={comerciales} />
        </>
      )}
    </Marco>
  );
}
