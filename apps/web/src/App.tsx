import { Outlet, useLocation, useNavigate } from "react-router";

import { logout } from "./lib/auth";
import { getToken } from "./lib/session";
import "./App.css";

/**
 * App shell: the WattWise header plus an Outlet for whichever page matched.
 * The header also carries the sign-out control, since it's the one element
 * present on every screen.
 */
function App() {
  const navigate = useNavigate();
  // Signing in and out happen on child routes, which change the location and
  // so re-render this component — meaning the token can simply be read here
  // rather than mirrored into state.
  useLocation();
  const signedIn = getToken() !== null;

  async function handleSignOut() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="app">
      <header className="app__header">
        <button
          onClick={() => {
            navigate("/");
          }}
          className="app__brand"
        >
          WattWise
        </button>
        {signedIn && (
          <button
            type="button"
            className="app__signout"
            onClick={handleSignOut}
          >
            Sign out
          </button>
        )}
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}

export default App;
