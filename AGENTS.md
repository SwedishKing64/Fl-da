<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Read the handover first

`docs/HANDOVER.md` holds what the shop told us and what was decided — the binding lists, the mount
charge rules, how kinds of product and name matches work, the tag spellings, what is still open.
Read it before changing behaviour, and add to it when the shop tells you something new.
# Ship it: merge and deploy without asking

Once a change is finished and the checks pass (npx tsc --noEmit, npx eslint src,
npx vitest run — only the known ENOENT supplier-file tests may fail), open a pull
request into main, wait for the Vercel check to pass, and merge it yourself so it
goes live. Never merge a change whose checks or Vercel build failed.
