# Light Theme Color Schemes (Destiny Chronicle)

Options for a future full light-theme rework. Each scheme keeps contrast and readability while giving the app a distinct look. Use these as a starting point; you can mix (e.g. Neutral backgrounds + Destiny accents).

---

## 1. **Clean Neutral** (current direction, refined)

- **Vibe:** Minimal, readable, works everywhere.
- **Background:** Off-white → light gray gradient (`#f8fafc` → `#e2e8f0` → `#cbd5e1`).
- **Cards / surfaces:** White or `rgba(255,255,255,0.9)`, subtle border `#e2e8f0`.
- **Primary text:** `#1e293b` (slate-800).
- **Secondary / muted:** `#475569` (slate-600).
- **Accent (links, buttons, focus):** Blue `#2563eb` / `#1d4ed8`.
- **Borders / dividers:** `#cbd5e1`–`#94a3b8`.
- **Pros:** Safe, accessible, low distraction.  
- **Cons:** Can feel generic.

---

## 2. **Warm / Cosmic**

- **Vibe:** Soft “golden hour” / parchment, still light.
- **Background:** Warm off-white → cream (`#fefce8` → `#fef9c3` → `#fde68a` or `#fef3c7`).
- **Cards:** `#fffbeb` (amber-50) or white with warm shadow.
- **Primary text:** `#422006` or `#78350f` (amber-900/800).
- **Secondary:** `#92400e` / `#b45309` (amber-700/600).
- **Accent:** Amber/gold `#d97706`, `#b45309` (matches D2 gold).
- **Borders:** `#fde68a` / `#fcd34d`.
- **Pros:** Feels Destiny (gold), cozy.  
- **Cons:** Can feel heavy if overdone; keep backgrounds light.

---

## 3. **Cool Slate / “Dawn”**

- **Vibe:** Cool, calm, early-morning.
- **Background:** Very light blue-gray (`#f0f9ff` → `#e0f2fe` → `#bae6fd` or `#f1f5f9` → `#e2e8f0`).
- **Cards:** White or `#f8fafc` with border `#cbd5e1`.
- **Primary text:** `#0f172a` (slate-900).
- **Secondary:** `#475569` (slate-600).
- **Accent:** Blue `#0369a1` / `#0284c7` (sky-700/600).
- **Borders:** `#94a3b8`, `#cbd5e1`.
- **Pros:** Modern, easy on the eyes, good for long sessions.  
- **Cons:** Less “gamey” than warm.

---

## 4. **Destiny-Branded Light**

- **Vibe:** Light theme but with clear D1/D2 identity (red/blue, gold).
- **Background:** Light neutral base (`#f8fafc` or `#f1f5f9`).
- **Cards:** White / `#ffffff` with subtle gold or blue border (`#f59e0b` at 20–30% opacity, or `#3b82f6` at 20%).
- **Primary text:** `#1e293b`.
- **Secondary:** `#475569`.
- **Accents:**
  - **Primary (CTAs, links):** D2 gold `#f59e0b` / `#d97706`.
  - **Secondary / D2:** Blue `#2563eb`.
  - **D1 / danger:** Red `#dc2626` / `#b91c1c`.
- **Headers / highlights:** Very light gold tint `#fffbeb` or light blue `#eff6ff`.
- **Borders:** `#e2e8f0` default; gold/blue for selected or key cards.
- **Pros:** Recognizable, ties to game.  
- **Cons:** Need to avoid clutter (don’t overuse gold/red/blue).

---

## 5. **High Contrast / Accessibility-First**

- **Vibe:** Maximum readability (WCAG AAA where possible).
- **Background:** Pure or near-white `#ffffff`, optional very light gray `#f8fafc`.
- **Cards:** White `#ffffff`, border `#64748b` or `#475569`.
- **Primary text:** Black or near-black `#0f172a`.
- **Secondary:** `#334155` (slate-700).
- **Accent:** High-contrast blue `#1d4ed8` or gold `#b45309`.
- **Borders:** `#475569` minimum.
- **Pros:** Best for accessibility.  
- **Cons:** Can feel stark; pair with one accent (e.g. Destiny gold) for personality.

---

## Implementation notes (for rework)

- Define **CSS custom properties** in `:root` or `html[data-theme="light"]` for:
  - `--dc-bg-base`, `--dc-bg-card`, `--dc-text-primary`, `--dc-text-secondary`, `--dc-accent`, `--dc-border`.
- Keep **one source of truth** (e.g. `styles.scss` or a `_light-themes.scss` partial) so switching schemes is a matter of swapping a set of variables.
- Keep **contrast ratios** ≥ 4.5:1 for normal text, ≥ 3:1 for large text and UI (WCAG 2.1).
- Keep **current behavior**: theme still toggled via `ThemeService`, `data-theme` and `.light` / `.light-theme` on `html`/`body`.

Once you pick a direction (or mix), we can map these tokens into your existing light overrides and components.
