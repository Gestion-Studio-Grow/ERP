---
id: ADR-066
nivel: fundacional
dominio: [Seguridad, Producto]
depends_on: [ADR-022, ADR-025, ADR-041]
---
# ADR-066: Credenciales fiscales POR TENANT (CUIT + certificado ARCA) — corrige "secreto por ámbito, no por cliente"

**Estado:** Aceptado — **fundamento de seguridad/fiscal**. **Corrige** el principio previo "el secreto es por
ámbito, no por cliente": la credencial **fiscal** es intrínsecamente **por tenant**.
**Fecha:** 2026-07-10
**Depende de:** ADR-022 (plugin ARCA: credenciales por tenant ya nombradas), ADR-025 (multi-cliente por el
contador, cada cliente un tenant aislado), ADR-041 (dos fases de credenciales: las pega el dueño)
**Relacionado:** ADR-062 (RLS/aislamiento), ADR-065 (la fábrica siembra la credencial por tenant en la saga),
ADR-060 (por base de producto), ADR-017 (secretos de app) · `src/plugins/arca/`

---

## Contexto

El sistema tenía un principio operativo razonable para secretos de **plataforma**: *"secreto por ÁMBITO, no
por cliente"* (una `DATABASE_URL`, un `AUTH_SECRET`, un `OPERATOR_SECRET` por entorno — no uno por tenant).
Pero al aterrizar ARCA (ADR-022) y el producto multi-cliente del contador (ADR-025) apareció el choque: la
**credencial fiscal** (CUIT + **certificado/clave privada ARCA** para WSAA/WSFEv1) **es del contribuyente**,
distinta para **cada tenant**. Aplicarle el principio "por ámbito" facturaría a todos con el CUIT equivocado —
un error fiscal grave. Hace falta **corregir explícitamente** el principio para el dominio fiscal.

## Decisión

**La credencial fiscal es POR TENANT, no por ámbito.** Se distingue de forma dura entre dos clases de secreto:

- **Secreto de PLATAFORMA → por ámbito/entorno** (sigue vigente): `DATABASE_URL`, `AUTH_SECRET`,
  `OPERATOR_SECRET`, `CRON_SECRET`, `MP_WEBHOOK_SECRET`… uno por entorno, no por cliente.
- **Credencial FISCAL (y de integración del cliente) → por TENANT** (corrección): **CUIT + certificado ARCA +
  clave privada + punto de venta + condición IVA** son **dato del contribuyente**, uno por tenant. Idem las
  credenciales de integración propias del cliente (p. ej. su cuenta de Mercado Pago vía OAuth, ADR-025).

**Reglas:**
1. **Almacenamiento aislado por tenant**, cifrado en reposo, **scopeado por `tenantId`** (nunca legible
   cross-tenant; respeta RLS/plano, ADR-062/021). La clave privada del certificado **nunca** sale del borde
   que firma.
2. **Las pega SIEMPRE el dueño/cliente, nunca el agente** (FASE 2, ADR-041) — el agente jamás manipula el
   certificado real. En demo (FASE 1) no hay credencial fiscal real: se usa stub (ADR-022, cero DB/red).
3. **La fábrica de tenants** (ADR-065) reserva el paso "cargar credencial fiscal" como **paso de la saga**
   (compensable/reanudable), separado del alta de datos.
4. **El régimen fiscal es dato del tenant** (Monotributo/RI…), consumido por la calculadora central
   (ADR-064 §1.1) — no una rama de código por cliente.

> **En una línea:** *plataforma = un secreto por entorno; fisco = una credencial por contribuyente. Confundir
> los dos factura con el CUIT ajeno.*

## Consecuencias

- **(+)** **Corrección fiscal correcta:** cada tenant factura con SU CUIT/certificado → habilita el producto
  multi-cliente del contador (ADR-025) sin cruces.
- **(+)** **Blast radius mínimo:** una credencial comprometida afecta a **un** tenant, no a todos.
- **(+)** Encaja con el aislamiento (ADR-062) y con "el secreto lo pega el dueño" (ADR-041): menos manos sobre
  la clave privada.
- **(−)** **Gestión de secretos por tenant** es más costosa que una global: almacenamiento cifrado, rotación,
  y un paso de alta por cliente (la saga de ADR-065 lo absorbe).
- **(−)** Custodia del **certificado + clave privada** ARCA es material sensible → exige cifrado en reposo y
  auditoría; es infra/seguridad = **Gate del dueño** (irreversible).

## Alternativas descartadas

- **Una credencial fiscal "de plataforma" para todos** (el principio viejo mal aplicado). Facturaría con el
  CUIT equivocado — **inaceptable fiscalmente**. Es exactamente lo que este ADR corrige.
- **Guardar el certificado en el código/entorno del deploy.** Cómodo pero mezcla secreto de cliente con
  config de plataforma y no escala a N tenants. Rechazada: almacenamiento por tenant, cifrado, scopeado.
- **Que el agente cargue las credenciales fiscales.** Rechazada por ADR-041: el secreto real lo pega el
  dueño/cliente; el agente nunca toca la clave privada.

— Elaborado por GSG (Seguridad / Fiscal — corrección de principio; la custodia real del certificado es infra = Gate del dueño)
