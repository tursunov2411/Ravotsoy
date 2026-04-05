import { LoaderCircle, LockKeyhole, Mail, Shield } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatedSection } from "../components/AnimatedSection";
import { getSession, signInAdmin } from "../lib/api";
import { hasSupabaseConfig } from "../lib/supabase";

export function AdminLogin() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!hasSupabaseConfig) {
      setChecking(false);
      return;
    }

    const checkSession = async () => {
      try {
        const session = await getSession();

        if (session) {
          navigate("/admin", { replace: true });
          return;
        }
      } catch (sessionError) {
        console.error(sessionError);
      } finally {
        setChecking(false);
      }
    };

    void checkSession();
  }, [navigate]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      await signInAdmin(form.email, form.password);
      navigate("/admin", { replace: true });
    } catch (loginError) {
      console.error(loginError);
      setError("Email yoki parol noto'g'ri.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!hasSupabaseConfig) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="rounded-[36px] border border-black/5 bg-white p-8 shadow-soft">
          <p className="text-xs uppercase tracking-[0.3em] text-ink/35">Admin kirish</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">Supabase sozlanmagan</h1>
          <p className="mt-4 text-sm leading-7 text-ink/65">
            `frontend/.env` ichiga `VITE_SUPABASE_URL` va `VITE_SUPABASE_ANON_KEY`
            qiymatlarini kiriting.
          </p>
        </div>
      </div>
    );
  }

  if (checking) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="rounded-[36px] border border-black/5 bg-white p-8 text-sm text-ink/60 shadow-soft">
          Sessiya tekshirilmoqda...
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <AnimatedSection className="grid gap-8 lg:grid-cols-[1fr_0.95fr]">
        <div className="rounded-[40px] bg-[#07111f] px-6 py-8 text-white shadow-[0_24px_80px_rgba(15,23,42,0.18)] sm:px-8 lg:px-10">
          <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(135deg,#09111f_0%,#0d1b33_48%,#143261_100%)] p-8">
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff10_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:66px_66px]" />
            <div className="absolute left-[-10%] top-[-18%] h-72 w-72 rounded-full bg-sky-500/20 blur-3xl" />
            <div className="absolute bottom-[-22%] right-[-10%] h-72 w-72 rounded-full bg-blue-500/16 blur-3xl" />

            <div className="relative z-10">
              <div className="inline-flex rounded-full border border-white/12 bg-white/8 p-3 text-white">
                <Shield size={22} />
              </div>
              <p className="mt-6 text-xs uppercase tracking-[0.3em] text-white/50">Admin kirish</p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
                Boshqaruv paneliga xavfsiz kiring
              </h1>
              <p className="mt-4 max-w-xl text-sm leading-8 text-white/72 sm:text-base">
                Bu sahifa faqat administrator uchun. Kirgandan so'ng bronlar, paketlar va media
                bo'limlari bilan to'liq ishlashingiz mumkin bo'ladi.
              </p>

              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                <div className="rounded-[28px] border border-white/10 bg-white/8 p-5">
                  <p className="text-xs uppercase tracking-[0.24em] text-white/45">Nazorat</p>
                  <p className="mt-2 text-lg font-semibold">Bronlar va holatlar</p>
                </div>
                <div className="rounded-[28px] border border-white/10 bg-white/8 p-5">
                  <p className="text-xs uppercase tracking-[0.24em] text-white/45">Boshqaruv</p>
                  <p className="mt-2 text-lg font-semibold">Paketlar va media</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <AnimatedSection className="rounded-[36px] border border-black/5 bg-white p-8 shadow-soft">
          <div className="mb-6">
            <p className="text-xs uppercase tracking-[0.28em] text-ink/35">Kirish ma'lumotlari</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ink">Admin akkauntiga kiring</h2>
            <p className="mt-3 text-sm leading-7 text-ink/60">
              Email va parolni kiriting. Muvaffaqiyatli kirgach siz to'g'ridan-to'g'ri admin panelga o'tasiz.
            </p>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <label className="space-y-2 text-sm text-ink/70">
              <span>Email</span>
              <div className="flex items-center gap-3 rounded-2xl border border-black/10 bg-pearl px-4 py-3 transition focus-within:border-pine">
                <Mail size={18} className="text-ink/35" />
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                  className="w-full bg-transparent outline-none"
                  placeholder="admin@example.com"
                />
              </div>
            </label>

            <label className="space-y-2 text-sm text-ink/70">
              <span>Parol</span>
              <div className="flex items-center gap-3 rounded-2xl border border-black/10 bg-pearl px-4 py-3 transition focus-within:border-pine">
                <LockKeyhole size={18} className="text-ink/35" />
                <input
                  type="password"
                  required
                  value={form.password}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      password: event.target.value,
                    }))
                  }
                  className="w-full bg-transparent outline-none"
                  placeholder="Parolingizni kiriting"
                />
              </div>
            </label>

            {error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-ink px-5 py-4 text-sm font-medium text-white transition hover:bg-pine disabled:cursor-not-allowed disabled:bg-ink/60"
            >
              {submitting ? <LoaderCircle className="animate-spin" size={18} /> : null}
              Kirish
            </button>
          </form>
        </AnimatedSection>
      </AnimatedSection>
    </div>
  );
}
