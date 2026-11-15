# Tenant Shield Design System

Phase 1 review draft. Applies to the hackathon MVP for California student renters.
Implementation is pending approval. No UI code is part of this phase.

## Authority and skill provenance

The existing app/globals.css is the brand baseline: navy #101F2A / #1B343D,
ink #172B33, green #176F5A, mint #E7F2EC, background #F7F9F8,
DM Sans body and Manrope headings. This specification supersedes the removed
preparation brief and its unrelated investment-firm direction.

UI/UX Pro Max v2.15.0 was run locally using bundled Python. Searches used:

- Requested generator: "legal-tech / consumer fintech, trustworthy, calm, mobile-first, student renters".
  Its Minimalism & Swiss Style and trust pattern fit; its crypto gold/purple palette
  did not fit the brand constraint, so those colors were rejected.
- Narrowed generator: "legal services trustworthy calm". Verified match:
  Accessible & Ethical, Trust & Authority + Conversion, Legal Services colors.
  Complete generated response is retained at the end of this file.
- Style: "trustworthy minimal accessible" -> minimalism-and-swiss-style (active).
- Color: "consumer fintech trust green" -> Fintech/Crypto, rejected;
  retry "legal services" -> Legal Services, verified.
- Typography: "DM Sans Manrope" -> Premium Sans (DM Sans), verified for clean
  readable body typography. "Manrope" -> Fashion Forward (Syne + Manrope);
  the fashion direction is unsuitable and is not applied. Existing Manrope
  headings remain a user-directed brand choice; no exact pair match is claimed.
- UX: "error summary validation", "focus not obscured", "dragging movements".
- Stacks: nextjs "routing loading error"; shadcn "dialog sheet focus".
- Reviewed quick-reference.md all ten categories and pro-rules.md.
  Native units are translated to the user's stronger 44 CSS px web requirement.

The skill guides hierarchy, semantic color roles, spacing, evidence disclosure,
focus, and recovery. Existing brand tokens and explicit product constraints take
precedence over generic generated sales CTAs, serif fonts, credentials, and carousels.
No generic fallback system was used. Search outputs are recommendations, not law.
Rules and deadlines shown in examples remain unverified until connected to a
reviewed rules pack.

## Product and voice

One journey: create case -> upload letter/lease/photos -> confirm extraction ->
audit each charge -> inspect evidence -> review estimated owed range -> edit
demand letter -> prepare a response. Move-out, California, tenant side only.

Use plain, calm language: "Here is why this charge may be disputed", "Add a receipt
to clarify this charge", "You may be owed". Fair charges remain visible. Avoid
"illegal", "guaranteed refund", adversarial landlord language, invented social
proof, unverified security badges, and claims that AI alone establishes a fact.
Persistent supporting copy: "Information to help you understand your deposit.
Not legal advice." Do not let it compete with the case action.

## Semantic color tokens

All values below are normative for Phase 2. No app styles are changed in Phase 1.

| Token | Value | Use |
| --- | --- | --- |
| background | #F7F9F8 | Page canvas, existing |
| card / on-primary | #FFFFFF | Surfaces / green button text |
| foreground | #172B33 | Body, existing ink |
| navy / navy-secondary | #101F2A / #1B343D | Owed card / desktop identity |
| primary | #176F5A | Main actions, active navigation, existing green |
| primary-hover | #125A49 | Hover and pressed fill; retain white text |
| primary-soft | #E7F2EC | Active background, existing mint |
| muted-foreground | #52656D | Secondary text; replaces pale #75838A text |
| border-subtle | #E7EBEA | Decorative separators only, existing line |
| border-control | #75838A | Required input and drop-zone outlines |
| ring-light | #176F5A | 3px focus ring with 2px white offset |
| ring-dark | #FFFFFF | Focus against navy/green surfaces |
| on-navy / on-navy-muted | #FFFFFF / #C9DFD6 | Owed card title / support |
| fair / fair-bg | #176F5A / #E7F2EC | Fair |
| disputable / disputable-bg | #8A4B0F / #FFF4DF | Disputable |
| not-allowed / not-allowed-bg | #B42332 / #FFF0F1 | Likely not allowed, the ONLY red role |
| info / info-bg | #245B84 / #EDF4FC | Need more info, neutral help |
| scrim | rgba(16,31,42,0.56) | Overlay background |

