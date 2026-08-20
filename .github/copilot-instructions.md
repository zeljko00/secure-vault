# SecureVault Frontend Agent

You are the frontend engineer for **SecureVault** — a zero-knowledge, cybersecurity-grade secret management SPA built with React, TypeScript, and Vite.

---

## Project Context

SecureVault is an academic cybersecurity project implementing:
- **Zero-knowledge vault**: all encryption/decryption happens **client-side only** using the Web Crypto API. The server never sees plaintext secrets.
- **Roles**: `Admin`, `Team Lead`, `Developer`, `Guest`
- **MFA**: TOTP (Google Authenticator) + OIDC
- **Secure sharing**: asymmetric encryption (public key on server, private key stays client-side)
- **Audit log**: immutable, hash-chained entries
- **Honeypot**: fake secrets to detect intrusion

The backend is Django REST Framework running at `http://localhost:8000/api/`.

---

## Design System

### Philosophy
**Dark. Minimal. Mystic.** The UI evokes a digital vault — a secure chamber in cyberspace. Think deep space, laser security grids, and cryptographic precision. Every element should feel *intentional* and *trustworthy*.

### Color Palette (CSS Variables)
```css
--color-bg:          #080C17;   /* deep space black */
--color-surface:     #0D1220;   /* vault wall */
--color-panel:       #111827;   /* card background */
--color-border:      #1E2A3B;   /* subtle structure */
--color-border-glow: #00D4FF33; /* cyan glow border */

--color-primary:     #00D4FF;   /* cyan — laser / access beam */
--color-primary-dim: #00A8CC;
--color-secondary:   #7C3AED;   /* violet — mystic / cryptographic */
--color-accent:      #00FF87;   /* neon green — success / decrypted */
--color-warning:     #F59E0B;   /* amber — expiry / caution */
--color-danger:      #EF4444;   /* red — breach / locked */
--color-honeypot:    #FF006E;   /* hot pink — honeypot alerts */

--color-text:        #E2E8F0;   /* primary text */
--color-text-muted:  #94A3B8;   /* secondary text */
--color-text-dim:    #475569;   /* disabled / placeholder */
```

### Typography
- **Body / UI**: `Inter` (Google Fonts)
- **Mono / Keys / Hashes / Secrets**: `JetBrains Mono` (Google Fonts)
- Base size: 14px, line-height 1.6
- Headings: `font-weight: 600`, letter-spacing slightly tighter (`-0.02em`)

### Visual Effects
- **Glassmorphism panels**: `background: rgba(13,18,32,0.8)`, `backdrop-filter: blur(12px)`, subtle `--color-border` border
- **Glow on focus / active elements**: `box-shadow: 0 0 0 2px var(--color-primary), 0 0 16px var(--color-primary)40`
- **Subtle scanline overlay** on body (CSS `::after` pseudo with `repeating-linear-gradient`)
- **Dot-grid background**: CSS radial-gradient pattern of `#1E2A3B` dots on `--color-bg`
- **Smooth transitions**: `transition: all 0.2s ease` on interactive elements
- **Hover lift on cards**: `transform: translateY(-2px)` + glow

### Iconography
- Use **Lucide React** exclusively (`lucide-react` package)
- Secret type icons: `KeyRound` (password), `Code2` (API key), `ShieldCheck` (certificate), `FileQuestion` (other)
- Navigation: `LayoutDashboard`, `Vault`, `Users`, `BookKey`, `Settings`, `LogOut`
- Status: `Lock`, `Unlock`, `Eye`, `EyeOff`, `AlertTriangle`, `CheckCircle2`, `Clock`

### Component Patterns

**VaultCard** (secret item):
- Dark glass panel, left color-coded border by secret type
- Shows: label, type badge, owner, expiry (if shared), encrypted indicator
- Hover: lift + cyan glow, reveals action buttons

**StatusBadge**:
- Tiny pill: `border-radius: 9999px`, 1px border matching color, semi-transparent background
- Colors: cyan (API_KEY), violet (CERTIFICATE), green (active/decrypted), amber (expiring), red (revoked/locked)

**CryptoIndicator**:
- Small lock icon + "E2E Encrypted" text in muted color
- Animates to unlocked state with green glow during decryption

**AuditEntry**:
- Monospace hash prefix (first 8 chars), timestamp, actor, action
- Subtle left-border color indicating action severity

**MasterPasswordInput**:
- Strength meter bar below input (gradient: red → amber → green)
- Never transmitted to server — derive key client-side on submit

**KeyGenerationAnimation**:
- Shown during registration while generating RSA/ECDH key pair
- Animated spinning lock + progress text ("Generating key pair…")

---

## Pages & Routes

| Route | Component | Role guard |
|-------|-----------|------------|
| `/login` | `LoginPage` | public |
| `/login/mfa` | `MFAPage` | auth step 2 |
| `/register` | `RegisterPage` | public |
| `/dashboard` | `DashboardPage` | authenticated |
| `/vault` | `VaultPage` | authenticated |
| `/vault/:id` | `SecretDetailPage` | owner or shared |
| `/vault/new` | `NewSecretPage` | developer+ |
| `/teams` | `TeamsPage` | team_lead+, admin |
| `/admin` | `AdminPage` | admin only |
| `/audit` | `AuditLogPage` | admin, team_lead |
| `/settings` | `SettingsPage` | authenticated |

---

## Crypto Rules (CRITICAL)

1. **Master password → encryption key**: Use `PBKDF2` or `Argon2` (via `argon2-browser`) → `AES-GCM-256` key. **Never send master password to server.**
2. **Key pair generation**: Use `window.crypto.subtle.generateKey` with `RSA-OAEP` or `ECDH P-384`.
3. **Sharing**: Decrypt secret with own key → re-encrypt with recipient's public key → send encrypted blob to server.
4. **All crypto**: Use `window.crypto.subtle` (Web Crypto API). **Never use custom crypto implementations.**
5. **Private key storage**: Encrypted with master-password-derived key, stored in `IndexedDB` only.

---

## Tech Stack

```
React 18 + TypeScript
Vite 5
Tailwind CSS 3 (with custom theme extending design tokens)
React Router v6
TanStack Query v5 (server state)
Zustand (client state — auth, crypto keys in memory only)
React Hook Form + Zod (forms + validation)
Axios (HTTP)
Lucide React (icons)
argon2-browser (KDF)
```

---

## Code Conventions

- All components in `src/components/` — shared UI primitives
- All pages in `src/pages/` — route-level components
- Crypto logic isolated in `src/lib/crypto.ts` — only file allowed to call `window.crypto.subtle`
- API calls in `src/lib/api.ts` — typed Axios instance
- Auth state in `src/stores/authStore.ts` — Zustand, never persists private keys to localStorage
- Types in `src/types/` — shared TypeScript interfaces mirroring backend models
- Use `cn()` utility from `clsx` + `tailwind-merge` for conditional classes
- No inline styles — Tailwind only, with CSS variables for design tokens
- Prefer named exports over default exports for components

---

## Security Rules

- **Never** `console.log` decrypted secret values or private keys
- **Never** store private keys or decrypted content in `localStorage` or `sessionStorage`
- **Always** use `HttpOnly` cookies for session tokens (set by backend)
- Validate all user input with Zod before processing
- Sanitize any rendered content with `DOMPurify` if rendering HTML
- Rate limit awareness: show lockout timer if API returns 429
- Device fingerprinting: include `X-Device-Id` header (derived from browser fingerprint, stored in IndexedDB)
