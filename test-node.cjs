// End-to-end test of the compiled node artifact.
// Loads dist/.../PdfConvert.node.js via require() — the same way n8n loads it —
// and runs execute() against a real PDF with a stubbed IExecuteFunctions context.
// Usage: node test-node.cjs <path-to-pdf>

const { readFileSync, writeFileSync } = require('fs');
const { resolve } = require('path');

const pdfPath = process.argv[2];
if (!pdfPath) {
  console.error('Usage: node test-node.cjs <path-to-pdf>');
  process.exit(1);
}

const pdfBuffer = readFileSync(resolve(pdfPath));

const { PdfConvert } = require('./dist/nodes/PdfConvert/PdfConvert.node.js');

const params = {
  binaryPropertyName: 'data',
  format: 'png',
  density: 150,
  outputProperty: 'images',
};

const items = [
  {
    json: { fileName: 'input.pdf' },
    binary: {
      data: {
        data: pdfBuffer.toString('base64'),
        mimeType: 'application/pdf',
        fileName: 'input.pdf',
      },
    },
  },
];

// Minimal stub of the IExecuteFunctions surface the node actually uses
const ctx = {
  getInputData: () => items,
  getNodeParameter: (name) => params[name],
  continueOnFail: () => false,
  getNode: () => ({ name: 'PDF Convert', type: 'pdfConvert' }),
  helpers: {
    assertBinaryData: (i, prop) => {
      if (!items[i].binary?.[prop]) throw new Error(`No binary data property "${prop}"`);
      return items[i].binary[prop];
    },
    getBinaryDataBuffer: async (i, prop) =>
      Buffer.from(items[i].binary[prop].data, 'base64'),
  },
};

(async () => {
  const node = new PdfConvert();
  const [output] = await node.execute.call(ctx);

  for (const item of output) {
    console.log('json:', JSON.stringify(item.json, null, 2));
    for (const [key, bin] of Object.entries(item.binary ?? {})) {
      const buf = Buffer.from(bin.data, 'base64');
      const outFile = `out_${key}.${bin.fileExtension}`;
      writeFileSync(outFile, buf);
      console.log(`binary[${key}]: ${bin.fileName} (${buf.length} bytes) -> ${outFile}`);
    }
  }
  console.log('OK');
})().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
