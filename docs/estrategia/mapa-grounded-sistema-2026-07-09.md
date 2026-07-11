# 🗺️ Mapa GROUNDED del sistema + incógnitas — repaso cronológico (2026-07-09)

> **Por qué:** dejar de operar a ciegas. El dueño sospecha —con razón— que leemos mal el sistema real (p.
> ej. que un solo deploy sirve a los 4 tenants, no a uno). Este doc separa **DATO** (verificado en
> código/docs), **SUPUESTO** (inferido) y **A VERIFICAR** (fuera del repo: Vercel/Neon). Anclado en el repo.
>
> **Autor:** GSG (Arquitecto de Solución) · **Fecha:** 2026-07-09 · **Base:** `src/lib/tenant.ts`,
> `.env.vercel.template`, `docs/runbooks/deploy-vercel.md`, `docs/adr/*` (graph.json 65 nodos), `ESTADO-ACTUAL.md`.

---

## 1. Cronología — cómo evolucionó (60 ADR + AMD)

| Fase | ADR | Qué se decidió (hito) |
|---|---|---|
| **0 · Fundación** | 001–009 | Aislamiento multi-tenant (001, **fundacional, con §12 "impacto a 5-10 años"**) · Core/Capabilities/Blueprints/Plugins (002) · MVP Servicios (003) · scheduling/overbooking (004) · stack (005) · motores de plataforma (006) · finanzas por escenario (007) · **costo de tokens Claude → nace el INDEX** (008) · UX metadata-driven + RBAC + onboarding (009) |
| **1 · Piloto→plataforma** | 010–018 + **AMD** | Convergencia del piloto CH Beauty&Spa a la plataforma (010) · relevamiento con Carolina (011) · recordatorios (012) · precio vecino (013) · seña+cupones (014) · **tenant fail-closed** (015) · handoff en cola (016) · **RBAC** (017) · **activación de RLS, gate del 2º tenant** (018). **AMD** = enmiendas a 001-008 (soft-delete, precio congelado, zona horaria UTC, MFA+rate-limit, email transaccional) |
| **2 · Plataforma/operación** | 019–029 | Provisioning de tenant (019) · API pública del Core (020) · **consola de operador/super-admin** (021) · **Plugin ARCA** (022) · perf multi-tenant (023) · facturación+MP (024/025) · tests node:test (026) · analytics cross-tenant (027) · **entrega: cliente = tenant real en su URL** (028) · **ruteo multi-tenant por hostname `TENANT_HOST_MAP`** (029) |
| **3 · Producto/negocio/gobierno** | 030–053 | DEMO→VENTA→INVERSIÓN, no invertir hasta vender (030) · demo navegable (031) · economía+Gate Opus (032) · copia-exacta (033) · **preset por IA** (034) · consultor→backoffice (035) · retail pádel + conversión de blueprint (036) · WhatsApp CTA (037) · impo (038) · **metodología sprint/FASE 0** (039) · **Gate de Excelencia** (040) · credenciales 2 fases (041) · autorización de marca (042) · sello GSG (043) · **argentinizar SAP** (044) · Advisory+Challenger (045) · de-sesgo (046) · retro (047) · arquitecto/reversibles (048) · RACI (049) · roster (050/051) · calibración (052) · pool de agentes (053) |
| **4 · Módulos + GROW-AR** | 054–060 | Repo de módulos/catálogo (054) · **variante** (055) · panel de dirección (056) · **dinero `number`+`Decimal(14,2)` en el borde** (057) · **filosofía GROW-AR: un Core, dos motores, crecé sin migrar** (058) · **reingeniería de interfaz** (059) · **estructura consolidada del producto D1–D10** (060) |

**Lectura:** el sistema NACIÓ multi-tenant (001) y el piloto CH fue el caso 1 (010). El multi-tenant por
**URL/host** se decidió explícito en 028/029. GROW-AR (058/059/060) es la capa reciente (perfil Comercio/
Empresa + módulos Empresa), casi toda **detrás de flags**.

