import React, { useEffect, useState } from "react";
import Layout from "@theme/Layout";
import BrowserOnly from "@docusaurus/BrowserOnly";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import { supabase } from "../../../lib/supabase";

type State = "loading" | "success" | "error" | "unauthenticated";

function CallbackContent() {
  const [state, setState] = useState<State>("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const run = async () => {
      const params = new URLSearchParams(window.location.search);
      const installationId = params.get("installation_id");
      const setupAction = params.get("setup_action");

      if (!installationId) {
        setState("error");
        setMessage("No installation_id in URL.");
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setState("unauthenticated");
        setMessage(
          `Please sign in and then visit: /integrations/github/callback?installation_id=${installationId}&setup_action=${setupAction ?? "install"}`
        );
        return;
      }

      const { error } = await supabase.rpc("link_github_installation", {
        p_installation_id: parseInt(installationId, 10),
      });

      if (error) {
        setState("error");
        setMessage(error.message);
        return;
      }

      setState("success");

      // Redirect to dashboard after a brief pause
      setTimeout(() => {
        window.location.href = "/dashboard?tab=integrations";
      }, 2000);
    };

    run();
  }, []);

  return (
    <div style={styles.container}>
      {state === "loading" && (
        <>
          <div style={styles.spinner} />
          <p style={styles.text}>Connecting GitHub App…</p>
        </>
      )}

      {state === "success" && (
        <>
          <div style={styles.icon}>✓</div>
          <p style={styles.text}>
            GitHub App connected successfully! Redirecting to your dashboard…
          </p>
        </>
      )}

      {state === "error" && (
        <>
          <div style={{ ...styles.icon, color: "#ef4444" }}>✕</div>
          <p style={{ ...styles.text, color: "#ef4444" }}>
            Connection failed: {message}
          </p>
          <a href="/dashboard?tab=integrations" style={styles.link}>
            Return to dashboard
          </a>
        </>
      )}

      {state === "unauthenticated" && (
        <>
          <p style={styles.text}>You need to be signed in to link the GitHub App.</p>
          <a
            href={`/login?redirect=${encodeURIComponent(window.location.href)}`}
            style={styles.link}
          >
            Sign in
          </a>
        </>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "60vh",
    gap: "1rem",
  },
  spinner: {
    width: "32px",
    height: "32px",
    border: "3px solid var(--ifm-color-emphasis-200)",
    borderTopColor: "var(--ifm-color-primary)",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  icon: {
    fontSize: "3rem",
    color: "#10b981",
    fontWeight: 700,
  },
  text: {
    fontSize: "1rem",
    textAlign: "center",
    maxWidth: "480px",
  },
  link: {
    color: "var(--ifm-color-primary)",
    textDecoration: "underline",
    cursor: "pointer",
  },
};

export default function GitHubCallbackPage(): React.ReactNode {
  const { siteConfig } = useDocusaurusContext();
  const flags = siteConfig.customFields?.featureFlags as { pro?: boolean } | undefined;

  if (!flags?.pro) {
    return (
      <BrowserOnly>
        {() => {
          window.location.href = "/";
          return null;
        }}
      </BrowserOnly>
    );
  }

  return (
    <Layout title="GitHub Integration" description="Connecting your GitHub App">
      <BrowserOnly>{() => <CallbackContent />}</BrowserOnly>
    </Layout>
  );
}
