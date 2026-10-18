// RESETEO DE GO-LIVE de UN negocio: borra los datos TRANSACCIONALES de prueba y conserva los
// MAESTROS. Decisión del dueño: docs/agent/DECISIONS.md D7.5 opción A. Runbook (leerlo antes):
// docs/runbooks/reset-golive.md.
//
// Uso (MODO PRUEBA por default — no borra nada, sólo cuenta y muestra):
//   DATABASE_URL=<app_rls, conexión DIRECTA> RLS_ENFORCEMENT=on \
//     npm run reset-golive -- --tenant <slug> [--conservar-futuro] [--clientes-creados-desde <ISO>]
//   ... --apply --confirmar <slug>     borra de verdad (el slug escrito OTRA vez)
//   ... --stock recalcular             documentado, NO implementado (ver el runbook)
//
// GARANTÍAS
//   * Un negocio por corrida, resuelto por slug; nunca itera negocios.
//   * Todo adentro de UNA `tenantTransaction` (RLS + GUC + candado consultivo por negocio):
//     leer, planificar, borrar, verificar. Si algo falla, no se borra nada.
//   * El plan es puro y testeado (src/lib/reset-golive.ts). Cada paso cuenta lo que borra; si
//     no coincide con lo planificado, error y vuelta atrás.
//   * Después de borrar se replanifica dentro de la misma transacción: tiene que dar cero.
//   * Nunca TRUNCATE. Comprobantes con CAE, días de caja cerrados, AuditLog y maestros: intactos.
//   * Deja una fila en AuditLog (actor "operator:reset-golive") con lo borrado y lo conservado.
//
// Códigos de salida: 0 ok · 1 error (nada borrado) · 2 la guarda no dejó correr.

import "dotenv/config";
import { basePrisma, RLS_ENFORCEMENT } from "@/lib/prisma-base";
import { tenantTransaction } from "@/lib/rls";
import { BUSINESS_TIMEZONE } from "@/lib/business-config";
import { esPoolerDeNeon, parsearArgs, planificarReseteo, totalABorrar, type ArgsReseteo, type PlanReseteo } from "@/lib/reset-golive";
import { aplicarPlan, candadoDelReseteo, leerFoto, tablasExistentes, verificarVacio } from "@/lib/reset-golive-db";

const TAG = "[reset-golive]";
const TIMEOUT_MS = 180_000;

const color = (code: number) => (s: string) => (process.env.NO_COLOR ? s : `\x1b[${code}m${s}\x1b[0m`);
const rojo = color(31);
const amarillo = color(33);
const verde = color(32);
const negrita = color(1);