Validation errors use navy text, an AlertCircle icon, a visible "Fix this" label,
and a 2px navy border. Deletion uses a neutral confirmation dialog. Neither uses
red; this deliberately overrides the skill's generic destructive-red convention.
Reserve amber for disputable verdicts and non-alarmist deadline clarification.

Measured WCAG relative luminance ratios: ink/canvas 13.89:1; muted/white 6.10:1;
muted/canvas 5.77:1; white/primary 6.07:1; fair pair 5.30:1; disputable pair 6.22:1;
not-allowed pair 5.88:1; info pair 6.52:1; owed muted/navy 11.99:1.
Control border/white 3.91:1 and border/canvas 3.70:1. Pale decorative dividers
must not become the only boundary of an interactive control. Remeasure composed
hover, disabled, overlay, and image states during implementation.

## Verdicts and evidence

One outline SVG family: Lucide-style, 20px default, 2px stroke, 16px supporting,
24px navigation. No emoji. Beside visible text, decorative icons are aria-hidden.

| Verdict | Icon | Meaning and action |
| --- | --- | --- |
| Fair | CircleCheck | Current evidence supports charge; explain supporting rule |
| Disputable | Scale | Evidence supports a question; show basis and review action |
| Likely not allowed | ShieldAlert | Rule/evidence raises a strong concern; no guarantee |
| Need more info | CircleHelp | Identify missing evidence; show Add evidence |

Each claim block includes a stable charge ID, exact amount, verdict text + icon,
plain-language rationale, and at least one source chip/thumbnail adjacent to that
rationale. Rule chips show an internal rule ID and readable title. Open them for
statute reference, quoted scope, effective/verified dates, and source link.
Photo thumbnails show photo ID, room, and move-in/move-out label. Upload dates
are distinguished from evidence dates.

A claimed conclusion unsupported by a rule ID or photo ID cannot be displayed as
a conclusion: show Need more info and state what is missing. A photo does not
by itself substantiate a legal claim. Never invent a citation to satisfy the UI.
Display AI rationale separately from user-confirmed extracted facts.
"Fair" items do not contribute to disputed recovery estimates.

## Type, spacing, shape, depth

DM Sans: body, forms, navigation, source chips, 400/500/600/700.
Manrope: headings and monetary totals, 600/700/800. Keep local/system fallbacks
and font-display swap; avoid loading new families. Use tabular figures for money,
charge amounts, and days. Use a real en dash for currency ranges in product copy.

| Role | Mobile size / line-height | Desktop size / line-height |
| --- | --- | --- |
| Owed amount | clamp(32px, 9vw, 40px) / 1.15 | 48px / 1.15 |
| Landing display | 32px / 40px | 48px / 56px |
| Page title | 28px / 36px | 36px / 44px |
| Section heading | 22px / 30px | 24px / 32px |
| Card title | 18px / 26px | 18px / 26px |
| Body / input | 16px / 24px | 16px / 24px |
| Secondary / chip | 14px / 20px | 14px / 20px |
| Eyebrow | 12px / 18px, weight 700 | same |

Normal body tracking; headings -0.02em maximum, balanced wrapping progressive
enhancement only. No forced nonbreaking phrases. Long IDs/file names wrap with
overflow-wrap:anywhere; money range may wrap at its separator on narrow screens.

