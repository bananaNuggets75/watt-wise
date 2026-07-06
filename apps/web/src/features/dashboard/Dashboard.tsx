import "material-symbols/rounded.css";

import "./Dashboard.css";

/**
 * Energy dashboard component. This is what the user first sees when logged in.
 * Displays health score, quick links, top priority actions, and some statistics.
 */
export function Dashboard() {
  return (
    <div className="dashboard">
      <div className="dashboard__header">
        <div className="selector">
          <div className="selector__avatar" />
          <div className="selector__label">Cafe Marie</div>
        </div>
        <span className="material-symbols-rounded">notifications</span>
      </div>
      <div className="dashboard__card dashboard__card--green">
        <div className="card__header">
          <h3 className="card__title">Energy Health Score</h3>
          <div className="health-card__status">Good</div>
        </div>
        <div className="health-card__content">
          <span className="material-symbols-rounded icon--large icon--filled icon--color-primary">
            favorite
          </span>
          <p className="health-card__percentage">78%</p>
        </div>
      </div>
      <ul className="dashboard__card quick-links">
        <li className="quick-links__item">
          <span className="material-symbols-rounded">receipt_long</span>
          <p>Bill History</p>
        </li>
        <li className="quick-links__item">
          <span className="material-symbols-rounded">inventory</span>
          <p>My Inventory</p>
        </li>
        <li className="quick-links__item">
          <span className="material-symbols-rounded">priority</span>
          <p>Priority Actions</p>
        </li>
        <li className="quick-links__item">
          <span className="material-symbols-rounded">speed</span>
          <p>Benchmarking</p>
        </li>
        <li className="quick-links__item icon--filled">
          <span className="material-symbols-rounded">store</span>
          <p>My Properties</p>
        </li>
        <li className="quick-links__item">
          <span className="material-symbols-rounded">handshake</span>
          <p>Partners</p>
        </li>
      </ul>
      <button className="dashboard__button dashboard__button--primary dashboard__button--with-icon">
        <span className="material-symbols-rounded">add</span>
        <p>Add a Bill</p>
      </button>
      <div className="dashboard__card">
        <div className="card__header">
          <h3 className="card__title">Priority Actions</h3>
          <span className="material-symbols-rounded">arrow_circle_right</span>
        </div>
        <ul className="priority-list">
          <li className="priority-list__item">
            <div className="priority-list__indicator priority-list__indicator--high" />
            <p className="text--muted priority-list__text">
              Your evening usage is higher than similar cafes.
            </p>
          </li>
          <li className="priority-list__item">
            <div className="priority-list__indicator priority-list__indicator--med" />
            <p className="text--muted priority-list__text">
              Non-inverter appliances may be driving up costs.
            </p>
          </li>
        </ul>
      </div>
      <div className="dashboard__card">
        <div className="card__header">
          <h3 className="card__title">Monthly Bill Trend</h3>
          <span className="material-symbols-rounded">info</span>
        </div>
        <div className="monthly-card__placeholder text--muted">placeholder</div>
      </div>
      <div className="stats">
        <div className="dashboard__card stats__card">
          <p className="stats__label text--muted">This Month</p>
          <div>
            <span className="stats__value">18,236</span>
            <span className="stats__label text--muted">pesos</span>
          </div>
        </div>
        <div className="dashboard__card stats__card">
          <p className="stats__label text--muted">vs Last Month</p>
          <div>
            <span className="stats__value">8.6%</span>
            <span className="stats__label text--muted">increase</span>
          </div>
        </div>
        <div className="dashboard__card stats__card">
          <p className="stats__label text--muted">Total Consumption</p>
          <div>
            <span className="stats__value">312</span>
            <span className="stats__label text--muted">kWh</span>
          </div>
        </div>
        <div className="dashboard__card stats__card">
          <p className="stats__label text--muted">Cost per kWh</p>
          <div>
            <span className="stats__value">5.85</span>
            <span className="stats__label text--muted">pesos</span>
          </div>
        </div>
      </div>
    </div>
  );
}
