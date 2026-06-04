# Destiny Chronicle Desktop

One-click desktop wrapper for the personal offline archive edition.

## Prerequisites

- [Rust](https://rustup.rs/)
- Node.js 20+
- Built Angular app (`npm run build` from repo root)

## Setup

```bash
cd desktop
npm install
```

## Development

From repo root, start Angular dev server:

```bash
npm start
```

In another terminal:

```bash
cd desktop
npm run dev
```

## Production build

```bash
cd desktop
npm run build
```

Installer output is under `desktop/src-tauri/target/release/bundle/`.

## Using an offline archive

1. In the web or desktop app, sync your accounts while Bungie is online.
2. Click **Build offline archive** to download a `.chronicle.zip` file.
3. Click **Open archive…** and select the zip.
4. The app switches to read-only offline mode with bundled images and PGCR data.

While in offline mode, click **Check for updates** in the green banner to reach Bungie (when online), sync new activities for archived accounts, and refresh the archive in place—no need to exit offline mode first.

## Antivirus and “Windows protected your PC” (SmartScreen)

Unsigned or newly published desktop apps are often flagged by antivirus and Microsoft SmartScreen. This is common for indie/Tauri apps and is not necessarily a sign of malware.

### What we do to reduce false positives

1. **Code signing (recommended for releases)**  
   Sign the Windows installer with an **Authenticode** certificate from a trusted CA (e.g. DigiCert, Sectigo). Extended Validation (EV) certs build SmartScreen reputation faster. Configure in Tauri:

   ```json
   "bundle": {
     "windows": {
       "certificateThumbprint": "YOUR_CERT_THUMBPRINT",
       "timestampUrl": "http://timestamp.digicert.com"
     }
   }
   ```

2. **GitHub Releases**  
   Publish installers from tagged releases with checksums (SHA-256) so users can verify downloads.

3. **Open source**  
   Source is public; users can build the installer themselves from this repo if they prefer.

4. **False-positive reports**  
   If a specific AV product blocks the app, submit the file to that vendor’s false-positive form (Microsoft, Malwarebytes, etc.).

### What users can do if blocked

- **Web app + zip archive** — Use the GitHub Pages site and **Open archive…** in the browser; no installer required.
- **Build from source** — Clone the repo, run `npm run build`, use the browser workflow above.
- **SmartScreen “More info” → Run anyway** — Only after verifying the download came from the official release URL and checksum.

We do not recommend disabling antivirus globally or adding broad exclusions unless you trust the exact signed build.

## CLI image bundler

When assembling archives outside the browser:

```bash
node tools/archive-builder/download-images.mjs ./MyArchive/asset-map.json ./MyArchive
```
