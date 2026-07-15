import { Outlet } from "react-router";

import "./App.css";

/**
 * App shell. For the MVP the web app opens straight to the bill upload /
 * input screen. As more screens land (dashboard, insights), this is where
 * routing/navigation will be introduced.
 */
function App() {
  return (
    <div className="app">
      <header className="app__header">
        <span className="app__brand">WattWise</span>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}

export default App;