function maskDbUrl(url: string | undefined): string {
  if (!url) return "(sin DATABASE_URL)";
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.username ? u.username + "@" : ""}${u.host}${u.pathname}`;
  } catch {
    return "(DATABASE_URL ilegible)";
  }
}

function salir(code: number, msg: string): never {
  console.error(`${TAG} ${msg}`);
  process.exit(code);
}

const pad = (s: string, n: number) => (s.length >= n ? s : s + " ".repeat(n - s.length));
const lpad = (s: string, n: number) => (s.length >= n ? s : " ".repeat(n - s.length) + s);

function imprimirPlan(plan: PlanReseteo, args: ArgsReseteo): void {
  console.log(`\n${negrita(args.apply ? "SE BORRA (en este orden):" : "BORRARÍA (en este orden):")}`);
  let i = 0;
  for (const p of plan.pasos) {
    i++;
    const etiqueta = p.paso === "InvoiceNota" ? "Invoice (notas asociadas a otro comprobante)" : p.paso === "Invoice" ? "Invoice (sin CAE)" : p.paso;
    console.log(`  ${lpad(String(i), 2)}. ${pad(etiqueta, 46)} ${lpad(String(p.ids.length), 7)}`);
  }
  console.log(`      ${pad("TOTAL", 46)} ${lpad(String(totalABorrar(plan)), 7)}`);

  console.log(`\n${negrita("SE CONSERVA:")}`);
  console.log("  · Maestros: negocio, credenciales fiscales, ajustes, usuarios, servicios y categorías, productos y precios,");
  console.log("    profesionales, horarios, comisiones, boxes, recursos, plantillas, proveedores, integraciones, cupones.");
  console.log("  · AuditLog completo (se agrega una fila con este reseteo).");
  console.log(`  · Stock: Product.stock queda como está (stock contado).${plan.ajustesStock.length ? ` Se asientan ${plan.ajustesStock.length} AJUSTE(S) para que el historial lo explique.` : ""}`);
  for (const c of plan.conserva) console.log(`  · ${pad(c.tabla, 22)} ${lpad(String(c.cantidad), 6)}  ${c.motivo}`);

  if (plan.comprobantesConCae.length > 0) {
    console.log(`\n${negrita(`COMPROBANTES CON CAE (${plan.comprobantesConCae.length}) — no se borran nunca:`)}`);
    for (const c of plan.comprobantesConCae.slice(0, 50)) console.log(`  · ${c.id} → ${c.enlazadoA}`);
    if (plan.comprobantesConCae.length > 50) console.log(`  … y ${plan.comprobantesConCae.length - 50} más`);
  }
  if (plan.cupones.length > 0) {
    console.log(`\n${negrita("CUPONES (uso que vuelve a cero o a lo que queda):")}`);
    for (const c of plan.cupones) console.log(`  · ${pad(c.code, 20)} ${c.de} → ${c.a}`);
  }
  if (plan.ajustesStock.length > 0) {
    console.log(`\n${negrita("AJUSTES DE STOCK que se asientan (el stock NO cambia):")}`);
    for (const a of plan.ajustesStock.slice(0, 50)) console.log(`  · ${pad(a.nombre, 32)} ${lpad(a.qty > 0 ? `+${a.qty}` : String(a.qty), 10)}  (stock ${a.stock})`);
    if (plan.ajustesStock.length > 50) console.log(`  … y ${plan.ajustesStock.length - 50} más`);
  }
  if (args.clientesCreadosDesde) {
    console.log(`\n${negrita(`CLIENTES creados desde ${args.clientesCreadosDesde.toISOString()}:`)} se borran ${plan.pasos.find((p) => p.paso === "Client")?.ids.length ?? 0}, se conservan ${plan.clientesConservados.length}`);
    const porMotivo = new Map<string, number>();
    for (const c of plan.clientesConservados) porMotivo.set(c.motivo, (porMotivo.get(c.motivo) ?? 0) + 1);
    for (const [m, n] of porMotivo) console.log(`  · ${n} — ${m}`);
  }
  if (plan.avisos.length > 0) {
    console.log(`\n${amarillo(negrita("PARA REVISAR ANTES DE APLICAR:"))}`);
    for (const a of plan.avisos) console.log(amarillo(`  ! ${a}`));
  }
}

async function main(): Promise<void> {
  const r = parsearArgs(process.argv.slice(2));
  if (!r.ok) {
    salir(2, `${r.error}\nUso: npm run reset-golive -- --tenant <slug> [--conservar-futuro] [--clientes-creados-desde <ISO>] [--apply --confirmar <slug>]`);
  }
  const args = r.args;
  if (args.stock === "recalcular") {
    salir(2, "--stock recalcular NO está implementado a propósito: devolver al stock lo que vendieron las pruebas pisa un conteo físico " +
      "y suma errores de coma flotante. Ver docs/runbooks/reset-golive.md §Stock. Corré sin esa opción (conserva el stock contado).");
  }

  const url = process.env.DATABASE_URL;
  console.log(`${TAG} ${args.apply ? rojo(negrita("MODO BORRADO (--apply)")) : verde("MODO PRUEBA (no borra nada)")}`);
  console.log(`${TAG} base: ${maskDbUrl(url)} · RLS_ENFORCEMENT=${RLS_ENFORCEMENT ? "on" : "off"} · zona ${BUSINESS_TIMEZONE}`);
  console.log(rojo(negrita(`${TAG} ANTES DE APLICAR: hacé un BRANCH DE RESPALDO en Neon (consola de Neon → Branches → Create branch desde main).`)));
  console.log(rojo(`${TAG} Este script NO hace el respaldo. Sin respaldo, lo borrado no se recupera.`));

  if (args.apply && esPoolerDeNeon(url)) {
    salir(2, rojo("DATABASE_URL apunta al POOLER de Neon (\"-pooler\" en el host). Para borrar hace falta la conexión DIRECTA " +
      "(la misma cadena sin \"-pooler\"): una transacción larga a través del pooler puede cortarse a mitad de camino."));
  }

  const tenant = await basePrisma.tenant.findUnique({ where: { slug: args.tenant }, select: { id: true, name: true, slug: true } });
  if (!tenant) salir(2, `no existe un negocio con slug "${args.tenant}"`);
  console.log(`${TAG} negocio: ${negrita(tenant.slug)} (${tenant.name}) id=${tenant.id}`);

  // Con qué rol se conecta: el dueño de las tablas (o un rol con BYPASSRLS) no pasa por RLS.
  const [rol] = await basePrisma.$queryRaw<{ usuario: string; bypass: boolean; duenio: boolean }[]>`
    SELECT current_user AS usuario,
           COALESCE((SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user), false) AS bypass,
           EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'Appointment' AND tableowner = current_user) AS duenio`;
  const sinRls = !RLS_ENFORCEMENT || rol.bypass || rol.duenio;
  console.log(`${TAG} rol: ${rol.usuario}${rol.duenio ? " (dueño de las tablas: exento de RLS)" : ""}${rol.bypass ? " (BYPASSRLS)" : ""}`);
  if (args.apply && sinRls) {
    salir(2, rojo("para borrar hace falta correr CON RLS: RLS_ENFORCEMENT=on y DATABASE_URL con el rol app_rls (no el dueño de las tablas)."));
  } else if (sinRls) {
    console.log(amarillo(`${TAG} aviso: esta corrida no pasa por RLS (igual todo va filtrado por tenantId). Para --apply hace falta app_rls + RLS_ENFORCEMENT=on.`));
  }

  const opciones = { clientesCreadosDesde: args.clientesCreadosDesde, conservarFuturo: args.conservarFuturo };
  const ahora = new Date();
  const resultado = await tenantTransaction(
    async (tx) => {
      await candadoDelReseteo(tx, tenant.id);
      const tablas = await tablasExistentes(tx);
      const foto = await leerFoto(tx, tenant.id, tablas, ahora);
      console.log(`${TAG} último día de caja cerrado: ${foto.frontera ?? "ninguno"}${args.conservarFuturo ? " · se conservan turnos y bloqueos futuros" : ""}`);
      const plan = planificarReseteo(foto, opciones);
      imprimirPlan(plan, args);
      if (!args.apply) return null;
      const hecho = await aplicarPlan(tx, tenant.id, plan, { opciones, frontera: foto.frontera, ahora });
      await verificarVacio(tx, tenant.id, tablas, opciones, ahora);
      return hecho;
    },
    { tenantId: tenant.id, timeoutMs: TIMEOUT_MS },
  );

  if (!resultado) {
    console.log(`\n${TAG} ${verde("MODO PRUEBA: no se borró nada.")} Si lo de arriba está bien, para borrar de verdad:`);
    console.log(`${TAG}   npm run reset-golive -- --tenant ${args.tenant}${args.conservarFuturo ? " --conservar-futuro" : ""}${args.clientesCreadosDesde ? ` --clientes-creados-desde ${args.clientesCreadosDesde.toISOString()}` : ""} --apply --confirmar ${args.tenant}`);
    return;
  }
  const total = Object.values(resultado.borradas).reduce((t, n) => t + n, 0);
  console.log(`\n${TAG} ${verde(negrita(`LISTO: ${total} fila(s) borradas en una sola transacción`))}, ${resultado.cupones} cupón(es) actualizados, ${resultado.ajustesStock} ajuste(s) de stock.`);
  console.log(`${TAG} verificación: replanificado después de borrar → 0 pendientes. Quedó registrado en AuditLog (acción "reset-golive").`);
  console.log(`${TAG} siguiente: si el negocio maneja caja, corte inicial con el arqueo real (scripts/corte-inicial.ts, ver el runbook).`);
}

main()
  .catch((err) => {
    console.error(rojo(`${TAG} error: ${err instanceof Error ? err.message : String(err)}`));
    console.error(`${TAG} la transacción volvió atrás: NO se borró nada.`);
    process.exit(1);
  })
  .finally(async () => {
    await basePrisma.$disconnect().catch(() => undefined);
  });
