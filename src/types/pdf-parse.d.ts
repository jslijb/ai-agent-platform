declare module "pdf-parse" {
  function pdfParse(data: Buffer | string, options?: Record<string, unknown>): Promise<{
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata: Record<string, unknown>;
    text: string;
    version: string;
  }>;
  export default pdfParse;
}
