// src/lib/amazonLogin.ts
const CLIENT_ID = import.meta.env.VITE_AMAZON_CLIENT_ID as string;

declare global {
    interface Window {
        amazon?: any;
        onAmazonLoginReady?: () => void;
    }
}

let sdkLoaded = false;
let loadingPromise: Promise<void> | null = null;

export function ensureAmazonSdk(): Promise<void> {
    if (sdkLoaded && window.amazon) {
        return Promise.resolve();
    }

    if (loadingPromise) return loadingPromise;

    loadingPromise = new Promise<void>((resolve, reject) => {
        window.onAmazonLoginReady = function () {
            if (!window.amazon || !window.amazon.Login) {
                reject(new Error('Amazon SDK did not initialise correctly'));
                loadingPromise = null;
                return;
            }

            window.amazon.Login.setClientId(CLIENT_ID);

            // Important for LWA JS SDK: return URL must match an allowed return URL in your Amazon Security Profile.
            // Defaulting to `${origin}/onboarding` covers the normal local dev flow.
            const returnUrl =
                (import.meta.env.VITE_AMAZON_RETURN_URL as string) ||
                `${window.location.origin}/onboarding`;
            window.amazon.Login.setReturnUrl(returnUrl);

            sdkLoaded = true;
            loadingPromise = null;
            resolve();
        };

        const existing = document.getElementById('amazon-login-sdk');
        if (existing) {
            // Script already on page, just wait for onAmazonLoginReady to fire
            return;
        }

        const root = document.getElementById('amazon-root') || document.body;
        const script = document.createElement('script');
        script.type = 'text/javascript';
        script.async = true;
        script.id = 'amazon-login-sdk';
        script.src = 'https://assets.loginwithamazon.com/sdk/na/login1.js';
        script.onerror = (err) => {
            loadingPromise = null;
            reject(err as any);
        };

        root.appendChild(script);
    });

    return loadingPromise;
}

export { };
