---
id: ADR-077
nivel: evolutiva
dominio: [Producto, Arquitectura, Multi-tenant]
depends_on: [ADR-076, ADR-055, ADR-019, ADR-074, ADR-018, ADR-021, ADR-066]
---
# ADR-077: Producto B·Contador — cartera multi-cliente (cada cliente ES un tenant + delegación ARCA)

**Estado:** Aceptada — decidido por el dueño (Maxi) en sesión 2026-07-11; en ejecución. Primer cliente real
de la suite es un contador (ADR-076 §6).
**Fecha:** 2026-07-11
**Depende de:** ADR-076 (la suite — B es uno de los tres empaquetados), ADR-055 (VARIANTE — la cartera es
una asignación con ABM propio), ADR-019/074 (el alta de cliente reusa `provisionTenant`), ADR-018 (RLS —
el aislamiento que hace viable "cada cliente un tenant"), ADR-021 (por qué el panel NO usa el plano de
operador), ADR-066 (credenciales fiscales por tenant — acá se instancia el modelo de delegación)
**Relacionado:** ADR-025 §10 (el "contador socio" original que este ADR baja a producto), ADR-075 (el
módulo bancos que el contador opera por cliente), ADR-078 (packs de cartera + comisión de graduación)

---

## Contexto

ADR-025 §10 ya había visto al contador como figura clave: un operador que administra la facturación de una
cartera de monotributistas. ADR-076 lo convierte en producto (B·Contador) y en canal. Faltaba decidir el
**modelo de datos y de aislamiento**: ¿la cartera son filas dentro del tenant del estudio, o cada cliente
es un tenant propio? Y el problema fiscal concreto: emitir por N CUITs distintos, ¿exige N certificados
ARCA desde el día uno?

## Decisión

1. **Cada cliente del contador ES un Tenant del ERP.** No filas en el tenant del estudio: tenant completo,
   con su RLS **gratis** (ADR-018/062 ya lo aíslan sin trabajo extra) y su **upgrade natural** — si el
   cliente crece y quiere su A·Comerciante propio, ya ES un tenant: se le activan módulos (ADR-076 §4), no
   se migra nada.
2. **El estudio también es un Tenant** (con su propio negocio: su facturación, sus settings, su marca).
3. **`CarteraCliente(estudioTenantId, clienteTenantId, estado)`** — la cartera es una **tabla de
   asignación con ABM propio**, patrón VARIANTE (ADR-055) aplicado al eje estudio↔cliente: el cliente
   (objeto maestro = tenant) se crea una vez y se **asigna** a la cartera; asignar/desasignar/suspender es
   el ABM de la relación, nunca "el estudio ve todo".
4. **El panel `/contador` agrega SIEMPRE vía `tenantTransaction` por cliente — jamás `operatorPrisma`.**
   El panel cross-cliente se construye iterando la cartera con el contexto de tenant de CADA cliente
   (RLS puesto por transacción, ADR-018); el plano de operador (ADR-021) es de plataforma y NO se le presta
   a un usuario final, ni siquiera al contador. La autorización del panel es una **capability propia**
   (`contador`), gateada por la asignación de cartera.
5. **Alta de cliente = reusar `provisionTenant`** (ADR-019, orquestado por la saga de ADR-074 cuando
   aplique). El alta desde el panel del contador es el mismo core de siempre + la fila de `CarteraCliente`.
   Reuso, no reimplementación (ADR-055).
6. **Certificado ARCA — modelo DELEGACIÓN:** un certificado de GSG sirve para **N CUITs**: cada cliente
   **autoriza el servicio `wsfe` al CUIT de GSG desde su Administrador de Relaciones** de ARCA (el patrón
   que usa Facturante). No hace falta generar/instalar un certificado por cliente para arrancar — la
   relación la da de alta el propio contribuyente en 5 minutos. Matiza ADR-066: la credencial *fiscal
   identitaria* (CUIT, PV, condición IVA) sigue siendo **por tenant**; lo que se comparte es el
   *certificado transportador* bajo delegación explícita y auditable.
7. **Estado actual y evolución:** hoy corre el **cert único del dueño en homologación**; el corte a
   **cert-por-cliente** (o cert propio de GSG en producción con delegaciones) se dispara **al 2º cliente
   real emitiendo** — antes es sobre-ingeniería (gobierno calidad-vs-costo).

## Consecuencias

- **(+)** Aislamiento y upgrade resueltos por arquitectura existente: cero mecanismos nuevos de seguridad —
  la cartera es una relación, no un privilegio. La regla "jamás `operatorPrisma`" mantiene el plano de
  plataforma (ADR-021) limpio de usuarios finales.
- **(+)** La delegación ARCA baja la fricción de alta de semanas a minutos y hace viable el pack de 10
  clientes del día uno (ADR-078) sin operativa de certificados.
- **(+)** El patrón VARIANTE vuelve a pagar: `CarteraCliente` es el mismo molde que servicio↔profesional y
  módulo↔tenant — ABM conocido, guardarraíl conocido.
- **(−) Deuda anotada:** `CarteraCliente` es tabla nueva → **migración = Gate 2** (no se aplica sola);
  hasta entonces el panel puede operar con la asignación en config/seed de homologación. El rendimiento del
  panel agregando N transacciones por cliente hay que medirlo con carteras grandes (30+); si duele, la
  salida es una proyección/caché por estudio — nunca saltarse el RLS.
- **(−)** La delegación concentra riesgo operativo en el cert de GSG (revocación, vencimiento, auditoría de
  qué se emitió por quién) → entra al runbook fiscal y al registro de emisiones por tenant.

— Elaborado por GSG · 2026-07-11

> Numeración provisional — verificar colisión al mergear (regla de timestamps de CLAUDE.md aplicada a ADRs).
