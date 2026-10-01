# CreativeHome Specification

## Overview
- Target: `frontend/src/views/aiAssistant/index.vue`
- Screenshot: `docs/design-references/miora-design/root/original-desktop.png`
- Interaction: click-driven carousel and category selector; time-driven mascot video.

## Desktop geometry
- Content column: 1000px.
- Banner outer: 1172 × 286.55px, margin-inline -86px.
- Banner stage: 1172 × 262.55px, perspective 3281.99px.
- Main card: 703.28 × 262.55px, radius 18.75px.
- Dots: 104 × 4px, gap 4px.
- Hero: 996 × 170px, margin-top -80px.
- Category tabs: 692 × 32px, padding 4px, radius 16px.
- Mascot preview: 220 × 170px.
- Input shell: 996 × 206px, radius 20px.
- Input surface: 992 × 160px, padding 12px, radius 18px.

## Assets
- `/miora-home/banner-bestiary.webp`
- `/miora-home/banner-cinematography.webp`
- `/miora-home/banner-hy4.webp`
- `/miora-home/mascot-preview.webm`

## Responsive
- Up to 1100px: page uses available width while preserving composition.
- Up to 760px: mascot hidden, tabs scroll horizontally, banner cards use 82% width.

## Skills popover
- Trigger-aligned floating panel, 540 × 421px maximum, 18px radius.
- Search input and installed-skill rows mirror the compact single-line information hierarchy of the reference.
- Pointer-down outside the panel and trigger closes it.
- Skill selection is limited to four and the selected paths are included in the assistant stream request.

## Inspiration showcase
- Four-column desktop / two-column mobile card grid below the composer.
- Uses repository-owned visual preset assets and original Chinese prompts.
- Clicking a card fills, grows, focuses, and scrolls the assistant textarea into view.
- External link points to the original Miora inspiration listing; third-party media is not copied or re-hosted.
