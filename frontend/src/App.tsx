import { Suspense, lazy } from "react";
import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";

const HomePage = lazy(() => import("./pages/HomePage").then((module) => ({ default: module.HomePage })));
const BookingPage = lazy(() =>
  import("./pages/BookingPage").then((module) => ({ default: module.BookingPage })),
);
const AdminLogin = lazy(() =>
  import("./pages/AdminLogin").then((module) => ({ default: module.AdminLogin })),
);
const AdminPage = lazy(() =>
  import("./pages/AdminPage").then((module) => ({ default: module.AdminPage })),
);

export default function App() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="rounded-[32px] border border-black/5 bg-white/80 p-8 shadow-soft">
            <div className="h-3 w-28 animate-pulse rounded-full bg-pearl" />
            <div className="mt-4 h-8 w-64 animate-pulse rounded-full bg-pearl" />
            <div className="mt-6 h-4 w-full animate-pulse rounded-full bg-pearl" />
            <div className="mt-3 h-4 w-4/5 animate-pulse rounded-full bg-pearl" />
          </div>
        </div>
      }
    >
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/bron" element={<BookingPage />} />
          <Route path="/admin-login" element={<AdminLogin />} />
          <Route path="/admin" element={<AdminPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
