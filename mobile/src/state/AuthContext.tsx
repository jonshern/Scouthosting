// Auth state. Holds the bearer token + active org + cached memberships;
// the rest of the app reads from useAuth(). Hydrates from SecureStorage
// on launch so a returning user lands straight in their channel list.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { ApiError } from "../api/client";
import {
  deleteAccount as deleteAccountFlow,
  fetchMe,
  signIn as signInFlow,
  persistSignIn,
  signOut as signOutFlow,
} from "../api/auth";
import {
  createSecureStorage,
  type SecureStorage,
  type StoredProfile,
} from "../api/storage";
import { registerPushToken, unregisterPushToken } from "../api/push";
import { BUILT_IN_SERVER, serverAddress, setServerAddress } from "../api/config";
import { connectLinkAddress, normalizeServerUrl } from "../api/serverUrl";
import type { ClientOptions } from "../api/client";

export type AuthState =
  | { status: "loading" }
  | { status: "signed-out" }
  | {
      status: "signed-in";
      token: string;
      profile: StoredProfile;
      activeOrg: { orgId: string; orgSlug: string; orgName: string; role: string };
    };

type AuthContextValue = {
  state: AuthState;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  switchOrg: (orgId: string) => Promise<void>;
  /** Build a ClientOptions for hitting the API as the active user. */
  client: () => ClientOptions | null;
  /**
   * Convenience accessor for the active session — flattens
   * state.activeOrg + token into a single object so screens don't
   * need to type-guard on state.status. Null when not signed-in.
   */
  session: ActiveSession | null;
  server: ServerState;
  /**
   * Delete this account on the server (confirm = its email). Resolves to
   * the reasons it can't be deleted yet, or null once it's gone and the
   * app is signed out.
   */
  deleteAccount: (confirm: string) => Promise<string[] | null>;
};

export type ServerState = {
  /** The server every request goes to. */
  address: string;
  /** True when it's the address the app was built with. */
  builtIn: boolean;
  /**
   * Save an address typed on this phone; returns an error message, or
   * null when saved. Moving to another server signs out of the old one.
   */
  setAddress(input: string): Promise<string | null>;
  /** Go back to the address the app was built with. */
  resetAddress(): Promise<void>;
  /** Ask the server's /health whether it's up. */
  check(): Promise<{ ok: boolean; message: string }>;
};

export type ActiveSession = {
  orgId: string;
  orgSlug: string;
  orgName: string;
  role: string;
  token: string;
  displayName: string;
  email: string;
};

const AuthContext = createContext<AuthContextValue | null>(null);

type ProviderProps = {
  children: React.ReactNode;
  /** Override storage in tests. */
  storage?: SecureStorage;
};

