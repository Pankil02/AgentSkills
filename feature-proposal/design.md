# Design System Specification

A comprehensive design documentation and token architecture for the Feature Proposal Viewer.

---

## 1. Brand Identity & Overview

The Proposal Viewer aesthetic pairs playful mid-century retro nostalgia with clean, modern minimalism.

* **Core Mood:** Focused engineering studio, retro workshop, cozy vintage aesthetic, playful, welcoming, artisanal.
* **Sub-tagline:** "Architectural clarity by design, deterministic execution by engineering."
* **Embellishments:** Playful status badges, starburst stamps, polaroid cards, speech bubbles, and hand-drawn scallop dividers.

---

## 2. Color Palette

All colors are defined as design tokens and mapped directly to CSS utilities.

| Token | Hex / Value | Usage |
| :--- | :--- | :--- |
| `--color-canvas` | `#f8f2e6` | Primary page background (warm cream/linen) |
| `--color-ink` | `#2f2f2f` | Primary body text (soft charcoal) |
| `--color-primary` | `#15018d` | Signature Brand Blue (electric ultramarine / deep sapphire) |
| `--color-orange` | `#e55a08` | Accent orange (starbursts, dots, subheadings, hover states) |
| `--color-warm-white` | `#fffdf8` | Card backgrounds, polaroid frames, lightbox, speech bubble |
| `--color-sand` | `#e9dfc9` | Polaroid tape stickers, subtle warm dividers |
| `--color-muted` | `#707070` | Secondary / muted text |
| `--color-blue-deep` | `#15018d` | Button active/hover state |
| `--color-espresso` | `#3f3026` | Deep rich brown |
| `--color-terracotta` | `#c96a4a` | Earthy accent |
| `--border-subtle` | `rgba(15, 33, 110, 0.1)` | Subtle header border line |

---

## 3. Typography System

The design system pairs a bold retro display font with Comic Neue for body prose and a crisp monospace for micro-copy:

### A. Display / Header Font: `hectic`
* **Source:** Custom geometric retro display font (`/fonts/hectic.ttf`)
* **Fallbacks:** `'hectic', 'Comic Neue', 'Comic Sans MS', cursive, system-ui, sans-serif`
* **Style:** Bold, uppercase, heavy geometric letterforms with slight retro rounding
* **Key Usages:**
  * Brand Logo: `font-hectic tracking-wider font-bold` ("PROPOSAL VIEWER")
  * Hero Headlines: `font-hectic text-[2.5rem] sm:text-7xl leading-[1.05]`
  * Navigation links: `font-hectic text-lg sm:text-xl uppercase`
  * Section Titles: `font-hectic text-3xl sm:text-5xl font-bold`
  * Polaroid captions & stickers: `font-hectic text-lg sm:text-xl`

### B. Body & Secondary Font: `Comic Neue`
* **Source:** Google Font / Local system cursive fallbacks (`'Comic Neue', 'Comic Sans MS', cursive, sans-serif`)
* **CSS Variable:** `--font-sans` / `--font-display`
* **Key Usages:**
  * Paragraph body text: `font-sans text-base leading-relaxed`
  * Menu & section items: names and descriptions
  * Form inputs, labels, and helper texts
  * Specifications & overview prose: `font-sans text-sm text-muted`

### C. Monospace / Micro-copy: `font-mono`
* **Source:** `'Courier Prime', 'Iosevka Etoile', Menlo, Monaco, Consolas, monospace`
* **CSS Variable:** `--font-mono`
* **Key Usages:**
  * Sub-headers & eyebrows: `font-mono text-xs uppercase tracking-widest text-orange font-bold`
  * Hotline badges: `01 / LOCALHOST`, `02 / CLI`
  * Code blocks, syntax, data pills, and timestamps

---

## 4. UI Components & Layout Specs

