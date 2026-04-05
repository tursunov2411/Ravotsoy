import { Button } from "./Button";
import { Menu, MessageCircleMore, Phone, X } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { getSiteSettings } from "../lib/api";
import { getTelegramLink } from "../lib/utils";

const navigation = [
  { to: "/", label: "Bosh sahifa" },
  { to: "/paketlar", label: "Paketlar" },
  { to: "/bron", label: "Bron qilish" },
];

function navClass(isActive: boolean) {
  return isActive
    ? "rounded-full bg-[var(--secondary)] px-4 py-2 text-sm font-semibold text-white shadow-md"
    : "rounded-full px-4 py-2 text-sm font-medium text-ink/70 transition hover:bg-white/75 hover:text-ink";
}

export function Layout() {
  const [open, setOpen] = useState(false);
  const [contactsButton, setContactsButton] = useState({
    label: "",
    url: "",
  });
  const telegramLink = getTelegramLink("Salom, Ravotsoy Dam olish Maskani haqida ma'lumot olmoqchiman.");
  const hasContactsButton = Boolean(contactsButton.label && contactsButton.url);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await getSiteSettings();
        setContactsButton({
          label: settings.contacts_button_label?.trim() ?? "",
          url: settings.contacts_button_url?.trim() ?? "",
        });
      } catch (error) {
        console.error(error);
      }
    };

    void loadSettings();
  }, []);

  return (
    <div className="min-h-screen bg-transparent text-ink">
      <header className="sticky top-0 z-30 border-b border-black/5 bg-white/68 backdrop-blur-2xl">
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

          <nav className="hidden items-center gap-2 rounded-full border border-black/5 bg-white/70 px-2 py-2 shadow-soft md:flex">
            {navigation.map((item) => (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => navClass(isActive)}>
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <a
              href={telegramLink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-black/8 bg-white/80 px-4 py-2 text-sm font-medium text-ink transition hover:bg-white"
            >
              <MessageCircleMore size={16} />
              Telegram
            </a>
            {hasContactsButton ? (
              <a
                href={contactsButton.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-black/8 bg-white/80 px-4 py-2 text-sm font-medium text-ink transition hover:bg-white"
              >
                <Phone size={16} />
                {contactsButton.label}
              </a>
            ) : null}
            <Button to="/bron" className="px-5 py-2.5">
              Bron qilish
            </Button>
          </div>

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
              <a
                href={telegramLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-black/10 px-4 py-3 text-sm font-medium text-ink"
                onClick={() => setOpen(false)}
              >
                <MessageCircleMore size={16} />
                Telegram orqali bog'lanish
              </a>
              {hasContactsButton ? (
                <a
                  href={contactsButton.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-black/10 px-4 py-3 text-sm font-medium text-ink"
                  onClick={() => setOpen(false)}
                >
                  <Phone size={16} />
                  {contactsButton.label}
                </a>
              ) : null}
            </div>
          </div>
        ) : null}
      </header>

      <main>
        <Outlet />
      </main>

      <footer className="border-t border-black/5 bg-white/72 backdrop-blur-xl">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 text-sm text-ink/60 sm:px-6 lg:grid-cols-[1fr_auto] lg:items-center lg:px-8">
          <div>
            <p className="text-base font-semibold text-ink">Ravotsoy Dam Olish Maskani</p>
            <p className="mt-2 max-w-2xl leading-7">
              Tabiat bag'rida sokin hordiq, oilaviy dam olish va tezkor bron uchun zamonaviy maskan.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <a
              href={telegramLink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-black/10 px-5 py-3 text-sm font-medium text-ink transition hover:bg-white"
            >
              <MessageCircleMore size={16} />
              Telegram
            </a>
            {hasContactsButton ? (
              <a
                href={contactsButton.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-black/10 px-5 py-3 text-sm font-medium text-ink transition hover:bg-white"
              >
                <Phone size={16} />
                {contactsButton.label}
              </a>
            ) : null}
            <Button to="/bron" variant="secondary" className="w-full sm:w-auto">
              Bron qilish
            </Button>
          </div>
        </div>
      </footer>
    </div>
  );
}
