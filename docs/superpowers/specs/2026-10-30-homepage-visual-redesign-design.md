# Homepage Visual Redesign - 2026 Design Trends

**Date:** 2026-10-30  
**Status:** Design Phase - Awaiting Implementation Plan Approval  
**Approach:** Progressive Enhancement (Approach A)

---

## 1. Context & Goals

### Problem
The current homepage (`apps/web/src/pages/Home.tsx`) uses a functional but dated visual language:
- Standard card grids with basic hover effects
- No scroll-driven animations
- Basic skeleton loading
- Hero section with static background image
- Product cards lack depth and micro-interactions

### Goal
Apply 2026 design trends (per `investigacion-tendencias-diseno-web-2026.md`) via **progressive enhancement** — layering modern CSS-native animations and visual polish onto the existing component structure without restructuring the page.

### Success Criteria
- ✅ Light theme remains default (dark mode variables ready)
- ✅ Micro-interactions on all interactive elements (hover, focus, scroll)
- ✅ Bento grid for "Populares" + "Novedades" sections
- ✅ Scroll-driven section reveals (staggered)
- ✅ Glassmorphism on hero cards, product cards, modals
- ✅ Skeleton loading with shimmer everywhere
- ✅ Zero-JS animations (CSS-native scroll-driven, transitions)
- ✅ `prefers-reduced-motion` respected throughout
- ✅ Performance: CLS < 0.1, INP < 200ms, 60fps animations

---

## 2. Design Specification

### 2.1 Design Tokens (CSS Custom Properties)

Add to `index.css` `:root`:

```css
:root {
  /* Glassmorphism */
  --glass-bg: rgba(255, 255, 255, 0.7);
  --glass-bg-strong: rgba(255, 255, 255, 0.85);
  --glass-border: rgba(255, 255, 255, 0.3);
  --glass-shadow: 0 8px 32px rgba(15, 23, 42, 0.08),
                  inset 0 1px 0 rgba(255, 255, 255, 0.4);
  --glass-blur: blur(20px) saturate(180%);
  
  /* Dark mode glass (ready but unused by default) */
  --glass-bg-dark: rgba(10, 10, 15, 0.6);
  --glass-border-dark: rgba(255, 255, 255, 0.08);
  --glass-shadow-dark: 0 8px 32px rgba(0, 0, 0, 0.4),
                       inset 0 1px 0 rgba(255, 255, 255, 0.05);
  
  /* Mesh Gradient (hero background) */
  --mesh-gradient: 
    radial-gradient(ellipse 80% 50% at 20% 10%, #f97316 0%, transparent 50%),
    radial-gradient(ellipse 60% 40% at 80% 20%, #fb923c 0%, transparent 50%),
    radial-gradient(ellipse 70% 60% at 40% 80%, #fdba74 0%, transparent 50%),
    #fff7ed;
  
  /* Animation tokens */
  --ease-out: cubic-bezier(0.2, 0, 0, 1);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --duration-fast: 150ms;
  --duration-base: 300ms;
  --duration-slow: 500ms;
  
  /* Elevation */
  --elevation-1: 0 1px 2px rgba(15,23,42,.06), 0 8px 24px -12px rgba(15,23,42,.18);
  --elevation-2: 0 4px 12px rgba(15,23,42,.08), 0 16px 40px -16px rgba(249,115,22,.25);
  --elevation-3: 0 20px 40px rgba(15,23,42,.15);
  
  /* Skeleton */
  --skeleton-base: #e2e8f0;
  --skeleton-highlight: #f1f5f9;
}
```

### 2.2 Hero Section Redesign

**File:** `apps/web/src/pages/Home.tsx` (lines 82-199)

**Changes:**
1. Replace static banner with mesh gradient background + subtle animation
2. Add glassmorphism overlay on content area
3. Search input gets glassmorphism + backdrop-blur
4. Scroll-driven parallax on background (CSS-native)
5. Staggered fade-up for hero content

```css
/* Hero mesh gradient animation */
.hero-mesh {
  background: var(--mesh-gradient);
  background-size: 200% 200%;
  animation: mesh-drift 60s ease-in-out infinite;
}

@keyframes mesh-drift {
  0%, 100% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
}

/* Scroll-driven parallax */
.hero-bg-parallax {
  animation: parallax linear;
  animation-timeline: view();
  animation-range: entry 0% exit 100%;
}

@keyframes parallax {
  to { transform: translateY(-30%); }
}

/* Glassmorphism search */
.search-glass {
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border);
  box-shadow: var(--glass-shadow);
}
```

### 2.3 Scroll-Driven Section Reveals

**File:** `apps/web/src/index.css` (new animations)

