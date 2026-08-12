import { Outlet } from "react-router";

import { InsightsTabs } from "./components/InsightsTabs";

export const InsightsPage = () => {
  return (
    <div>
      <InsightsTabs />
      <Outlet />
    </div>
  );
};
