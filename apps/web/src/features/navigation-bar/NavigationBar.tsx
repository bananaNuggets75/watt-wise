import "material-symbols/rounded.css";

import navStyles from "./NavigationBar.module.css";

export const NavigationBar = () => {
  return (
    <div className={navStyles.NavBar}>
      <ul className={navStyles.NavBar_layout}>
        <li>
          <button
            className={`${navStyles.NavBar_menuButton} ${navStyles.NavBar_menuButton___selected}`}
          >
            <div
              className={`${navStyles.NavBar_menuicon} ${navStyles.NavBar_menuicon___selected}`}
            >
              <span
                className={`material-symbols-rounded ${navStyles.NavBar_menuicon} ${navStyles.NavBar_menuicon___selected}`}
              >
                home
              </span>
            </div>
            <p className={navStyles.NavBar_menuName}>Home</p>
          </button>
        </li>
        <li>
          <button className={navStyles.NavBar_menuButton}>
            <div className={navStyles.NavBar_menuicon}>
              <span className="material-symbols-rounded">lightbulb</span>
            </div>
            <p className={navStyles.NavBar_menuName}>Insights</p>
          </button>
        </li>
        <li>
          <button className={navStyles.NavBar_menuButton}>
            <div className={navStyles.NavBar_menuicon}>
              <span className="material-symbols-rounded">
                energy_savings_leaf
              </span>
            </div>
            <p className={navStyles.NavBar_menuName}>Simulator</p>
          </button>
        </li>
        <li>
          <button className={navStyles.NavBar_menuButton}>
            <div className={navStyles.NavBar_menuicon}>
              <span className="material-symbols-rounded">person</span>
            </div>
            <p className={navStyles.NavBar_menuName}>Profile</p>
          </button>
        </li>
      </ul>
    </div>
  );
};