Spacing scale: 4, 8, 12, 16, 24, 32, 48, 64px. Related controls 8px gap minimum.
Page gutters 16px below 768px, 24px at 768px, 32px at 1024px, 40px at 1440px.
Page max 1200px excluding sidebar; narrative measure 68ch; wizard form max 720px.
Radius: controls/chips 8px, cards/drop zones 12px, owed card/sheet top 16px.
Shadows: none for normal content, card 0 6px 24px rgba(17,44,50,.035) (existing),
overlay 0 16px 48px rgba(16,31,42,.18). Borders and spacing carry hierarchy.

Motion: press feedback <=100ms; hover/focus 150ms; sheet enter 220ms ease-out,
exit 150ms ease-in; content crossfade 160ms. Only transform/opacity animate.
Reduced motion removes sliding, shimmer, number counting, and nonessential fades.
Never delay results for an animation or run a celebratory money counter.
No parallax, autoplay carousel, confetti, or decorative continuous motion.

## Navigation and responsive anatomy

Below 1024px use mobile navigation; at >=1024px use a 240px left sidebar.
Use identical destination order and visible labels in both, never render both
as operable navigation at one breakpoint.

Global destinations: Home (/) and New case (/case/new). A saved or fixture case
adds a Current case destination (/case/[id]); before one exists show a short
"Start a case first" explanation, not an inert icon. No new dashboard route.

Inside a case, the four destinations Audit, Photos, Letter, Replies replace the
global bottom destinations for that context. The case header has Home and case
name, so global escape remains available. Desktop sidebar groups Home/New case
above the same four case destinations. These are URL-addressable navigation links
with ?tab=audit|photos|letter|replies and aria-current, not a second nested tab bar.
Default /case/[id] is Audit. Browser back restores tab and scroll.

Mobile bottom nav is at least 64px plus env(safe-area-inset-bottom); each item
has >=44x44px hit area and icon + text. Primary action is a 72px minimum pinned
tray ABOVE the nav. Reserve their measured combined height + 16px in main content
and set scroll-padding so the entire focused field remains visible. With the
software keyboard, CTA participates in the visual viewport or normal flow;
it must never hide the editor or prevent scrolling. Desktop actions are inline.
Small landscape or short viewports may put the action tray in flow.

Details use a modal bottom sheet below 1024px, max-height 85dvh, and a 360px
right side panel above that breakpoint. Use one shadcn Sheet instance with
responsive positioning, a title, explicit Close, Escape, focus containment,
inert background, and focus return to trigger. Do not rely on swipe dismissal.
Only the sheet scrolls while it is open; the page scroll is locked. A sheet with
unsaved edits confirms discard or offers Keep editing.

Layer tokens: base 0, sticky header 10, navigation 20, action tray 30,
scrim 40, sheet/dialog 50. Closed overlays leave no focusable hidden content.

## Component specifications

