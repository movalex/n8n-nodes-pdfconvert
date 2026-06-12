import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { createCanvas } from '@napi-rs/canvas';
import * as path from 'path';

// pdfjs-dist v4 is ESM-only. Under module:commonjs tsc rewrites `await import()`
// into `require()`, which cannot load ESM — the indirection below prevents that rewrite.
// The legacy build is required: in Node it disables the worker and resolves
// workerSrc internally; the modern build throws "No workerSrc specified".
const importPdfjs = new Function(
	'return import("pdfjs-dist/legacy/build/pdf.mjs")',
) as () => Promise<typeof import('pdfjs-dist')>;

// Directories with cMaps and standard fonts shipped inside pdfjs-dist; needed to
// render PDFs that rely on non-embedded or CID-keyed fonts.
const pdfjsRoot = path.dirname(require.resolve('pdfjs-dist/package.json'));
const CMAP_URL = path.join(pdfjsRoot, 'cmaps') + path.sep;
const STANDARD_FONT_DATA_URL = path.join(pdfjsRoot, 'standard_fonts') + path.sep;

export class PdfConvert implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'PDF Convert',
		name: 'pdfConvert',
		icon: 'file:pdfconvert.svg',
		group: ['transform'],
		version: 1,
		description: 'Convert PDF files to images (no system dependencies)',
		defaults: {
			name: 'PDF Convert',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		properties: [
			{
				displayName: 'Binary Property',
				name: 'binaryPropertyName',
				type: 'string',
				default: 'data',
				description: 'Name of the binary property that contains the PDF file',
			},
			{
				displayName: 'Output Format',
				name: 'format',
				type: 'options',
				options: [
					{
						name: 'PNG',
						value: 'png',
					},
					{
						name: 'JPEG',
						value: 'jpeg',
					},
				],
				default: 'png',
				description: 'Output image format',
			},
			{
				displayName: 'Density (DPI)',
				name: 'density',
				type: 'number',
				default: 150,
				description: 'Image density in DPI (higher = better quality, larger file)',
			},
			{
				displayName: 'Output Property',
				name: 'outputProperty',
				type: 'string',
				default: 'images',
				description: 'Name of the output property that will contain the converted images',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		const pdfjs = await importPdfjs();

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const binaryPropertyName = this.getNodeParameter('binaryPropertyName', itemIndex) as string;
				const format = this.getNodeParameter('format', itemIndex) as 'png' | 'jpeg';
				const density = this.getNodeParameter('density', itemIndex) as number;
				const outputProperty = this.getNodeParameter('outputProperty', itemIndex) as string;

				this.helpers.assertBinaryData(itemIndex, binaryPropertyName);
				const pdfBuffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);

				const scale = density / 72;
				const pdfDoc = await pdfjs.getDocument({
					data: new Uint8Array(pdfBuffer),
					cMapUrl: CMAP_URL,
					cMapPacked: true,
					standardFontDataUrl: STANDARD_FONT_DATA_URL,
				}).promise;
				const numPages = pdfDoc.numPages;

				const outputItem: INodeExecutionData = {
					json: {
						...items[itemIndex].json,
						[outputProperty]: {
							totalPages: numPages,
							format,
							density,
							pdfSize: pdfBuffer.length,
						},
					},
					binary: {},
				};

				for (let pageNum = 1; pageNum <= numPages; pageNum++) {
					const page = await pdfDoc.getPage(pageNum);
					const viewport = page.getViewport({ scale });
					const canvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height));
					const context = canvas.getContext('2d');

					await page.render({
						canvasContext: context as object,
						viewport,
					}).promise;

					const mimeType: 'image/png' | 'image/jpeg' =
						format === 'png' ? 'image/png' : 'image/jpeg';
					const imageBuffer =
						format === 'png' ? await canvas.encode('png') : await canvas.encode('jpeg');
					const binaryKey = `${outputProperty}_page_${pageNum}`;

					outputItem.binary![binaryKey] = {
						data: imageBuffer.toString('base64'),
						mimeType,
						fileName: `page_${pageNum}.${format}`,
						fileExtension: format,
					};
				}

				returnData.push(outputItem);
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							...items[itemIndex].json,
							error: (error as Error).message,
							conversionFailed: true,
						},
						pairedItem: itemIndex,
					});
				} else {
					throw new NodeOperationError(this.getNode(), error as Error, { itemIndex });
				}
			}
		}

		return [returnData];
	}
}
