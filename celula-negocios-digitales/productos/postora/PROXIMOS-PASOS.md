# Postora — Handoff / Próximos pasos

— Elaborado por GSG · Frente D (sprint) · 2026-07-07

## Estado al cierre de este frente

**Postora MVP GENERADO y verde.** Es el #1 del roadmap (antes solo análisis); ahora tiene el patrón
completo de los 4 productos ya construidos:

- **SPEC + ARQUITECTURA + PLAN + README** en `celula-negocios-digitales/productos/postora/`.
- **Código núcleo funcionando** (`src/`): tipos · routing+COGS · planes · generador · métricas · LLM mock
  offline · LLM Claude real (excluido del build) · demo CLI.
- **Demo web navegable** (`demo-web/index.html`): autocontenida, sin datos reales, sin secretos, con el
  blindaje de margen interactivo y el Reporte de Resultados. Publicable a costo cero.
- **Vallas verdes:** `tsc --noEmit` ✔ · 28 tests (`node --test`) ✔ · build ✔.
- **Gate de Excelencia:** pasado (ver PLAN.md § Gate).

## ⛔ Zona §C — requiere OK del dueño (no ejecutado en la demo)

1. **Cablear la API real de IA** (`src/llm-claude.ts` → `LLMClaude`). Gasta tokens de producción. El
   corazón y la demo corren con el mock. Runbook: `npm install @anthropic-ai/sdk`, quitar `llm-claude.ts`
   del `exclude` de `tsconfig.json`, exportar `ANTHROPIC_API_KEY` (lo pega el dueño), y cambiar la demo/prod
   para instanciar `LLMClaude` en vez de `LLMMock`. Validar COGS real vs supuesto en 20 planes.
2. **Cobro real por Mercado Pago** (suscripción/preapproval en pesos). Mueve plata. Secretos MP los pega el
   dueño (FASE 2 de credenciales).
3. **Persistencia** (Neon/Postgres): Kits, planes, posteos, eventos de atribución, `UsoMensual`. Migración
   sin aplicar → Gate 2 del dueño.

## 🚀 Publicar la demo web — runbook de 1 clic (costo cero, sin secretos del dueño)

La demo es **un solo archivo estático** (`demo-web/index.html`, todo inline). No necesita build ni base ni
credenciales del dueño. Tres caminos, todos costo cero:

**Opción A — Vercel (recomendada, URL con nombre de cliente):**
```bash
cd celula-negocios-digitales/productos/postora/demo-web
vercel deploy --prod --yes            # requiere token Vercel del dueño → §C (1 clic)
# o arrastrar la carpeta demo-web a vercel.com/new (deploy estático, sin config)
```
Da una URL tipo `postora-demo.vercel.app`. **El agente no tiene token Vercel en el entorno** → se eleva
al dueño (1 clic o `vercel login` + `vercel deploy`).

**Opción B — cualquier hosting estático:** subir `demo-web/index.html` a Netlify drop, GitHub Pages o
Cloudflare Pages. Es un HTML plano, funciona en cualquiera.

**Opción C — local:** `python -m http.server 8791 --directory demo-web` y abrir `http://localhost:8791`.

> Nota: en esta sesión se publicó además una versión navegable como **Artifact** (link entregado al dueño)
> para revisión inmediata sin tocar secretos. La URL de cliente (`postora-demo.vercel.app`) queda
> lista-para-publicar con el runbook de arriba.

## Siguiente frente sugerido

M1 del PLAN: cablear `LLMClaude` real (§C con OK), medir COGS real, y arrancar la persistencia. En paralelo,
poblar un Kit de Marca real desde la red de un comercio faro (con autorización, vía Generador de Preset).
