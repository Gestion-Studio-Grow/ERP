# Roadmap de producto y estrategia de escala — GSG

**Qué es este documento:** el roadmap de producto por segmento de mercado LOCAL (Argentina), más la
estrategia de escala LOW→MID→BIG. Complementa `docs/fundamentos/bases-gsg.md` (identidad/posicionamiento)
y se apoya en el estado real del código relevado el 2026-07-06. Consolidado con los dueños, sesión de
Advisory Board.

**Fuera de alcance de este documento:** expansión regional (es "otra línea de producto", ver bases §3)
y el modelo comercial/pricing fino — ambos deliberadamente dejados abiertos (ver §4).

---

## 1. Lógica de segmentación: por tipo de contribuyente fiscal, no por tamaño abstracto

Decisión explícita de los dueños: **medir el mercado local por su estatus fiscal ante AFIP/ARCA**, no
por facturación en abstracto ni por rubro — porque ese estatus es lo que en los hechos determina la
complejidad real que el negocio necesita resolver (régimen de facturación, percepciones/retenciones,
reporting). Se traduce en **tres suscripciones/plataformas** (⚠️ el mapeo fiscal exacto es una hipótesis
de trabajo — validar con un contador antes de comunicarlo comercialmente; la lógica de tiers no cambia
aunque el nombre de la categoría AFIP/ARCA se ajuste):

| Tier | Estatus fiscal | Lo que ese estatus obliga a resolver | Propuesta de valor |
|---|---|---|---|
| **BAJA** | Monotributo / RI chico sin retenciones | Factura simple (C), sin discriminar IVA, sin percepciones | *"Todo automatizado, versión simple"* — self-serve, prende y factura, sin fricción |
| **MEDIANO** | Responsable Inscripto (IVA general) | Factura A/B, percepciones IIBB según jurisdicción, libro IVA digital | *"Backoffice full"* — control total de la operación, multi-sucursal, gestión de gente |
| **GRANDE** | Agente de Retención/Percepción — Grandes Contribuyentes | Régimen de información (tipo SICORE), retenciones automáticas, auditoría | *"Producto 100% completo"* — todos los plugins que hacen fit, nivel SAP, con implementación guiada |

**Regla de suite (confirmada por los dueños — NO es un módulo a la vez):** el diferencial de GSG frente
a un SaaS de nicho no es una feature suelta, **es la suite integrada**, igual que SAP. Cada tier no es
"un producto distinto" en el sentido de un fork — es **el mismo Core, con más plugins/módulos activados**
a medida que el contribuyente lo necesita. Subir de tier es activar capacidades del mismo sistema, nunca
migrar de sistema.

## 2. Estado real de módulos hoy (línea de base, relevado 2026-07-06)

| Módulo | Estado | Nota |
|---|---|---|
| Core multi-tenant + Blueprints + RLS | Construido, en prod | `ADR-001/002/018`, RLS enforced |
| Agenda/turnos | Construido (parcial) | Falta no-show tracking, push |
| POS/venta retail | Construido | Blueprint retail, 6 rubros |
| Comisiones | Construido | ADR-020/021 |
| Inventario (ledger básico) | Construido | F1b + F2 en main |
| Inventario avanzado (multi-depósito, lotes) | Migraciones escritas, **sin aplicar** (Gate 2) | `20260705140000/150000` |
| Mercado Pago | Construido (stub) | Falta OAuth real, credenciales por tenant |
| ARCA/AFIP (facturación) | Scaffold | Falta certificado X.509 + tabla Invoice + migración (Gate 2) |
| WhatsApp (router + CTA) | Construido (parcial) | Falta webhook HTTP real de entrada (Meta/Twilio) |
| Owner insights / reportería | Construido | ADR-035 |
| CRM/fidelización | Parcial | Sin puntos/loyalty ni segmentación |
| E-commerce (carrito/checkout) | Parcial | Sin checkout real ni envíos |
| Multi-sucursal | **No existe** | Schema `BusinessSettings` es singleton por tenant |
| RRHH / nómina | **No existe** | Solo comisiones, no control horario ni liquidación |
| Envíos (Correo Argentino, Andreani) | **No existe** | — |
| Seguridad enterprise (SSO, auditoría fina) | Parcial | RLS vivo; faltan 2 rojos pre-cobros (rotar secretos, PITR) |

## 3. Roadmap por tier — qué se completa en cada uno

### Tier BAJA — ya vendible hoy (los 4 clientes actuales están acá)

