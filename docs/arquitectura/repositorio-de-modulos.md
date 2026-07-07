# Repositorio de módulos / plugins — arquitectura de la FUNDACIÓN

**Estado:** ✅ Fundación implementada (reversible, detrás de flag) — 2026-07-07 · **Opus (reingeniería)**
**Implementa:** ADR-054 (repositorio de plugins) · **ADR-055 (principio de variante)**
**Depende de:** ADR-002 (Core/Blueprint/Plugin) · ADR-006 (Integration Engine / manifiesto) · ADR-001/018 (multi-tenant + RLS) · ADR-044 (argentinizar SAP)
**Código:** `src/modules/` (contenedor) · `src/plugins/arca/module.ts` (ejemplo migrado)
**Firma:** — Elaborado por GSG

---

## 1. Qué es esto (y qué NO)

Es **el contenedor donde enchufan los módulos** del ERP (servicios/agenda, catálogo,
clientes, ARCA, Mercado Pago, …): el molde común para **definir**, **catalogar**,
**versionar** y **activar por tenant** un módulo, sin forkear la plataforma.

**NO** es un módulo nuevo de negocio ni un marketplace (ADR-006 lo difiere). Es el
**andamiaje** — el "repo" y su contrato. Se **nutre** agregando descriptores; el molde
no cambia cuando entra un módulo nuevo.

Formaliza —sin reemplazar— tres cosas que ya vivían dispersas:

| Antes (informal) | Ahora (formal) |
|---|---|
| `PluginManifest` en `src/plugins/arca/manifest.ts` | `ModuleDescriptor` (`src/modules/contract.ts`) — superconjunto; el manifiesto legado se **deriva** |
| `ModuleDef` + `MODULES` en `src/lib/operator-config.ts` | descriptores nativos (`src/modules/descriptors/nativos.ts`) |
| `Tenant.modules[]` a secas | la **asignación** validada por variante (`src/modules/activation.ts`) |

## 2. El principio de variante (ADR-055) — el corazón

Argentinización del patrón **material master + assignment** de SAP: un **objeto-maestro**
único, y una **asignación** que dice quién lo usa. Cada capa con su **ABM**.

```
          OBJETO-MAESTRO                          ASIGNACIÓN
   (definición única del módulo)          (qué activa cada tenant)
   ┌───────────────────────────┐          ┌───────────────────────────┐
   │  ModuleDescriptor          │          │  Tenant.modules[]          │
   │  id · version · kind       │  ◄────►  │  (lista explícita por      │
   │  rubros (COMPAT) · deps    │          │   tenant, DIFERENCIADA)    │
   │  eventos · comandos · cfg  │          │                            │
   │  ABM: catálogo (curación)  │          │  ABM: consola de operador  │
   └───────────────────────────┘          └───────────────────────────┘
        "dónde PUEDE aplicar"                  "dónde SE activa"
```

**Regla de oro — COMPATIBILIDAD ≠ ASIGNACIÓN.** Que un módulo sea *compatible* con un
rubro no significa que se *active* para todos los tenants de ese rubro. ARCA es
compatible con `todos` los rubros, pero solo se activa en los tenants que facturan. La
compatibilidad es amplia; la **asignación es deliberada y tenant por tenant**.

**Por qué importa (lección DX-6):** una asignación **uniforme** ("todos con todo") es
exactamente lo que hizo que el front *mintiera* (las 3 profesionales de CH mostrando el
mismo catálogo). El resolver de asignación **nunca infla**: parte de lo que el tenant
asignó y solo **resta** lo que no corresponde (incompatible con el rubro, o sin sus
dependencias). Nunca agrega lo que el tenant no pidió.

## 3. El contenedor (`src/modules/`)

```
src/modules/
  contract.ts      ← ModuleDescriptor (objeto-maestro) + validación pura + adaptador legado
  registry.ts      ← ModuleRegistry: el "repo" (registrar/get/listar + validar catálogo)
  activation.ts    ← la variante en acción: resolverActivacion(tenant) + asignacionSugerida
  flags.ts         ← moduleRegistryEnabled (reversibilidad; default OFF)
  catalog.ts       ← el catálogo curado: construirCatalogo() valida estricto (fail-closed)
  index.ts         ← superficie pública
  descriptors/
    nativos.ts     ← módulos capability del Core (agenda, catálogo, clientes, …)
    mercadopago.ts ← descriptor del plugin MP
src/plugins/arca/
  module.ts        ← arcaModule (FUENTE DE VERDAD) → arcaManifest se deriva  [ejemplo migrado]
  manifest.ts      ← shim de compat (re-exporta el tipo y el manifiesto derivado)
```

### 3.1 Cómo se DEFINE un módulo — `ModuleDescriptor`

Contrato declarativo (ver `contract.ts`): `id` (kebab, estable), `version` (semver),
`nombre`/`descripcion` (criollo, sin jerga — ADR-044), `kind` (`capability` nativa vs
`plugin` integración), `capability` (ata al RBAC), `rubros` (compatibilidad de variante:
`"todos"` o lista), `dependencias` (otros módulos, con rango semver), `consumeEventos` /
`llamaComandos` (superficie de integración, ADR-002/006), `configSchema` (config por
tenant; `secreto:true` ⇒ nunca al repo), `migraciones` (metadata **solo aditiva**;
nunca se aplican desde acá), `flag` (rollout).

