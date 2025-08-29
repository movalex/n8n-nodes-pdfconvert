import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionType, NodeOperationError } from 'n8n-workflow';

export class PdfConvert implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'PDF Convert',
		name: 'pdfConvert',
		icon: 'file:pdfconvert.svg',
		group: ['transform'],
		version: 1,
		description: 'Convert PDF files to images using pdf2pic',
		defaults: {
			name: 'PDF Convert',
		},
		inputs: [NodeConnectionType.Main],
		outputs: [NodeConnectionType.Main],
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

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const binaryPropertyName = this.getNodeParameter('binaryPropertyName', itemIndex) as string;
				const format = this.getNodeParameter('format', itemIndex) as string;
				const density = this.getNodeParameter('density', itemIndex) as number;
				const outputProperty = this.getNodeParameter('outputProperty', itemIndex) as string;

				// Get PDF buffer
				this.helpers.assertBinaryData(itemIndex, binaryPropertyName);
				const pdfBuffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);

				// Write PDF to temporary file
				const fs = await import('fs');
				const path = await import('path');
				const os = await import('os');
				
				const tempDir = os.tmpdir();
				const tempPdfPath = path.join(tempDir, `pdf_${Date.now()}_${itemIndex}.pdf`);
				
				await fs.promises.writeFile(tempPdfPath, pdfBuffer);

				try {
					// Import pdf2pic dynamically
					const { fromPath } = await import('pdf2pic');
					
					// Configure pdf2pic
					const convert = fromPath(tempPdfPath, {
						density: density,
						saveFilename: `page`,
						savePath: tempDir,
						format: format,
						width: undefined, // Keep original aspect ratio
						height: undefined,
					});

					// Convert all pages
					const results = await convert.bulk(-1); // -1 means all pages

					// Process results
					const images: Array<{
						data: Buffer;
						mimeType: string;
						fileName: string;
						pageNumber: number;
					}> = [];

					for (const result of results) {
						if (result.path) {
							const imageBuffer = await fs.promises.readFile(result.path);
							images.push({
								data: imageBuffer,
								mimeType: format === 'png' ? 'image/png' : 'image/jpeg',
								fileName: `page_${result.page}.${format}`,
								pageNumber: result.page || 1,
							});
							
							// Clean up temporary image file
							try {
								await fs.promises.unlink(result.path);
							} catch (cleanupError) {
								// Ignore cleanup errors
							}
						}
					}

					// Create output
					const outputItem: INodeExecutionData = {
						json: {
							...items[itemIndex].json,
							[outputProperty]: {
								totalPages: images.length,
								format,
								density,
								pdfSize: pdfBuffer.length,
							},
						},
						binary: {},
					};

					// Add images as binary data
					images.forEach((image, index) => {
						const binaryKey = `${outputProperty}_page_${image.pageNumber}`;
						outputItem.binary![binaryKey] = {
							data: image.data.toString('base64'),
							mimeType: image.mimeType,
							fileName: image.fileName,
							fileExtension: format,
						};
					});

					returnData.push(outputItem);

				} finally {
					// Clean up temporary PDF file
					try {
						await fs.promises.unlink(tempPdfPath);
					} catch (cleanupError) {
						// Ignore cleanup errors
					}
				}

			} catch (error) {
				// Enhanced error handling
				let errorMessage = (error as Error).message;
				
				if (errorMessage.includes('pdf2pic')) {
					errorMessage = `PDF conversion failed: ${errorMessage}. Make sure GraphicsMagick or ImageMagick is installed in your system.`;
				}

				if (this.continueOnFail()) {
					returnData.push({
						json: { 
							...items[itemIndex].json, 
							error: errorMessage,
							conversionFailed: true,
						},
						pairedItem: itemIndex,
					});
				} else {
					throw new NodeOperationError(this.getNode(), errorMessage, { itemIndex });
				}
			}
		}

		return [returnData];
	}
}
