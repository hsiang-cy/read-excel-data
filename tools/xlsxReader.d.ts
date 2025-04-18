type CellValue = string | number | boolean | null;
export interface SheetData {
    [column: string]: CellValue[];
}
/**
 * Excel spreadsheet handler
 */
export declare class Red {
    /**
     * Get all sheet names from Excel file
     * @param buffer Excel file buffer
     * @returns Array of sheet names
     */
    static getSheetNames(buffer: ArrayBuffer | Uint8Array | Buffer): string[];
    
    /**
     * Read Excel as column-based data
     * @param buffer Excel file buffer
     * @param sheetNameOrIndex Sheet name or index (1-based)
     * @param headerRow Header row number (default: first row)
     * @returns Column-based spreadsheet data
     */
    static readAsColumns(buffer: ArrayBuffer | Uint8Array | Buffer, sheetNameOrIndex: string | number, headerRow?: number): SheetData;
    
    /**
     * Read Excel as row-based data (objects per row)
     * @param buffer Excel file buffer
     * @param sheetNameOrIndex Sheet name or index (1-based)
     * @param headerRow Header row number (default: first row)
     * @returns Array of objects, each representing a row
     */
    static readAsRows(buffer: ArrayBuffer | Uint8Array | Buffer, sheetNameOrIndex: string | number, headerRow?: number): Record<string, CellValue>[];
    
    /**
     * Read Excel as 2D array (matrix)
     * @param buffer Excel file buffer
     * @param sheetNameOrIndex Sheet name or index (1-based)
     * @returns 2D array where first row corresponds to Excel's first row
     */
    static readAsMatrix(buffer: ArrayBuffer | Uint8Array | Buffer, sheetNameOrIndex: string | number): CellValue[][];
}
export {};