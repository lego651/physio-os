# UI Guide — PhysioOS

> Last updated: 2026-04-01
> Design philosophy: cal.com meets health — clean, trustworthy, minimal

---

## Design Principles

1. **Trust through simplicity** — Health tools must feel safe. No flashy animations, no dark patterns. Clean lines, clear typography, plenty of white space.
2. **Data is the hero** — Charts, numbers, and trends should be the most prominent elements. Not decorations.
3. **Mobile-first** — Weekly reports open in mobile browser from SMS links. Everything must work on small screens.
4. **Accessible** — WCAG AA minimum. Older patients with reading glasses need to use this. Large tap targets, high contrast, readable fonts.
5. **White-label ready** — Color scheme, logo, and clinic name are configurable. Base design must work with any brand color.

---

## Color System

### Base Palette (V-Health defaults)

```
--background:       #FFFFFF        White — primary background
--foreground:       #0A0A0A        Near-black — primary text
--muted:            #F5F5F5        Light gray — secondary backgrounds
--muted-foreground: #737373        Gray — secondary text
--border:           #E5E5E5        Light border
--ring:             #0A0A0A        Focus ring

--primary:          #0F766E        Teal — primary actions, links (health/trust association)
--primary-foreground: #FFFFFF      White on primary

--accent:           #F0FDFA        Light teal — hover states, highlights
--accent-foreground: #0F766E       Teal text on accent

--destructive:      #DC2626        Red — errors, high pain alerts
--warning:          #F59E0B        Amber — warnings, moderate alerts
--success:          #16A34A        Green — positive trends, completed exercises
```

### Metric Colors (consistent across all charts)

```
Pain (1-10):              #DC2626 (red spectrum — higher = darker red)
Discomfort (0-3):         #F59E0B (amber spectrum)
Sitting Tolerance:        #0F766E (teal — higher = better)
Exercise Completion:      #16A34A (green)
```

### White-Label Customization

Clinics can override:
- `--primary` and `--primary-foreground` (their brand color)
- Logo (displayed in header and reports)
- Clinic name (displayed everywhere)

Base neutral palette stays consistent for readability.

---

## Typography

```
Font family:        Inter (system fallback: -apple-system, sans-serif)
Heading weight:     600 (semibold)
Body weight:        400 (regular)
Monospace:          JetBrains Mono (for metric numbers in reports)

Scale:
  Display:          2rem / 32px     — page titles
  H1:               1.5rem / 24px  — section headers
  H2:               1.25rem / 20px — card headers
  Body:             1rem / 16px    — primary text
  Small:            0.875rem / 14px — secondary text, labels
  Caption:          0.75rem / 12px  — timestamps, footnotes
```

### Metric Numbers

Large, bold, monospace. The number is the message.

```
Pain score:         text-3xl font-mono font-bold text-red-600
Discomfort score:   text-3xl font-mono font-bold text-amber-500
Sitting tolerance:  text-3xl font-mono font-bold text-teal-700
```

---

## Component Patterns (shadcn/ui)

### Chat Interface (Patient Web)

```
┌─────────────────────────────────────┐
│  V-Health Recovery Coach       [?]  │  ← Header: clinic logo + name
├─────────────────────────────────────┤
│                                     │
│  ┌──────────────────────┐           │
│  │ How are you feeling  │           │  ← AI message (left-aligned)
│  │ today?               │           │
│  └──────────────────────┘           │
│                                     │
│           ┌──────────────────────┐  │
│           │ My back is a bit     │  │  ← Patient message (right-aligned)
│           │ stiff, discomfort    │  │
│           │ about 2              │  │
│           └──────────────────────┘  │
│                                     │
│  ┌──────────────────────┐           │
│  │ Got it. I've logged   │          │  ← AI response with metric card
│  │ discomfort 2 for now. │          │
│  │                       │          │
│  │ ┌──────────────────┐ │          │
│  │ │ Discomfort: 2     │ │          │  ← Inline metric badge
│  │ │ ▼ from 2.3 avg   │ │          │
│  │ └──────────────────┘ │          │
│  └──────────────────────┘           │
│                                     │
├─────────────────────────────────────┤
│  [Type a message...        ] [Send] │  ← Input: large tap target
└─────────────────────────────────────┘
```

- Use shadcn `Card` for message bubbles
- AI messages: `bg-muted` left-aligned
- Patient messages: `bg-primary text-primary-foreground` right-aligned
- Metric badges: inline `Badge` component with trend arrow
- Streaming: show AI response as it generates (Vercel AI SDK `useChat`)

### Clinic Dashboard

