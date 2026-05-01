// Token storage. Uses Expo SecureStore on device (Keychain on iOS,
// EncryptedSharedPreferences on Android). The interface keeps in-memory
// fallback for unit tests + early-startup scenarios where SecureStore
// isn't ready.
//
// We never write the raw bearer token anywhere except SecureStore. The
// userId / orgSlug / displayName are non-sensitive and live in the same
// store for ergonomics.

const KEY_TOKEN = "compass.bearer";
const KEY_PROFILE = "compass.profile";

export type StoredProfile = {
  userId: string;
  displayName: string;
  email: string;
  orgs: { orgId: string; orgSlug: string; orgName: string; role: string }[];
  // The org the user is currently focused on. Defaults to the first
  // membership; settable from the Profile screen.
  activeOrgId?: string;
};

export interface SecureStorage {
  getToken(): Promise<string | null>;
  setToken(value: string): Promise<void>;
  clearToken(): Promise<void>;
  getProfile(): Promise<StoredProfile | null>;
  setProfile(profile: StoredProfile): Promise<void>;
  clearProfile(): Promise<void>;
}

/** In-memory implementation. Used for tests and as a fallback. */
export function createMemoryStorage(): SecureStorage {
  let token: string | null = null;
  let profile: StoredProfile | null = null;
  return {
    async getToken() { return token; },
    async setToken(v: string) { token = v; },
    async clearToken() { token = null; },
    async getProfile() { return profile; },
    async setProfile(p: StoredProfile) { profile = p; },
    async clearProfile() { profile = null; },
  };
}

/**
 * Production storage — wraps `expo-secure-store` lazily. The import is
 * gated so unit tests running in plain Node never load the native
 * module. Returns the in-memory implementation if SecureStore isn't
 * available (e.g. during SSR, Jest, or unsupported web platforms).
 */
export function createSecureStorage(): SecureStorage {
  let secureStore: typeof import("expo-secure-store") | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    secureStore = require("expo-secure-store");
  } catch {
    secureStore = null;
  }
  if (!secureStore) return createMemoryStorage();

  return {
    async getToken() {
      return await secureStore!.getItemAsync(KEY_TOKEN);
    },
    async setToken(value: string) {
      await secureStore!.setItemAsync(KEY_TOKEN, value, {
        keychainAccessible: secureStore!.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
      });
    },
    async clearToken() {
      await secureStore!.deleteItemAsync(KEY_TOKEN);
    },
    async getProfile() {
      const raw = await secureStore!.getItemAsync(KEY_PROFILE);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as StoredProfile;
      } catch {
        return null;
      }
    },
    async setProfile(p: StoredProfile) {
      await secureStore!.setItemAsync(KEY_PROFILE, JSON.stringify(p));
    },
    async clearProfile() {
      await secureStore!.deleteItemAsync(KEY_PROFILE);
    },
  };
}