**Pattern:** Each section gets staggered reveal via CSS Scroll-Driven Animations API.

```css
/* Base reveal class */
.reveal-on-scroll {
  opacity: 0;
  transform: translateY(40px);
  animation: reveal linear both;
  animation-timeline: view();
  animation-range: entry 10% cover 50%;
}

@keyframes reveal {
  to { opacity: 1; transform: translateY(0); }
}

/* Stagger for grid children */
.reveal-stagger:nth-child(1)  { animation-range-start: entry 5%;  }
.reveal-stagger:nth-child(2)  { animation-range-start: entry 12%; }
.reveal-stagger:nth-child(3)  { animation-range-start: entry 19%; }
.reveal-stagger:nth-child(4)  { animation-range-start: entry 26%; }
.reveal-stagger:nth-child(5)  { animation-range-start: entry 33%; }
.reveal-stagger:nth-child(6)  { animation-range-start: entry 40%; }
.reveal-stagger:nth-child(7)  { animation-range-start: entry 47%; }
.reveal-stagger:nth-child(8)  { animation-range-start: entry 54%; }

/* Section container gets the timeline */
.section-scroll-timeline {
  animation-timeline: view();
}
```

**Applied to sections in Home.tsx:**
- Categorías (stagger children)
- Comercios destacados (stagger StoreCards)
- Promociones (stagger promo cards)
- Populares (bento grid stagger)
- Novedades (bento grid stagger)
- No afiliados (stagger ProductCards)

### 2.4 Product Card Redesign (Glassmorphism + Micro-interactions)

**File:** `apps/web/src/components/Cards.tsx` (ProductCard, lines 50-87)

**New ProductCard Variant: `ProductCardGlass`**

```tsx
// Enhanced hover: scale + glow + border shift + shadow elevation
.card-glass {
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border);
  box-shadow: var(--glass-shadow);
  transition: 
    transform var(--duration-base) var(--ease-out),
    box-shadow var(--duration-base) var(--ease-out),
    border-color var(--duration-fast) var(--ease-out);
  will-change: transform, box-shadow, border-color;
}

.card-glass:hover,
.card-glass:focus-visible {
  transform: translateY(-6px) scale(1.015);
  box-shadow: var(--elevation-3);
  border-color: var(--brand-500);
  z-index: 10;
}

/* Image zoom on hover */
.card-glass img {
  transition: transform 0.5s var(--ease-out);
}
.card-glass:hover img {
  transform: scale(1.05);
}

/* Price highlight on hover */
.card-glass:hover .price {
  color: var(--brand-600);
  transform: scale(1.02);
}

/* Skeleton variant */
.card-glass.skeleton {
  pointer-events: none;
}
```

### 2.5 Bento Grid for Popular + Newest

**Files:** 
- `apps/web/src/pages/Home.tsx` (sections "Populares" and "Novedades")
- `apps/web/src/index.css` (bento grid styles)

**Grid Structure:**
```css
.bento-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  grid-template-rows: repeat(3, 1fr);
  gap: 16px;
  grid-auto-flow: dense;
}

/* Cell sizes */
.bento-hero    { grid-column: span 2; grid-row: span 2; }  /* 2x2 - featured */
.bento-wide    { grid-column: span 2; grid-row: span 1; }  /* 2x1 */
.bento-tall    { grid-column: span 1; grid-row: span 2; }  /* 1x2 */
.bento-standard { grid-column: span 1; grid-row: span 1; } /* 1x1 */

/* Responsive collapse */
@media (max-width: 1024px) {
  .bento-grid { grid-template-columns: repeat(2, 1fr); }
  .bento-hero,
  .bento-wide,
  .bento-tall { grid-column: span 1; grid-row: span 1; }
}

@media (max-width: 640px) {
  .bento-grid { grid-template-columns: 1fr; }
}
```

**Product Assignment Logic:**
- First product → `bento-hero` (2x2, larger image, more details)
- Products 2-3 → `bento-wide` (2x1)
- Products 4-5 → `bento-tall` (1x2)
- Rest → `bento-standard` (1x1)

**Scroll-driven stagger reveal** applied to each bento cell.

### 2.6 Category Cards Micro-interactions

**File:** `apps/web/src/pages/Home.tsx` (lines 214-254)

**Enhancements:**
- Magnetic hover (subtle follow cursor)
- Glassmorphism background
- Icon scale + rotate on hover
- Ripple effect on click

