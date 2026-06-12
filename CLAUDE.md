# CLAUDE.md

n8n community node that converts a PDF into one image per page (PNG/JPEG). Conversion is pure JS via `pdfjs-dist` (Mozilla PDF.js) + `@napi-rs/canvas` — no GraphicsMagick, ImageMagick, or Ghostscript, no system packages.

## Commands

- `npm run build` — clean `dist/`, compile TypeScript, copy icons (gulp)
- `npm run dev` — tsc watch
- `npm run lint` / `lintfix` — ESLint
- `node test-node.cjs <pdf>` — load the compiled `dist/` artifact via require() exactly as n8n does and run execute() against a PDF (build first)

## Critical constraints

The node compiles with `module: commonjs` (required by n8n), but `pdfjs-dist` v4 is ESM-only. Two non-obvious things in [PdfConvert.node.ts](nodes/PdfConvert/PdfConvert.node.ts) make it load:

1. pdfjs is imported through `new Function('return import("...")')`. A plain `await import('pdfjs-dist')` gets rewritten by tsc into `require()`, which throws `ERR_REQUIRE_ESM`. The `new Function` wrapper hides the import from tsc so it survives as a real dynamic import.
2. It imports the **legacy** build (`pdfjs-dist/legacy/build/pdf.mjs`). Under Node the legacy build disables the worker and self-resolves `workerSrc`; the modern build throws `No "GlobalWorkerOptions.workerSrc" specified`.

`cMapUrl` and `standardFontDataUrl` are passed to `getDocument()` pointing into the installed pdfjs package, so PDFs with non-embedded/CID fonts render.

`@napi-rs/canvas` resolves a native binary per platform at install time — always install inside the target environment (the n8n container), never copy `node_modules` across OSes.

## Output shape

- `json[outputProperty]` — metadata: `{ totalPages, format, density, pdfSize }`
- `binary` — one entry per page, key `{outputProperty}_page_{n}`, each `{ data, mimeType, fileName, fileExtension }`

All pages are converted; there is no page-range option. `NodeConnectionTypes` (plural) is the runtime value in n8n-workflow 2.x; `NodeConnectionType` is type-only.

## Publishing

`files` ships only `dist/`. n8n loads `dist/nodes/PdfConvert/PdfConvert.node.js` (per `n8n.nodes` in package.json). `index.js` is an empty required entry point. `prepublishOnly` runs build + lint with `.eslintrc.prepublish.js`.
