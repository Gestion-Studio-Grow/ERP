"use client";

import { useState } from "react";

type Service = {
  id: string;
  name: string;
  description: string | null;
  durationMin: number;
  price: number;
};

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="transition-transform duration-300 shrink-0"
      style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function ServiceItem({ service }: { service: Service }) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="rounded-2xl overflow-hidden transition-shadow"
      style={{
        background: "var(--spa-ivory)",
        boxShadow: open ? "0 8px 30px rgba(79,56,43,0.12)" : "none",
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left"
      >
        <div className="flex items-baseline gap-3 min-w-0">
          <span
            className="font-serif text-lg sm:text-xl truncate"
            style={{ color: "var(--spa-mocha-dark)" }}
          >
            {service.name}
          </span>
          <span
            className="text-xs whitespace-nowrap uppercase tracking-wide"
            style={{ color: "var(--spa-sage)" }}
          >
            {service.durationMin} min
          </span>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <span className="font-serif text-lg" style={{ color: "var(--spa-gold)" }}>
            ${service.price.toLocaleString("es-AR")}
          </span>
          <span style={{ color: "var(--spa-mocha)" }}>
            <ChevronIcon open={open} />
          </span>
        </div>
      </button>

      <div
        className="grid transition-all duration-300 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div
            className="px-6 pb-6 pt-0 text-sm leading-relaxed border-t"
            style={{ color: "var(--spa-mocha)", borderColor: "var(--spa-sage-light)" }}
          >
            <p className="pt-4">
              {service.description ||
                "Un tratamiento pensado para tu bienestar. Consultanos por WhatsApp si querés más detalles antes de reservar."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ServicesAccordion({ services }: { services: Service[] }) {
  return (
    <div className="space-y-3">
      {services.map((s) => (
        <ServiceItem key={s.id} service={s} />
      ))}
    </div>
  );
}
