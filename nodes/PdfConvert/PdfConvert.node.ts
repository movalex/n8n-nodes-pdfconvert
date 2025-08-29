import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionType, NodeOperationError, ApplicationError } from 'n8n-workflow';

export class PdfConvert implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'PDF Convert',
		name: 'pdfConvert',
		icon: 'file:pdfconvert.svg',
		group: ['transform'],
		version: 1,
		description: 'Convert PDF files to images (PNG/JPG)',
		defaults: {
			name: 'PDF Convert',
		},
		inputs: [NodeConnectionType.Main],
		outputs: [NodeConnectionType.Main],
		usableAsTool: true,
		properties: [
			{
				displayName: 'Input Type',
				name: 'inputType',
				type: 'options',
				options: [
					{
						name: 'Binary Data',
						value: 'binaryData',
						description: 'PDF from binary data (file upload)',
					},
					{
						name: 'Base64',
						value: 'base64',
						description: 'PDF from base64 encoded string',
					},
				],
				default: 'binaryData',
				description: 'How the PDF data is provided',
			},
			{
				displayName: 'Binary Property',
				name: 'binaryPropertyName',
				type: 'string',
				default: 'data',
				placeholder: 'data',
				displayOptions: {
					show: {
						inputType: ['binaryData'],
					},
				},
				description: 'Name of the binary property that contains the PDF data',
			},
			{
				displayName: 'Base64 Data',
				name: 'base64Data',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						inputType: ['base64'],
					},
				},
				description: 'Base64 encoded PDF data',
			},
			{
				displayName: 'Output Format',
				name: 'outputFormat',
				type: 'options',
				options: [
					{
						name: 'PNG',
						value: 'png',
					},
					{
						name: 'JPG',
						value: 'jpg',
					},
				],
				default: 'png',
				description: 'Output image format',
			},
			{
				displayName: 'Scale',
				name: 'scale',
				type: 'number',
				typeOptions: {
					minValue: 0.5,
					maxValue: 5,
					numberStepSize: 0.1,
				},
				default: 2,
				description: 'Scale factor for image resolution (1 = 72dpi, 2 = 144dpi)',
			},
			{
				displayName: 'Pages',
				name: 'pages',
				type: 'string',
				default: '',
				placeholder: '1,2,3 or 1-5 or leave empty for all pages',
				description: 'Specific pages to convert (comma-separated numbers or ranges, leave empty for all)',
			},
			{
				displayName: 'Output Property Name',
				name: 'outputPropertyName',
				type: 'string',
				default: 'images',
				description: 'Name of the output property that will contain the converted images',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		// Dynamic import for pdf-img-convert (ESM module)
		const pdf2img = await import('pdf-img-convert');
		
		// Try to set up Canvas for server-side rendering
		try {
			const Canvas = await import('canvas');
			// Set up global Canvas if not already available
			if (typeof (globalThis as any).HTMLCanvasElement === 'undefined') {
				(globalThis as any).HTMLCanvasElement = Canvas.Canvas;
			}
		} catch (error) {
			// Canvas not available, pdf-img-convert will try to work without it
			console.warn('Canvas not available for PDF conversion:', (error as Error).message);
		}

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const inputType = this.getNodeParameter('inputType', itemIndex) as string;
				const outputFormat = this.getNodeParameter('outputFormat', itemIndex) as string;
				const scale = this.getNodeParameter('scale', itemIndex) as number;
				const pagesParam = this.getNodeParameter('pages', itemIndex) as string;
				const outputPropertyName = this.getNodeParameter('outputPropertyName', itemIndex) as string;

				let pdfBuffer: Buffer;

				// Get PDF data based on input type
				if (inputType === 'binaryData') {
					const binaryPropertyName = this.getNodeParameter('binaryPropertyName', itemIndex) as string;
					this.helpers.assertBinaryData(itemIndex, binaryPropertyName);
					pdfBuffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);
				} else if (inputType === 'base64') {
					const base64Data = this.getNodeParameter('base64Data', itemIndex) as string;
					if (!base64Data) {
						throw new NodeOperationError(this.getNode(), 'Base64 data is required when input type is base64', {
							itemIndex,
						});
					}
					pdfBuffer = Buffer.from(base64Data, 'base64');
				} else {
					throw new NodeOperationError(this.getNode(), `Unknown input type: ${inputType}`, {
						itemIndex,
					});
				}

				// Parse pages parameter
				let pageNumbers: number[] | undefined;
				if (pagesParam.trim()) {
					pageNumbers = PdfConvert.parsePageNumbers(pagesParam);
				}

				// Convert PDF to images
				const conversionOptions = {
					scale,
					base64: false, // We want Uint8Array output
					page_numbers: pageNumbers,
				};

					try {
						const outputImages = await pdf2img.convert(pdfBuffer, conversionOptions) as Uint8Array[];

						// Convert Uint8Array images to proper format
						const images = outputImages.map((imageData, index) => {
							const pageNumber = pageNumbers ? pageNumbers[index] : index + 1;
							return {
								data: Buffer.from(imageData),
								mimeType: outputFormat === 'png' ? 'image/png' : 'image/jpeg',
								fileName: `page_${pageNumber}.${outputFormat}`,
								fileExtension: outputFormat,
								pageNumber,
							};
						});

						// Create output item
						const outputItem: INodeExecutionData = {
							json: {
								...items[itemIndex].json,
								[outputPropertyName]: images,
								totalPages: images.length,
								outputFormat,
								scale,
							},
							binary: {},
						};

						// Also add images as binary data for easier use in workflows
						images.forEach((image, index) => {
							const binaryPropertyName = `${outputPropertyName}_page_${image.pageNumber}`;
							outputItem.binary![binaryPropertyName] = {
								data: image.data.toString('base64'),
								mimeType: image.mimeType,
								fileName: image.fileName,
								fileExtension: image.fileExtension,
							};
						});

						returnData.push(outputItem);

					} catch (conversionError) {
						// Handle Canvas/conversion specific errors
						const errorMessage = `PDF conversion failed: ${(conversionError as Error).message}. This might be due to missing Canvas dependencies. Please ensure the n8n container has the required system dependencies installed.`;
						
						if (this.continueOnFail()) {
							returnData.push({
								json: { 
									...items[itemIndex].json, 
									error: errorMessage,
									originalError: (conversionError as Error).message
								},
								error: conversionError,
								pairedItem: itemIndex,
							});
						} else {
							throw new NodeOperationError(this.getNode(), errorMessage, {
								itemIndex,
							});
						}
					}

			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { ...items[itemIndex].json, error: error.message },
						error,
						pairedItem: itemIndex,
					});
				} else {
					if (error.context) {
						error.context.itemIndex = itemIndex;
						throw error;
					}
					throw new NodeOperationError(this.getNode(), error, {
						itemIndex,
					});
				}
			}
		}

		return [returnData];
	}

	/**
	 * Parse page numbers from string like "1,2,3" or "1-5" or "1,3-5,7"
	 */
	private static parsePageNumbers(pagesParam: string): number[] {
		const pages: number[] = [];
		const parts = pagesParam.split(',');

		for (const part of parts) {
			const trimmed = part.trim();
			if (trimmed.includes('-')) {
				// Handle ranges like "1-5"
				const [start, end] = trimmed.split('-').map(n => parseInt(n.trim(), 10));
				if (isNaN(start) || isNaN(end) || start > end || start < 1) {
					throw new ApplicationError(`Invalid page range: ${trimmed}`);
				}
				for (let i = start; i <= end; i++) {
					if (!pages.includes(i)) {
						pages.push(i);
					}
				}
			} else {
				// Handle single pages like "1"
				const pageNum = parseInt(trimmed, 10);
				if (isNaN(pageNum) || pageNum < 1) {
					throw new ApplicationError(`Invalid page number: ${trimmed}`);
				}
				if (!pages.includes(pageNum)) {
					pages.push(pageNum);
				}
			}
		}

		return pages.sort((a, b) => a - b);
	}
}