```
┌─────────────────────────────────────────────────┐
│  V-Health Dashboard                    [Admin ▼] │
├──────────┬──────────────────────────────────────┤
│          │                                       │
│ Patients │  Active Patients (24)                 │
│ Settings │                                       │
│ Alerts   │  ┌─────────────────────────────────┐  │
│          │  │ 🔴 Sarah M. — Pain 6 (unusual)  │  │  ← Alert card
│          │  └─────────────────────────────────┘  │
│          │                                       │
│          │  ┌─────────────────────────────────┐  │
│          │  │ Lisa C.        Last: 2h ago      │  │
│          │  │ Discomfort ▼1.4  Pain —          │  │  ← Patient row
│          │  │ Logged 5/7 days this week        │  │
│          │  └─────────────────────────────────┘  │
│          │                                       │
│          │  ┌─────────────────────────────────┐  │
│          │  │ Mark T.        Last: 8 days ago  │  │
│          │  │ ⚠️ Inactive — no logs in 8 days │  │  ← Inactive warning
│          │  └─────────────────────────────────┘  │
│          │                                       │
└──────────┴──────────────────────────────────────┘
```

- Left sidebar: shadcn navigation (collapsible on mobile)
- Patient cards: shadcn `Card` with key metrics as `Badge`
- Alert states: red border for anomalies, amber for inactive, green for on-track
- Click patient → detail view with full metric history and charts

### Weekly Progress Report (Mobile Web)

```
┌───────────────────────────┐
│  V-Health                 │
│  Weekly Recovery Report   │
│  Mar 25 – Mar 31          │
├───────────────────────────┤
│                           │
│  Hi Lisa,                 │
│                           │
│  ┌───────────────────┐    │
│  │ Pain        —     │    │  ← Metric cards (large numbers)
│  │ Discomfort  1.4 ▼ │    │
│  │ was 2.1 last week │    │
│  └───────────────────┘    │
│                           │
│  ┌───────────────────┐    │
│  │ Exercises   5/7   │    │
│  │ ████████░░  71%   │    │  ← Progress bar
│  └───────────────────┘    │
│                           │
│  ┌───────────────────┐    │
│  │ [Chart: 7-day     │    │
│  │  discomfort trend] │    │
│  └───────────────────┘    │
│                           │
│  Insight:                 │
│  "Your discomfort drops   │
│  on days you do evening   │
│  stretches. Keep it up!"  │
│                           │
│  [Open Chat →]            │  ← CTA back to web chat
│                           │
└───────────────────────────┘
```

- Designed for mobile viewport (SMS link opens this)
- No auth required — accessed via signed token URL
- Simple, scannable, data-first
- One CTA: open web chat for more details

---

## Component Library (shadcn)

### Required Components (V1)

| Component | Usage |
|-----------|-------|
| Button | Actions, send message, navigation |
| Card | Message bubbles, patient cards, metric cards |
| Badge | Metric values, status indicators |
| Input | Chat input, search |
| Avatar | Patient initials, AI coach icon |
| Separator | Section dividers |
| Toast | Notifications, confirmations |
| Dialog | Confirm actions, patient detail modal |
| Table | Metrics history, patient list (desktop) |
| Chart | Trend lines (use recharts or similar via shadcn charts) |
| Sidebar | Dashboard navigation |
| Skeleton | Loading states |

### Spacing

```
Page padding:       px-4 (mobile), px-8 (desktop)
Card padding:       p-4
Card gap:           gap-3
Section gap:        gap-6
Chat message gap:   gap-2
```

### Responsive Breakpoints

```
sm:   640px    — mobile landscape
md:   768px    — tablet
lg:   1024px   — desktop
xl:   1280px   — wide desktop
```

Dashboard: sidebar collapses to bottom nav on mobile.
Chat: full-width on all screens.
Reports: optimized for mobile-first (opened from SMS).

---

## Iconography

Use Lucide icons (bundled with shadcn). Consistent 20px size in UI, 16px in compact contexts.

Key icons:
- `MessageSquare` — chat
- `Activity` — metrics/health
- `TrendingDown` / `TrendingUp` — trend indicators
- `Bell` — alerts
- `User` — patient
- `Shield` — practitioner/clinic
- `Calendar` — scheduling (V2)
- `AlertTriangle` — warnings

---

## Animation & Motion

Minimal. Health tools should feel stable, not bouncy.

- Chat messages: `fade-in` 150ms
- Metric updates: `number-tick` counter animation (subtle)
- Page transitions: none (instant navigation)
- Loading: shadcn `Skeleton` components (no spinners)
- Charts: no entry animations; static render
