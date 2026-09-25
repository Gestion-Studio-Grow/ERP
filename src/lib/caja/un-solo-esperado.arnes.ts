/**
 * Arnés compartido por los tests `un-solo-esperado-*-postgres.test.ts` (no es un test: no
 * termina en `.test.ts`). Cada archivo de test corre en su propio proceso con su propia base,
 * porque la app lee el entorno al importarse.
 *
 * UN SOLO ESPERADO para el cajón (ADR-101), EJECUTADO contra Postgres con RLS (app_rls).
 *
 * El defecto: el turno esperaba `fondo tipeado + efectivo del turno`; el día, el saldo del libro.
 * Si el fondo contado no coincidía con el libro, el turno cuadraba y el día asentaba la diferencia
 * como faltante de ESE día. (En el laboratorio de MAGRA un cierre asentó $146.578,25; que haya salido
 * de este mecanismo es una lectura del código, no algo reproducido: no hay datos de ese laboratorio
 * en el repo. Estos tests no lo reproducen.) Acá corren las Server Actions reales (`openCashSession`, `closeCashSession`,
 * `cerrarDia`) con la sesión de la dueña, y se mira el libro desde afuera con el dueño de la base.
 *
 *   · turno que cuadra ⇒ el día no inventa faltante;
 *   · la diferencia real al abrir (fondo contado ≠ libro) queda UNA vez, con quién y cuándo;
 *   · un movimiento en efectivo que no pasó por el turno lo ve el turno igual que el día;
 *   · los días ya cerrados no se tocan;
 *   · dos negocios no se mezclan.
 */
import assert from "node:assert/strict";
import { apuntarLaAppA, type BaseEfimera, type NegocioDePrueba } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const DIA_MS = 24 * 60 * 60 * 1000;

export async function preparar(laBase: BaseEfimera) {
  apuntarLaAppA(laBase);
  prepararAccionesDeServidor();
  Object.assign(process.env as Record<string, string | undefined>, { DB_CONNECTION_LIMIT: "2", DB_CONNECT_TIMEOUT_MS: "3000" });
  const { operatorPrisma } = await import("@/lib/operator-db");
  const { openCashSession, closeCashSession, getCajaData } = await import("@/lib/caja-actions");
  const { CAMPO_ESPERADO_CONFIRMADO, esperadoDelCajon, esperadoParaElFormulario } = await import("@/lib/caja/esperado-del-cajon");
  const { cerrarDia } = await import("@/lib/cierre-diario-actions");
  const { businessWallTimeToUtc, dateStrInBusinessTz } = await import("@/lib/datetime");
  const marcas = await import("@/lib/caja/cierre-marca");

  const hoy = dateStrInBusinessTz(new Date());
  const ayer = dateStrInBusinessTz(new Date(Date.now() - DIA_MS));
  const inicioDeHoy = businessWallTimeToUtc(hoy, "00:00");
  const alMediodia = (dia: string) => businessWallTimeToUtc(dia, "12:00");

  const form = (campos: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.set(k, v);
    return fd;
  };
  const comoDuenia = async <R>(negocio: NegocioDePrueba, accion: () => Promise<R>): Promise<R> => {
    const r = await ejecutarAccion({ negocio, usuario: negocio.duenia }, accion);
    assert.equal(r.tipo, "respuesta", `la acción cortó con ${r.tipo}`);
    return (r as { valor: R }).valor;
  };
  // Como la pantalla: lee la caja (getCajaData), muestra el esperado con `esperadoDelCajon` y
  // manda ESE número con el conteo. `esperadoVisto` fuerza otro (una pantalla que quedó vieja).
  const leerCaja = (n: NegocioDePrueba) => comoDuenia(n, () => getCajaData());
  const esperadoEnPantalla = async (n: NegocioDePrueba): Promise<number> => {
    const caja = await leerCaja(n);
    if (!caja.open) return caja.esperadoEnElCajon ?? 0;
    return esperadoDelCajon(caja.open, caja.esperadoEnElCajon).esperado;
  };
  const abrir = async (n: NegocioDePrueba, fondo: string, esperadoVisto?: number) => {
    const visto = esperadoVisto ?? (await esperadoEnPantalla(n));
    return comoDuenia(n, () => openCashSession(null, form({ openingFloat: fondo, [CAMPO_ESPERADO_CONFIRMADO]: esperadoParaElFormulario(visto) })));
  };
  const cerrarTurno = async (n: NegocioDePrueba, contado: string, esperadoVisto?: number) => {
    const visto = esperadoVisto ?? (await esperadoEnPantalla(n));
    return comoDuenia(n, () => closeCashSession(null, form({ counted: contado, [CAMPO_ESPERADO_CONFIRMADO]: esperadoParaElFormulario(visto) })));
  };
  const cerrarElDia = (n: NegocioDePrueba, dia: string, efectivo: string) =>
    comoDuenia(n, () => cerrarDia(form({ day: dia, declarado_EFECTIVO: efectivo })));

  const conMarca = (tenantId: string, prefijo: string) =>
    operatorPrisma.cashMovement.findMany({ where: { tenantId, createdBy: { startsWith: prefijo } }, orderBy: { occurredAt: "asc" } });
  const fotoDelLibro = async (tenantId: string, hasta?: Date) =>
    (
      await operatorPrisma.cashMovement.findMany({
        where: { tenantId, ...(hasta ? { occurredAt: { lt: hasta } } : {}) },
        orderBy: { id: "asc" },
        select: { id: true, type: true, method: true, amount: true, occurredAt: true, createdBy: true, reason: true },
      })
    ).map((m) => ({ ...m, occurredAt: m.occurredAt.toISOString() }));

  return {
    operatorPrisma, marcas, hoy, ayer, inicioDeHoy, alMediodia,
    abrir, cerrarTurno, cerrarElDia, conMarca, fotoDelLibro, leerCaja, esperadoEnPantalla,
  };
}

