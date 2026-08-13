/**
 * Tests for the auth client.
 *
 * This module is the whole app's view of "who is signed in", so the cases
 * worth pinning are the ones where Supabase answers in a way that isn't a
 * plain success or failure — chiefly sign-up returning a user but no
 * session, which is what happens the moment email confirmation is switched
 * on in the dashboard.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

const signUp = vi.fn();
const signInWithPassword = vi.fn();
const signOut = vi.fn();
const getUser = vi.fn();

vi.mock("./supabase", () => ({
  supabase: { auth: { signUp, signInWithPassword, signOut, getUser } },
  isSupabaseConfigured: true,
}));

const { getCurrentUser, login, logout, register } = await import("./auth");

const supabaseUser = {
  id: "user-uuid-1",
  email: "kenan@example.com",
  created_at: "2026-08-01T00:00:00Z",
};

afterEach(() => vi.clearAllMocks());

describe("register", () => {
  it("returns the new user when sign-up produces a session", async () => {
    signUp.mockResolvedValue({ data: { user: supabaseUser, session: { access_token: "t" } }, error: null });

    await expect(register("kenan@example.com", "supersecret1")).resolves.toEqual({
      id: "user-uuid-1",
      email: "kenan@example.com",
      createdAt: "2026-08-01T00:00:00Z",
    });
  });

  it("reports the confirmation step when there is no session", async () => {
    // With email confirmation enabled, Supabase returns a user but no
    // session. Treating that as success would send the user to a page whose
    // every request 401s.
    signUp.mockResolvedValue({ data: { user: supabaseUser, session: null }, error: null });

    await expect(register("kenan@example.com", "supersecret1")).rejects.toThrow(/Check your email/);
  });

  it("passes Supabase's message through", async () => {
    signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "User already registered", status: 422 },
    });

    await expect(register("taken@example.com", "supersecret1")).rejects.toThrow("User already registered");
  });

  it("does not invent a user when Supabase returns none", async () => {
    signUp.mockResolvedValue({ data: { user: null, session: null }, error: null });

    await expect(register("odd@example.com", "supersecret1")).rejects.toThrow();
  });
});

describe("login", () => {
  it("returns the signed-in user", async () => {
    signInWithPassword.mockResolvedValue({ data: { user: supabaseUser, session: {} }, error: null });

    await expect(login("kenan@example.com", "supersecret1")).resolves.toMatchObject({
      id: "user-uuid-1",
    });
  });

  it("rejects bad credentials with the status Supabase gave", async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Invalid login credentials", status: 400 },
    });

    await expect(login("kenan@example.com", "wrong")).rejects.toMatchObject({
      message: "Invalid login credentials",
      status: 400,
    });
  });

  it("defaults to 401 when Supabase gives no status", async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Invalid login credentials" },
    });

    await expect(login("kenan@example.com", "wrong")).rejects.toMatchObject({ status: 401 });
  });
});

describe("logout", () => {
  it("asks Supabase to end the session", async () => {
    signOut.mockResolvedValue({ error: null });
    await logout();

    expect(signOut).toHaveBeenCalled();
  });
});

describe("getCurrentUser", () => {
  it("returns the user for a live session", async () => {
    getUser.mockResolvedValue({ data: { user: supabaseUser }, error: null });

    await expect(getCurrentUser()).resolves.toMatchObject({ id: "user-uuid-1" });
  });

  it("returns null when signed out", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });

    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it("returns null rather than throwing when the session is invalid", async () => {
    // The route guard treats null as "send them to sign in"; an exception
    // here would instead surface as a blank page.
    getUser.mockResolvedValue({ data: { user: null }, error: { message: "JWT expired" } });

    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it("copes with a user record that has no email", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "u2", created_at: "2026-08-01T00:00:00Z" } },
      error: null,
    });

    await expect(getCurrentUser()).resolves.toEqual({
      id: "u2",
      email: "",
      createdAt: "2026-08-01T00:00:00Z",
    });
  });
});
