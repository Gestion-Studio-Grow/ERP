// Dónde espera la contraseña provisoria de un alta Factoque hasta que se entrega al titular.
//
// Un archivo por negocio, en una carpeta 0700 del disco de quien corre el alta (nunca en el repo):
// `FACTOQUE_CLAVES_DIR` o `~/.gsg/factoque-claves`. El archivo se crea 0600 y se borra cuando el
// mail sale o cuando se confirma la entrega a mano (`--confirmar-envio`).

import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { GuardaDeClaves } from "./alta-negocio.server";

export function carpetaDeClaves(env: Readonly<Record<string, string | undefined>> = process.env): string {
  return env.FACTOQUE_CLAVES_DIR?.trim() || join(homedir(), ".gsg", "factoque-claves");
}

export function guardaEnDisco(carpeta: string = carpetaDeClaves()): GuardaDeClaves {
  const ruta = (slug: string) => join(carpeta, `${slug}.clave`);
  return {
    ruta,
    leer(slug) {
      const r = ruta(slug);
      if (!existsSync(r)) return null;
      const v = readFileSync(r, "utf8").trim();
      return v || null;
    },
    guardar(slug, clave) {
      mkdirSync(carpeta, { recursive: true, mode: 0o700 });
      const r = ruta(slug);
      // `wx`: nunca se pisa una clave pendiente de otra corrida.
      writeFileSync(r, `${clave}\n`, { mode: 0o600, flag: "wx" });
      chmodSync(r, 0o600);
      return r;
    },
    borrar(slug) {
      rmSync(ruta(slug), { force: true });
    },
  };
}
