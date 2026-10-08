import Link from "next/link";
import s from "./sitio.module.css";

/** Logo tipográfico: "busca[tu]foto", con "tu" entre esquinas de visor. */
export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className={s.logo} aria-label="buscatufoto, inicio">
      <span aria-hidden>busca</span>
      <span aria-hidden className={s.logoTu}>
        tu
      </span>
      <span aria-hidden>foto</span>
    </Link>
  );
}
