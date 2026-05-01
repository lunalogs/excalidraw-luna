import { createClient } from "@supabase/supabase-js";

import type { Session } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_EXCALIDRAW_LUNA_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_EXCALIDRAW_LUNA_SUPABASE_PUBLISHABLE_KEY;

const PROVIDER_TOKEN_STORAGE_KEY =
  "excalidraw-luna-google-provider-token";

type SessionWithProviderToken = Session & {
  provider_token?: string | null;
};

export const isSupabaseConfigured = Boolean(
  SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY,
);

export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export const storeProviderToken = (session: Session | null) => {
  if (typeof window === "undefined") {
    return null;
  }

  const providerToken = (session as SessionWithProviderToken | null)
    ?.provider_token;

  if (providerToken) {
    window.sessionStorage.setItem(PROVIDER_TOKEN_STORAGE_KEY, providerToken);
    return providerToken;
  }

  window.sessionStorage.removeItem(PROVIDER_TOKEN_STORAGE_KEY);
  return null;
};

export const getProviderToken = () => {
  if (typeof window === "undefined") {
    return null;
  }

  return window.sessionStorage.getItem(PROVIDER_TOKEN_STORAGE_KEY);
};

export const signInWithGoogle = async () => {
  if (!supabase) {
    throw new Error("Supabase is not configured");
  }

  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: window.location.href,
      scopes: "https://www.googleapis.com/auth/drive.file",
      queryParams: {
        access_type: "offline",
        prompt: "consent",
      },
    },
  });
};

export const signOutFromSupabase = async () => {
  if (!supabase) {
    return;
  }

  await supabase.auth.signOut();
  storeProviderToken(null);
};
