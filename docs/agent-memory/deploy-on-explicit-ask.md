---
name: deploy-on-explicit-ask
description: Commit/push to jakedami.co only when the user explicitly says so; preview via local server first
metadata:
  node_type: memory
  type: feedback
  originSessionId: b12d24c9-539d-4d9d-8c3b-6c2e7cd28790
  modified: 2026-09-01T02:17:42.063Z
---

The user gates deploys themselves: they rejected an unprompted `git push` once, and their flow is edit → local test server (`py -m http.server 8000` in `portfolio/`) → they check it (sometimes from a phone/mobile window) → "commit" / "make it live".

**Why:** pushing to `main` auto-deploys jakedami.co via Cloudflare Pages, so a push is a production deploy.

**How to apply:** make changes and offer a preview server; commit and push only on explicit ask. After a push, polling `https://jakedami.co` with curl until the change appears (~≤1 min) to confirm "live" worked well.