### 4.1 Header & Navigation (`Nav.tsx`)
* **Position:** `sticky top-0 z-50 w-full bg-canvas border-b border-[#0f216e]/10`
* **Height:** `h-20` with `px-6 lg:px-12`
* **Brand Logo:** "PROPOSAL VIEWER" (`font-hectic text-2xl font-bold tracking-wide text-primary`)
* **Desktop Nav Items:** `Overview`, `Architecture`, `Delivery`, `Source`
* **Active Indicator:** Dynamic hand-drawn rough underline SVG using `roughjs` (or rendered exact SVG path) with `scale-x-100` transition.
* **Call to Action (CTA):** "REFRESH" pill/box button (`font-hectic text-xs py-2 px-6 bg-primary text-white hover:bg-blue-deep rounded-sm shadow-sm`).
* **Mobile Nav:** Hamburger icon with toggle state revealing a dropdown drawer with links and full-width Refresh CTA.

### 4.2 Footer (`Footer.tsx`)
* **Top Wave Divider:** Hand-drawn SVG wavy scallop transition (`M0,48 L0,18 C240,38 480,0 720,20 C960,40 1200,2 1440,20 L1440,48 Z`) in `#15018d`.
* **Footer Body:** `bg-[#15018d] text-white pt-6 pb-8`
* **Columns:**
  1. Brand info ("PROPOSAL VIEWER" + starburst), mission statement, and `GOOD ARCHITECTURE • GOOD PROPOSALS • GOOD SYSTEMS` ticker.
  2. Operating Environment (Local loopback 127.0.0.1, Port 4317, zero telemetry).
  3. Explore Links (`Overview`, `Requirements`, `Architecture`, `Data & API`, `Delivery`).
  4. Playful Speech Bubble ("Ready to build!" + starburst) and Mascot illustration.
* **Bottom Bar:** Local isolated preview badge, build checksum, and status indicators.

### 4.3 Polaroid Gallery Component (`PolaroidCard.tsx`)
* **Frame:** `bg-warm-white p-3 pt-3 pb-8 shadow-md border-2 border-border/80 rounded-sm hover:scale-105`
* **Tape Element:** `absolute -top-3 left-1/2 -translate-x-1/2 w-16 h-5 bg-sand/80 border border-border/30 rotate-1 opacity-90`
* **Image Aspect:** 1:1 square ratio (`aspect-square`) with subtle border.
* **Caption:** `font-hectic text-lg sm:text-xl text-ink tracking-wider font-bold mt-3 text-center`
* **Interactive Lightbox:** Clicking any card opens a full-screen backdrop modal with close button.

### 4.4 Menu & Sections Page Architecture
* **Tabs:** Section blocks:
  1. `1: OVERVIEW` — Light Theme (`bg-transparent text-primary`)
  2. `2: ARCHITECTURE` — Light / Dark Theme (`bg-primary text-warm-white`)
  3. `3: DELIVERY` — Light Theme (`bg-transparent text-primary`)
* **Interactive Animation:** Floating system architecture nodes and interactive SVG diagrams.
* **Texture Overlay:** SVG `feTurbulence` fractal noise layer with `mix-blend-overlay` and `opacity-[0.38]`.

### 4.5 Controls & Inspection Stage
* **Title:** "proposal inspection" with starburst stamp
* **Direct Actions:**
  * `01 / LOCALHOST`: `127.0.0.1:4317` with [Copy Link] with feedback toast.
  * `02 / CLI`: `proposal view --plan <path>` with [Copy Command] with feedback toast.
* **Action Toolbar:**
  * Theme Toggle, Reload from Disk, and Document Source Switcher.
  * Status feedback toast on copy operations.

---

## 5. Asset Catalog

* **Ornaments:**
  * Vibrant 8-point orange starburst stamp
  * Hand-drawn scallop wave transition
  * Star character mascot
  * Polaroid tape stickers
* **System Design Icons:**
  * Database, Cache, API Gateway, App Server, Load Balancer, Queue, Storage, Auth, Worker.
