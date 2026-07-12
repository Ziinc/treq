import React, { useEffect, useState } from "react";
import Layout from "@theme/Layout";
import BrowserOnly from "@docusaurus/BrowserOnly";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import { supabase } from "../lib/supabase";
import { PAYMENT_LINK_URL, APP_DEEP_LINK, APP_DOWNLOAD_URL } from "../lib/constants";
function DashboardContent() {
    const [user, setUser] = useState(null);
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);
    const [subscription, setSubscription] = useState(null);
    const [activeTab, setActiveTab] = useState("subscription");
    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session: s } }) => {
            if (!s) {
                window.location.href = "/login";
                return;
            }
            setSession(s);
            setUser(s.user);
            setLoading(false);
        });
        const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange((_event, s) => {
            setSession(s);
            setUser(s?.user ?? null);
            if (!s) {
                window.location.href = "/login";
            }
        });
        return () => authSub.unsubscribe();
    }, []);
    // Fetch subscription status from Stripe via FDW
    useEffect(() => {
        if (!session)
            return;
        supabase
            .from("subscriptions")
            .select("*")
            .single()
            .then(({ data }) => {
            if (data)
                setSubscription(data);
        });
    }, [session]);
    const handleSignOut = async () => {
        await supabase.auth.signOut();
        window.location.href = "/";
    };
    const handleUpgrade = () => {
        if (!user)
            return;
        const url = `${PAYMENT_LINK_URL}?client_reference_id=${user.id}`;
        window.location.href = url;
    };
    if (loading) {
        return (<div style={styles.centerContainer}>
        <div style={styles.spinner}/>
        <p>Loading...</p>
      </div>);
    }
    if (!user)
        return null;
    const avatarUrl = user.user_metadata?.avatar_url || user.user_metadata?.picture;
    const fullName = user.user_metadata?.full_name || user.user_metadata?.name || "User";
    const isPro = subscription?.plan === "pro" && subscription?.status === "active";
    return (<div style={styles.container}>
      <div style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          {avatarUrl ? (<img src={avatarUrl} alt={fullName} style={styles.avatar}/>) : (<div style={styles.avatarPlaceholder}>{fullName[0]}</div>)}
          <div>
            <div style={styles.userName}>{fullName}</div>
            <div style={styles.userEmail}>{user.email}</div>
          </div>
        </div>

        <nav style={styles.nav}>
          <button onClick={() => setActiveTab("subscription")} style={{
            ...styles.navItem,
            ...(activeTab === "subscription" ? styles.navItemActive : {}),
        }}>
            Subscription
          </button>
          <button onClick={() => setActiveTab("integrations")} style={{
            ...styles.navItem,
            ...(activeTab === "integrations" ? styles.navItemActive : {}),
        }}>
            Integrations
          </button>
        </nav>

        <button onClick={handleSignOut} style={styles.signOutButton}>
          Sign Out
        </button>
      </div>

      <div style={styles.content}>
        <div style={styles.openAppCard}>
          <div style={styles.openAppInfo}>
            <div style={styles.openAppTitle}>Treq Desktop</div>
            <div style={styles.openAppDesc}>
              Open the app to manage your workspaces and start coding.
            </div>
          </div>
          <div style={styles.openAppActions}>
            <a href={APP_DEEP_LINK} style={styles.primaryButton}>
              Open App
            </a>
            <a href={APP_DOWNLOAD_URL} style={styles.openAppDownload}>
              Download
            </a>
          </div>
        </div>

        {activeTab === "subscription" && (<div>
            <h2 style={styles.sectionTitle}>Subscription</h2>
            <div style={styles.card}>
              <div style={styles.field}>
                <label style={styles.fieldLabel}>Current Plan</label>
                <div style={styles.fieldValue}>
                  <span style={isPro ? styles.proBadge : styles.freeBadge}>
                    {isPro ? "Pro" : "Free"}
                  </span>
                </div>
              </div>
              {subscription?.status && (<div style={styles.field}>
                  <label style={styles.fieldLabel}>Status</label>
                  <div style={styles.fieldValue}>
                    <span style={{
                    color: subscription.status === "active"
                        ? "#10b981"
                        : subscription.status === "canceled"
                            ? "#f59e0b"
                            : "#6b7280",
                }}>
                      {subscription.status.charAt(0).toUpperCase() +
                    subscription.status.slice(1).replace("_", " ")}
                    </span>
                  </div>
                </div>)}
              {subscription?.current_period_end && (<div style={styles.field}>
                  <label style={styles.fieldLabel}>Current Period Ends</label>
                  <div style={styles.fieldValue}>
                    {new Date(subscription.current_period_end).toLocaleDateString()}
                  </div>
                </div>)}

              {!isPro && (<div style={{ marginTop: "1.5rem" }}>
                  <button onClick={handleUpgrade} style={styles.primaryButton}>
                    Upgrade to Pro
                  </button>
                </div>)}
            </div>
          </div>)}

        {activeTab === "integrations" && (<div>
            <h2 style={styles.sectionTitle}>Integrations</h2>

            <div style={styles.card}>
              <div style={styles.integrationItem}>
                <div style={styles.integrationInfo}>
                  <div style={styles.integrationIcon}>
                    <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/>
                    </svg>
                  </div>
                  <div>
                    <div style={styles.integrationName}>GitHub</div>
                    <div style={styles.integrationDesc}>
                      Connect your GitHub repositories for seamless code integration.
                    </div>
                  </div>
                </div>
                <span style={styles.comingSoonBadge}>Coming Soon</span>
              </div>
            </div>

            <div style={{ ...styles.card, marginTop: "1rem" }}>
              <div style={styles.integrationItem}>
                <div style={styles.integrationInfo}>
                  <div style={styles.integrationIcon}>
                    <svg width="20" height="20" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M20.15 64.15L36 48.29l15.85 15.86L36 80z" fill="#5E6AD2"/>
                      <path d="M4.29 48.29L20.15 32.43l15.85 15.86L20.15 64.15z" fill="#5E6AD2"/>
                      <path d="M36 32.43L51.85 16.57l15.86 15.86L51.85 48.29z" fill="#5E6AD2"/>
                      <path d="M51.85 16.57L67.71.71l15.86 15.86L67.71 32.43z" fill="#5E6AD2"/>
                    </svg>
                  </div>
                  <div>
                    <div style={styles.integrationName}>Linear</div>
                    <div style={styles.integrationDesc}>
                      Link issues and track progress directly from Treq.
                    </div>
                  </div>
                </div>
                <span style={styles.comingSoonBadge}>Coming Soon</span>
              </div>
            </div>
          </div>)}
      </div>
    </div>);
}
const styles = {
    centerContainer: {
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "60vh",
    },
    spinner: {
        width: "32px",
        height: "32px",
        border: "3px solid var(--ifm-color-emphasis-200)",
        borderTopColor: "var(--ifm-color-primary)",
        borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
        marginBottom: "1rem",
    },
    container: {
        display: "flex",
        width: "960px",
        margin: "2rem auto",
        padding: "0 1rem",
        gap: "2rem",
        minHeight: "60vh",
    },
    sidebar: {
        width: "240px",
        flexShrink: 0,
    },
    sidebarHeader: {
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        marginBottom: "1.5rem",
        paddingBottom: "1rem",
        borderBottom: "1px solid var(--ifm-color-emphasis-200)",
    },
    avatar: {
        width: "40px",
        height: "40px",
        borderRadius: "50%",
    },
    avatarPlaceholder: {
        width: "40px",
        height: "40px",
        borderRadius: "50%",
        backgroundColor: "var(--ifm-color-primary)",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 600,
        fontSize: "1.1rem",
    },
    userName: {
        fontWeight: 600,
        fontSize: "0.9rem",
    },
    userEmail: {
        fontSize: "0.75rem",
        color: "var(--ifm-color-emphasis-500)",
    },
    nav: {
        display: "flex",
        flexDirection: "column",
        gap: "0.25rem",
    },
    navItem: {
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: "0.5rem 0.75rem",
        borderRadius: "6px",
        border: "none",
        backgroundColor: "transparent",
        color: "var(--ifm-font-color-base)",
        fontSize: "0.9rem",
        cursor: "pointer",
        transition: "all 0.15s",
    },
    navItemActive: {
        backgroundColor: "var(--ifm-color-emphasis-100)",
        fontWeight: 600,
    },
    signOutButton: {
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: "0.5rem 0.75rem",
        borderRadius: "6px",
        border: "none",
        backgroundColor: "transparent",
        color: "#ef4444",
        fontSize: "0.9rem",
        cursor: "pointer",
        marginTop: "1rem",
    },
    content: {
        flex: 1,
        minWidth: 0,
    },
    openAppCard: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "1.25rem 1.5rem",
        borderRadius: "10px",
        border: "1px solid var(--ifm-color-primary)",
        backgroundColor: "var(--ifm-background-color)",
        marginBottom: "1.5rem",
    },
    openAppInfo: {
        flex: 1,
        minWidth: 0,
    },
    openAppTitle: {
        fontWeight: 600,
        fontSize: "0.95rem",
        marginBottom: "0.2rem",
    },
    openAppDesc: {
        fontSize: "0.8rem",
        color: "var(--ifm-color-emphasis-500)",
    },
    openAppActions: {
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        flexShrink: 0,
    },
    openAppDownload: {
        fontSize: "0.85rem",
        color: "var(--ifm-color-emphasis-500)",
        textDecoration: "none",
    },
    sectionTitle: {
        fontSize: "1.25rem",
        fontWeight: 700,
        marginBottom: "1rem",
    },
    card: {
        padding: "1.5rem",
        borderRadius: "10px",
        border: "1px solid var(--ifm-color-emphasis-200)",
        backgroundColor: "var(--ifm-background-color)",
    },
    field: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "0.75rem 0",
        borderBottom: "1px solid var(--ifm-color-emphasis-100)",
    },
    fieldLabel: {
        fontSize: "0.85rem",
        color: "var(--ifm-color-emphasis-600)",
        fontWeight: 500,
    },
    fieldValue: {
        fontSize: "0.9rem",
        fontWeight: 500,
    },
    proBadge: {
        padding: "0.2rem 0.6rem",
        borderRadius: "12px",
        backgroundColor: "rgba(16, 185, 129, 0.1)",
        color: "#10b981",
        fontSize: "0.8rem",
        fontWeight: 600,
    },
    freeBadge: {
        padding: "0.2rem 0.6rem",
        borderRadius: "12px",
        backgroundColor: "var(--ifm-color-emphasis-100)",
        color: "var(--ifm-color-emphasis-600)",
        fontSize: "0.8rem",
        fontWeight: 600,
    },
    primaryButton: {
        display: "inline-block",
        padding: "0.6rem 1.5rem",
        borderRadius: "8px",
        border: "none",
        background: "linear-gradient(135deg, var(--ifm-color-primary) 0%, var(--ifm-color-primary-dark) 100%)",
        color: "#fff",
        fontSize: "0.9rem",
        fontWeight: 600,
        cursor: "pointer",
        transition: "all 0.2s",
        textDecoration: "none",
    },
    integrationItem: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "1rem",
    },
    integrationInfo: {
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        flex: 1,
        minWidth: 0,
    },
    integrationIcon: {
        width: "36px",
        height: "36px",
        borderRadius: "8px",
        backgroundColor: "var(--ifm-color-emphasis-100)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
    },
    integrationName: {
        fontWeight: 600,
        fontSize: "0.9rem",
        marginBottom: "0.15rem",
    },
    integrationDesc: {
        fontSize: "0.8rem",
        color: "var(--ifm-color-emphasis-500)",
    },
    comingSoonBadge: {
        padding: "0.2rem 0.6rem",
        borderRadius: "12px",
        backgroundColor: "var(--ifm-color-emphasis-100)",
        color: "var(--ifm-color-emphasis-500)",
        fontSize: "0.75rem",
        fontWeight: 500,
        whiteSpace: "nowrap",
        flexShrink: 0,
    },
};
export default function DashboardPage() {
    const { siteConfig } = useDocusaurusContext();
    const flags = siteConfig.customFields?.featureFlags;
    if (!flags?.pro) {
        return (<BrowserOnly>{() => { window.location.href = "/"; return null; }}</BrowserOnly>);
    }
    return (<Layout title="Dashboard" description="Manage your Treq account">
      <BrowserOnly>{() => <DashboardContent />}</BrowserOnly>
    </Layout>);
}