export function AuthProvider({ children, storage: storageOverride }: ProviderProps) {
  const storage = useMemo(() => storageOverride || createSecureStorage(), [storageOverride]);
  const [state, setState] = useState<AuthState>({ status: "loading" });
  const [address, setAddr] = useState(serverAddress());

  // Hydrate on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const savedServer = await storage.getServer().catch(() => null);
      if (savedServer) {
        setServerAddress(savedServer);
        setAddr(serverAddress());
      }
      const token = await storage.getToken();
      const profile = await storage.getProfile();
      if (cancelled) return;
      if (!token || !profile || !profile.orgs.length) {
        setState({ status: "signed-out" });
        return;
      }
      // The `!profile.orgs.length` early-return above guarantees orgs[0]
      // exists; the `!` tells TS what we already verified.
      const activeId = profile.activeOrgId || profile.orgs[0]!.orgId;
      const activeOrg = profile.orgs.find((o) => o.orgId === activeId) || profile.orgs[0]!;
      setState({ status: "signed-in", token, profile, activeOrg });
      // Tokens last 90 days and die when the password changes. If the
      // server turns this one down, go back to the sign-in screen.
      try {
        await fetchMe({ orgSlug: activeOrg.orgSlug, token });
      } catch (e) {
        if (!cancelled && e instanceof ApiError && e.status === 401) {
          await storage.clearToken();
          await storage.clearProfile();
          setState({ status: "signed-out" });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [storage]);

  // Once a session is established (sign-in OR hydrate-from-storage),
  // register the device's Expo push token with the server. Best-effort:
  // simulators / missing perms / expo-notifications not bundled all
  // gracefully no-op via the lib/api/push driver. Re-runs whenever the
  // session changes (org switch, fresh sign-in) so the token is always
  // attached to the right user.
  useEffect(() => {
    if (state.status !== "signed-in") return;
    let cancelled = false;
    (async () => {
      const result = await registerPushToken({
        orgSlug: state.activeOrg.orgSlug,
        token: state.token,
      });
      if (cancelled) return;
      if (!result.ok && result.reason !== "simulator" && result.reason !== "notifications_module_missing") {
        // eslint-disable-next-line no-console
        console.warn("[push] registration skipped:", result.reason);
      }
    })();
    return () => { cancelled = true; };
  }, [state]);

  const signIn = useCallback(async () => {
    const result = await signInFlow();
    if (!result.ok) {
      // Surface the failure by leaving state at signed-out; caller can
      // re-render an error toast based on the throw.
      throw new Error(`signin_failed: ${result.reason}`);
    }
    // Fetch memberships using the new token. The first membership's
    // slug is sufficient context for /api/v1/auth/me — that route is
    // host-agnostic on the server (looks up the user from the bearer).
    const fallbackSlug = result.userId; // any non-empty slug; server doesn't read it
    const me = await fetchMe({ orgSlug: fallbackSlug, token: result.token });
    if (!me.memberships.length) {
      throw new ApiError(403, "not_a_member", "Account isn't a member of any units yet.");
    }
    const profile = await persistSignIn(storage, result, me);
    // For multi-org users we currently default to the first membership.
    // A real picker is the next mobile UI follow-up.
    const activeOrg = profile.orgs.find((o) => o.orgId === profile.activeOrgId) || profile.orgs[0]!;
    setState({ status: "signed-in", token: result.token, profile, activeOrg });
  }, [storage]);

  const signOut = useCallback(async () => {
    if (state.status === "signed-in") {
      const client = { orgSlug: state.activeOrg.orgSlug, token: state.token };
      // Best-effort unregister so this device stops receiving push.
      // Doesn't gate the sign-out; failures are silently ignored.
      await unregisterPushToken(client);
      await signOutFlow(client, storage);
    } else {
      await storage.clearToken();
      await storage.clearProfile();
    }
    setState({ status: "signed-out" });
  }, [state, storage]);

  const forgetSignIn = useCallback(async () => {
    if (state.status === "signed-in") {
      const client = { orgSlug: state.activeOrg.orgSlug, token: state.token };
      await unregisterPushToken(client);
      await signOutFlow(client, storage);
    }
    setState({ status: "signed-out" });
  }, [state, storage]);

  const setAddress = useCallback(async (input: string): Promise<string | null> => {
    const next = normalizeServerUrl(input);
    if (!next) return "That doesn't look like a server address. Try https://your-mac.your-tailnet.ts.net";
    if (next !== serverAddress()) await forgetSignIn();
    setServerAddress(next);
    await storage.setServer(next);
    setAddr(next);
    return null;
  }, [forgetSignIn, storage]);

  const resetAddress = useCallback(async () => {
    if (serverAddress() !== BUILT_IN_SERVER) await forgetSignIn();
    setServerAddress(null);
    await storage.setServer(null);
    setAddr(serverAddress());
  }, [forgetSignIn, storage]);

  const check = useCallback(async () => {
    const at = serverAddress();
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 8000);
    try {
      const res = await fetch(`${at}/health`, { signal: ctl.signal });
      return res.ok
        ? { ok: true, message: `Connected to ${at}` }
        : { ok: false, message: `${at} answered ${res.status}.` };
    } catch {
      return { ok: false, message: `Couldn't reach ${at}. Check that Tailscale is on, on this phone and on the server, and that the server is running.` };
    } finally {
      clearTimeout(timer);
    }
  }, []);

  // compass://connect?url=https://… (printed by scripts/phone.sh) points
  // the app at a server.
  useEffect(() => {
    if (state.status === "loading") return;
    const onLink = (url: string | null) => {
      if (!url || !/(?:^[a-z][a-z0-9+.-]*:\/\/|\/)connect\?/i.test(url)) return;
      const next = connectLinkAddress(url);
      if (next) void setAddress(next);
    };
    let sub: { remove(): void } | null = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Linking = require("expo-linking") as typeof import("expo-linking");
      void Linking.getInitialURL().then(onLink);
      sub = Linking.addEventListener("url", (e) => onLink(e.url));
    } catch {
      // No linking module (unit tests).
    }
    return () => sub?.remove();
    // Listen once the saved address has loaded; setAddress changes with
    // the sign-in state, which shouldn't re-run the initial link.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status === "loading"]);

  const deleteAccount = useCallback(async (confirm: string) => {
    if (state.status !== "signed-in") return null;
    const client = { orgSlug: state.activeOrg.orgSlug, token: state.token };
    await unregisterPushToken(client);
    const blockers = await deleteAccountFlow(client, confirm, storage);
    if (!blockers) setState({ status: "signed-out" });
    return blockers;
  }, [state, storage]);

  const switchOrg = useCallback(async (orgId: string) => {
    if (state.status !== "signed-in") return;
    const next = state.profile.orgs.find((o) => o.orgId === orgId);
    if (!next) return;
    const profile: StoredProfile = { ...state.profile, activeOrgId: orgId };
    await storage.setProfile(profile);
    setState({ ...state, profile, activeOrg: next });
  }, [state, storage]);

  const client = useCallback((): ClientOptions | null => {
    if (state.status !== "signed-in") return null;
    return { orgSlug: state.activeOrg.orgSlug, token: state.token };
  }, [state]);

  const session: ActiveSession | null =
    state.status === "signed-in"
      ? {
          orgId: state.activeOrg.orgId,
          orgSlug: state.activeOrg.orgSlug,
          orgName: state.activeOrg.orgName,
          role: state.activeOrg.role,
          token: state.token,
          displayName: state.profile.displayName || state.profile.email || "",
          email: state.profile.email || "",
        }
      : null;

  const server = useMemo<ServerState>(() => ({
    address,
    builtIn: address === BUILT_IN_SERVER,
    setAddress,
    resetAddress,
    check,
  }), [address, setAddress, resetAddress, check]);

  const value = useMemo<AuthContextValue>(() => ({
    state,
    signIn,
    signOut,
    switchOrg,
    client,
    session,
    server,
    deleteAccount,
  }), [state, signIn, signOut, switchOrg, client, session, server, deleteAccount]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