---

## 2. Modelo multi-tenant REAL (lo más importante) — DATO

**Un deploy NO es "un tenant". El código resuelve el tenant POR REQUEST**, y un mismo deploy puede servir a
**N tenants**. Orden de resolución (`src/lib/tenant.ts`, DATO):

0. **`FORCE_TENANT_SLUG`** seteado → fija TODO el deploy a **1 tenant** por slug (Opción A). Si no matchea → THROW.
1. **`TENANT_HOST_MAP`** (`host=subdomain;…`) → mapea un **hostname plano** (`chestetica-erp.vercel.app`) al
   `Tenant.subdomain`. **N hosts → N tenants en UN proyecto.** (ADR-029.)
2. **Subdominio de `APP_BASE_DOMAIN`** (`chestetica.<dominio>` → `Tenant.subdomain="chestetica"`). **N
   subdominios → N tenants en UN proyecto** (Opción B, dominio propio).
3. **Fallback single-tenant:** sin subdominio/host resoluble y **exactamente 1 tenant** → ese. Con **>1
   tenant y sin host** → **THROW** ("más de un tenant y sin subdominio", ADR-015).

**Consecuencia dura (corrige el supuesto "1 deploy = 1 tenant"):** si la DB tiene **>1 tenant**, un deploy
sin FORCE y sin host resoluble **falla** — así que en prod (4 tenants) el deploy **tiene que** estar
resolviendo por host/subdominio (paso 1 o 2), es decir **sirviendo a varios tenants**, no a uno.

### ¿`erp-ch` sirve solo CH o los 4? → el DISEÑO dice los 4 (DATO); el valor VIVO es A VERIFICAR
- **DATO (repo):** `.env.vercel.template` trae, como ejemplo canónico del deploy:
  ```
  TENANT_HOST_MAP=chestetica-erp.vercel.app=chestetica;magra-erp.vercel.app=magra;shinevelas-erp.vercel.app=shinevelas;adosmanos-erp.vercel.app=adosmanos
  ```
  → **UN proyecto Vercel, cuatro hostnames `.vercel.app`, cuatro tenants.** Es exactamente lo que el dueño
  sospecha. `deploy-vercel.md` documenta lo mismo por subdominio (`chestetica.<base>` → tenant chestetica).
- **A VERIFICAR (Vercel, fuera del repo):** el `TENANT_HOST_MAP`/`APP_BASE_DOMAIN`/`FORCE_TENANT_SLUG`
  **reales** del proyecto que sirve prod. El template los deja **vacíos** (`TENANT_HOST_MAP=`), así que el
  valor efectivo NO está en el repo. **Si el proyecto tiene el map con los 4 hosts → sirve los 4.** Si
  tuviera `FORCE_TENANT_SLUG=beauty-spa` → solo CH.
- **Supuesto razonable:** dado que prod tiene 4 tenants y el fallback single-tenant tiraría error con >1, el
  deploy prod **está resolviendo por host** → **muy probablemente sirve los 4** (o los que tengan hostname
  configurado). **El modelo mental correcto es "un deploy, varios tenants", no "un deploy por tenant".**

### Tenants reales (DATO, ESTADO-ACTUAL §3 + Neon)
| Tenant | slug | subdomain | blueprint | id Neon (prod) | estado |
|---|---|---|---|---|---|
| CH Estética | `beauty-spa` | `chestetica` | servicios | (prod) | ✅ vivo en prod, RLS enforced, vidriera sirviendo |
| Magra | `magra` | `magra` | carniceria | `cmr8nncxj0000aoh7cqpn7yyg` | alta hecha, aislamiento verificado; falta deploy del sitio (Gate 1) + datos reales |
| Shine Velas | `shinevelas` | `shinevelas` | velas | `cmr9b3b5a0000m8h7913rkvf3` | ídem |
| A Dos Manos | `adosmanos` | `adosmanos` | padel | `cmr9b3kij0000fkh73ax0d85h` | ídem (+20 productos convertidos) |
| **magra-demo** *(staging)* | `magra-demo` | *(sin subdomain)* | carniceria | `cmrdlqzl100008kh7822umdsb` **(branch qa-empresa, NO prod)** | seed de QA, perfil Comercio |

