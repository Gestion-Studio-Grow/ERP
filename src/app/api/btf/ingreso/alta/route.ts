// POST /api/btf/ingreso/alta → 201 Fotografo + cookie. El alta está cerrada salvo con BTF_CODIGO_ALTA.
import { timingSafeEqual, createHash } from "node:crypto";
import { hashPassword } from "@/lib/auth-password";
import { btfDb, exigirServidor } from "@/lib/btf/db";
import { usuarioLibre } from "@/lib/btf/dueno";
import { ErrorBtf, json, leerCuerpo, manejar, texto } from "@/lib/btf/http";
import { fotografoRed, MARCA_POR_DEFECTO } from "@/lib/btf/mapeo";
import { cookieDeSesion } from "@/lib/btf/sesion";
import { email as validarEmail } from "@/lib/btf/validar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Comparación en tiempo constante sobre el hash (largos iguales siempre). */
function codigoValido(dado: string, esperado: string | undefined): boolean {
  const e = esperado?.trim();
  if (!e) return false;
  const h = (s: string) => createHash("sha256").update(s, "utf8").digest();
  return timingSafeEqual(h(dado), h(e));
}

export function POST(request: Request) {
  return manejar(async () => {
    exigirServidor();
    const c = await leerCuerpo(request);
    if (!codigoValido(typeof c.codigo === "string" ? c.codigo.trim() : "", process.env.BTF_CODIGO_ALTA)) {
      throw new ErrorBtf("prohibido", "El código de alta no es válido.");
    }
    const nombre = texto(c.nombre, "el nombre", { max: 120 });
    const email = validarEmail(c.email);
    const contrasena = typeof c.contrasena === "string" ? c.contrasena : "";
    if (contrasena.length < 8 || contrasena.length > 200) throw new ErrorBtf("invalido", "La contraseña necesita al menos 8 caracteres.");
    if (await btfDb.btfFotografo.findUnique({ where: { email }, select: { id: true } })) {
      throw new ErrorBtf("duplicado", "Ya hay una cuenta con ese email.");
    }
    const f = await btfDb.btfFotografo.create({
      data: { nombre, email, usuario: await usuarioLibre(nombre), contrasena: await hashPassword(contrasena), marca: { ...MARCA_POR_DEFECTO } },
    });
    return json(fotografoRed(f), 201, { "set-cookie": cookieDeSesion(request, f.id) });
  });
}
