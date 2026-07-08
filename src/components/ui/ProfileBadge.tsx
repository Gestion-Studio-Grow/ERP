import { cn } from "./cn";
import { profileEditionLabel } from "./profile-labels";
import type { Perfil } from "@/modules/perfil";

// Insignia de EDICIÓN (Comercio/Empresa) — ADR-059 D5: el tier se señaliza en
// canal NEUTRO, JAMÁS con color de acento. El acento es DEL TENANT (D5/D8: el
// enterprise ve SU marca dominar la pantalla, no un "color de comerciante").
// Por eso este primitivo consume solo texto + forma + tokens neutros
// (line-strong/text-muted/surface-raised) — nunca --accent, nunca --ch-*.
//
// `locked` es el candado OPT-IN del teaser de upgrade (D3: default OFF, nunca
// se siembra por defecto en la nav del lite). Este primitivo solo sabe pintar
// el estado; quién decide MOSTRARLO (el punto de entrada discreto/UpgradeSheet)
// es otro frente — acá no hay lógica de flags ni de gating.

export type ProfileBadgeProps = Omit<React.HTMLAttributes<HTMLSpanElement>, "children"> & {
  profile: Perfil;
  /** Candado opt-in (D3) — NO usar como default en listados de nav. */
  locked?: boolean;
};

export function ProfileBadge({ profile, locked, className, ...props }: ProfileBadgeProps) {
  const label = profileEditionLabel(profile);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5",
        "text-xs font-medium leading-5 tracking-wide",
        "border-line-strong bg-surface-raised text-muted",
        className,
      )}
      {...props}
    >
      {locked && (
        <svg
          viewBox="0 0 16 16"
          aria-hidden="true"
          className="size-3 shrink-0 fill-none stroke-current stroke-[1.5]"
        >
          <rect x="3.5" y="7" width="9" height="6" rx="1.25" />
          <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
        </svg>
      )}
      {label}
      {locked && <span className="sr-only"> — función bloqueada en tu plan actual</span>}
    </span>
  );
}
