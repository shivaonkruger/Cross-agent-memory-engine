---
version: alpha
name: "360Labs Monochrome Editorial"
description: "360Labs is an AI-native product studio and engineering consultancy with a stark, high-contrast monochrome identity. The design system is built on a single custom grotesque typeface (neueAlteGrotesk) used at extreme scale. the hero wordmark renders at 331px. paired with Chivo Mono for code/label contexts. The palette is deliberately minimal: near-black (#1a1a1a) on white (#ffffff) with a light grey (#e5e5e5) for borders and structural dividers. No shadows, no gradients, no decorative color. Spacing follows a base-8 rhythm scaling through 32, 48, 64, 96px. The overall effect is confident, typographically-led, and deliberately anti-decorative."
colors:
  border-grey: "#e5e5e5"
  secondary-surface: "#ffffff"
  surface-white: "#ffffff"
  foreground-black: "#1a1a1a"
  muted-text: "#6b6b6b"
  primary-action: "#1a1a1a"
typography:
  hero-display:
    fontFamily: "neueAlteGrotesk"
    fontSize: "331px"
    fontWeight: "500"
    lineHeight: "297.9px"
    letterSpacing: "-6.62px"
  display-xl:
    fontFamily: "neueAlteGrotesk"
    fontSize: "72px"
    fontWeight: "400"
    lineHeight: "75.6px"
  display-lg:
    fontFamily: "neueAlteGrotesk"
    fontSize: "48px"
    fontWeight: "300"
    lineHeight: "60px"
  heading-md:
    fontFamily: "neueAlteGrotesk"
    fontSize: "36px"
    fontWeight: "400"
    lineHeight: "40px"
  heading-sm:
    fontFamily: "neueAlteGrotesk"
    fontSize: "30px"
    fontWeight: "300"
    lineHeight: "30px"
  subheading:
    fontFamily: "neueAlteGrotesk"
    fontSize: "24px"
    fontWeight: "400"
    lineHeight: "32px"
  body-base:
    fontFamily: "neueAlteGrotesk"
    fontSize: "16px"
    fontWeight: "400"
    lineHeight: "24px"
  body-lg:
    fontFamily: "neueAlteGrotesk"
    fontSize: "18px"
    fontWeight: "400"
    lineHeight: "29.25px"
  label-uppercase-lg:
    fontFamily: "neueAlteGrotesk"
    fontSize: "14px"
    fontWeight: "400"
    lineHeight: "20px"
    letterSpacing: "1.4px"
  label-uppercase-sm:
    fontFamily: "neueAlteGrotesk"
    fontSize: "12px"
    fontWeight: "400"
    lineHeight: "16px"
    letterSpacing: "1.2px"
  caption-xs:
    fontFamily: "neueAlteGrotesk"
    fontSize: "11px"
    fontWeight: "400"
    lineHeight: "17.6px"
    letterSpacing: "0.55px"
  code-base:
    fontFamily: "Chivo Mono"
    fontSize: "16px"
    fontWeight: "400"
    lineHeight: "24px"
rounded:
  radius-sm: "8px"
  radius-md: "16px"
  radius-base: "0.5rem"
spacing:
  spacing-2: "2px"
  spacing-4: "4px"
  spacing-6: "6px"
  spacing-8: "8px"
  spacing-10: "10px"
  spacing-12: "12px"
  spacing-16: "16px"
  spacing-20: "20px"
  spacing-24: "24px"
  spacing-32: "32px"
  spacing-40: "40px"
  spacing-48: "48px"
  spacing-64: "64px"
  spacing-80: "80px"
  spacing-96: "96px"
  spacing-128: "128px"
---

## Overview