> ⚠️ **magra-demo ≠ Magra.** `magra-demo` vive en la **Neon branch `qa-empresa`** (staging), NO en prod.
> Confundirlos es un riesgo real de este mismo sprint.

---

## 3. Deploys ↔ Tenants — DATO parcial + A VERIFICAR

| Proyecto Vercel | Sirve a | Branch | Env clave | Certeza |
|---|---|---|---|---|
| `erp` / "erp-ch" (prod) | **CH (+ probablemente Magra/Shine/ADM por `TENANT_HOST_MAP`)** | `main` | `DATABASE_URL`=Neon prod, `RLS_ENFORCEMENT=on`, `TENANT_HOST_MAP`=? | hostnames `chestetica-erp` / `magra-erp` / `shinevelas-erp` / `adosmanos-erp` **DATO en el template**; el map vivo **A VERIFICAR** |
| `erp` (staging) | **magra-demo** | rama del sprint | `DATABASE_URL`=qa-empresa, flags on, `FORCE_TENANT_SLUG=magra-demo` | **A VERIFICAR** si los flags/FORCE están efectivos (ver §4 y el diagnóstico Wave B) |

**A VERIFICAR en Vercel (no está en el repo):** cuántos proyectos hay realmente, qué `TENANT_HOST_MAP`/
`APP_BASE_DOMAIN`/`FORCE_TENANT_SLUG`/`DATABASE_URL` tiene cada uno, y qué hostnames/dominios están
apuntados. **"Solo CH tiene sitio deployado"** (ESTADO §3) probablemente signifique *"solo el hostname de CH
está apuntado/activo"*, no *"un proyecto por tenant"* — pero eso **hay que confirmarlo en el panel**.

---

## 4. Estado REAL — construido vs. plomería-tras-flag vs. asumido

- **Construido y VIVO en prod (DATO):** núcleo servicios/estética (agenda, clientes, catálogo, cobro manual,
  comisiones, reseñas, recordatorios, RBAC, auditoría), **RLS enforced**, CH sirviendo. Retail/POS, caja,
  ledger de stock, ARCA sandbox, cockpit operador: en `main`.
- **Construido pero DETRÁS DE FLAGS (default OFF) — no se ve salvo que el deploy prenda el flag (DATO):**
  - `MODULE_REGISTRY_ENABLED` (gating por módulo/rubro), `PROFILES_ENABLED` (Comercio/Empresa + densidad),
    `NAV_GROUPING_ENABLED` (nav 5 grupos), `UPGRADE_TEASER_ENABLED`. **Todos OFF por default.**
  - **ADR-060 (D1–D10)** — Supplier, Collection/settlement, Invoice→origen, AccountPayable+cheque,
    AccountReceivable, devoluciones, inventario light + las 5 pantallas Empresa. **Migraciones ADITIVAS
    escritas pero NO aplicadas a Neon prod** (Gate 2). Las pantallas existen (`ready:true`) pero **su schema
    no está en prod**.
- **Aplicado SOLO en staging (DATO):** `qa-empresa` tiene **35 migraciones + RLS + seed Magra**. → **el
  schema de staging ≠ el de prod** (prod está en la cola vieja hasta ~`add_waitlist`/`control_plane_tenant`;
  el stack ADR-060 NO está en prod).
- **Asumido sin verificar hasta HOY (riesgo):** la QA fue **estática** (tsc + tests + dumps) hasta el staging
  de hoy — **el primer render real** destapó gaps (Wave B: seed sin `Tenant.modules`, flags que no toman en
  runtime, home fijo estética). **Lo que "pasa los tests" no es lo que "renderiza en un deploy".**