| Component | Anatomy and behavior | States and accessibility |
| --- | --- | --- |
| Button | 48px minimum height, 16px/700, 16px horizontal padding, icon gap 8; primary green, secondary white/navy outline, tertiary text | Hover/press without layout shift; visible focus; disabled semantics with explanatory copy; async label and spinner; one primary CTA per screen |
| Card | White, 1px subtle border, 12px radius, padding 16/24 mobile/desktop, title then supporting content | A card containing links is not itself a nested button; independent controls retain names |
| Owed result card | Navy surface, 24/32 padding, 16 radius; "You may be owed", largest range, scope note, included-charge count, "How this is estimated" | Full range in accessible text; no guaranteed recovery; no fake zero during loading; unavailable estimate replaces amount; evidence breakdown in sheet/panel |
| Verdict chip | 20px icon + full 14px semibold label; tinted surface, 8px radius, 8/12 padding | Noninteractive status by default; labels wrap. Separate View details button >=44px; color never alone |
| Rule chip | BookOpen icon, ID + short title, outline or neutral fill | Button >=44px high, opens source details; no hover-only citation; wrap chip collection before labels |
| Upload drop zone | 1px control border dashed, mint hint, FileUp icon, explicit Choose files, accepted formats/limit, file list | Keyboard/native picker alternative to drag; selected/uploading/extracting/success/failed; Remove file named per item; failed file retry preserves other files |
| Form field | Persistent label, hint, 48px input height, font >=16px, visible control border | Required vs optional explicit; blur validation; submitted error summary links to inline errors; preserve values and reuse extracted data |
| Wizard stepper | Ordered list: 1 Letter, 2 Details, 3 Photos, 4 Review; current label and "Step n of 4" | Check + text for completed; aria-current=step; completed steps editable; future steps noninteractive; no swipe-only progression |
| Bottom nav | <=4 case destinations, icon + 14px label, active underline/background and weight | nav landmark, aria-current=page, >=44px targets; source order follows visual order |
| Countdown badge | Clock icon + explicit deadline type/date, timezone and neutral days-remaining label | Never urgent red. Unknown date -> "Confirm date"; elapsed -> "Date passed"; no ticking per-second announcements |
| Sheet / side panel | Title, source context, content, Close; source links and edit action as appropriate | Named dialog, focus trap/return, Escape, visible close; unsaved change protection; retained trigger on dismissal |
| Skeleton/status | Reserved card structure plus "Analyzing your evidence" with named phases | aria-busy, one polite live region; indeterminate if no real progress; no fabricated percent or timer |
| Error block | AlertCircle, cause, retained work description, actionable retry/edit | Navy + label, role=alert once; focus summary after failed submit; no raw API errors or sensitive data |

## Money, deadlines, and trust

Owed card dominates the Audit view: first substantive content after the case
header, full width on mobile and across the content column on desktop.
Example fixture range $650–$900 is explicitly illustrative, not a legal finding.
Its breakdown shows included charges, uncertainty, exclusions, and source IDs;
if evidence changes, mark result "Needs review" until recalculation.
No-evidence -> no range. No disputable charges -> "No disputable amount identified"
with evidence summary, not a success promise or a forced purchase.

Keep distinct: (1) landlord deposit-accounting deadline derived from confirmed
move-out facts and a verified CA rule; (2) user-selected reply-by date in a draft
letter. Label both separately. No generic "21 days after sending" assumption.
Date-only deadline handling uses the case's California timezone (America/Los_Angeles);
unknown facts show Confirm date. Expired date is informational, not proof of liability.
The UI does not codify or assert unverified law in this design phase.

Before running audit explain which files will be analyzed; do not promise
encryption, deletion, storage duration, or attorney review without implementation
evidence. File previews may contain personal data: no default public/share URLs.
Replies and letters are drafts; no Send action in this MVP. User edits precede
copy/export. Editing evidence invalidates dependent analysis visibly.

## Skill anti-patterns applied to this product

Generator flags: playful design, unclear fees, outdated design, hidden credentials,
and AI purple/pink gradients. Application: sober navigation and evidence; disclose
actual pricing before any payment; no unsupported badges/certifications; no gamified
recovery promise. No payment flow is introduced in Phase 1.

Quick-reference flags addressed: tiny labels and controls, placeholder-only labels,
color-only verdicts, generic error toasts, hover-only evidence, stale result
certainty, hidden fixed-footer content, fake loading percentages, motion without
reduced-motion, and nested competing navigation. Preserve original uploads.
Light theme only for MVP; do not expose an untested dark-mode toggle.

## Build handoff after approval

Detected: Next.js 16.4.6 App Router, React 19.3, TypeScript, Tailwind 4.3.3.
shadcn/ui is requested but not installed. Phase 2 should select the minimum
accessible primitives needed and use Tailwind 4 CSS-first token mapping
(@theme inline); do not introduce a legacy config solely for older examples.
If a configuration file is needed, document its Tailwind 4 loading path.

