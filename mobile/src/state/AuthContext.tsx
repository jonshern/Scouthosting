// Auth state. Holds the bearer token + active org + cached memberships;
// the rest of the app reads from useAuth(). Hydrates from SecureStorage
// on launch so a returning user lands straight in their channel list.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { ApiError } from "../api/client";
import { fetchMe, signIn as signInFlow, persistSignIn, signOut as signOutFlow } from "../api/auth";
import {
  createSecureStorage,
  type SecureStorage,
  type StoredProfile,
} from "../api/storage";
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
  signIn: (orgSlug: string) => Promise<void>;
  signOut: () => Promise<void>;
  switchOrg: (orgId: string) => Promise<void>;
  /** Build a ClientOptions for hitting the API as the active user. */
  client: () => ClientOptions | null;
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

  // Hydrate on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await storage.getToken();
      const profile = await storage.getProfile();
      if (cancelled) return;
      if (!token || !profile || !profile.orgs.length) {
        setState({ status: "signed-out" });
        return;
      }
      const activeId = profile.activeOrgId || profile.orgs[0].orgId;
      const activeOrg = profile.orgs.find((o) => o.orgId === activeId) || profile.orgs[0];
      setState({ status: "signed-in", token, profile, activeOrg });
    })();
    return () => { cancelled = true; };
  }, [storage]);

  const signIn = useCallback(async (orgSlug: string) => {
    const result = await signInFlow({ orgSlug });
    if (!result.ok) {
      // Surface the failure by leaving state at signed-out; caller can
      // re-render an error toast based on the throw.
      throw new Error(`signin_failed: ${result.reason}`);
    }
    // Use the token to fetch the membership list.
    const me = await fetchMe({ orgSlug, token: result.token });
    if (!me.memberships.length) {
      throw new ApiError(403, "not_a_member", "Account isn't a member of any units yet.");
    }
    const profile = await persistSignIn(storage, result, me);
    const activeOrg = profile.orgs.find((o) => o.orgId === profile.activeOrgId) || profile.orgs[0];
    setState({ status: "signed-in", token: result.token, profile, activeOrg });
  }, [storage]);

  const signOut = useCallback(async () => {
    if (state.status === "signed-in") {
      await signOutFlow(
        { orgSlug: state.activeOrg.orgSlug, token: state.token },
        storage,
      );
    } else {
      await storage.clearToken();
      await storage.clearProfile();
    }
    setState({ status: "signed-out" });
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

  const value = useMemo<AuthContextValue>(() => ({
    state,
    signIn,
    signOut,
    switchOrg,
    client,
  }), [state, signIn, signOut, switchOrg, client]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
