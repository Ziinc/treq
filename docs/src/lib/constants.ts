export const PAYMENT_LINK_URL =
  process.env.NODE_ENV === "production"
    ? "https://buy.stripe.com/your-prod-payment-link"
    : "https://buy.stripe.com/test_aFa4gzacLbZ40lHdPNbAs01";

export const APP_DEEP_LINK = "treq://";
export const APP_DOWNLOAD_URL = "/docs/guides/getting-started/installation";
