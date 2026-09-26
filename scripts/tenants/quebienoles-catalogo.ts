// Carga del catálogo de Qué Bien Olés en su tenant — y el subdominio que lo publica.
//
// QUÉ HACE: deja en la base los 25 perfumes del carrusel del 15/09/2026 (fuente única:
// src/app/tienda/quebienoles/perfumes.ts) y el `Tenant.subdomain` que resuelve el host
// quebienoles-erp.vercel.app (HOSTS_PUBLICADOS, src/lib/tenant.ts).
//
// CÓMO (lecciones DX-6/DX-7 del registro: una carga que "pisa parejo" miente sin error visible):
//   1. Sin flags = SIMULACIÓN: muestra el plan campo por campo y no escribe nada.
//   2. `--apply` = aplica ESE plan en una transacción, con el GUC de RLS del tenant puesto.
//   3. Se vuelve a correr sin flags: tiene que dar 0 cambios. Si no, algo quedó distinto de lo planeado.
//
// Lo que NO hace: no borra ni desactiva productos que el dueño haya sumado desde el panel (los lista),
// no toca stock (trackStock queda como esté; los nuevos entran sin control de stock: "Stock disponible"
// es lo que publica la marca, sin cantidades) y no toca otros tenants (todo va filtrado por tenantId).
//
// Uso:  DOTENV_CONFIG_PATH=<.env con la base> npx tsx scripts/tenants/quebienoles-catalogo.ts [--apply]

import "dotenv/config";
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PERFUMES, nombreEnCatalogo, perfumeDe } from "../../src/app/tienda/quebienoles/perfumes";

const SLUG = "quebienoles";
const SUBDOMINIO = "quebienoles";

type Cambio = { id: string; clave: string; campos: Record<string, { antes: unknown; despues: unknown }> };

async function main() {
  const aplicar = process.argv.includes("--apply");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL (pasá el .env con DOTENV_CONFIG_PATH).");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const tenant = await prisma.tenant.findUnique({ where: { slug: SLUG }, select: { id: true, name: true, subdomain: true } });
    if (!tenant) throw new Error(`No existe el tenant "${SLUG}". Primero el alta: scripts/provision-tenant.ts --slug ${SLUG} --blueprint perfumeria --skip-catalog`);

    // El subdominio es único en toda la base: si otro tenant lo tiene, se frena (no se le roba el host).
    let cambiaSubdominio = false;
    if (tenant.subdomain !== SUBDOMINIO) {
      const ocupado = await prisma.tenant.findFirst({ where: { subdomain: SUBDOMINIO, NOT: { id: tenant.id } }, select: { slug: true } });
      if (ocupado) throw new Error(`El subdominio "${SUBDOMINIO}" ya es del tenant "${ocupado.slug}". No se toca.`);
      cambiaSubdominio = true;
    }

    const existentes = await prisma.product.findMany({
      where: { tenantId: tenant.id, deletedAt: null },
      select: { id: true, name: true, price: true, codigo: true, active: true, saleUnit: true },
    });
    const porCodigo = new Map(existentes.filter((p) => p.codigo).map((p) => [p.codigo!, p]));
    const usados = new Set<string>();

    const altas: { clave: string; name: string; price: number }[] = [];
    const cambios: Cambio[] = [];
    for (const perfume of PERFUMES) {
      const name = nombreEnCatalogo(perfume);
      // Primero por código (lo pone esta carga), después por nombre (lo pudo haber cargado alguien a mano).
      const actual =
        porCodigo.get(perfume.clave) ??
        existentes.find((p) => !usados.has(p.id) && !p.codigo && perfumeDe(p.name)?.clave === perfume.clave);
      if (!actual) {
        altas.push({ clave: perfume.clave, name, price: perfume.precio });
        continue;
      }
      usados.add(actual.id);
      const campos: Cambio["campos"] = {};
      if (actual.name !== name) campos.name = { antes: actual.name, despues: name };
      if (actual.price !== perfume.precio) campos.price = { antes: actual.price, despues: perfume.precio };
      if (actual.codigo !== perfume.clave) campos.codigo = { antes: actual.codigo, despues: perfume.clave };
      if (!actual.active) campos.active = { antes: false, despues: true };
      if (actual.saleUnit !== "UNIT") campos.saleUnit = { antes: actual.saleUnit, despues: "UNIT" };
      if (Object.keys(campos).length) cambios.push({ id: actual.id, clave: perfume.clave, campos });
    }
    const ajenos = existentes.filter((p) => !usados.has(p.id));

    console.log(`── Catálogo de ${tenant.name} (${SLUG}) — ${aplicar ? "APLICAR" : "SIMULACIÓN"} ──`);
    console.log(`  Subdominio: ${cambiaSubdominio ? `${tenant.subdomain ?? "(vacío)"} → ${SUBDOMINIO}` : `${SUBDOMINIO} (sin cambios)`}`);
    console.log(`  Productos en la base: ${existentes.length} · altas: ${altas.length} · cambios: ${cambios.length}`);
    for (const a of altas) console.log(`    + ${a.name}  $${a.price}  [${a.clave}]`);
    for (const c of cambios) {
      const detalle = Object.entries(c.campos)
        .map(([k, v]) => `${k}: ${JSON.stringify(v.antes)} → ${JSON.stringify(v.despues)}`)
        .join(" · ");
      console.log(`    ~ [${c.clave}] ${detalle}`);
    }
    if (ajenos.length) {
      console.log(`  Productos que no son de las placas (no se tocan): ${ajenos.map((p) => p.name).join(", ")}`);
    }
    const total = altas.length + cambios.length + (cambiaSubdominio ? 1 : 0);
    if (!aplicar) {
      console.log(total ? `\n  ${total} cambio(s) pendiente(s). Para aplicarlos: --apply` : "\n  0 cambios: la base ya coincide con el catálogo.");
      return;
    }
    if (!total) {
      console.log("\n  Nada que aplicar.");
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenant.id}, true)`;
      if (cambiaSubdominio) await tx.tenant.update({ where: { id: tenant.id }, data: { subdomain: SUBDOMINIO } });
      for (const a of altas) {
        await tx.product.create({
          data: { tenantId: tenant.id, name: a.name, saleUnit: "UNIT", price: a.price, unit: "unidades", stock: 0, trackStock: false, codigo: a.clave },
        });
      }
      for (const c of cambios) {
        const data = Object.fromEntries(Object.entries(c.campos).map(([k, v]) => [k, v.despues]));
        // updateMany con tenantId en el filtro: una fila de otro tenant no se puede tocar aunque el id coincida.
        const r = await tx.product.updateMany({ where: { id: c.id, tenantId: tenant.id }, data });
        if (r.count !== 1) throw new Error(`No se actualizó [${c.clave}] (${r.count} filas). Se revierte todo.`);
      }
    });
    console.log(`\n✔ Aplicado: ${altas.length} altas, ${cambios.length} cambios${cambiaSubdominio ? ", subdominio" : ""}. Volvé a correr sin --apply: tiene que dar 0 cambios.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("\n✖ Carga abortada:\n" + (e instanceof Error ? e.message : String(e)));
  process.exitCode = 1;
});
