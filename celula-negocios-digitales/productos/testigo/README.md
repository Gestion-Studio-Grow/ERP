# Testigo

**De foto + nota de voz por WhatsApp a un parte de trabajo profesional en PDF.**
Producto validado por la célula de negocios digitales (Gestión Studio Grow). Este directorio es un
**prototipo aislado y local** — no forma parte del ERP (`src/`, `prisma/` de la raíz).

## Qué hay acá

| Archivo | Qué es |
|---|---|
| `SPEC.md` | MVP: rubro faro (control de plagas), flujo exacto, plantilla del parte, qué NO entra. |
| `ARQUITECTURA.md` | Stack (WhatsApp, STT, visión, Claude Sonnet, PDF), modelo de datos, costos por parte. |
| `PLAN.md` | Milestones hasta el primer contratista pagando + go-to-market + onboarding. |
| `src/esquema-parte.ts` | Esquema (Zod) del parte de control de plagas — contrato de salida del núcleo. |
| `src/prompt.ts` | System prompt del rubro + armado del mensaje de usuario. |
| **`src/estructurar.ts`** | **EL CORAZÓN**: (transcripción + fotos) → parte estructurado con Claude Sonnet. |
| `src/plantilla-pdf.ts` | Render del parte a HTML (→ PDF). |
| `src/pipeline.ts` | Orquestador end-to-end (estructurar → ¿repregunta? → render). |
| `src/tipos.ts` | Tipos de entrada y config del contratista. |
| `ejemplo/input.json` | Input real de ejemplo (operario) — incluye un dato regulatorio faltante a propósito. |
| `ejemplo/salida-esperada.json` | Salida esperada del núcleo (con campos `PENDIENTE_REVISION` + repregunta). |
| `ejemplo/parte-ejemplo.html` | Parte final renderizado (tras resolver la repregunta) — abrir en el navegador. |
| `ejemplo/demo.ts` | Corre el pipeline completo (real o mock). |

## Correr la demo

```bash
cd celula-negocios-digitales/productos/testigo
npm install                # sólo dentro de esta carpeta (aislado)
npm run demo:mock          # sin gastar tokens: usa salida-esperada.json y renderiza el HTML
npm run demo               # real: requiere ANTHROPIC_API_KEY o perfil `ant auth login`
```

`demo:mock` no llama al modelo: reproduce el flujo (parte con pendientes → repregunta → operario responde →
parte completo → `ejemplo/parte-ejemplo.html`). Sirve para validar el render offline.

## El corazón, en una línea

`estructurarParte(entrada, config)` toma lo que el operario mandó (ya pasado por STT y visión) y devuelve un
**parte estructurado y validado** usando structured outputs de Claude Sonnet, marcando en
`PENDIENTE_REVISION` cualquier dato regulatorio que el operario no haya dicho (nunca lo inventa) y disparando
una repregunta por WhatsApp antes de emitir el PDF.
