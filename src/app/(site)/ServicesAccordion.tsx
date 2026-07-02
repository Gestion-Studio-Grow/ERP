"use client";

import { useState } from "react";

type Service = {
  id: string;
  name: string;
  description: string | null;
  durationMin: number;
  price: number;
};

function PlusIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      className="transition-transform duration-300 shrink-0"
      style={{ transform: open ? "rotate(45deg)" : "rotate(0deg)" }}
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function ServiceItem({ service }: { service: Service }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ borderBottom: "1px solid var(--spa-hairline)" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-4 py-6 text-left"
      >
        <div className="flex items-baseline gap-3 min-w-0">
          <span
            className="font-serif text-xl sm:text-2xl truncate"
            style={{ color: "var(--spa-ink)" }}
          >
            {service.name}
          </span>
          <span
            className="text-xs whitespace-nowrap uppercase tracking-[0.1em]"
            style={{ color: "var(--spa-mocha)" }}
          >
            {service.durationMin} min
          </span>
        </div>
        <div className="flex items-center gap-5 shrink-0">
          <span className="text-base" style={{ color: "var(--spa-gold)" }}>
            ${service.price.toLocaleString("es-AR")}
          </span>
          <span style={{ color: "var(--spa-ink)" }}>
            <PlusIcon open={open} />
          </span>
        </div>
      </button>

      <div
        className="grid transition-all duration-300 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <p
            className="pb-6 pr-16 text-sm leading-relaxed"
            style={{ color: "var(--spa-mocha)" }}
          >
            {service.description ||
              "Un tratamiento pensado para tu bienestar. Consultanos por WhatsApp si querés más detalles antes de reservar."}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function ServicesAccordion({ services }: { services: Service[] }) {
  return (
    <div style={{ borderTop: "1px solid var(--spa-hairline)" }}>
      {services.map((s) => (
        <ServiceItem key={s.id} service={s} />
      ))}
    </div>
  );
}
