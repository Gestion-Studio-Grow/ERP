/**
 * Reexport del validador de CUIT/CUIL, que ahora vive en el CORE (`@/lib/cuit`).
 *
 * Por qué se movió: el perfil fiscal del emisor (`@/lib/fiscal`) también tiene
 * que validar el CUIT antes de emitir, y el Core NO puede importar un plugin
 * (la dependencia va plugin→Core, ADR-002). El módulo es puro y sin deps, así
 * que subirlo al Core es lo correcto; este archivo queda para no tocar a los
 * consumidores del plugin (`@/plugins/bancos`).
 */

export { normalizarCuit, cuitValido } from "@/lib/cuit";
