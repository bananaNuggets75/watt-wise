import "material-symbols/rounded.css";

import styles from "../Insights.module.css";
import type { PriorityActionData } from "../types";

export const PriorityActions = () => {
  const prioActionsPlaceholder: PriorityActionData[] = [
    {
      title: "Your evening usage is higher than similar cafes.",
      description:
        "Your power usage is 18% higher between 6PM–10PM compared to peers. Consider optimizing lighting and cooling during these hours.",
      impact: "High Impact",
    },
    {
      title: "Non-inverter appliances may be driving up costs.",
      description:
        "Your non-inverter AC units add extra baseline weight. Replacing them with inverter types could significantly lower daily consumption.",
      impact: "Medium Impact",
    },
    {
      title: "Baseline consumption is consistently high.",
      description:
        "You have a high idle draw even when closed. Check for appliances that can be completely unplugged overnight.",
      impact: "Medium Impact",
    },
  ];

  return (
    <div className={styles.Insights}>
      <section className={styles.Insights_section}>
        <div>
          <h1 className={styles.Insights_sectionTitle}>Priority Actions</h1>
          <p className={`${styles.Insights_sectionSubtitle}`}>
            Possible steps to take to improve energy efficiency.
          </p>
        </div>

        <div className={styles.PriorityAction_actionList}>
          {prioActionsPlaceholder.map((prioAction) => {
            return (
              <div className={`${styles.Insights_card}`}>
                <div className={styles.PriorityAction_heading}>
                  <h3 className={styles.Insights_cardTitle}>
                    {prioAction.title}
                  </h3>
                  <div
                    className={`${styles.PriorityAction_badge} ${prioAction.impact === "Medium Impact" ? styles.PriorityAction_badge__medium : ""}`}
                  >
                    {prioAction.impact}
                  </div>
                </div>
                <p className={styles.PriorityAction_description}>
                  {prioAction.description}
                </p>
                <div className={styles.PriorityAction_buttonContainer}>
                  <button
                    className={`${styles.PriorityAction_button} ${styles.PriorityAction_button__action}`}
                  >
                    <span
                      className={`material-symbols-rounded ${styles.PriorityAction_icon}`}
                    >
                      check
                    </span>
                    Action Taken
                  </button>
                  <button
                    className={`${styles.PriorityAction_button} ${styles.PriorityAction_button__dismiss}`}
                  >
                    <span
                      className={`material-symbols-rounded ${styles.PriorityAction_icon}`}
                    >
                      close
                    </span>
                    Dismiss
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