Objetivo: automatizar 100% lo simple, cero fricción, self-serve.

- Core + Blueprint del rubro — **listo**
- Facturación C automática (sin percepciones) — completar plugin ARCA (certificado + Invoice + Gate 2)
- Cobro Mercado Pago simple — cerrar OAuth real
- WhatsApp CTA (intención básica) — **listo**
- Reportería básica (ventas del día/mes) — **listo**
- Onboarding self-serve vía Generador de Preset por IA — **listo**

**Hito:** cerrar ARCA + MP reales en este tier antes de escalar esfuerzo a MEDIANO — es la base que
sostiene el volumen y la caja de GSG hoy.

### Tier MEDIANO — objetivo: primer cliente real en 6 MESES (≈ enero 2027)

Objetivo: backoffice full — el contribuyente RI necesita gestionar personal, stock real y ventas
online sin depender de tres herramientas sueltas.

Módulos "puerta" (mínimo viable de MEDIANO, se construyen primero y en paralelo):
1. **Multi-sucursal v1** (2-3 locales: caja y stock separados por sucursal) — desde cero, el gap más
   grande y el que más define "ya no sos BAJA".
2. **Facturación A/B completa** + percepciones IIBB + libro IVA — extensión del plugin ARCA.
3. **Inventario avanzado** — aplicar las migraciones ya escritas (Gate 2) + cablear multi-depósito y
   lotes/vencimientos (crítico para carnicería-tipo).

En paralelo, no bloqueantes para el primer cliente pero necesarios para sostener el tier:
4. CRM/fidelización (puntos, segmentación, campañas)
5. E-commerce completo (checkout real + integración de envíos, Correo Argentino/Andreani)
6. RRHH básico (turnos de empleados, control horario)
7. WhatsApp conversacional completo (cerrar el webhook HTTP real)

**Hito (6 meses):** 1-3, con el cliente real como forzador de alcance — el primer piloto MEDIANO define
cuál de los tres módulos "puerta" se prioriza primero según su necesidad concreta (no se decide en
abstracto). 4-7 se completan en los meses siguientes, no antes del piloto.

### Tier GRANDE — horizonte 12-18 meses, apalancando el activo SAP del dueño

Objetivo: la suite 100% completa, con todos los plugins que hacen fit — nivel de exigencia SAP real.

- Todo lo de MEDIANO, más:
- Régimen de información avanzado / agente de retención (tipo SICORE) automatizado
- RRHH completo (liquidación de sueldos, legajos, no solo control horario)
- Multi-sucursal a escala + consolidación y tesorería centralizada
- Integraciones bancarias (conciliación automática)
- Seguridad/compliance de nivel enterprise (SSO, roles granulares, auditoría fina) — construye sobre
  el trabajo ya iniciado en Frente Seguridad, cerrando primero sus 2 rojos pendientes (rotar secretos,
  PITR) como condición de entrada a este tier, no como opcional

**Ventaja competitiva concreta de este tier:** el dueño de GSG implementa personalmente SAP Public
Cloud Finance en mercado grande en su práctica profesional — el primer piloto GRANDE puede (y debería)
ser **guiado directamente por él**, aplicando ese know-how real de implementación enterprise a precio y
ejecución argentina. No es un segmento "a self-serve": es consultivo por diseño.

## 4. Modelo comercial y pricing — dejado deliberadamente dinámico

Decisión explícita de los dueños: el modelo comercial (self-serve vs venta asistida vs consultiva,
pricing por tier, canal directo vs partner) **no se fija en este documento** — es una palanca que
gestiona **Agencia Digital** como su dominio (`docs/sectores/agencia-digital.md`), y puede ajustarse
sin tocar el roadmap de producto. Este documento fija **qué construir y cuándo**; Agencia Digital
decide **cómo se vende** cada tier.

## 5. Riesgos abiertos (para tensionar)

- El hito de 6 meses para MEDIANO depende de cerrar Gate 2 (migraciones de inventario y ARCA aplicadas
  a Neon) — hoy pausado, requiere OK del dueño.
- La ambición de "suite completa tipo SAP" es, por diseño, un objetivo de largo aliento — sin una
  secuencia de alcance por hito (§3), se vuelve ambición sin roadmap. Este documento fija esa secuencia
  como primera versión, sujeta a revisión con cada piloto real.
- El mapeo tier↔categoría fiscal (§1) es una hipótesis de trabajo, no validada aún con un contador.
