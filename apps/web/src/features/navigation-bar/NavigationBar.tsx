import "material-symbols/rounded.css";

import navStyles from "./NavigationBar.module.css";
import { useNavigate, useLocation } from "react-router";

interface NavBarItem {
  materialIcon: string;
  itemName: string;
  route: string;
}

export const NavigationBar = () => {
  const navBarItems: NavBarItem[] = [
    { materialIcon: "home", itemName: "Home", route: "/dashboard" },
    { materialIcon: "lightbulb", itemName: "Insights", route: "/insights" },
    {
      materialIcon: "energy_savings_leaf",
      itemName: "Simulator",
      route: "/simulator",
    },
    { materialIcon: "person", itemName: "Profile", route: "/profile" },
  ];
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const handleRedirect = (route: string) => {
    navigate(route);
  };

  return (
    <div className={navStyles.NavBar}>
      <ul className={navStyles.NavBar_layout}>
        {navBarItems.map((navItem) => {
          const isSelected = pathname === navItem.route;
          console.log(pathname, navItem.route);
          console.log("is selected:", isSelected);
          return (
            <li key={navItem.route}>
              <button
                className={`${navStyles.NavBar_menuButton} ${isSelected ? navStyles.NavBar_menuButton___selected : ""}`}
                onClick={() => {
                  handleRedirect(navItem.route);
                }}
              >
                <div
                  className={`${navStyles.NavBar_menuIconContainer} ${isSelected ? navStyles.NavBar_menuIconContainer___selected : ""}`}
                >
                  <span
                    className={`material-symbols-rounded ${navStyles.NavBar_menuicon} ${isSelected ? navStyles.NavBar_menuicon___selected : ""}`}
                  >
                    {navItem.materialIcon}
                  </span>
                </div>

                <p className={navStyles.NavBar_menuName}>{navItem.itemName}</p>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
