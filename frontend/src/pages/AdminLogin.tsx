import { LoaderCircle, Shield } from "lucide-react";
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
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <AnimatedSection className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-[36px] border border-black/5 bg-white p-8 shadow-soft">
          <div className="inline-flex rounded-full bg-pearl p-3 text-ink">
            <Shield size={22} />
          </div>
          <p className="mt-6 text-xs uppercase tracking-[0.3em] text-ink/35">Admin kirish</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">Boshqaruv paneliga kiring</h1>
          <p className="mt-4 text-sm leading-7 text-ink/65">
            Bu sahifa faqat administrator uchun. Kirgandan so'ng bronlar, paketlar va media
            fayllarni boshqarish mumkin bo'ladi.
          </p>
        </div>

        <AnimatedSection className="rounded-[36px] border border-black/5 bg-white p-8 shadow-soft">
          <form className="space-y-5" onSubmit={handleSubmit}>
            <label className="space-y-2 text-sm text-ink/70">
              <span>Email</span>
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
                className="w-full rounded-2xl border border-black/10 bg-pearl px-4 py-3 outline-none transition focus:border-pine"
                placeholder="admin@example.com"
              />
            </label>

            <label className="space-y-2 text-sm text-ink/70">
              <span>Parol</span>
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
                className="w-full rounded-2xl border border-black/10 bg-pearl px-4 py-3 outline-none transition focus:border-pine"
                placeholder="Parolingizni kiriting"
              />
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
