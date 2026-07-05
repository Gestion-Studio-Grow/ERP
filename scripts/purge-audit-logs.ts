// Purga de AuditLog por retención (ADR-009 · ADR-023 F8). Mantenimiento manual/cron.
//
// Uso:
//   npm run purge-audit                  -> DRY-RUN: informa cuántas borraría, NO borra
//   npm run purge-audit -- --apply       -> borra de verdad (dato productivo)
//   npm run purge-audit -- --months 12 [--apply]
//
// NUNCA se corre solo ni desde el runtime de la app. El default es dry-run a propósito:
// contra prod (Neon) borra dato productivo, así que el borrado real exige `--apply`
// explícito. La ventana por defecto es AUDIT_RETENTION_MONTHS (18m); ver src/lib/audit-retention.ts.

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { purgeAuditLogs, AUDIT_RETENTION_MONTHS } from "../src/lib/audit-retention";

function parseArgs(argv: string[]): { apply: boolean; months: number } {
  const apply = argv.includes("--apply");
  const mIdx = argv.indexOf("--months");
  const months = mIdx >= 0 ? Number(argv[mIdx + 1]) : AUDIT_RETENTION_MONTHS;
  if (!Number.isFinite(months) || months <= 0) {
    throw new Error(`--months inválido: "${argv[mIdx + 1]}" (esperado un entero > 0)`);
  }
  return { apply, months };
}

async function main() {
  const { apply, months } = parseArgs(process.argv.slice(2));
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });
  try {
    const res = await purgeAuditLogs(prisma, { months, dryRun: !apply });
    const modo = res.dryRun ? "DRY-RUN (no se borró nada)" : "APLICADO (borrado real)";
    console.log(
      `[purge-audit] ${modo} · ventana ${months} meses · corte < ${res.cutoff.toISOString()} · ` +
        `${res.affected} entrada(s) ${res.dryRun ? "se borrarían" : "borradas"}.`,
    );
    if (res.dryRun && res.affected > 0) {
      console.log("[purge-audit] Para borrar de verdad: npm run purge-audit -- --apply");
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && /purge-audit-logs\.ts$/.test(process.argv[1])) {
  main().catch((e) => {
    console.error("[purge-audit] error:", e);
    process.exit(1);
  });
}
