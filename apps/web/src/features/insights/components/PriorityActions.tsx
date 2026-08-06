import "material-symbols/rounded.css";

import styles from "../Insights.module.css";

export const PriorityActions = () => {
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
          <div className={`${styles.Insights_card}`}>
            <div className={styles.PriorityAction_heading}>
              <h3 className={styles.Insights_cardTitle}>title</h3>
              <div className={styles.PriorityAction_badge}>badge</div>
            </div>
            <p className={styles.PriorityAction_description}>description</p>
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
        </div>
      </section>
    </div>
  );
};
