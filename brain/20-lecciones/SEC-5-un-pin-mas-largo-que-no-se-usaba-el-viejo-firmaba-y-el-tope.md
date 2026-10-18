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
> una tabla de rastro que se usa como almacén (una foto en `AuditLog`) se **excluye de todo lector genérico** el mismo día que se crea (`ENTIDADES_FUERA_DE_LA_AUDITORIA`), con test contra Postgres.

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
- **Deuda abierta (Gate del club en la base, 18/10/2026):** con la jornada en la base (BP-3, «modo foto») los PIN en
  claro del sobre v1 también quedan en `AuditLog.changes` (entidad `ClubEstado`) y vuelven en `leerFotoDelClub` a
  cualquier puesto con `agenda:manage`. Y el servidor no hace cumplir G8: `guardarFotoDelClub` no distingue un
  guardado de un restaurar ni sabe qué cambió; lo hace cumplir la pantalla. La Auditoría del panel las excluye (B1:
  mostraba los PIN y cargaba decenas de MB). Hash/redacción y comandos: BP-4 / G10
  (`docs/tenants/breakpoint/PARIDAD-REACT.md`, «Lo que el servidor no controla»).
- **Guardarraíl (sumado):** una tabla de rastro que se usa como almacén (una foto en `AuditLog`) se **excluye de todo
  lector genérico** el mismo día que se crea (`ENTIDADES_FUERA_DE_LA_AUDITORIA`), con test contra Postgres.
- **Refs:** SEC-4; `public/previews/breakpoint/club/motor.mjs` (`verificarFirma`, `anotarIntentoPin`, `pinFacil`);
  `docs/tenants/breakpoint/REINGENIERIA.md §10`.


---

Fuente: [registro.md](../../docs/lecciones-aprendidas/registro.md) · Índice: [guardarraíles](000-INDICE.md) · Estado: [foto del repo](../10-estado/ESTADO.md)
