# MinBooks UI library integration

MinBooks uses source-level adaptation rather than runtime dependency on visual component libraries.

## OpenSource UI

Used for the document/download interaction pattern. `components/finance/DownloadButton.tsx` is an adapted implementation of OpenSource UI's "Download with States" component.

The adaptation keeps the project's Geist typography, dark semantic tokens, existing button primitives and PDF workflow. OpenSource UI is MIT licensed and explicitly designed for copy/paste ownership rather than an npm runtime package.

Source: https://opensourceui.in/components/download-button

## ObsidianUI

Used as a reference for restrained interactive motion and source-owned React components. MinBooks intentionally does not add the library's heavier motion/Three.js components to the finance workspace: visual effects that do not improve financial workflows are excluded.

Source: https://www.obsidianui.dev/components

## PanelUI

Used as the mobile interaction architecture reference. PanelUI is a React Native/Expo library, so `panelui-native` is not installed in this Next.js web application.

The MinBooks mobile sheet in `components/finance/FinancePrimitives.tsx` adapts the useful principles: semantic state, explicit dialog roles, Escape handling, focus placement, scroll containment, reduced-motion support, and consistent mobile sheet geometry.

Source: https://panelui.dev/docs

## Project rule

Prefer source-level adaptation when a component directly improves a MinBooks workflow. Do not install a library merely to claim library usage, and do not introduce decorative effects that weaken information density or financial clarity.