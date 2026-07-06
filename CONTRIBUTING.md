# Contribuir a este proyecto

Guía corta para arrancar rápido y trabajar de forma consistente con el resto del equipo.

## Levantar el proyecto local

Requisitos: Node.js, acceso al `DATABASE_URL` de Neon (pedirlo a quien administre los secretos del equipo — nunca por chat/email en texto plano).

```bash
npm install                 # corre `prisma generate` solo (postinstall)
cp .env.example .env        # si no existe .env.example, pedir las claves y crearlo a mano
npm run dev                 # http://localhost:3000
```

Variables de entorno necesarias en `.env` (ver `DEPLOY.md` para el detalle de cada una):
`DATABASE_URL`, `AUTH_SECRET`, y opcionalmente `RESEND_API_KEY` / `RESEND_FROM_EMAIL` / `CRON_SECRET` para que los recordatorios salgan por email real en vez de quedar simulados. (`ADMIN_PASSWORD` fue retirada en ADR-017 Fase 2: el login es email + contraseña contra la tabla `User`, administrado desde `/admin/usuarios`.)

## Antes de escribir código de arquitectura

1. Leé `docs/adr/INDEX.md` completo — es liviano a propósito, es el punto de entrada único.
2. Si tu cambio toca una decisión ya tomada, decilo explícitamente ("esto ya se decidió en ADR-00X") en vez de redecidirlo.
3. Si tu cambio *es* una decisión nueva de arquitectura (no una feature de negocio suelta), se documenta como ADR nuevo antes de que se pierda el razonamiento — no alcanza con un comentario en el código que diga "ADR-0XX" si ese ADR no existe todavía.

Para features de negocio (no arquitectura), el punto de entrada es `BACKLOG.md`, no `docs/adr/`.

## Verificar antes de pushear (sin deployar)

Cada `git push` a `main` dispara un deploy real en Netlify — minimizar cuántos
pushes se hacen por sesión es parte del flujo, no un detalle. Para eso:

```bash
npx tsc --noEmit             # tipos, sin efectos secundarios
npm run build && npm run start   # build de producción servido en localhost:3000
```

`build` + `start` corren el mismo código que correría en Netlify, con lecturas
reales contra Neon, pero **sin tocar Netlify** — el deploy lo dispara `git
push`, ningún comando local. Es la forma de probar el cambio "como en
producción" antes de empujarlo. Verificar acá, no en el sitio real.

Meta: un push por tema de sesión (una vez que está verificado y listo), no un
push por cada edición chica.

## 🛡️ Gate de Excelencia — OBLIGATORIO, no salteable (antes de integrar/pushear)

**Ningún cambio se integra a `main` sin pasar el gate de excelencia (UX + Arquitectura +
Confiabilidad).** Es adicional a "verificar antes de pushear" (tsc+build+test). Fundamento
transversal: filosofía **SAP/Fiori** (rol-based · coherente · simple · adaptable · delightful ·
calidad enterprise). Tildá esto en el commit/PR antes de empujar (si un ítem no aplica: **N/A + por
qué**):

**UX (SAP/Fiori)**
- [ ] Rol-based (cada rol ve lo suyo) · coherente (usa design system/tokens) · simple.
- [ ] Adaptable (responsive + branding por tenant) · delightful/enterprise (loading/vacío/error).

**Arquitectura**
- [ ] Respeta capas/límites de dominio · lógica testeable · sin sumar deuda (o anotada en ADR/PROXIMOS-PASOS).
- [ ] Multi-tenant: query con predicado `tenantId` / `tenantTransaction` · no evade RLS · secretos fuera del repo.

**Confiabilidad de Producción**
- [ ] `tsc --noEmit` + `npm run build` + `npm test` en verde · aislamiento por tenant verificado.
- [ ] Manejo de errores controlado · cambios de schema = migración SIN aplicar (Gate 2), nada irreversible.

Detalle y racional: `docs/METODOLOGIA-SPRINT.md` → "GATE DE EXCELENCIA". Un cambio que no tilda los
tres bloques **no se integra**.

## Convención de commits

- Un commit = un cambio completo y verificado (build + type-check pasan), no un checkpoint intermedio.
- El mensaje explica el *por qué*, no repite el diff — quien lea `git log` dentro de 6 meses tiene que entender el motivo sin abrir el código.
- `git push --force` a `main` solo en emergencia explícitamente acordada con el resto del equipo.

## Flujo de trabajo (mientras seamos pocas personas)

Hoy el proyecto trabaja con push directo a `main` (deploy automático en Netlify). Funciona bien con una persona; con dos o más trabajando en simultáneo sobre el mismo área, avisar activamente qué se está tocando para no pisarse. Si el equipo crece, este punto pasa a decidirse explícitamente (PRs con revisión) — no asumir que el flujo actual escala solo.

## Seguridad

- Nunca commitear secretos. `.env` está gitignored — si accidentalmente se commitea algo sensible, no alcanza con borrarlo en el commit siguiente: hay que rotar el secreto.
- El panel `/admin` hoy usa una sola contraseña compartida (sin roles todavía — ver `BACKLOG.md`). Tratá cualquier acceso a esa contraseña como acceso total e indistinguible de cualquier otra persona que la tenga.
- Reportar una vulnerabilidad: ver `SECURITY.md`.
