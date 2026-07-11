---
id: ADR-076
nivel: fundacional
dominio: [Producto, Arquitectura]
depends_on: [ADR-054, ADR-055, ADR-058, ADR-060, ADR-061, ADR-029]
---
# ADR-076: Suite de facturación — UN motor, TRES productos empaquetados (A·Comerciante / B·Contador / C·Facturita)

**Estado:** Aceptada — decisión estructural del dueño (Maxi), 2026-07-11. Fuente: síntesis del equipo de
diseño **+ challenger (ADR-045)** corrido el 2026-07-11.
**Fecha:** 2026-07-11
**Depende de:** ADR-054/055 (módulos activables por tenant — el mecanismo de empaquetado), ADR-058 ("crecé
sin migrar" — el upgrade es aditivo, mismo tenant), ADR-060/061 (motor invisible compartido, config sobre
código, nada de `if producto`), ADR-029 (ruteo por hostname — acá se extiende a host→producto)
**Relacionado:** ADR-075 (el módulo bancos que define la frontera), ADR-077 (el producto B en detalle),
ADR-078 (pricing de los tres), ADR-025 §10 (modelo "contador socio" — acá se convierte en producto y canal)

---

## Contexto

Con el módulo de facturación bancaria en main (ADR-075), el mismo motor fiscal sirve a públicos con
necesidades y bolsillos muy distintos: el comerciante que quiere que "se facture solo", el contador que
administra una cartera de monotributistas, y el monotributista chico que solo necesita emitir 3 facturas
por mes. La tentación clásica es hacer tres apps — y ya sabemos cómo termina: forks, triple mantenimiento,
y el motor divergiendo (exactamente lo que ADR-061 prohíbe). El challenger (ADR-045) presionó además el
riesgo comercial inverso: si los tres productos son "lo mismo con otro precio", el barato canibaliza al
caro y el contador nos ve como competencia en vez de canal.

## Decisión

**UN motor, TRES productos empaquetados** — la suite de facturación se vende como tres productos que son
**empaquetados de módulos por tenant** (mecanismo ADR-054/055), **NUNCA forks**:

1. **Los tres productos:** **A·Comerciante** (el negocio que factura lo suyo: extracto + MP + tope +
   clasificador), **B·Contador** (el estudio que administra una cartera de clientes — detalle en ADR-077),
   **C·Facturita** (emisión simple y gratuita para el monotributista chico — el funnel).
2. **Cada producto con SU cara comercial propia:** link de venta, landing y signup **propios por producto**.
   Técnicamente: **ruteo host→producto**, extensión natural del host→tenant vigente (ADR-029) — el mismo
   deploy sirve todo (ADR-070); la diferencia es config, no artefacto.
3. **Frontera anti-canibalización DURA** (respuesta al challenger):
   - **C jamás incluye extracto ni conciliación** — esa es la línea que no se cruza ni "por esta vez".
   - **A se precia por negocio** (un tenant, su facturación).
   - **B se precia por cartera** (packs de clientes — ADR-078).
4. **Upgrade entre productos = activar módulos en el MISMO tenant, sin migrar datos.** Es ADR-058 aplicado
   a la suite: pasar de C a A (o de un cliente de cartera B a un A propio) es prender módulos, no exportar
   e importar nada.
5. **El contador es CANAL, no competencia.** Cuando un cliente de la cartera de un contador "se gradúa" a
   A·Comerciante, el contador cobra una **comisión de graduación** (20% × 12 meses — números en ADR-078).
   El diseño alinea incentivos: al contador le conviene que sus clientes crezcan dentro de la suite.
6. **Primer cliente real: un contador (cartera).** El go-to-market arranca por B — valida el motor con
   volumen real y convierte al contador en distribuidor de A y C.

**Regla de oro heredada (ADR-061):** si en el motor aparece un `if producto`, falta un eje de configuración
(módulo/flag/blueprint). El producto es un empaquetado + un host + un precio — nada más.

## Consecuencias

- **(+)** Tres mercados con un solo código: el costo marginal de "lanzar un producto" es un empaquetado +
  una landing, no un desarrollo. Coherente con la fundación (ADR-060/061) y con el catálogo (ADR-054).
- **(+)** El upgrade sin migración convierte a C en el CAC de A (ADR-078) y a B en canal de distribución —
  la escalera comercial ES la arquitectura.
- **(+)** La frontera dura de C protege el precio de A/B: lo gratis nunca hace el trabajo pesado
  (extracto/conciliación).
- **(−) Deuda anotada:** el ruteo host→producto (landing/signup por producto) hay que cablearlo sobre
  ADR-029; el signup self-serve de C dispara la fábrica de tenants (ADR-074) que todavía tiene su saga en
  scaffold. Hasta entonces, altas operadas.
- **(−)** Tres marcas comerciales para mantener (copy, landing, pricing page) — mitigado porque el shell
  es común y los textos se gobiernan por la guía única (ADR-080).

— Elaborado por GSG · 2026-07-11

> Numeración provisional — verificar colisión al mergear (regla de timestamps de CLAUDE.md aplicada a ADRs).
