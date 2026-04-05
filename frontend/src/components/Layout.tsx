import { Button } from "./Button";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";

const navigation = [
  { to: "/", label: "Bosh sahifa" },
  { to: "/paketlar", label: "Paketlar" },
  { to: "/bron", label: "Bron qilish" },
  { to: "/admin", label: "Admin" },
];

function navClass(isActive: boolean) {
  return isActive
    ? "rounded-2xl bg-[var(--secondary)] px-4 py-2 text-sm font-semibold text-white shadow-md"
    : "rounded-2xl px-4 py-2 text-sm font-medium text-ink/70 transition hover:bg-white/75 hover:text-ink";
}

export function Layout() {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-transparent text-ink">
      <header className="sticky top-0 z-30 border-b border-black/5 bg-white/72 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <NavLink to="/" className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--secondary),var(--accent))] text-sm font-semibold text-white shadow-soft">
              RD
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-ink/40">Ravotsoy</p>
              <p className="text-sm font-semibold">Dam olish maskani</p>
            </div>
          </NavLink>

          <nav className="hidden items-center gap-2 md:flex">
            {navigation.map((item) => (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => navClass(isActive)}>
                {item.label}
              </NavLink>
            ))}
          </nav>

          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-black/10 md:hidden"
            onClick={() => setOpen((current) => !current)}
            aria-label="Menyuni ochish"
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>

        {open ? (
          <div className="border-t border-black/5 bg-white/90 px-4 py-4 md:hidden">
            <div className="flex flex-col gap-2">
              {navigation.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => navClass(isActive)}
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
        ) : null}
      </header>

      <main>
        <Outlet />
      </main>

      <footer className="border-t border-black/5 bg-white/72 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-8 text-sm text-ink/60 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <p>Ravotsoy Dam Olish Maskani. Tabiat bag'rida sokin hordiq.</p>
          <Button to="/bron" variant="secondary" className="w-full sm:w-auto">
            Bron qilish sahifasi
          </Button>
        </div>
      </footer>
    </div>
  );
}
