---
id: ADR-001
nivel: fundacional
dominio: [Arquitectura, Datos]
depends_on: []
---
# ADR-001: Estrategia de Aislamiento Multi-Tenant

**Estado:** Propuesto
**Fecha:** 2026-07-01
**Contexto del proyecto:** ERP SaaS vertical para PyMEs argentinas (distribuidores/importadores), piloto inicial en blueprint "Servicios" (estética/spa). Equipo: 3 personas. Presupuesto de startup. Objetivo: escalar de 1 a miles de tenants sin rediseñar.

---

## 1. Problema a resolver
Definir cómo se aíslan los datos de cada cliente (tenant) en la base de datos, de forma que:
- Sea seguro (cero fuga de datos entre tenants — crítico, es dato fiscal/contable).
- Sea económicamente viable desde 1 cliente.
- No genere un techo de escalabilidad a 1.000-10.000 tenants.
- No obligue a reescribir el modelo de datos más adelante.

## 2. Alternativas evaluadas

| Estrategia | Descripción |
|---|---|
| A. Tenant_id compartido (shared schema) | Todas las tablas tienen columna `tenant_id`. Una sola base, un solo schema. |
| B. Schema por cliente | Misma base física, un schema de Postgres por tenant. |
| C. Base de datos por cliente | Instancia de DB independiente por tenant. |
| D. Híbrida por tier | Shared schema por defecto + schema/DB dedicado para tenants "enterprise" o con requisitos especiales. |

## 3-8. Comparación

| Criterio | A. Shared+tenant_id | B. Schema/tenant | C. DB/tenant | D. Híbrida |
|---|---|---|---|---|
| **Seguridad** | Buena, si se usa Row-Level Security (RLS) de Postgres. Riesgo si se olvida un WHERE tenant_id en algún query (RLS lo mitiga a nivel motor). | Muy buena, aislamiento físico dentro de la misma instancia. | Excelente, aislamiento total. | Excelente donde importa, buena en el resto. |
| **Costo a 1-10 clientes** | Mínimo. Una sola instancia chica. | Medio-bajo, pero ya complica migraciones (correr N schemas). | Alto: cada tenant es una instancia de DB. Inviable para MVP. | Bajo (arranca igual que A). |
| **Costo a 1.000-10.000 clientes** | Escala muy bien con connection pooling + sharding horizontal si hace falta. | Se vuelve inmanejable: miles de schemas, migraciones que corren N veces, monitoreo complejo. | Inviable operativamente sin equipo de DevOps dedicado grande. | Escala bien: 95% de tenants en shared, el resto aislado puntualmente. |
| **Migraciones de schema** | Una sola migración corre para todos. Simple. | Hay que correrla N veces (una por schema). Riesgo de desincronización. | Igual que B pero peor (N bases). | Simple para la mayoría, manual para los aislados. |
| **Backup/Restore** | Backup único, restore selectivo por tenant_id es más laborioso (hay que filtrar). | Backup/restore por schema, más granular. | Backup/restore trivial por tenant, pero N veces el costo operativo. | Lo mejor de ambos según el tier. |
| **Cumplimiento normativo (AFIP/ARCA, datos fiscales)** | Cumple si RLS está bien implementado. Argentina no exige aislamiento físico por ley para este tipo de dato. | Cumple, con margen extra de tranquilidad. | Cumple de sobra. | Cumple, y da argumento comercial ("tu empresa tiene DB dedicada") para tenants grandes. |
| **Complejidad técnica inicial** | Baja-media (hay que ser disciplinado con RLS y con nunca commitear un query sin tenant_id). | Media (connection routing dinámico por schema). | Baja por tenant, alta a nivel de orquestación general. | Media (hay que soportar los dos modos desde el diseño). |
| **Complejidad operativa a escala** | Baja. | Alta. | Muy alta. | Media, controlada. |

## 9. Costos (orden de magnitud, infraestructura de DB sola)

- **1 cliente:** A y D ≈ USD 0 (free tier de un Postgres gestionado tipo Supabase/Neon/RDS micro). C ya arranca en ~USD 15-25/mes por instancia mínima innecesaria.
- **100 clientes:** A/D siguen en una instancia mediana, ~USD 50-150/mes total. B empieza a necesitar tooling de migración custom. C: 100 instancias = varios miles de USD/mes + gestión imposible para un equipo de 3.
- **10.000 clientes:** A/D con sharding horizontal cuando haga falta (no antes). C directamente descartado para este tamaño de equipo.

## 10. Riesgos

- **Riesgo real de A:** un desarrollador se olvida el filtro `tenant_id` en un query manual → fuga de datos. **Mitigación:** usar RLS de Postgres (lo aplica el motor, no el código) + nunca permitir queries sin RLS activo, ni siquiera en scripts internos.
- **Riesgo de B/C:** velocidad de desarrollo cae mucho apenas hay más de una docena de tenants, porque cada cambio de modelo son N ejecuciones.
- **Riesgo de no decidir el híbrido desde el día 1:** si el modelo de datos no nace con `tenant_id` en cada tabla, migrar después de shared a cualquier otra cosa es mucho más doloroso que el camino inverso.

## 11. Recomendación

**Opción A (shared schema + tenant_id + Row-Level Security de PostgreSQL) desde el día 1, diseñada para eventualmente soportar D (híbrida) sin refactor.**

Justificación:
- Con 3 personas y presupuesto de startup, B y C son deuda operativa que no pueden pagar todavía.
- RLS de Postgres resuelve el principal riesgo de seguridad de A (aislamiento a nivel de motor, no de disciplina del programador).
- El camino de escape existe: si en el futuro un cliente enterprise exige aislamiento físico (por contrato o compliance), armás un schema o DB dedicado *solo para ese tenant*, sin tocar el resto de la plataforma. Eso es la opción D, y nace gratis si desde el día 1 diseñaste el modelo con `tenant_id` como ciudadano de primera clase.
- Ir directo a B o C sería sobre-ingeniería para un piloto de 1 cliente — exactamente el tipo de decisión que genera deuda técnica por complejidad prematura, no por deuda de código.

## 12. Impacto a 5 y 10 años

- **5 años:** con sharding horizontal (particionar por rango de tenant_id en varias instancias) esta arquitectura sostiene tranquilamente miles de tenants sin haber tenido que reescribir una sola tabla.
- **10 años:** si aparecen 2-3 clientes enterprise que exigen DB dedicada por contrato, los migrás puntualmente a D sin que el 99% de la base (PyMEs) se entere del cambio.

---

## Reglas de implementación derivadas de este ADR
1. **Toda tabla de negocio lleva `tenant_id` desde la primera migración.** No es opcional, no se agrega "después".
2. **RLS activado por default** en cada tabla nueva — se define una política antes de escribir el primer query contra esa tabla.
3. El código de aplicación **nunca** confía en que el desarrollador puso el filtro de tenant a mano; la seguridad vive en la base de datos, no en el ORM.
4. El campo `tenant_id` va indexado siempre, generalmente como parte de un índice compuesto con la clave de negocio más consultada.
