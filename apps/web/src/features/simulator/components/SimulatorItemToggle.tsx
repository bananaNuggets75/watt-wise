import styles from "../Simulator.module.css";
import type { SimulatorItem } from "../types";

interface SimulatorItemToggleProps {
  item: SimulatorItem;
  isEnabled: boolean;
  handleToggle: () => void;
}

export const SimulatorItemToggle = ({
  item,
  isEnabled,
  handleToggle,
}: SimulatorItemToggleProps) => {
  return (
    <div onClick={handleToggle} className={styles.SimulatorItem_container}>
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
          checked={isEnabled}
          readOnly
          className={styles.SimulatorItem_toggle}
        />
      </div>
    </div>
  );
};
