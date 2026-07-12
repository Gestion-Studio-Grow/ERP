---
id: ADR-093
nivel: fundacional
dominio: fiscal
depends_on: [ADR-066, ADR-041, ADR-022]
---

# ADR-093 — Credenciales fiscales por tenant: implementación (cifrado en sobre + guard fail-closed)

**Estado:** Aceptada / implementada (2026-07-12) · **Depende de:** ADR-066 (credenciales fiscales POR TENANT — la decisión), ADR-041 (dos fases de credenciales · las pega el dueño), ADR-022 (plugin ARCA) · **Relacionado:** ADR-092 (RLS, la tabla nueva lleva policy), ADR-077 (contador · cert por delegación).

> Numeración provisional — verificar colisión al mergear (regla de timestamps de CLAUDE.md aplicada a ADRs; otras sesiones podrían haber tomado números 081 en adelante).

## Contexto

ADR-066 decidió que las credenciales fiscales (CUIT + certificado/clave ARCA + punto de venta + condición IVA) son **por tenant, cifradas, scopeadas por `tenantId`** — no por entorno. Faltaba **construirlo**: hasta ahora ARCA leía el cert de un env único (`ARCA_CERT_PEM`/`ARCA_KEY_PEM`), lo que **viola ADR-066** (un cert compartido para todos los tenants).

## Decisión (lo implementado)

1. **Tabla `TenantFiscalCredential`** — cert + clave privada **cifrados con envelope encryption** (la master key `FISCAL_MASTER_KEY` vive **solo en Vercel**, nunca en repo ni logs; ADR-041). **Migración `20260711140000_add_tenant_fiscal_credential` APLICADA a prod (2026-07-12)** — RLS re-ejecutado a **43 tablas**, la nueva incluida (ADR-092).
2. **`credencialParaTenant(tenantId)` reemplaza a `credencialDesdeEnv`** como fuente de la credencial en el pipeline real (outbox → `clientePara` → `credencialParaTenant`). El cert por env queda **solo** para el "banco de pruebas" aislado.
3. **Guard fail-closed CUIT↔cert:** en modo `real`, el CUIT del subject del certificado **debe** coincidir con `Tenant.arcaCuit`, o `crearAfipClient` **aborta** (nunca firma con el cert de otro contribuyente). En `real`/`homologacion` la credencial por tenant es **obligatoria** — sin ella **lanza** (no cae al stub ni a un env compartido).
4. **`ARCA_MODO=homologacion` es fail-safe:** `configParaModo` **fuerza `homologacion: true`** ignorando `Tenant.arcaHomologacion`, y los endpoints resuelven **siempre** al ambiente de test de ARCA. Aunque un tenant se crea "en producción", `ARCA_MODO=homologacion` lo pisa → **imposible emitir una factura real**. Default del modo = **`stub`** (un typo cae a stub, no emite nada).
5. **Carga por consola:** el dueño pega cert + clave en `/operador/tenants/[id]` → card "Credencial fiscal · ARCA". El agente **nunca** maneja el material (ADR-041).

## Consecuencias

**Habilita:** probar facturación en **homologación** hoy (cert de prueba del dueño, mismo para los 4 tenants con su CUIL) y pasar a **real** por tenant sin tocar código — runbook `docs/runbooks/arca-homologacion.md`. Cierra la violación de ADR-066 (cert por env único).

**Deuda / follow-ups:**
- **Gap: no hay campo de CUIT en la consola** todavía — `/operador/tenants/[id]` **avisa** si falta `arcaCuit` pero no lo setea (hay que setearlo por DB). Lo cierra la rama `fiscal/consola-cuit`.
- **Drift huérfano `fiscal_config`:** queda una migración `add_tenant_fiscal_config` previa cuya tabla puede haber quedado sin uso pleno tras esta implementación — revisar al consolidar el schema fiscal.
- **Colisión de timestamp:** `20260711140000_add_tenant_fiscal_credential` comparte timestamp con `20260711140000_add_cartera_cliente` (Prisma ordena por nombre de carpeta, determinista, pero **no agregar una tercera con ese timestamp**).
- Lo que falta es **acción del dueño**: `ARCA_MODO` en Vercel + CUIT por tenant + cargar el cert de prueba.

— Elaborado por GSG · 2026-07-12
