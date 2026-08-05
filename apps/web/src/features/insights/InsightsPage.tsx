import styles from "./Insights.module.css";

export const InsightsPage = () => {
  return (
    <div className={styles.Insights}>
      {/* Energy Health Score */}
      <section className={styles.Insights_section}>
        <div>
          <h1 className={styles.Insights_sectionTitle}>Energy Health Score</h1>
          <p className={`${styles.Insights_sectionSubtitle}`}>
            Calculated based on your bills and appliances.
          </p>
        </div>
        <div
          className={`${styles.Insights_card} ${styles.Insights_card__primary}`}
        >
          <div className={styles.HealthCard_topRow}>
            <p className={styles.HealthCard_value}>78%</p>
            <div className={styles.HealthCard_badge}>Good</div>
          </div>
          <div className={styles.ProgressBar_container}>
            <div className={styles.ProgressBar_value} />
          </div>
        </div>
      </section>

      {/* Benchmark */}
      <section className={styles.Insights_section}>
        <div>
          <h1 className={styles.Insights_sectionTitle}>Benchmark</h1>
          <p className={`${styles.Insights_sectionSubtitle}`}>
            See how you compare to other users.
          </p>
        </div>
        <div className={styles.Insights_card}>
          <p className={styles.Benchmark_description}>
            You consume{" "}
            <span className={styles.Benchmark_description__colored}>18%</span>{" "}
            more electricity than similar{" "}
            <span className={styles.Benchmark_description__colored}>cafes</span>{" "}
            .
          </p>
        </div>
        <div className={styles.Insights_card}>
          <div className={styles.Insights_cardTitle}>Comparison Bar</div>
          <div className={styles.Comparison_placeholder}>placeholder</div>
        </div>
        <div className={styles.Insights_card}>
          <div className={styles.Insights_cardTitle}>
            Average KWH Consumption this Month
          </div>
          <table className={styles.AverageConsumption_table}>
            <tr>
              <th>Building</th>
              <th>Monthly Consumption</th>
            </tr>
            <tr>
              <td>Cafes</td>
              <td className={styles.AverageConsumption_number}>265 kWh</td>
            </tr>
            <tr>
              <td>Cafe Marie</td>
              <td className={styles.AverageConsumption_number}>312 kWh</td>
            </tr>
          </table>
        </div>
      </section>
    </div>
  );
};
