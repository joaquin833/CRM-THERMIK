"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ThermikhausAICloud } from "@/components/ai/thermikhaus-ai-cloud";

import { ThermikhausLogo } from "./brand";

type NavigationItem = {
  href: string;
  label: string;
  icon: ReactNode;
  featured?: boolean;
};

const operationItems: NavigationItem[] = [
  {
    href: "/cotizaciones",
    label: "Cotizaciones",
    icon: <DocumentIcon />,
    featured: true,
  },
  { href: "/agenda", label: "Agenda comercial", icon: <CalendarIcon /> },
  { href: "/oportunidades", label: "Oportunidades", icon: <PipelineIcon /> },
  { href: "/contactos", label: "Contactos", icon: <ContactIcon /> },
  { href: "/empresas", label: "Empresas", icon: <CompanyIcon /> },
  { href: "/proyectos", label: "Proyectos", icon: <ProjectIcon /> },
];

const analysisItems: NavigationItem[] = [
  { href: "/reportes", label: "Reportes", icon: <ChartIcon /> },
  { href: "/ia", label: "Centro de IA", icon: <SparkIcon /> },
];

const administrationItems: NavigationItem[] = [
  { href: "/notificaciones", label: "Notificaciones", icon: <BellIcon /> },
  {
    href: "/importacion",
    label: "Importación histórica",
    icon: <ImportIcon />,
  },
  { href: "/usuarios", label: "Usuarios", icon: <UsersIcon /> },
  { href: "/auditoria", label: "Auditoría", icon: <AuditIcon /> },
  {
    href: "/configuracion/identidad",
    label: "Identidad",
    icon: <IdentityIcon />,
  },
  {
    href: "/configuracion/google",
    label: "Google Calendar",
    icon: <CalendarIcon />,
  },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [administrationOpen, setAdministrationOpen] = useState(() =>
    administrationItems.some((item) => isActive(pathname, item.href)),
  );

  return (
    <div className="min-h-screen bg-slate-50 lg:grid lg:grid-cols-[272px_minmax(0,1fr)]">
      {mobileOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden"
          aria-label="Cerrar navegación"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[272px] flex-col bg-brand-dark text-white transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-5">
          <ThermikhausLogo />
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="rounded-lg p-2 text-white/75 hover:bg-white/10 hover:text-white lg:hidden"
            aria-label="Cerrar navegación"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-5">
          <nav className="grid gap-1">
            <NavigationLink
              item={{ href: "/dashboard", label: "Inicio", icon: <HomeIcon /> }}
              pathname={pathname}
              onNavigate={() => setMobileOpen(false)}
            />
          </nav>

          <NavigationGroup title="Operación comercial">
            {operationItems.map((item) => (
              <NavigationLink
                key={item.href}
                item={item}
                pathname={pathname}
                onNavigate={() => setMobileOpen(false)}
              />
            ))}
          </NavigationGroup>

          <NavigationGroup title="Análisis">
            {analysisItems.map((item) => (
              <NavigationLink
                key={item.href}
                item={item}
                pathname={pathname}
                onNavigate={() => setMobileOpen(false)}
              />
            ))}
          </NavigationGroup>

          <section className="mt-6">
            <button
              type="button"
              onClick={() => setAdministrationOpen((value) => !value)}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/50 hover:bg-white/5 hover:text-white/80"
              aria-expanded={administrationOpen}
            >
              Administración
              <ChevronIcon open={administrationOpen} />
            </button>

            {administrationOpen && (
              <nav className="mt-1 grid gap-1">
                {administrationItems.map((item) => (
                  <NavigationLink
                    key={item.href}
                    item={item}
                    pathname={pathname}
                    onNavigate={() => setMobileOpen(false)}
                  />
                ))}
              </nav>
            )}
          </section>
        </div>

        <div className="border-t border-white/10 px-7 py-4">
          <p className="text-xs text-white/45">CRM Thermikhaus</p>
          <p className="mt-1 text-sm font-medium text-white/75">
            Gestión comercial
          </p>
        </div>
      </aside>

      <main className="min-w-0">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b bg-white/95 px-4 py-3 shadow-sm backdrop-blur lg:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="rounded-lg border p-2 text-slate-700 hover:bg-slate-50 lg:hidden"
              aria-label="Abrir navegación"
            >
              <MenuIcon />
            </button>
            <div>
              <p className="text-sm font-semibold text-slate-950">
                CRM Comercial
              </p>
              <p className="hidden text-xs text-slate-500 sm:block">
                Cotizaciones y seguimiento comercial
              </p>
            </div>
          </div>

          <form action="/buscar" className="hidden md:block">
            <label className="relative block">
              <span className="sr-only">Buscar</span>
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
                <SearchIcon />
              </span>
              <input
                name="q"
                className="w-72 rounded-xl border border-slate-200 bg-slate-50 py-2 pl-10 pr-3 text-sm outline-none focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100"
                placeholder="Buscar N.º de cotización, RUT..."
              />
            </label>
          </form>
        </header>

        <div className="p-4 sm:p-5 lg:p-8">{children}</div>
      </main>
      <ThermikhausAICloud />
    </div>
  );
}

function NavigationGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-6">
      <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/45">
        {title}
      </p>
      <nav className="grid gap-1">{children}</nav>
    </section>
  );
}

