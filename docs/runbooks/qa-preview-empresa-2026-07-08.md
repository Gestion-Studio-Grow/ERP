# 🔬 Estándar de QA — Preview real (Vercel, NO prod) + checklist click-por-click

> **Por qué existe:** el estándar de calidad GSG (equipo experto) NO se cumple con tsc+tests: exige QA
> **click-por-click en navegador** con los flags **ON**, sobre un entorno real. En el worktree eso no corre
> (Turbopack rechaza el `node_modules` symlinkeado). Este runbook deja **al borde** cómo montar un **Vercel
> Preview** (efímero, aislado de prod) con flags ON y el **checklist por pantalla** que se tilda antes de
> consolidar/encender. **El deploy del preview lo dispara el dueño**; acá queda todo listo.
>
> **Regla dura:** el preview **NUNCA** apunta a prod. Corre sobre una **Neon dev branch** aislada → se pueden
> aplicar migraciones y sembrar el tenant demo Empresa **sin tocar prod** (§C de prod intacto).
> **Autor:** S5 (Confiabilidad + Gate, Opus).

---

## PARTE A — Montar el PREVIEW real (aislado, $0, sin tocar prod)

### A.0 Principio
Un **Vercel Preview** es un deploy efímero por rama/commit, con su **propio set de Environment Variables**
(scope *Preview*, separado de *Production*). Lo apuntamos a una **Neon dev branch** (copia aislada, gratis en
Hobby) donde SÍ podemos migrar y sembrar. Así el QA es real **y** prod queda congelado.

### A.1 Base de datos del preview — Neon dev branch (aislada)
1. En Neon → **crear una branch de dev** desde `main` (ej. `qa-empresa`). Es una copia aislada; **no** es prod.
2. Copiar su connection string (rol owner o app; para el preview de QA alcanza el rol owner de la branch).
3. **Aplicar migraciones a la dev branch** (seguro: es dev, no prod):
   ```
   DATABASE_URL="<dev-branch-url>" npx prisma migrate deploy
   ```
   Esto aplica toda la cola pendiente **en dev** (incluida `add_tenant_profile` y el Decimal de facturas) —
   sin riesgo, son datos de dev. *(En prod esa cola sigue FRENADA hasta la decisión A/B del dueño; acá no.)*
4. **Sembrar datos de QA** en la dev branch:
   ```
   DATABASE_URL="<dev-branch-url>" npx tsx prisma/seed.ts                 # tenant(s) base (Comercio/lite)
   DATABASE_URL="<dev-branch-url>" npx tsx prisma/seed-demo-empresa.ts    # tenant demo Empresa (profile=enterprise)
   ```
   Deja **≥2 tenants**: uno **Comercio** (`profile=lite`) y el **demo Empresa** (`profile=enterprise`) para
   QA de ambos perfiles.

### A.2 Environment Variables del preview (Vercel → Settings → Env Vars → scope **Preview**)
Mismos nombres que prod (`.env.vercel.template`), con estos valores/diferencias para QA:

| Variable | Valor en el PREVIEW | Nota |
|---|---|---|
| `DATABASE_URL` | **dev branch** (A.1) | **NUNCA** la de prod |
| `OPERATOR_DATABASE_URL` | dev branch (rol owner) | operador cross-tenant en dev |
| `AUTH_SECRET` / `OPERATOR_SECRET` / `OPERATOR_PASSWORD` | valores de QA (no los de prod) | secretos los pega el dueño |
| `RLS_ENFORCEMENT` | `on` | QA con el mismo candado que prod |
| `TENANT_HOST_MAP` | `<preview-host>=<comercio-slug>;<preview-host-2>=demo-empresa` | mapear los hosts del preview a los tenants |
| **`PROFILES_ENABLED`** | **`on`** | 🔑 enciende el perfil (Comercio/Empresa) para QA |
| **`NAV_GROUPING_ENABLED`** | **`on`** | 🔑 enciende la nav agrupada de 5 grupos |
| `UPGRADE_TEASER_ENABLED` | **off** | D3: candados nunca por default, ni en QA salvo que se pruebe explícito |
| `CRON_SECRET` | un valor de QA | protege los crons |
| `ARCA_INVOICING_ENABLED` | `off` | ARCA real fuera del preview |
| `MP_WEBHOOK_SECRET` / `RESEND_*` | opcional | solo si se testea cobro/mail (modo simulado sin ellas) |

> `FORCE_TENANT_SLUG` **no** setear (rompería el multi-tenant salvo que quieras un preview de 1 solo tenant).

### A.3 Disparar el preview (acción del dueño)
- **Opción CLI:** `vercel` (sin `--prod`) sobre la rama `claude/sprint-startup-generic-rf6x0m` → genera una
  **URL de preview** (`<proyecto>-<hash>.vercel.app`). Requiere la cuenta del dueño (no hay CLI autenticado
  en la sesión del agente).
- **Opción dashboard:** push de la rama → Vercel crea el Preview Deployment automáticamente (si el proyecto
  tiene previews on) → abrir la Preview URL.
- Agregar los hosts del `TENANT_HOST_MAP` como dominios del preview, o usar la preview URL con el apex
  mapeado a un tenant.

### A.4 Rollback / limpieza
El preview es efímero: al terminar el QA, **borrar la Neon dev branch** (limpia los datos de QA) y el
deployment de preview. Cero costo, cero rastro en prod.

---

