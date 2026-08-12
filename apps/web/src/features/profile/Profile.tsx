import styles from "./Profile.module.css";

export const Profile = () => {
  return (
    <div className={styles.Profile}>
      {/* Account Details */}
      <section className={styles.Profile_section}>
        <div className={styles.Profile_accountDetails}>
          wattwiselogo.png
          <h1 className={styles.Profile_sectionTitle}>Username</h1>
          <p className={styles.Profile_sectionSubtitle}>email@example.com</p>
        </div>
      </section>
      {/* Properties */}
      <section className={styles.Profile_section}>
        <div>
          <h3 className={styles.Profile_sectionTitle}>My Properties</h3>
          <p className={styles.Profile_sectionSubtitle}>
            Change to one of your existing properties or add a new one.
          </p>
        </div>
        <ul className={styles.PropertiesList_container}>
          <li>
            <button
              className={`${styles.PropertiesList_button} ${styles.PropertiesList_button__active}`}
            >
              <div className={styles.PropertiesList_icon}>
                <span className="material-symbols-rounded">local_cafe</span>
              </div>
              <div className={styles.PropertiesList_propertyContent}>
                <p className={styles.PropertiesList_propertyName}>Cafe Marie</p>
                <p>Jaro, Iloilo</p>
              </div>
              Selected
              <span className="material-symbols-rounded">chevron_forward</span>
            </button>
          </li>
          <li>
            <button className={styles.PropertiesList_button}>
              {" "}
              <div className={styles.PropertiesList_icon}>
                <span className="material-symbols-rounded">house</span>
              </div>
              <div className={styles.PropertiesList_propertyContent}>
                <p className={styles.PropertiesList_propertyName}>Home</p>
                <p>Iloilo City</p>
              </div>
              <span className="material-symbols-rounded">chevron_forward</span>
            </button>
          </li>
          <li>
            <button
              className={`${styles.PropertiesList_button} ${styles.PropertiesList_button__add}`}
            >
              Add New Property
            </button>
          </li>
        </ul>
      </section>
      {/* Account Settings */}
      <section>
        <div>
          <h3 className={styles.Profile_sectionTitle}>Account</h3>
        </div>
        <ul className={styles.AccountOptions_container}>
          <li>
            <button className={styles.AccountOptions_button}>
              <span
                className={`material-symbols-rounded ${styles.AccountOptions_icon}`}
              >
                password
              </span>
              Change Password
            </button>
          </li>
          <li>
            <button className={styles.AccountOptions_button}>
              <span
                className={`material-symbols-rounded ${styles.AccountOptions_icon}`}
              >
                help
              </span>
              Help Center
            </button>
          </li>
          <li>
            <button
              className={`${styles.AccountOptions_button} ${styles.AccountOptions_button__logout}`}
            >
              <span
                className={`material-symbols-rounded ${styles.AccountOptions_icon}`}
              >
                logout
              </span>
              Log Out
            </button>
          </li>
        </ul>
      </section>
    </div>
  );
};