```css
.category-card {
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border);
  transition: 
    transform var(--duration-fast) var(--ease-out),
    box-shadow var(--duration-fast) var(--ease-out),
    border-color var(--duration-fast) var(--ease-out);
}

.category-card:hover {
  transform: translateY(-4px) scale(1.02);
  box-shadow: var(--elevation-2);
  border-color: var(--brand-400);
}

.category-card:active {
  transform: translateY(-2px) scale(0.99);
}

.category-card .icon {
  transition: transform var(--duration-base) var(--ease-spring);
}

.category-card:hover .icon {
  transform: scale(1.15) rotate(5deg);
}
```

### 2.7 Store Card Enhancements

**File:** `apps/web/src/components/Cards.tsx` (StoreCard, lines 6-48)

Similar glassmorphism treatment as ProductCard, with:
- Cover image zoom on hover
- Sponsored tag pulse animation
- Availability badge with pulse when open

### 2.8 Button Micro-interactions

**File:** `apps/web/src/index.css` (btn classes)

**Ripple Gradient Button:**
```css
.btn-ripple {
  position: relative;
  overflow: hidden;
}

.btn-ripple::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at var(--x, 50%) var(--y, 50%), 
    rgba(255,255,255,0.4), transparent 70%);
  transform: scale(0);
  transition: transform 0.4s ease-out;
  pointer-events: none;
}

.btn-ripple:active::before {
  transform: scale(4);
  transition: transform 0s;
}

/* Smiling CTA - border-radius morph */
.btn-smile {
  border-radius: 12px;
  transition: border-radius var(--duration-fast) var(--ease-spring);
}

.btn-smile:hover,
.btn-smile:focus-visible {
  border-radius: 24px;
}
```

### 2.9 Skeleton Loading States

**File:** `apps/web/src/index.css` (enhance existing `.skeleton`)

Enhance existing skeleton with:
- Card-shaped skeletons matching glassmorphism cards
- Shimmer animation (already exists, refine)
- Section-specific skeletons (hero, bento, regular grid)

```css
.skeleton-card {
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border);
  border-radius: 16px;
}

.skeleton-bento-hero { grid-column: span 2; grid-row: span 2; aspect-ratio: 1; }
.skeleton-bento-wide { grid-column: span 2; grid-row: span 1; aspect-ratio: 2/1; }
.skeleton-bento-tall { grid-column: span 1; grid-row: span 2; aspect-ratio: 1/2; }
.skeleton-bento-standard { aspect-ratio: 1; }
```

### 2.10 Promotions & Featured Stores

**Files:** `apps/web/src/pages/Home.tsx` (promotions section, lines 284-309)

- Glassmorphism cards
- Staggered scroll reveal
- Hover: subtle lift + brand border glow

---

## 3. Component Changes Summary

| Component | File | Changes |
|-----------|------|---------|
| Hero Section | `Home.tsx:82-199` | Mesh gradient BG, glassmorphism search, scroll parallax |
| Section Reveals | `index.css` | CSS scroll-driven animations + stagger |
| ProductCard | `Cards.tsx:50-87` | Glassmorphism variant, enhanced hover, skeleton |
| Bento Grid | `Home.tsx:311-329` + `index.css` | CSS Grid bento layout + scroll stagger |
| Category Cards | `Home.tsx:214-254` | Glassmorphism, magnetic hover, icon animation |
| StoreCard | `Cards.tsx:6-48` | Glassmorphism, cover zoom, badge pulse |
| Buttons | `index.css` | Ripple gradient, smiling CTA morph |
| Skeletons | `index.css` | Card-shaped, bento-shaped, shimmer |

---

## 4. Accessibility & Performance

### Accessibility
- All animations respect `prefers-reduced-motion` (already in `index.css:187-194`)
- Focus-visible styles enhanced for glassmorphism cards
- Semantic HTML preserved
- WCAG AA contrast maintained (glassmorphism on light bg = sufficient contrast)

### Performance
- CSS-native animations only (no Framer Motion/GSAP)
- `will-change` only on active hover elements
- `contain: layout paint` on animated containers
- `content-visibility: auto` on off-screen sections
- Mesh gradient animation uses `transform` + `opacity` (compositor thread)

---

## 5. Rollback Strategy

Since this is progressive enhancement:
1. All new classes are additive (`.card-glass`, `.bento-grid`, `.reveal-on-scroll`)
2. Original components unchanged until explicitly swapped
3. Feature flags via CSS: disable new effects by removing class
4. Git commit per section for granular revert

---

## 6. Out of Scope

- Dark mode toggle UI (variables ready, toggle UI separate task)
- WebGL hover effects (Approach B/C territory)
- Variable font animations (hero only, optional Phase 2)
- Page transitions (View Transitions API, separate task)
- Neumorphism (not suitable for e-commerce per research)

---

*Design document created for review. Implementation plan to follow upon approval.*