import { NavigationBar } from "../features/navigation-bar/NavigationBar";
import { Outlet } from "react-router";

export const HomeLayout = () => {
  return (
    <div style={{ paddingBottom: "64px" }}>
      <Outlet />
      <NavigationBar />
    </div>
  );
};
