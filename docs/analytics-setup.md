# Analytics Setup Guide

This guide walks you through setting up **Google Analytics (GA4)** and **Cloudflare Web Analytics** for Destiny Chronicle.

---

## Google Analytics (GA4)

### 1. Create a Google Analytics account

1. Go to [analytics.google.com](https://analytics.google.com)
2. Sign in with your Google account
3. Click **Admin** (gear icon, bottom left)
4. Under **Account**, click **Create account**
   - Account name: e.g. "Destiny Chronicle"
   - Click **Next**

### 2. Create a GA4 property

1. Property name: e.g. "Destiny Chronicle"
2. Reporting time zone: your timezone
3. Currency: your currency
4. Click **Next**
5. Industry category: choose closest (e.g. "Games")
6. Business size: choose your size
7. Click **Create**
8. Accept the Terms of Service

### 3. Set up a web data stream

1. Choose **Web** as the platform
2. Website URL: `https://splashbear.github.io/Destiny-Chronicle/` (or your actual site URL)
3. Stream name: e.g. "Destiny Chronicle Production"
4. Click **Create stream**

### 4. Get your Measurement ID

1. On the stream details page, find **Measurement ID** (format: `G-XXXXXXXXXX`)
2. Copy this value

### 5. Add to the app

1. Open `src/environments/environment.prod.ts`
2. Find the `analytics` section
3. Replace `'G-XXXXXXXXXX'` with your actual Measurement ID:

```ts
analytics: {
  googleMeasurementId: 'G-XXXXXXXXXX',  // Replace with your ID
  cloudflareToken: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
}
```

---

## Cloudflare Web Analytics

### 1. Sign up / log in

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com)
2. Sign in or create a free account

### 2. Add Web Analytics (no proxy required)

1. In the left sidebar, click **Web Analytics** (under "Analytics & Logs")
2. Click **Add a site**
3. Enter your site URL: e.g. `splashbear.github.io/Destiny-Chronicle`
4. Click **Add site**

### 3. Get your token

1. After adding the site, click **Manage site**
2. Copy the **token** (UUID format: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)

### 4. Add to the app

1. Open `src/environments/environment.prod.ts`
2. Find the `analytics` section
3. Replace the Cloudflare token placeholder with your actual token:

```ts
analytics: {
  googleMeasurementId: 'G-XXXXXXXXXX',
  cloudflareToken: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'  // Replace with your token
}
```

---

## Verification

1. Build for production: `npm run build`
2. Deploy to GitHub Pages (or your host)
3. Visit your site and browse a few pages
4. **Google Analytics**: In GA4, go to **Reports → Realtime** — you should see your visit within ~30 seconds
5. **Cloudflare**: In Web Analytics dashboard, data may take a few minutes to appear

---

## Notes

- Analytics scripts load **only in production builds** (not when running `ng serve`)
- If you leave the placeholders empty (`''`), that provider will be skipped
- Both tools are privacy-friendly: Cloudflare does not use cookies; GA4 can be configured for minimal data collection
