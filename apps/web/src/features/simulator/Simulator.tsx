import "material-symbols/rounded.css";

import styles from "./Simulator.module.css";
import type { SimulatorItem } from "./types";
import { useEffect, useState } from "react";
import { SimulatorItemToggle } from "./components/SimulatorItemToggle";

export const Simulator = () => {
  const simulatorData: SimulatorItem[] = [
    {
      id: 0,
      icon: "climate_mini_split",
      label: "Switch to inverter AC",
      estSavings: 1450,
    },
    {
      id: 1,
      icon: "hourglass",
      label: "Optimize operating hours",
      estSavings: 950,
    },
    {
      id: 2,
      icon: "kitchen",
      label: "Replace old refrigerator",
      estSavings: 750,
    },
    {
      id: 3,
      icon: "power",
      label: "Reduce idle appliance usage",
      estSavings: 350,
    },
  ];

  const [selectedItems, setSelectedItems] = useState<Array<number>>([]);

  const handleItemToggle = (itemId: number) => {
    console.log("Before selected: ", selectedItems);
    setSelectedItems((prevItems) => {
      if (prevItems.includes(itemId)) {
        return prevItems.filter((prevItem) => prevItem !== itemId);
      } else {
        return [...prevItems, itemId];
      }
    });
  };

  useEffect(() => {
    console.log("After selected: ", selectedItems);
  }, [selectedItems]);

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
              <SimulatorItemToggle
                key={item.label}
                item={item}
                handleToggle={() => handleItemToggle(item.id)}
                isEnabled={selectedItems.includes(item.id)}
              />
            );
          })}
        </div>
      </section>
    </div>
  );
};