---

## 5. LO QUE FALTA SABER — incógnitas y supuestos no verificados

**Infra / Vercel (lo más urgente — es la sospecha del dueño):**
1. ¿Cuántos proyectos Vercel hay y **qué `TENANT_HOST_MAP`/`APP_BASE_DOMAIN`/`FORCE_TENANT_SLUG` tiene cada
   uno**? → define si un deploy sirve 1 o 4 tenants. **A VERIFICAR en el panel.**
2. ¿El proyecto de prod tiene los **4 hostnames** apuntados o solo el de CH? ("Solo CH deployado" es ambiguo.)
3. ¿El staging (rama del sprint) tiene los **flags efectivos en runtime** y en el **scope** correcto
   (Production vs Preview) y **redeploy** posterior? (Wave B: nav plana + home estética sugiere que NO.)

**Datos / DB (Neon):**
4. **Qué migraciones están aplicadas POR base:** prod (¿hasta dónde exactamente? ESTADO dice "a confirmar")
   vs `qa-empresa` (35). El stack ADR-060 **NO** está en prod → cualquier pantalla Empresa contra prod
   fallaría (los loaders no tienen fallback si falta la tabla — riesgo I3 del audit).
5. `Tenant.modules` de **cada tenant real** en prod: ¿CH/Magra/Shine/ADM tienen su set por rubro seteado, o
   `[]`? (magra-demo lo tenía vacío — Wave B.) Sin eso, con `MODULE_REGISTRY_ENABLED` on, la nav se rompe.
6. `Tenant.subdomain` de cada tenant real: ¿están seteados (chestetica/magra/…)? El routing por host depende
   de esa columna.
7. Datos reales vs provisionales: Magra/Shine/ADM tienen **branding/catálogo provisional**, emails OWNER
   provisionales (ESTADO §3/§6). Cobro MP/ARCA real = §C del dueño.

**Producto / flags:**
8. ¿Se quiere prender `PROFILES_ENABLED`/`NAV_GROUPING_ENABLED`/`MODULE_REGISTRY_ENABLED` en **prod**, o
   siguen OFF? Hoy en prod el backoffice es la **nav plana legada** (flags off) — el rediseño GROW-AR **no
   llega al usuario** hasta prenderlos (con Gate).
9. El **home** no adapta al rubro (Wave B RC3) — afecta a CUALQUIER tenant retail (Magra/Shine/ADM), no solo
   al demo.

**Supuestos que estábamos arrastrando (a corregir):**
- ❌ "un deploy = un tenant" → **falso**; el diseño es un deploy sirviendo varios por host (§2).
- ❌ "magra-demo es Magra" → **falso**; es un tenant de staging aparte (`qa-empresa`).
- ❌ "lo que pasa los tests renderiza igual en el deploy" → **falso** (QA estática; Wave B lo destapó).
- ❓ "prod tiene el schema del sprint" → **falso** (ADR-060 no aplicado a prod).

---

## 6. Resumen

**El sistema es multi-tenant por request: un deploy puede servir N tenants (por `TENANT_HOST_MAP` o
subdominio), y el diseño documentado es UN proyecto Vercel sirviendo a los 4 tenants por hostname** —
la sospecha del dueño es correcta y estábamos leyéndolo como "un deploy por tenant". Hay **4 tenants reales
en prod** (CH vivo; Magra/Shine/ADM provisionados, sin deploy de sitio confirmado) + **magra-demo en
staging** (qa-empresa, ≠ Magra). Casi todo GROW-AR/ADR-060 está **detrás de flags OFF** y **sin schema en
prod**. Las incógnitas críticas son de **infra (env de Vercel)** y **datos (migraciones + `Tenant.modules`/
`subdomain` por tenant)** — todo **A VERIFICAR en Vercel/Neon** antes de seguir, porque no vive en el repo.

— Elaborado por GSG (Arquitecto de Solución) · dato vs. supuesto vs. a-verificar, anclado en el repo.
