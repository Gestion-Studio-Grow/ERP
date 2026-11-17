// Lo común de los scripts de la prueba del CRM comercial (GSG-CRM-011 parte 3): argumentos y archivos.
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ClienteDePrueba, LeadDePrueba } from "../../src/lib/crm-comercial/carga-prueba";

export const RAIZ = path.resolve(__dirname, "..", "..");
export const NEGOCIO_POR_DEFECTO = "mia-producciones";
const CARPETA = (slug: string) => path.join(RAIZ, "docs", "tenants", slug, "crm-prueba");

/** `--clave valor` o `--bandera` (true). */
export function argumento(nombre: string, argv = process.argv.slice(2)): string | true | undefined {
  const i = argv.indexOf(`--${nombre}`);
  if (i < 0) return undefined;
  const v = argv[i + 1];
  return v === undefined || v.startsWith("--") ? true : v;
}
export const texto = (nombre: string, porDefecto: string) => {
  const v = argumento(nombre);
  return typeof v === "string" ? v : porDefecto;
};

/** Sólo `leads.json` y `clientes-activos.json`: la clave de la prueba no la lee quien carga. */
export function leerArchivos(slug: string): { leads: LeadDePrueba[]; clientes: ClienteDePrueba[] } {
  const leadsPath = texto("leads", path.join(CARPETA(slug), "leads.json"));
  const clientesPath = texto("clientes", path.join(CARPETA(slug), "clientes-activos.json"));
  const leads = JSON.parse(readFileSync(leadsPath, "utf8")) as { leads?: LeadDePrueba[] };
  const clientes = JSON.parse(readFileSync(clientesPath, "utf8")) as { clientes?: ClienteDePrueba[] };
  if (!Array.isArray(leads.leads) || !Array.isArray(clientes.clientes)) throw new Error("Los archivos de la prueba no tienen la forma esperada ({leads:[…]} y {clientes:[…]}).");
  return { leads: leads.leads, clientes: clientes.clientes };
}

export function salir(obj: unknown, codigo = 0): never {
  process.stdout.write(`${JSON.stringify(obj, null, 2)}\n`);
  process.exit(codigo);
}
