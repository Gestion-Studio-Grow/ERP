---
id: SEC-5
categoria: SEC
tipo: leccion
generado: true
tags: [brain/leccion, leccion/sec]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# [SEC-5] Un PIN más largo que no se usaba: el viejo firmaba y el tope se reseteaba con otro PIN

**Categoría:** Seguridad

> 🛡️ **Guardarraíl (la regla verificable):**
> al cambiar el largo o la forma de una credencial, listar **cada lugar que la acepta** (entrar, firmar, aprobar remoto) y decidir uno por uno; el tope de intentos es **uno por dispositivo** y no lo resetea un acierto de quien tiene la credencial débil (acá, recepción): sólo uno de la fuerte (dueño) o el tiempo.

**Lección:** endurecer una credencial es cambiar **qué firma**, no sólo qué entra; y un rate-limit que se resetea con *cualquier* acierto se esquiva intercalando una credencial propia.

## Detalle

- **Síntoma:** al pasar los PIN de los dueños de Break Point de 2 a 4 dígitos (18/10/2026), el Gate encontró que el
  PIN viejo de 2 seguía **firmando** descuentos y aprobaciones (sólo la entrada pedía el cambio), que el descuento no
  tenía tope de intentos y que cada pantalla tenía su propio contador (y cualquier acierto lo ponía en cero).
- **Causa raíz:** la migración se pensó desde la ENTRADA (no dejar afuera a nadie) y no desde la FIRMA; y el tope se
  copió por pantalla en vez de ser uno de la compu.
- **Fix:** `verificarFirma` en el motor (el PIN viejo entra, no firma) dentro de `autorizar`; un solo contador
  persistente (`anotarIntentoPin`, `bp-intentos`) para bloqueo, cambio de usuario, descuento y aprobación; un acierto
  de recepción no borra los fallos; filtro de PIN fáciles (`pinFacil`).
- **Lección:** endurecer una credencial es cambiar **qué firma**, no sólo qué entra; y un rate-limit que se resetea
  con *cualquier* acierto se esquiva intercalando una credencial propia.
- **Guardarraíl:** al cambiar el largo o la forma de una credencial, listar **cada lugar que la acepta** (entrar,
  firmar, aprobar remoto) y decidir uno por uno; el tope de intentos es **uno por dispositivo** y no lo
  resetea un acierto de quien tiene la credencial débil (acá, recepción): sólo uno de la fuerte (dueño) o el tiempo.
- **Refs:** SEC-4; `public/previews/breakpoint/club/motor.mjs` (`verificarFirma`, `anotarIntentoPin`, `pinFacil`);
  `docs/tenants/breakpoint/REINGENIERIA.md §10`.


---

Fuente: [registro.md](../../docs/lecciones-aprendidas/registro.md) · Índice: [guardarraíles](000-INDICE.md) · Estado: [foto del repo](../10-estado/ESTADO.md)
