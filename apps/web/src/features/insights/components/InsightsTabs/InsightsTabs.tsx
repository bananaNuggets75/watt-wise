import { useLocation, useNavigate } from "react-router";
import styles from "./InsightsTabs.module.css";

export const InsightsTabs = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const currentTab = pathname.split("/")[2];
  console.log("Current tab:", currentTab);

  return (
    <div className={styles.Tabs_background}>
      <ul className={styles.Tabs_container}>
        <li className={styles.Tabs_itemContainer}>
          <button
            className={styles.Tabs_button}
            onClick={() => navigate("health-score")}
          >
            <div
              className={`${styles.Tabs_label} ${currentTab === "health-score" ? styles.Tabs_label__selected : ""}`}
            >
              Health Score
            </div>
          </button>
        </li>
        <li className={styles.Tabs_itemContainer}>
          <button
            className={styles.Tabs_button}
            onClick={() => navigate("priority-actions")}
          >
            <div
              className={`${styles.Tabs_label} ${currentTab === "priority-actions" ? styles.Tabs_label__selected : ""}`}
            >
              Priority Actions
            </div>
          </button>
        </li>
      </ul>
    </div>
  );
};
