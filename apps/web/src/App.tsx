import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router";

import { logout } from "./lib/auth";
import { supabase } from "./lib/supabase";
import "./App.css";

/**
 * App shell: the WattWise header plus an Outlet for whichever page matched.
 * The header also carries the sign-out control, since it's the one element
 * present on every screen.
 */
function App() {
  const navigate = useNavigate();
  const [signedIn, setSignedIn] = useState(false);

  // Subscribe to Supabase's auth state. It's an external system, which is
  // what effects are for: the callback fires on sign-in, sign-out and token
  // refresh, keeping the header correct without polling for a token.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(session !== null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

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
