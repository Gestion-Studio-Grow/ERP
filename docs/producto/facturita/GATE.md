# Facturita como app — Gate de Excelencia (4 bloques)

Frente: «facturación automática» · célula Facturita como app · rama
`claude/facturacion-automatica-facturita` (desde `origin/claude/facturacion-automatica`).
Fecha: 2026-10-22. Sin deploy, sin migraciones, sin Neon, sin credenciales ARCA, sin datos reales.

## Qué entra

| Pieza | Archivos |
|---|---|
| PWA instalable | `src/app/facturita/layout.tsx` (manifest, íconos, theme color) · `src/app/facturita/manifest.webmanifest/route.ts` (estático) · `src/lib/facturita-pwa.ts` · `public/facturita/sw.js` · `public/facturita/sin-conexion.html` · `public/facturita/icon*.png`, `icon.svg`, `apple-touch-icon.png` · `RegistrarServiceWorker.tsx` · `InstalarApp.tsx` |
| Alta self-serve (modo alta operada, sin persistencia) | `src/app/facturita/alta/` · `src/lib/facturita-onboarding.ts` |
| Planes y precios (fuente única, provisionales) | `src/lib/facturita-planes.ts` · `src/app/facturita/planes/page.tsx` · `app/cuenta/page.tsx` (gancho con precio) |
| Vidriera | `src/app/facturita/page.tsx` · `VidrieraMarco.tsx` · `estilos.ts` |
| Tests | `src/lib/facturita-{onboarding,planes,pwa}.test.ts` (27 casos con los de core) |

## 1. Auditoría SAP Fiori (7 ángulos) + ángulo argentino

- [x] **Rol-based:** la vidriera habla al monotributista/comercio chico; la app instalada abre en «Emitir» (su tarea), no en un menú.
- [x] **Coherente:** misma piel Fable que `/facturita/app`, acento ámbar del producto (`producto-identidad.ts`), mismos tokens.
- [x] **Simple:** alta en 5 pasos, uno por pantalla; validación por paso; mensajes que dicen qué revisar.
- [x] **Adaptable:** mobile-first; probado en 360 / 768 / 1280 (capturas en `capturas/`). Branding: producto con marca propia (no por tenant); el layout de la app sigue con el acento del negocio.
- [x] **Delightful/enterprise:** ejemplo de factura en HTML (no imagen) arriba; sin animaciones salvo el «+» del FAQ (200 ms, `transform`, respeta reduced motion).
- [x] **Accesibilidad:** labels reales, `aria-invalid` + `aria-describedby`, `role="alert"` en errores, foco al título al cambiar de paso, «Saltar al contenido», foco visible en todo control, `<details>` nativo en FAQ, contraste AA con tokens Fable (`text-accent-ink` para texto en ámbar).
- [x] **Consistencia:** reusa `@/lib/cuit` (validador oficial), `whatsapp-cta` (helper único, DX-4), `resolveAccent`, `LIMITE_FACTURAS_FACTURITA`; no duplica lógica fiscal.
- [x] **🇦🇷 Argentino:** voseo criollo, ARCA (no AFIP), CUIT/CUIL/DNI, monotributo/RI/exento, punto de venta «Web Services», delegación por «Administrador de Relaciones de Clave Fiscal», WhatsApp-first, «sin tarjeta», «tu clave fiscal queda con vos». Mercado Pago aparece sólo como trigger de upgrade (frontera dura ADR-076).

## 2. Sello GSG

- [x] `metadata.generator = "Gestión Studio Grow"` en el layout de producto, la vidriera, alta, planes, y `<meta name="generator">` en la página sin conexión.
- [x] Crédito discreto: pie de la vidriera en `text-xs text-faint` («Un producto de Gestión Studio Grow» — Facturita es producto propio de GSG); el crédito del backoffice ya estaba en `app/layout.tsx`.
- [x] Commit con trailer del equipo GSG. Docs firmados.

## 3. Excelencia de Arquitectura

- [x] **Capas:** lógica pura en `src/lib/facturita-*.ts` (testeada sin red); UI en `src/app/facturita/`. El cliente no importa nada de servidor (`estilos.ts` separado de `VidrieraMarco` por eso — el build lo cazó).
- [x] **Multi-tenant:** el manifiesto es de PRODUCTO (estático, igual para todos) — no expone datos de ningún negocio (MT-1). Ninguna pantalla nueva lee tenant ni base.
- [x] **Seguridad:** el SW sólo precarga 3 archivos públicos; nunca `cache.put`, nunca navegaciones ni respuestas con sesión, ignora no-GET (server actions) y fuera de `/facturita/`. Lo vigila `facturita-pwa.test.ts`. El alta no pide clave fiscal ni guarda nada.
- [x] **Deuda anotada:** P-1..P-5 en `PEDIDOS-A-PLATAFORMA.md` (host→producto, portón de sesión de `/facturita/app`, headers del SW, alta real con la fábrica, `WHATSAPP_GSG` en build).

## 4. Confiabilidad de Producción

- [x] `npx tsc --noEmit` verde (exit 0). `eslint` de lo tocado: 0 problemas.
- [x] `npm test`: 5812 tests, 5802 pasan, 10 fallan — **ninguno de Facturita** y todos en áreas que este
  frente no toca (pruebas de navegador de /vender e ingreso, pie pegado del admin, fila de KPIs, escala de
  clientes/links de cobro, cron con RLS, búsqueda sin tildes, guardia de redondeos con archivos de `club/`).
  Los 27 tests de `src/lib/facturita-*.test.ts` + `guardia-bundle-cliente`, `site-gate` y
  `producto-identidad` pasan.
- [x] `npm run build` verde. El manifiesto sale estático (○). Las páginas declaran `force-static` y no
  leen base, pero el layout raíz (`src/app/layout.tsx`) exporta `force-dynamic` y se impone: salen ƒ,
  igual que `/demo` (pedido P-6).
- [x] QA clic por clic con Playwright (Chromium) en 360/768/1280: sin scroll horizontal; alta completa
  con error de campo vacío, CUIT con verificador mal y camino feliz; el SW se registra con alcance
  `/facturita/`, controla `/facturita/planes` y sin red muestra «Sin conexión · Facturita».
- [x] No rompe prod: sin schema, sin migraciones, sin cambios en `src/proxy.ts`, `next.config`, `/api/pwa/admin.webmanifest` intacto.
- [x] Errores: registro del SW con `catch` silencioso (la app anda sin él); portapapeles con `try/catch`; sin número de WhatsApp no aparece el botón (no se inventa).

**Nota de entorno (no afecta la rama):** el `npm install` del worktree no pudo bajar `xlsx` de
`cdn.sheetjs.com` (bloqueado por el proxy de la sesión). Para verificar se instaló localmente con
`xlsx@0.18.5` del registro y se restauraron `package.json`/`package-lock.json` sin cambios.

— Elaborado por GSG
