import "material-symbols/rounded.css";

import styles from "./Simulator.module.css";
import type { SimulatorItem } from "./types";

export const Simulator = () => {
  const simulatorData: SimulatorItem[] = [
    {
      icon: "climate_mini_split",
      label: "Switch to inverter AC",
      estSavings: 1450,
    },
    {
      icon: "hourglass",
      label: "Optimize operating hours",
      estSavings: 950,
    },
    {
      icon: "kitchen",
      label: "Replace old refrigerator",
      estSavings: 750,
    },
    {
      icon: "power",
      label: "Reduce idle appliance usage",
      estSavings: 350,
    },
  ];

  return (
    <div className={styles.Simulator}>
      <section className={styles.Simulator_section}>
        <div>
          <h1 className={styles.Simulator_sectionTitle}>Savings Simulator</h1>
          <p className={`${styles.Simulator_sectionSubtitle}`}>
            Adjust the options below to see your potential savings.
          </p>
        </div>
        <div className={styles.Simulator_card}>
          <div className={styles.SimulatorCard_header}>
            Estimated Monthly Savings
          </div>
          <div className={styles.SimulatorCard_contentLayout}>
            <div className={styles.SimulatorCard_savingsNumber}>
              <span className={styles.SimulatorCard_currencyUnit}>₱</span>
              2,200.00
            </div>
            <div className={styles.SimulatorCard_reductionBadge}>
              12.1% reduction
            </div>
          </div>
        </div>
        <button className={styles.Simulator_button}>
          View Detailed Projection
        </button>
        <div className={styles.Simulator_itemList}>
          {simulatorData.map((item) => {
            return (
              <div className={styles.SimulatorItem_container}>
                <div className={styles.SimulatorItem_icon}>
                  <span className="material-symbols-rounded">{item.icon}</span>
                </div>
                <div className={styles.SimulatorItem_contentLayout}>
                  <div className={styles.SimulatorItem_label}>{item.label}</div>
                  <div className={styles.SimulatorItem_description}>
                    Estimated savings: ₱{item.estSavings} / month
                  </div>
                </div>
                <div>
                  <input
                    type="checkbox"
                    className={styles.SimulatorItem_toggle}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