function NavigationLink({
  item,
  pathname,
  onNavigate,
}: {
  item: NavigationItem;
  pathname: string;
  onNavigate: () => void;
}) {
  const active = isActive(pathname, item.href);

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-emerald-300 ${
        active
          ? "bg-white text-brand-dark shadow-sm"
          : item.featured
            ? "bg-emerald-400/15 text-white hover:bg-emerald-400/25"
            : "text-white/80 hover:bg-white/10 hover:text-white"
      }`}
    >
      <span
        className={`grid size-8 shrink-0 place-items-center rounded-lg ${
          active
            ? "bg-emerald-100 text-emerald-800"
            : "bg-white/5 text-white/75"
        }`}
      >
        {item.icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {active && <span className="size-2 rounded-full bg-emerald-600" />}
    </Link>
  );
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function HomeIcon() {
  return (
    <Icon>
      <path d="m3 11 9-8 9 8" />
      <path d="M5 10v10h14V10" />
      <path d="M9 20v-6h6v6" />
    </Icon>
  );
}
function DocumentIcon() {
  return (
    <Icon>
      <path d="M6 2h9l3 3v17H6z" />
      <path d="M14 2v4h4" />
      <path d="M9 11h6M9 15h6" />
    </Icon>
  );
}
function CalendarIcon() {
  return (
    <Icon>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </Icon>
  );
}
function PipelineIcon() {
  return (
    <Icon>
      <path d="M4 5h5v5H4zM15 14h5v5h-5z" />
      <path d="M9 7.5h3a4 4 0 0 1 4 4V14" />
    </Icon>
  );
}
function ContactIcon() {
  return (
    <Icon>
      <circle cx="12" cy="8" r="3" />
      <path d="M5 21a7 7 0 0 1 14 0" />
    </Icon>
  );
}
function CompanyIcon() {
  return (
    <Icon>
      <path d="M4 21V6l8-3v18M12 9h8v12" />
      <path d="M7 9h2M7 13h2M7 17h2M15 13h2M15 17h2" />
    </Icon>
  );
}
function ProjectIcon() {
  return (
    <Icon>
      <path d="M3 21h18M5 21V9l7-5 7 5v12" />
      <path d="M9 21v-6h6v6" />
    </Icon>
  );
}
function ChartIcon() {
  return (
    <Icon>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </Icon>
  );
}
function SparkIcon() {
  return (
    <Icon>
      <path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z" />
    </Icon>
  );
}
function BellIcon() {
  return (
    <Icon>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </Icon>
  );
}
function ImportIcon() {
  return (
    <Icon>
      <path d="M12 3v12M7 10l5 5 5-5" />
      <path d="M4 21h16" />
    </Icon>
  );
}
function UsersIcon() {
  return (
    <Icon>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 21a6 6 0 0 1 12 0M16 4a3 3 0 0 1 0 6M17 14a5 5 0 0 1 4 5" />
    </Icon>
  );
}
function AuditIcon() {
  return (
    <Icon>
      <path d="M5 3h14v18H5z" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </Icon>
  );
}
function IdentityIcon() {
  return (
    <Icon>
      <circle cx="12" cy="7" r="3" />
      <path d="M5 21v-2a7 7 0 0 1 14 0v2" />
    </Icon>
  );
}
function SearchIcon() {
  return (
    <Icon>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </Icon>
  );
}
function MenuIcon() {
  return (
    <Icon>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </Icon>
  );
}
function CloseIcon() {
  return (
    <Icon>
      <path d="m6 6 12 12M18 6 6 18" />
    </Icon>
  );
}
function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={`size-4 transition ${open ? "rotate-180" : ""}`}
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
