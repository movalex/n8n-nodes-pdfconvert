# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an n8n community node package that converts PDF files to images (PNG/JPEG). Built as a TypeScript-based n8n node using the pdf2pic library.

## Build & Development Commands

### Core Commands
- `npm run build` - Full build (clean dist, compile TypeScript, copy icons)
- `npm run dev` - Watch mode for development (TypeScript compiler only)
- `npm run lint` - Run ESLint on nodes and package.json
- `npm run lintfix` - Auto-fix linting issues
- `npm run format` - Format code with Prettier

### Build Process Details
The build is two-phase:
1. TypeScript compilation to `dist/` (via tsc)
2. Icon copying via Gulp task (`gulp build:icons`) - copies SVG/PNG files from `nodes/**/*` to `dist/nodes/`

### Testing in n8n
After building, use `npm link` to test the node in a local n8n installation. The node appears as "PDF Convert" in the n8n editor.

## Architecture

### n8n Node Structure
All n8n nodes must follow this structure:
- Implement `INodeType` interface
- Export class with `description: INodeTypeDescription` and `execute()` method
- Node configuration in `description.properties[]` defines UI parameters
- Entry point defined in `package.json` under `n8n.nodes[]`

### Key Files
- `nodes/PdfConvert/PdfConvert.node.ts` - Main node implementation
- `nodes/PdfConvert/pdfconvert.svg` - Node icon (copied to dist during build)
- `gulpfile.js` - Icon copy task
- `tsconfig.json` - Strict TypeScript config with commonjs modules

### Node Implementation Pattern

**Parameter Handling:**
```typescript
const param = this.getNodeParameter('paramName', itemIndex) as Type;
```

**Binary Data Access:**
```typescript
this.helpers.assertBinaryData(itemIndex, propertyName);
const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, propertyName);
```

**Output Structure:**
- `json` property: Metadata (totalPages, format, density, etc.)
- `binary` property: Each image as separate binary data with key pattern `{outputProperty}_page_{pageNumber}`

**Error Handling:**
- Use `NodeOperationError` for throwing errors
- Check `this.continueOnFail()` to handle errors gracefully
- Add error details to json output when continuing on fail

### PDF Conversion Flow

1. Extract PDF buffer from binary data
2. Write PDF to temporary file in OS temp directory
3. Use pdf2pic's `fromPath()` to configure converter
4. Call `convert.bulk(-1)` to convert all pages (-1 = all pages)
5. Read each generated image file into buffer
6. Package images into n8n binary data format (base64)
7. Clean up temporary files (PDF and images)

### Dependencies

**Runtime:**
- `pdf2pic` - PDF to image conversion (requires GraphicsMagick or ImageMagick on system)
- `n8n-workflow` - Peer dependency (types and utilities)

**System Requirements:**
- Node.js >= 20.15
- GraphicsMagick or ImageMagick must be installed on system for pdf2pic to work

## Common Development Tasks

### Adding New Node Parameters
1. Add property definition to `description.properties[]` array
2. Extract parameter in `execute()` using `this.getNodeParameter()`
3. Pass to pdf2pic configuration or use in processing logic

### Modifying Output Format
Output structure is defined in lines 134-156 of PdfConvert.node.ts:
- JSON metadata in `outputItem.json[outputProperty]`
- Binary images in `outputItem.binary[binaryKey]` with base64 data

### Changing Image Conversion Options
pdf2pic configuration (lines 94-101):
- `density` - DPI setting from node parameter
- `format` - 'png' or 'jpeg' from node parameter
- `width`/`height` - Currently undefined to maintain aspect ratio
- `saveFilename` and `savePath` - Control temporary file locations

## TypeScript Configuration

Strict mode enabled with:
- `noImplicitAny: true`
- `strictNullChecks: true`
- `noUnusedLocals: true`
- `noImplicitReturns: true`

Target: ES2019, Module: CommonJS (required for n8n compatibility)

## Package Publishing

Entry point: `index.js` (empty file, required by n8n)
Published files: Only `dist/` directory (defined in package.json `files` array)
n8n loads: `dist/nodes/PdfConvert/PdfConvert.node.js` (defined in package.json `n8n.nodes`)

Pre-publish runs build and lint with stricter config (`.eslintrc.prepublish.js`)
