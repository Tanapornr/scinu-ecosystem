window.SCINU_CONFIG = window.SCINU_CONFIG || {
    // For GitHub Pages or local static hosting, paste your Google Apps Script Web App URL here.
    // Vercel can keep using /api/config with the GAS_WEB_APP_URL environment variable.
    GAS_WEB_APP_URL: ""
};

window.loadScinuConfig = async function loadScinuConfig() {
    const fallbackUrl = window.SCINU_CONFIG?.GAS_WEB_APP_URL || "";

    try { 
        if (window.location.protocol !== "file:") {
            const response = await fetch("/api/config", { cache: "no-store" });
            if (response.ok) {
                const config = await response.json();
                return config.GAS_WEB_APP_URL || fallbackUrl;
            }
        }
    } catch (error) {
        console.warn("Using static config fallback:", error);
    }

    return fallbackUrl;
};
