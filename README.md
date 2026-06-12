# n8n-nodes-pdfconvert

This package contains the PDF Convert node for [n8n](https://n8n.io). It converts a PDF file into one image per page (PNG or JPEG).

Conversion runs entirely in-process using [pdf.js](https://github.com/mozilla/pdf.js) and [@napi-rs/canvas](https://github.com/Brooooooklyn/canvas). There are no system dependencies: GraphicsMagick, ImageMagick, and Ghostscript are not required, so the node works in a stock n8n container without extra packages.

## Installation

To install this community node, follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n docs, or install it manually:

```bash
npm install n8n-nodes-pdfconvert
```

## Configuration

The node exposes four parameters:

| Parameter | Default | Description |
| --- | --- | --- |
| Binary Property | `data` | Name of the input binary property that holds the PDF |
| Output Format | `png` | Image format: `png` or `jpeg` |
| Density (DPI) | `150` | Render resolution. Higher values give sharper, larger images |
| Output Property | `images` | Base name used for the output metadata and binary keys |

Every page is converted; there is no page-range option.

## Output

For each input item the node returns:

- **JSON** — the original item JSON, plus a metadata object under the configured output property:

  ```json
  {
    "images": {
      "totalPages": 3,
      "format": "png",
      "density": 150,
      "pdfSize": 824641
    }
  }
  ```

- **Binary** — one entry per page, keyed `{outputProperty}_page_{n}` (e.g. `images_page_1`, `images_page_2`). Each entry carries the image `data`, `mimeType`, `fileName`, and `fileExtension`.

## Use cases

- Render PDF pages for downstream OCR or vision models
- Generate page thumbnails or previews
- Convert presentations and invoices to per-page images
- Archive PDF content as individual images

## Requirements

- Node.js >= 20.15

The native `@napi-rs/canvas` binary is selected automatically for the host platform at install time. Install the node inside the target environment (for example, the n8n container) rather than copying `node_modules` across operating systems.

## Development

```bash
npm install      # install dependencies
npm run build    # clean, compile TypeScript, copy icons
npm run dev      # TypeScript watch mode
npm run lint     # ESLint
```

To test the compiled node the same way n8n loads it (via `require()` of the `dist` artifact), run `test-node.cjs` against any PDF:

```bash
npm run build
node test-node.cjs path/to/file.pdf
```

It runs `execute()` with a stubbed n8n context and writes each rendered page to disk.

To try the node in a local n8n instance, run `npm link` after building and link the package into your n8n installation.

## License

[MIT](LICENSE.md)

## Support

- [n8n community nodes documentation](https://docs.n8n.io/integrations/community-nodes/)
- [Issue tracker](https://github.com/movalex/n8n-nodes-pdfconvert/issues)