### 3.2 Cómo se ACTIVA por tenant/rubro — la asignación

`resolverActivacion(state, catálogo)` toma el estado del tenant
(`{ tenantId, blueprintId, modules[] }`) y devuelve `{ activos, incompatibles,
dependenciasFaltantes, desconocidos, enforced }`. Valida la variante en dos pasos:
existencia + compatibilidad de rubro, y luego dependencias. Es **pura** (recibe el
tenant como dato; no consulta Prisma) → testeable sin DB y **respeta RLS** (el llamador
ya resolvió el tenant en su contexto).

`asignacionSugerida(rubro, preferidos, catálogo)` es el default **diferenciado** del
alta: filtra la propuesta del blueprint por compatibilidad de rubro. Reemplaza, sin
romperlo aún, al `defaultModulesForBlueprint` legado — pero **rubro-consciente** y sin
"todos con todo".

### 3.3 El registro/catálogo (el "repo") y cómo se nutre

`catalog.ts` arma la instancia curada y la **valida estricto**: ids únicos, semver,
dependencias presentes con rango satisfecho, sin ciclos, compat coherente. **Fail-closed**:
si un descriptor está mal, el catálogo no arranca (`CatalogoInvalidoError`).

**Nutrir el catálogo = una fila:** agregás el descriptor (en `descriptors/` o junto al
plugin) y lo sumás a `DESCRIPTORES_CATALOGO`. Nada más. Coherente con el patrón
"sumar idea = sumar fila" de los blueprints (`src/blueprints/index.ts`).

## 4. Versionado y compatibilidad

- **Semver por módulo** (`ModuleDescriptor.version`). Las dependencias declaran **rango**
  (`"^1.0"`, `"1.x"`, exacto o `"*"`), chequeado al validar el catálogo.
- **Migraciones siempre aditivas** (el tipo `MigrationRef` fuerza `aditiva: true`); nunca
  destructivas. La **aplicación** a la DB sigue siendo **Gate 2** (OK del dueño).
- Compatibilidad de rubro declarada en el descriptor (`rubros`) y verificada en la
  asignación.

## 5. Coherencia con multi-tenant + RLS (sin romper aislamiento)

- La activación se apoya en la columna **`Tenant.modules[]` que YA existe** → la fundación
  funciona **sin ninguna migración**.
- El catálogo es **dato de código/plataforma** (no depende del tenant). El resolver es
  **puro** y recibe el tenant ya resuelto por el llamador (en su contexto RLS). No abre
  conexiones, no evade el predicado `tenantId`, no toca tablas del Core.
- Los módulos `plugin` mantienen la regla dura de ADR-002: **no tocan la DB del Core**;
  solo eventos (in) + comandos públicos (out), con `tenantId` explícito.

## 6. Reversibilidad (Balde B / plan-ventana)

Todo es **código nuevo** bajo `src/modules/` + un flag (`MODULE_REGISTRY_ENABLED`,
**default OFF**) + una migración de ARCA **backward-compatible** (el manifiesto legado se
deriva; ninguna ruta de import se rompe). Con el flag OFF, el catálogo existe y es
inspeccionable/testeable pero **ningún cableado lo toma como autoritativo** (el backoffice
sigue con el comportamiento legado). Revertir = apagar el flag o `git revert`. **Cero**
migraciones aplicadas, cero seed, cero deploy, cero secretos tocados.

## 7. Ejemplo end-to-end: ARCA migrado

`src/plugins/arca/module.ts` declara `arcaModule` (objeto-maestro) y **deriva**
`arcaManifest` con `toLegacyPluginManifest`. Prueba el contrato completo: evento in
(`InvoiceCreated`), comando out (`RegisterFiscalDocument`), config con secretos
(certificado/clave PEM), semver (`0.1.0`) y compatibilidad (`todos`). El test
`catalog.test.ts` verifica que el manifiesto derivado **es idéntico** a la forma que
consumían `arca/index` y `mercadopago` → migración sin ruptura.

## 8. Lo que se ELEVA (no se corre en esta tarea)

La **tabla `TenantModule`** (config rica por tenant + pin de versión) que menciona la
visión de ADR-054 **no** se creó: la fundación no la necesita para funcionar (usa
`Tenant.modules[]`). Queda como **propuesta dry-run** en
[`propuesta-migracion-tenant-module.md`](./propuesta-migracion-tenant-module.md) para OK
del dueño (Gate 2). Ver también la sección de elevación de esa doc.

## 9. Seguimiento (fuera de esta tarea, anotado)

- Consolidar los dos `defaultModulesForBlueprint` duplicados (operator-config vs
  presets-meta) contra `asignacionSugerida` cuando se prenda el flag.
- Cablear el nav del backoffice y la consola de operador al resolver (hoy leen
  `Tenant.modules[]` directo) — detrás del flag, con su propio Gate.
- Migrar el descriptor de MP a `src/plugins/mercadopago/module.ts` cuando se reingeniere
  a real (hoy vive en `descriptors/` para no tocar el plugin).
