import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";

import "./index.css";
import App from "./App.tsx";
import { Login } from "./features/auth/Login.tsx";
import { Register } from "./features/auth/Register.tsx";
import { HomeLayout } from "./components/HomeLayout.tsx";
import { RequireAuth } from "./features/auth/RequireAuth.tsx";
import { Dashboard } from "./features/dashboard/Dashboard.tsx";
import { BillUpload } from "./features/bill-upload/BillUpload.tsx";
import { InsightsPage } from "./features/insights/InsightsPage.tsx";
import { HealthScore } from "./features/insights/components/HealthScore.tsx";
import { ApplianceSurvey } from "./features/appliance-survey/ApplianceSurvey.tsx";
import { PriorityActions } from "./features/insights/components/PriorityActions.tsx";
import { Simulator } from "./features/simulator/Simulator.tsx";
import { Profile } from "./features/profile/Profile.tsx";
import { EstablishmentSetup } from "./features/onboarding/EstablishmentSetup.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<App />}>
          {/* Public: reachable while signed out. */}
          <Route path="login" element={<Login />} />
          <Route path="register" element={<Register />} />

          {/* Everything else needs a session — RequireAuth redirects to
              /login when there isn't a valid one. */}
          <Route element={<RequireAuth />}>
            <Route index element={<Navigate to={"dashboard"} />} />
            {/* Onboarding: registration sends new users here, because bills
                and appliances can't be recorded without an establishment. */}
            <Route path="establishment" element={<EstablishmentSetup />} />
            <Route path="upload" element={<BillUpload />} />
            <Route element={<HomeLayout />}>
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="insights" element={<InsightsPage />}>
                <Route index element={<Navigate to={"health-score"} />} />
                <Route path="health-score" element={<HealthScore />} />
                <Route path="priority-actions" element={<PriorityActions />} />
              </Route>
              <Route path="simulator" element={<Simulator />} />
              <Route path="profile" element={<Profile />} />
            </Route>
            <Route path="appliances" element={<ApplianceSurvey />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
