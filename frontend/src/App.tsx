import { Suspense, lazy } from "react";
import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";

const HomePage = lazy(() => import("./pages/HomePage").then((module) => ({ default: module.HomePage })));
const PackagesPage = lazy(() =>
  import("./pages/PackagesPage").then((module) => ({ default: module.PackagesPage })),
);
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
        <div className="mx-auto max-w-7xl px-4 py-16 text-sm text-ink/60 sm:px-6 lg:px-8">
          Sahifa yuklanmoqda...
        </div>
      }
    >
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/paketlar" element={<PackagesPage />} />
          <Route path="/bron" element={<BookingPage />} />
          <Route path="/admin-login" element={<AdminLogin />} />
          <Route path="/admin" element={<AdminPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
