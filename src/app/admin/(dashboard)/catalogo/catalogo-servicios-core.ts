// El catálogo de servicios con «Diseño nuevo»: qué pestaña se pide y lo que la línea de estado
// cuenta. Puro (sin React ni base) para poder probarlo con datos de CH.

export const PARTES_DEL_CATALOGO = ["servicios", "profesionales", "boxes", "equipos", "productos", "quien", "cupones"] as const;
export type ParteDelCatalogo = (typeof PARTES_DEL_CATALOGO)[number];

/** La pestaña pedida en `?ver=`; cualquier otra cosa (o nada), Servicios. */
export function leerParte(sp: Record<string, string | string[] | undefined>): ParteDelCatalogo {
  const v = typeof sp.ver === "string" ? sp.ver : "";
  return (PARTES_DEL_CATALOGO as readonly string[]).includes(v) ? (v as ParteDelCatalogo) : "servicios";
}

type Profesional = { name: string; active: boolean; boxId: string | null; services: { id: string }[] };
type Servicio = { id: string; active: boolean; categoryId: string | null };

export type CuentasDelCatalogo = {
  /** Cuántos profesionales ACTIVOS hacen cada servicio. */
  quienesLaHacen: Record<string, number>;
  /** Los profesionales activos de cada box. */
  profesionalesPorBox: Record<string, string[]>;
  aLaVenta: number;
  sinCategoria: number;
  /** Servicios a la venta que ningún profesional activo hace: no se pueden dar como turno. */
  sinProfesional: number;
  profesionalesActivos: number;
};

export function contarCatalogo(servicios: readonly Servicio[], profesionales: readonly Profesional[]): CuentasDelCatalogo {
  const activos = profesionales.filter((p) => p.active);
  const quienesLaHacen: Record<string, number> = {};
  const profesionalesPorBox: Record<string, string[]> = {};
  for (const p of activos) {
    for (const s of p.services) quienesLaHacen[s.id] = (quienesLaHacen[s.id] ?? 0) + 1;
    if (p.boxId) (profesionalesPorBox[p.boxId] ??= []).push(p.name);
  }
  const aLaVenta = servicios.filter((s) => s.active);
  return {
    quienesLaHacen,
    profesionalesPorBox,
    aLaVenta: aLaVenta.length,
    sinCategoria: aLaVenta.filter((s) => !s.categoryId).length,
    sinProfesional: aLaVenta.filter((s) => !quienesLaHacen[s.id]).length,
    profesionalesActivos: activos.length,
  };
}
