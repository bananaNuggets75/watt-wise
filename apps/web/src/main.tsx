import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";

import "./index.css";
import App from "./App.tsx";
import { HomeLayout } from "./components/HomeLayout.tsx";
import { Dashboard } from "./features/dashboard/Dashboard.tsx";
import { BillUpload } from "./features/bill-upload/BillUpload.tsx";
import { ApplianceSurvey } from "./features/appliance-survey/ApplianceSurvey.tsx";
import { Login } from "./features/auth/Login.tsx";
import { Register } from "./features/auth/Register.tsx";
import { RequireAuth } from "./features/auth/RequireAuth.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<App />}>
          {/* Public: reachable while signed out. */}
          <Route path="login" element={<Login />} />
          <Route path="register" element={<Register />} />
          {/* 
 <Route index element={<BillUpload />} />
 <Route path="dashboard" element={<Dashboard />} />
 */}
          {/* Everything else needs a session — RequireAuth redirects to
              /login when there isn't a valid one. */}
          <Route element={<RequireAuth />}>
            <Route index element={<BillUpload />} />
            <Route element={<HomeLayout />}>
              <Route path="dashboard" element={<Dashboard />} />
            </Route>
            <Route path="appliances" element={<ApplianceSurvey />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