## PARTE B — Checklist de QA por pantalla (se tilda antes de consolidar/encender)

> **Cómo se corre:** entrar por el host del **tenant Comercio** y recorrer TODA la lista; repetir por el host
> del **tenant Empresa**; repetir cambiando de **rol** (OWNER · RECEPTION · PROFESSIONAL). Un ítem que no
> aplica → **N/A + por qué**. Cualquier ✗ bloquea la consolidación de esa pantalla.

### B.0 Transversal (aplica a CADA pantalla)
- [ ] **Funcional:** carga sin error (consola limpia); la **acción principal** funciona y **persiste** (recargar y sigue).
- [ ] **Sin callejón sin salida (MP-14):** ningún link/botón lleva a 404 o ruta protegida; los ítems Empresa `ready:false` (J59/J58/BMK) **NO se renderizan**.
- [ ] **Perfil Comercio vs Empresa:** en Comercio se ve el set base; en Empresa se ve el base **+** lo aditivo (nunca *menos* — invariante `enterprise ⊇ lite`).
- [ ] **Nav agrupada (flag ON):** los ítems caen en su grupo correcto (Operación · Clientes · Inventario y compras · Finanzas · Configuración); orden estable.
- [ ] **Tier neutro:** el badge de edición (Comercio/Empresa) es **neutro** (texto+forma), nunca con el color de acento del tenant.
- [ ] **Roles:** cada rol ve SOLO lo que su capability permite (un PROFESSIONAL no ve Usuarios/Auditoría/Módulos).
- [ ] **Estado vacío:** sin datos → se muestra el `EmptyState` (mensaje + acción), **no** una tabla rota ni un crash.
- [ ] **Visual/tokens:** sin hex sueltos; densidad correcta (Comercio espacioso / Empresa denso); **responsive** (mobile/desktop) y **dark/light** OK.
- [ ] **A11y + argentino:** labels/ARIA reales, foco visible, contraste AA; textos en **criollo claro** (no jerga), fiscal/pago/WhatsApp donde corresponde.

### B.1 Por pantalla (rutas reales del backoffice)
| Pantalla | Chequeo funcional específico | Perfil |
|---|---|---|
| **Dashboard `/admin`** (home analítico) | KPIs cargan con dato real; home **por rol**; Empresa ve el home analítico, Comercio el curado | ambos |
| **Agenda `/admin/turnos`** (+ `/lista`) | crear/mover/cancelar turno; vista lista | ambos |
| **Clientes `/admin/clientes`** (+ `/[id]`) | alta/edición; ficha del cliente | ambos |
| **Lista de espera `/admin/espera`** | agregar/quitar; estados | ambos |
| **Pedidos `/admin/pedidos`** | crear pedido; estados/canal | ambos |
| **Caja `/admin/caja`** | abrir/cerrar sesión; movimientos; venta en efectivo mueve caja | ambos |
| **Catálogo `/admin/catalogo`** | alta producto/servicio; precio; unidad de venta | ambos |
| **Compras `/admin/compras`** | **Empresa: orden formal (J45/18J)** — crear orden, proveedor, ítems; **Comercio: reposición simple** | Comercio + Empresa (profundiza) |
| **Ajustes y mermas `/admin/ajustes`** | ajuste de stock, merma; anti-oversell (no deja vender bajo cero) | ambos |
| **Reseñas `/admin/resenas`** | moderar/publicar | ambos |
| **Recordatorios `/admin/recordatorios`** | config por servicio; el cron dead-letter no rompe el lote | ambos |
| **Facturación `/admin/facturacion`** | estado por factura (pendiente/CAE/rechazada); **idempotencia:** un pago no genera factura duplicada | ambos |
| **Reportes `/admin/reportes`** | **Empresa: margen por producto (16T)**; Comercio: reportes base | Comercio + Empresa (profundiza) |
| **Auditoría `/admin/auditoria`** | log de acciones; solo roles con `audit:read` | ambos (gateado por rol) |
| **Usuarios `/admin/usuarios`** | alta/edición de usuarios; solo OWNER | ambos (gateado por rol) |
| **Localización `/admin/localizacion`** | datos del negocio; CBU/alias (BFA absorbido acá) | ambos |
| **Módulos `/admin/modulos`** | OWNER prende/apaga módulos; el cambio se refleja en la nav | ambos |

### B.2 Recorridos end-to-end (viaje de usuario, no solo "carga")
- [ ] **Comercio (lite):** entrar → vender en mostrador (`/pedidos`+`/caja`) → cobrar → facturar (Factura C) → ver en Facturación. Sin pantallas que no usa.
- [ ] **Empresa (enterprise):** entrar → orden de compra formal a proveedor (`/compras`) → recibir stock (`/ajustes`) → ver margen (`/reportes`) → todo lo de Comercio **sigue estando**.
- [ ] **Cambio de perfil (demo):** el tenant demo Empresa muestra edición "Empresa"; un tenant lite muestra "Comercio" — sin que el lite pierda nada.

---

## Salida del QA
- QA **verde** por pantalla × perfil × rol → insumo del **Gate de Excelencia (Opus)** de la ola.
- Cualquier ✗ → hallazgo con captura + pasos → vuelve a la célula dueña; **no se consolida** esa pantalla.
- El QA **no reemplaza** el Gate: lo alimenta (bloque 1 Auditoría SAP Fiori + bloque 4 Confiabilidad).

— Elaborado por GSG (S5 · Confiabilidad + Gate).
