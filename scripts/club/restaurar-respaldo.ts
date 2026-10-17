// Restaura un respaldo del club (sobre v1 del piloto) como foto vigente de un negocio en la base del ERP (BP-3).
// Es el paso del día de corte vanilla → React (docs/tenants/breakpoint/PARIDAD-REACT.md). Patrón DX-7: dry-run por
// defecto → --apply explícito → verificación.
//
//   npx tsx scripts/club/restaurar-respaldo.ts <respaldo.json>
//        DRY-RUN sin base: valida el sobre e imprime conteos, la caja por día, «caja = cobrado», las cajas sin cerrar y
//        cuántos usuarios tienen PIN (nunca el PIN).
//   npx tsx scripts/club/restaurar-respaldo.ts <respaldo.json> --tenant <slug>
//        DRY-RUN con base (sólo lectura): además, el negocio, si tiene el módulo `club` y la versión de su foto vigente.
//   npx tsx scripts/club/restaurar-respaldo.ts <respaldo.json> --tenant <slug> --apply
//        ESCRIBE: la foto pasa a ser la vigente (una fila de AuditLog «ClubEstado», acción `restaurar`, poda incluida;
//        la foto anterior del mismo día se conserva). Después relee y compara la caja al centavo.
//
// ⚠️ Con --apply contra producción (Neon) es exposición al cliente: corre SÓLO con el OK del dueño (O4 del plan,
// docs/producto/PLAN-TERMINALES-MOSTRADOR.md §7) y con `DATABASE_URL` del entorno. Scopeado por el id del slug: nunca
// toca otro negocio. Con un rol sujeto a RLS (app_rls) funciona igual: el GUC del negocio va primero.
//
// — Elaborado por GSG
import { readFileSync } from "node:fs";
import { leerSobre, resumenDelRespaldo, type ResumenDelRespaldo } from "../../src/lib/club/foto";

function arg(nombre: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : undefined;
}

const pesos = (n: number) => `$ ${Math.round(n).toLocaleString("es-AR")}`;

export function imprimirResumen(r: ResumenDelRespaldo, log: (s: string) => void = console.log): void {
  const c = r.conteos;
  log(`Conteos: ${c.canchas} canchas · ${c.clientes} clientes · ${c.productos} productos · ${c.usuarios} usuarios · ${c.reservas} turnos · ${c.cuentas} cuentas (${c.cuentasAbiertas} abiertas) · ${c.movimientosDeCaja} movimientos de caja · ${c.cierresDeCaja} cierres`);
  log(`Caja = cobrado: ingresos ${pesos(r.caja.ingresos)} · cobrado ${pesos(r.caja.cobrado)} (canchas ${pesos(r.caja.cobradoCanchas)} + cuentas ${pesos(r.caja.cobradoCuentas)}) · monedero aparte ${pesos(r.caja.monedero)} → ${r.caja.cuadra ? "CUADRA al centavo" : `DIFERENCIA ${pesos(r.caja.diferencia)} (cobros de cuenta corriente u otros ingresos sueltos: revisar)`}`);
  log("Caja por día (de 12 a 12):");
  for (const d of r.porDia) log(`  ${d.dia}  ingresos ${pesos(d.ingresos).padStart(14)} · egresos ${pesos(d.egresos).padStart(12)} · efectivo esperado ${pesos(d.efectivoEsperado).padStart(14)} · ${d.cerrada ? "cerrada" : "SIN CERRAR"}`);
  log(`Cajas sin cerrar: ${r.cajasSinCerrar.length ? r.cajasSinCerrar.join(", ") : "ninguna"}`);
  log(`PIN: ${r.pin.conPin} de ${r.pin.usuariosActivos} usuarios activos tienen PIN${r.pin.sinPin.length ? ` (sin PIN: ${r.pin.sinPin.join(", ")})` : ""}`);
  log(`Deudas: ${r.deudas.clientes} clientes deben ${pesos(r.deudas.total)} · créditos (monedero) de clientes: ${pesos(r.monederoDeClientes)}`);
}

async function main() {
  const archivo = process.argv[2];
  const slug = arg("tenant");
  const aplicar = process.argv.includes("--apply");
  if (!archivo || archivo.startsWith("--")) {
    console.error("uso: npx tsx scripts/club/restaurar-respaldo.ts <respaldo.json> [--tenant <slug> [--apply]]");
    process.exit(2);
  }
  if (aplicar && !slug) {
    console.error("--apply necesita --tenant <slug>: nunca se adivina el negocio.");
    process.exit(2);
  }
  const texto = readFileSync(archivo, "utf8");
  const l = leerSobre(texto);
  if (!l.ok) {
    console.error(`✖ ${l.motivo}`);
    process.exit(1);
  }
  console.log(`── Respaldo ${archivo} (${(Buffer.byteLength(texto) / 1024).toFixed(0)} KB${l.sobre.guardado ? `, guardado ${new Date(l.sobre.guardado).toISOString()}` : ""})`);
  const resumen = resumenDelRespaldo(l.estado);
  imprimirResumen(resumen);
  if (!slug) {
    console.log("\n[dry-run] No se tocó ninguna base. Para restaurar: --tenant <slug> --apply (con el OK del dueño).");
    return;
  }

  await import("dotenv/config");
  const { PrismaClient } = await import("../../src/generated/prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { escribirFotoEnTx, leerVigenteEnTx, metasEnTx } = await import("../../src/lib/club/estado-repo");
  const { diaDeCajaEn } = await import("../../src/lib/club/foto");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    const t = await prisma.tenant.findUnique({ where: { slug }, select: { id: true, slug: true, modules: true } });
    if (!t) throw new Error(`No existe el negocio «${slug}».`);
    const enElNegocio = <T>(fn: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => Promise<T>) =>
      prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${t.id}, true)`;
          return fn(tx);
        },
        { isolationLevel: "Serializable", timeout: 60_000 },
      );
    const metas = await enElNegocio((tx) => metasEnTx(tx, t.id));
    console.log(`\n── Negocio ${t.slug} (id=${t.id}) · módulo club: ${t.modules.includes("club") ? "asignado" : "NO asignado (scripts/club/asignar-modulo-club.ts)"}`);
    console.log(`   Foto vigente: ${metas.length ? `versión ${metas[metas.length - 1].version} del ${metas[metas.length - 1].dia} (${metas.length} fotos guardadas)` : "ninguna"}`);
    if (!aplicar) {
      console.log("\n[dry-run] No se escribió nada. Reejecutá con --apply (con el OK del dueño).");
      return;
    }
    const r = await enElNegocio((tx) =>
      escribirFotoEnTx(tx, t.id, { sobre: l.sobre, dia: diaDeCajaEn(l.estado, Date.now()), accion: "restaurar", actor: "script:restaurar-respaldo", versionEsperada: null }),
    );
    if (!r.ok) throw new Error("no se pudo escribir");
    // Verificación: se relee y la caja tiene que dar lo mismo al centavo.
    const vigente = await enElNegocio((tx) => leerVigenteEnTx(tx, t.id));
    const releida = vigente ? leerSobre(vigente.texto) : null;
    const igual = releida?.ok && JSON.stringify(resumenDelRespaldo(releida.estado)) === JSON.stringify(resumen);
    console.log(`\n✔ Restaurado: versión ${r.version} (${r.podadas} fotos podadas). Releída: ${igual ? "caja, conteos y PIN iguales al respaldo" : "✖ NO COINCIDE: revisar"}`);
    if (!igual) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(`\n✖ Abortado: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  });
}
