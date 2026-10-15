---
id: SEC-4
categoria: SEC
tipo: leccion
generado: true
tags: [brain/leccion, leccion/sec]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# [SEC-4] Superficie pública: un límite por IP que bloquea al club y un "motivo" que nombra a otro cliente

**Categoría:** Seguridad

> 🛡️ **Guardarraíl (la regla verificable):**
> en superficies públicas, rate-limit **por usuario** (fallos) + por IP **sólo fallos** y con techo generoso; nunca devolver el `motivo` del motor a un tercero sin pasarlo por un filtro de "qué puede ver este rol".

**Lección:** el límite por IP castiga al NAT compartido (club, oficina, 4G con CGNAT); y un mensaje de dominio "en criollo" puede llevar datos de terceros: hay que **decidir quién lo lee** antes de exponerlo.

## Detalle

- **Síntoma:** en el turnero de Break Point (15/10/2026), (a) el límite de intentos de ingreso por IP contaba también
  los ingresos **exitosos**: con el Wi-Fi del club (decenas de jugadores detrás de una IP) se bloqueaba en una noche
  movida; (b) el 409 de "turno ocupado" devolvía el motivo del motor tal cual: «Se pisa con Ana Test (23:30–01:00)».
- **Causa raíz:** (a) se copió el patrón "contar pedidos" en vez de "contar fallos"; (b) los motivos del motor están
  escritos para la recepcionista (que puede ver nombres), y se reusaron en una API pública sin filtrar.
- **Fix:** por IP cuentan sólo los fallos (30/15'), por usuario 5/15'; el 409 público es genérico + alternativas.
  Tests: 20 registros desde la misma IP pasan; ningún nombre en el 409 ni en el SSE público.
- **Lección:** el límite por IP castiga al NAT compartido (club, oficina, 4G con CGNAT); y un mensaje de dominio "en
  criollo" puede llevar datos de terceros: hay que **decidir quién lo lee** antes de exponerlo.
- **Guardarraíl:** en superficies públicas, rate-limit **por usuario** (fallos) + por IP **sólo fallos** y con techo
  generoso; nunca devolver el `motivo` del motor a un tercero sin pasarlo por un filtro de "qué puede ver este rol".
- **Refs:** SEC-3; `src/tenants/breakpoint/turnero/back/servidor.mjs`; `docs/tenants/breakpoint/TURNERO-QA.md` (D1, D3).


---

Fuente: [registro.md](../../docs/lecciones-aprendidas/registro.md) · Índice: [guardarraíles](000-INDICE.md) · Estado: [foto del repo](../10-estado/ESTADO.md)
