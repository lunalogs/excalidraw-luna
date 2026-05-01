import React from "react";

type AuthUserControlProps = {
  userEmail: string | null;
  userAvatarUrl: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
};

const getInitial = (email: string | null) =>
  email?.trim().charAt(0).toUpperCase() || "G";

export const AuthUserControl: React.FC<AuthUserControlProps> = React.memo(
  ({
    userEmail,
    userAvatarUrl,
    isAuthenticated,
    isLoading,
    onSignIn,
    onSignOut,
  }) => {
    if (isLoading) {
      return null;
    }

    if (!isAuthenticated) {
      return (
        <button
          className="btn btn-primary"
          type="button"
          onClick={onSignIn}
          style={{ marginInlineStart: 8 }}
        >
          Sign in
        </button>
      );
    }

    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginInlineStart: 8,
          padding: "6px 10px",
          borderRadius: 999,
          background: "var(--color-surface-lowest, rgba(255,255,255,0.92))",
          boxShadow: "0 1px 4px rgba(0, 0, 0, 0.08)",
        }}
      >
        {userAvatarUrl ? (
          <img
            src={userAvatarUrl}
            alt={userEmail || "Signed in user"}
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              objectFit: "cover",
            }}
          />
        ) : (
          <div
            aria-hidden="true"
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#2563eb",
              color: "#fff",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {getInitial(userEmail)}
          </div>
        )}
        <span
          style={{
            maxWidth: 180,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontSize: 13,
          }}
          title={userEmail || undefined}
        >
          {userEmail || "Signed in"}
        </span>
        <button
          className="btn btn-secondary"
          type="button"
          onClick={onSignOut}
        >
          Sign out
        </button>
      </div>
    );
  },
);