360Labs is an AI-native product studio and engineering consultancy with a stark, high-contrast monochrome identity. The design system is built on a single custom grotesque typeface (neueAlteGrotesk) used at extreme scale. the hero wordmark renders at 331px. paired with Chivo Mono for code/label contexts. The palette is deliberately minimal: near-black (#1a1a1a) on white (#ffffff) with a light grey (#e5e5e5) for borders and structural dividers. No shadows, no gradients, no decorative color. Spacing follows a base-8 rhythm scaling through 32, 48, 64, 96px. The overall effect is confident, typographically-led, and deliberately anti-decorative.

**Signature traits:**
- Dual typeface system: Pairs neueAlteGrotesk and Chivo Mono across the type hierarchy.
- Monochrome palette: Relies entirely on neutral tones with no chromatic accent.

## Colors

The palette uses 6 validated color tokens across 1 theme profile. Semantic roles stay attached to observed usage so generation agents can choose accents without inventing new color meaning.

**Semantic naming:**
- **action-text** maps to `foreground-black`: Role "text" is grounded by usage context "Primary text, headings, nav links, button labels, and icon fills across all zones".
- **surface-background** maps to `surface-white`: Role "background" is grounded by usage context "Page background, card surfaces, popover backgrounds".
- **border-primary** maps to `border-grey`: Role "primary" is grounded by usage context "Structural dividers, input borders, sidebar borders, nav bottom rule".
- **content-text** maps to `muted-text`: Role "text" is grounded by usage context "Secondary/muted text labels, footer metadata, subdued captions".

### Primary Brand
- **Border Grey** (#e5e5e5): Structural dividers, input borders, sidebar borders, nav bottom rule. Role: primary. {authored: rgb(229, 229, 229), space: rgb}

### Text Scale
- **Foreground Black** (#1a1a1a): Primary text, headings, nav links, button labels, and icon fills across all zones. Role: text. {authored: rgb(26, 26, 26), space: rgb}
- **Muted Text** (#6b6b6b): Secondary/muted text labels, footer metadata, subdued captions. Role: text. {authored: rgb(107, 107, 107), space: rgb}

### Interactive
- **Primary Action** (#1a1a1a): Primary interactive elements, CTA button border/text, ring focus color. Role: border. {authored: rgb(26, 26, 26), space: rgb}

### Surface & Shadows
- **Secondary Surface** (#ffffff): Secondary/muted surface fills, sidebar accent backgrounds. Role: background. {authored: rgb(255, 255, 255), space: rgb}
- **Surface White** (#ffffff): Page background, card surfaces, popover backgrounds. Role: background. {authored: rgb(255, 255, 255), space: rgb}

## Typography

Typography uses neueAlteGrotesk, Chivo Mono across extracted hierarchy roles. Keep hierarchy mapped to these token rows before adding decorative type styles.

Mixes neueAlteGrotesk and Chivo Mono for visual contrast. Weight range spans medium, regular, light. Sizes range from 11px to 331px.

### Font Roles
- **Headline Font**: neueAlteGrotesk
- **Body Font**: neueAlteGrotesk

### Type Scale Evidence
| Role | Font | Size | Weight | Line Height | Letter Spacing | Stack / Features | Notes |
|------|------|------|--------|-------------|----------------|------------------|-------|
| Oversized hero wordmark / brand statement at viewport scale | neueAlteGrotesk | 331px | 500 | 297.9px | -6.62px | neueAlteGrotesk, neueAlteGrotesk Fallback | Extracted token |
| Large section headings and primary display text | neueAlteGrotesk | 72px | 400 | 75.6px | normal | neueAlteGrotesk, neueAlteGrotesk Fallback | Extracted token |
| Secondary display headings, light weight for editorial contrast | neueAlteGrotesk | 48px | 300 | 60px | normal | neueAlteGrotesk, neueAlteGrotesk Fallback | Extracted token |
| Section-level headings | neueAlteGrotesk | 36px | 400 | 40px | normal | neueAlteGrotesk, neueAlteGrotesk Fallback | Extracted token |
| Sub-section headings, light weight | neueAlteGrotesk | 30px | 300 | 30px | normal | neueAlteGrotesk, neueAlteGrotesk Fallback | Extracted token |
| Card titles, subheadings | neueAlteGrotesk | 24px | 400 | 32px | normal | neueAlteGrotesk, neueAlteGrotesk Fallback | Extracted token |
| Primary body copy, nav links, general UI text | neueAlteGrotesk | 16px | 400 | 24px | normal | neueAlteGrotesk, neueAlteGrotesk Fallback | Extracted token |
| Larger body paragraphs, intro text | neueAlteGrotesk | 18px | 400 | 29.25px | normal | neueAlteGrotesk, neueAlteGrotesk Fallback | Extracted token |
| Uppercase navigation labels, section identifiers | neueAlteGrotesk | 14px | 400 | 20px | 1.4px | neueAlteGrotesk, neueAlteGrotesk Fallback | Extracted token |
| Small uppercase labels, metadata tags | neueAlteGrotesk | 12px | 400 | 16px | 1.2px | neueAlteGrotesk, neueAlteGrotesk Fallback | Extracted token |
| Fine-print captions, footnotes, micro-labels | neueAlteGrotesk | 11px | 400 | 17.6px | 0.55px | neueAlteGrotesk, neueAlteGrotesk Fallback | Extracted token |
| Code snippets, monospace UI elements, technical labels | Chivo Mono | 16px | 400 | 24px | normal | Chivo Mono, Chivo Mono Fallback | Extracted token |

## Layout

Layout rhythm is inferred from spacing tokens and responsive breakpoint evidence.

This system uses a 8px base grid with scale values 2, 4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128.

### Spacing System
| Token | Value | Px | Notes |
|------|-------|----|-------|
| spacing-2 | 2px | 2 | Extracted spacing token |
| spacing-4 | 4px | 4 | Extracted spacing token |
| spacing-6 | 6px | 6 | Extracted spacing token |
| spacing-8 | 8px | 8 | Extracted spacing token |
| spacing-10 | 10px | 10 | Extracted spacing token |
| spacing-12 | 12px | 12 | Extracted spacing token |
| spacing-16 | 16px | 16 | Extracted spacing token |
| spacing-20 | 20px | 20 | Extracted spacing token |
| spacing-24 | 24px | 24 | Extracted spacing token |
| spacing-32 | 32px | 32 | Extracted spacing token |
| spacing-40 | 40px | 40 | Extracted spacing token |
| spacing-48 | 48px | 48 | Extracted spacing token |
| spacing-64 | 64px | 64 | Extracted spacing token |
| spacing-80 | 80px | 80 | Extracted spacing token |
| spacing-96 | 96px | 96 | Extracted spacing token |
| spacing-128 | 128px | 128 | Extracted spacing token |

## Elevation & Depth

Keep depth flat unless validated shadow or interaction evidence appears in the extraction payload. Do not invent shadows beyond this evidence boundary.

### Shadow Evidence
| Shadow Token | Layers | Details |
|--------------|--------|---------|
| n/a | 0 | No validated shadow payload |

### Interaction Signals
| Theme | Signal | Evidence |
|-------|--------|----------|
| Light | backdrop-filter | blur(12px) ; blur(8px) |
| Light | outline-color | oklab(0.217785 0.00000996143 0.00000435114 / 0.5) |
| Light | outline-width | 3px |
| Light | outline-offset | 0px |
| Light | transform | matrix(1, 0, 0, 1, 0, 20) |

## Shapes

Shape language maps directly to rounded tokens. Keep component corners consistent with the role mapping below before introducing bespoke geometry.

### Radius Roles
| Token | Value | Px | Role Mapping |
|------|-------|----|--------------|
| radius-sm | 8px | 8 | Control corner |
| radius-base | 0.5rem | 8 | Control corner |
| radius-md | 16px | 16 | Card corner |

### Geometry Evidence
| Radius Token | Shape | Units |
|--------------|-------|-------|
| radius-sm | 8px | px |
| radius-md | 16px | px |
| radius-base | 0.5rem | rem |

## Components

(none detected)

## Do's and Don'ts

Guardrails protect Dual typeface system, Monochrome palette without adding unsupported visual claims.

| Do | Don't |
|----|---------|
| Do maintain consistent spacing using the base grid | Don't make unsupported claims about absent visual features |
| Do maintain WCAG AA contrast ratios (4.5:1 for normal text) | Don't mix rounded and sharp corners in the same view |
| Do use the primary color only for the single most important action per screen |  |
| Do verify evidence before writing new design-system guidance |  |

## Responsive Evidence

### Breakpoints

No distinct responsive breakpoints were extracted.

## Agent Prompt Guide

### Example Component Prompts
- Create button component using validated primary color role and spacing tokens.
- Create card component with mapped radius role and evidence-backed elevation.
- Create form input component using inferred typography hierarchy and border roles.

### Iteration Guide
1. Start with extracted palette and typography roles only.
2. Map spacing and radius directly from token tables before visual polish.
3. Apply component patterns one section at a time and compare against source intent.
4. Keep elevation claims tied to explicit evidence in output.
5. Iterate with smallest diffs and re-check section hierarchy after each change.
