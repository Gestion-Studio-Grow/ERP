// Operar el CRM comercial como un puesto (o una persona) desde una sesión, SÓLO contra la base local.
//   npx tsx scripts/crm-comercial/operar.ts --negocio <slug> --como <email> <comando> ['{"json":…}' | @archivo.json]
//   npx tsx scripts/crm-comercial/operar.ts ayuda
// Llama a las mismas funciones del repo que las acciones del servidor: el permiso lo decide el repo.
import "dotenv/config";
import { readFileSync } from "node:fs";
import { COMANDOS, operar } from "../../src/lib/crm-comercial/operar";
import { NEGOCIO_POR_DEFECTO, salir, texto } from "./comun";

async function main() {
  const argv = process.argv.slice(2);
  const sueltos: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) i++;
    else sueltos.push(argv[i]);
  }
  const [comando, crudo] = sueltos;
  if (!comando || comando === "ayuda") salir({ ok: true, uso: "operar.ts --negocio <slug> --como <email> <comando> [json|@archivo]", comandos: Object.fromEntries(Object.entries(COMANDOS).map(([k, v]) => [k, v.ayuda])) });
  const como = texto("como", "");
  if (!como) salir({ ok: false, motivo: "Falta --como <email>: el usuario con el que se opera." }, 1);
  let datos: Record<string, unknown> = {};
  if (crudo) {
    try {
      datos = JSON.parse(crudo.startsWith("@") ? readFileSync(crudo.slice(1), "utf8") : crudo) as Record<string, unknown>;
    } catch {
      salir({ ok: false, motivo: "Los datos no son un JSON válido." }, 1);
    }
  }
  const r = await operar({ negocio: texto("negocio", NEGOCIO_POR_DEFECTO), como, comando, datos });
  salir(r, r.ok ? 0 : 1);
}
main().catch((e) => salir({ ok: false, motivo: e instanceof Error ? e.message : String(e) }, 1));