Order: tokens -> shared components -> wizard -> Audit -> owed card refinement ->
Letter -> Photos -> Replies -> Landing. Meaningful build after each screen and
one commit per screen. Use lib/fixtures/demo-case.ts with six charges across all
four verdicts; label demo data and // TODO(api) swap points. Map real API formats
and shared types before integration; never alter backend contracts silently.

## Generated output from verified narrower query

The following is the skill's unedited generator response for
"legal services trustworthy calm". The approved adaptations above retain the
existing brand. Sales CTAs, alternate fonts, and palette below are source
recommendations only and are not implementation tokens.

## Design System: Tenant Shield

### Pattern
- **Name:** Trust & Authority + Conversion
- **Conversion Focus:** Security badges. Case studies. Transparent pricing. Low-friction form. Provide pause/stop and stop the logo carousel on focus, hover, and reduced motion. Previous/next controls provide the keyboard equivalent; pause offscreen/hidden and render a static logo set under reduced motion.
- **CTA Placement:** Contact Sales / Get Quote (primary) + Nav
- **Color Strategy:** Navy/Grey corporate. Trust blue. Accent for CTA only.
- **Sections:** Hero (mission/credibility) > Proof (logos, certs, stats) > Solution overview > Clear CTA path

### Style
- **Name:** Accessible & Ethical
- **Mode Support:** Light supported | Dark supported
- **Keywords:** Accessible, inclusive interface, high contrast, large text (16px+), keyboard navigation, screen reader friendly, accessibility standards aware, focus state, semantic
- **Best For:** Government, healthcare, education, inclusive products, large audience, legal compliance, public
- **Performance:** cost:low|drivers:none | **Accessibility:** risk:low|requires:contrast-text-4.5,keyboard,visible-focus,reduced-motion

### Colors
| Role | Hex | CSS Variable |
|------|-----|--------------|
| Primary | `#1E3A8A` | `--color-primary` |
| On Primary | `#FFFFFF` | `--color-on-primary` |
| Secondary | `#1E40AF` | `--color-secondary` |
| On Secondary | `#FFFFFF` | `--color-on-secondary` |
| Accent/CTA | `#B45309` | `--color-accent` |
| On Accent/CTA | `#FFFFFF` | `--color-on-accent` |
| Background | `#F8FAFC` | `--color-background` |
| Foreground | `#0F172A` | `--color-foreground` |
| Card | `#FFFFFF` | `--color-card` |
| Card Foreground | `#0F172A` | `--color-card-foreground` |
| Muted | `#E9EEF5` | `--color-muted` |
| Muted Foreground | `#475569` | `--color-muted-foreground` |
| Border | `#CBD5E1` | `--color-border` |
| Destructive | `#DC2626` | `--color-destructive` |
| On Destructive | `#FFFFFF` | `--color-on-destructive` |
| Ring | `#1E3A8A` | `--color-ring` |

*Notes: Authority navy + trust gold*

### Typography
- **Heading:** EB Garamond
- **Body:** Lato
- **Mood:** legal, professional, traditional, trustworthy, formal, authoritative
- **Best For:** Law firms, legal services, contracts, formal documents, government
- **Google Fonts:** https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;500;600;700&family=Lato:wght@300;400;700&display=swap
- **CSS Import:**
```css
@import url('https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;500;600;700&family=Lato:wght@300;400;700&display=swap');
```

### Key Effects
Clear focus rings (3-4px), ARIA labels, skip links, responsive design, reduced motion, 44x44px touch targets

### Avoid (Anti-patterns)
- Outdated design
- Hidden credentials
- AI purple/pink gradients

### Pre-Delivery Checklist
- [ ] No emojis as icons (use SVG: Heroicons/Lucide)
- [ ] cursor-pointer on all clickable elements
- [ ] Hover states with smooth transitions (150-300ms)
- [ ] Light mode: text contrast 4.5:1 minimum
- [ ] Focus states visible for keyboard nav
- [ ] prefers-reduced-motion respected
- [ ] Responsive: 375px, 768px, 1024px, 1440px
