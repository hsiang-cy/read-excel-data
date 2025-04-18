import { unzipSync, Unzipped } from './unzipsync.js';

// 定義類型
type BufferSource = ArrayBuffer | Uint8Array | Buffer;
type RowSelectorType = number | [number, number] | null;
type HeaderRowType = number | null;
type CellDataMap = Map<number, Map<string, string | number | boolean | null>>;
type ColumnSet = Set<string>;
type ColumnArray = Array<string>;
type RowData = Record<string, string | number | boolean | null>;
type MatrixData = (string | number | boolean | null)[][];
type SheetInfo = { name: string; rId: string };

export class Red {
    private buffer: Uint8Array;
    private files: Unzipped;
    private sheetNameOrIndex: string | number;
    private workbookXml: string;
    private sheets: SheetInfo[];
    private targetSheet: SheetInfo;
    private sheetPath: string;
    private sheetXml: string;
    private sharedStrings: string[];

    /**
     * Get all sheet names from Excel file
     * @param buffer Excel file buffer
     * @returns Array of sheet names
     */
    static getSheetNames(buffer: BufferSource): string[] {
        const files = unzipSync(new Uint8Array(buffer));
        const workbookXml = new TextDecoder().decode(files['xl/workbook.xml']);
        const sheetsRegex = /<sheet[^>]*name="([^"]*)"[^>]*r:id="([^"]*)"[^>]*\/>/g;
        const sheets: string[] = [];
        let sheetMatch;

        while ((sheetMatch = sheetsRegex.exec(workbookXml)) !== null) {
            sheets.push(sheetMatch[1]);
        }

        return sheets;
    }

    /**
     * Create a Red instance
     * @param buffer Excel file buffer
     * @param sheetNameOrIndex Sheet name or index (1-based)
     */
    constructor(buffer: BufferSource, sheetNameOrIndex: string | number) {
        this.buffer = new Uint8Array(buffer);
        this.files = unzipSync(this.buffer);
        this.sheetNameOrIndex = sheetNameOrIndex;

        this.workbookXml = new TextDecoder().decode(this.files['xl/workbook.xml']);
        this.sheets = this.#parseSheets();

        this.targetSheet = this.#findTargetSheet();

        this.sheetPath = this.#getSheetPath();
        this.sheetXml = new TextDecoder().decode(this.files[this.sheetPath]);

        this.sharedStrings = this.#loadSharedStrings();
    }

    /**
     * Read Excel data
     * @param rowSelector Single row or range [startRow, endRow], or null for all rows
     * @param headerRow Header row number (specified to return objects with header names)
     * @returns If headerRow is specified, returns array of objects, each representing a row
     *          Otherwise, returns 2D array where first row corresponds to Excel's first row
     */
    readAsRows(rowSelector: RowSelectorType = null, headerRow: HeaderRowType = null): RowData[] | MatrixData {
        const cellData = this.#parseCells();
        const maxRow = this.#findMaxRow(cellData);
        const columns = this.#getAllColumns(cellData);
        const sortedColumns = this.#sortColumns(columns);

        // 處理行範圍
        let startRow = 1;
        let endRow = maxRow;

        if (rowSelector !== null) {
            if (Array.isArray(rowSelector)) {
                [startRow, endRow] = rowSelector;
                startRow = Math.max(startRow, 1);
                endRow = Math.min(endRow, maxRow);
            } else {
                startRow = endRow = Math.min(Math.max(rowSelector, 1), maxRow);
            }
        }

        // 如果 headerRow 未指定，返回矩陣形式數據
        if (headerRow === null) {
            return this.#generateMatrixData(cellData, startRow, endRow, sortedColumns);
        }

        // 否則返回物件形式（需要使用 headerRow 作為列名來源）
        const columnMapping = new Map<string, string>();
        
        const headerRowData = cellData.get(headerRow);
        if (headerRowData) {
            for (const col of sortedColumns) {
                const headerValue = headerRowData.get(col);
                if (headerValue !== undefined && headerValue !== null) {
                    columnMapping.set(col, String(headerValue));
                } else {
                    columnMapping.set(col, col);
                }
            }
        } else {
            for (const col of sortedColumns) {
                columnMapping.set(col, col);
            }
        }

        // 物件形式的數據開始行應當是 headerRow 之後
        startRow = Math.max(startRow, headerRow + 1);

        const result: RowData[] = [];
        for (let row = startRow; row <= endRow; row++) {
            const rowData: RowData = {};
            const rowMap = cellData.get(row);

            for (const col of sortedColumns) {
                const propName = columnMapping.get(col) || col;
                rowData[propName] = null;
            }

            if (rowMap) {
                for (const col of sortedColumns) {
                    const propName = columnMapping.get(col) || col;
                    const value = rowMap.get(col);
                    if (value !== undefined) {
                        rowData[propName] = value;
                    }
                }
            }

            result.push(rowData);
        }

        return result;
    }

    /**
     * 生成矩陣數據（原 readAsMatrix 功能）
     * @param cellData 單元格數據
     * @param startRow 開始行
     * @param endRow 結束行
     * @param sortedColumns 排序後的列
     * @returns 2D 數組表示的 Excel 工作表
     */
    #generateMatrixData(cellData: CellDataMap, startRow: number, endRow: number, sortedColumns: ColumnArray): MatrixData {
        // 創建列到索引的映射
        const columnToIndex = new Map<string, number>();
        sortedColumns.forEach((col, index) => {
            columnToIndex.set(col, index);
        });

        // 創建結果矩陣
        const result: MatrixData = [];
        for (let row = startRow; row <= endRow; row++) {
            const rowData = Array(sortedColumns.length).fill(null);

            // 填充該行的數據
            if (cellData.has(row)) {
                const rowMap = cellData.get(row);
                if (rowMap) {
                    for (const [col, value] of rowMap.entries()) {
                        const colIndex = columnToIndex.get(col);
                        if (colIndex !== undefined) {
                            rowData[colIndex] = value;
                        }
                    }
                }
            }

            result.push(rowData);
        }

        return result;
    }

    /**
     * 解析工作表
     */
    #parseSheets(): SheetInfo[] {
        const sheetsRegex = /<sheet[^>]*name="([^"]*)"[^>]*r:id="([^"]*)"[^>]*\/>/g;
        const sheets: SheetInfo[] = [];
        let sheetMatch;
        while ((sheetMatch = sheetsRegex.exec(this.workbookXml)) !== null) {
            sheets.push({
                name: sheetMatch[1],
                rId: sheetMatch[2]
            });
        }
        return sheets;
    }

    /**
     * 查找目標工作表
     */
    #findTargetSheet(): SheetInfo {
        if (typeof this.sheetNameOrIndex === 'string') {
            const targetSheet = this.sheets.find(sheet => sheet.name === this.sheetNameOrIndex);
            if (!targetSheet) {
                throw new Error(`Sheet "${this.sheetNameOrIndex}" not found`);
            }
            return targetSheet;
        } else {
            if (this.sheetNameOrIndex < 1 || this.sheetNameOrIndex > this.sheets.length) {
                throw new Error(`Sheet index out of range: ${this.sheetNameOrIndex}`);
            }
            return this.sheets[this.sheetNameOrIndex - 1];
        }
    }

    /**
     * 獲取工作表路徑
     */
    #getSheetPath(): string {
        const relsXml = new TextDecoder().decode(this.files['xl/_rels/workbook.xml.rels']);
        const relRegex = new RegExp(`<Relationship[^>]*Id="${this.targetSheet.rId}"[^>]*Target="([^"]*)"[^>]*\/>`);
        const relMatch = relRegex.exec(relsXml);
        if (!relMatch) {
            throw new Error(`Path for sheet "${this.targetSheet.name}" not found`);
        }
        return 'xl/' + relMatch[1];
    }

    /**
     * 加載共享字符串
     */
    #loadSharedStrings(): string[] {
        const sharedStrings: string[] = [];
        if (this.files['xl/sharedStrings.xml']) {
            const ssXml = new TextDecoder().decode(this.files['xl/sharedStrings.xml']);
            const siRegex = /<si>([\s\S]*?)<\/si>/g;
            let siMatch;
            while ((siMatch = siRegex.exec(ssXml)) !== null) {
                const tRegex = /<t[^>]*>(.*?)<\/t>/g;
                let tMatch;
                let text = '';
                while ((tMatch = tRegex.exec(siMatch[1])) !== null) {
                    text += tMatch[1];
                }
                sharedStrings.push(text);
            }
        }
        return sharedStrings;
    }

    /**
     * 解析單元格
     */
    #parseCells(): CellDataMap {
        const cellData = new Map<number, Map<string, string | number | boolean | null>>();
        const cellRegex = /<c\s+r="([A-Z]+)(\d+)"(?:\s+[^>]*t="([^"]*)")?[^>]*>(?:<v>([^<]*)<\/v>|<is><t>([^<]*)<\/t><\/is>)?<\/c>/g;
        let cellMatch;

        while ((cellMatch = cellRegex.exec(this.sheetXml)) !== null) {
            const col = cellMatch[1];
            const row = parseInt(cellMatch[2], 10);
            const type = cellMatch[3] || '';
            const rawValue = cellMatch[4] !== undefined ? cellMatch[4] : cellMatch[5];

            let value: string | number | boolean | null = null;
            if (rawValue !== undefined) {
                if (type === 's') {
                    const index = parseInt(rawValue, 10);
                    value = index >= 0 && index < this.sharedStrings.length ? this.sharedStrings[index] : null;
                } else if (type === 'b') {
                    value = rawValue === '1';
                } else if (type === 'n' || type === '') {
                    value = rawValue ? parseFloat(rawValue) : null;
                } else {
                    value = rawValue;
                }
            }

            if (!cellData.has(row)) {
                cellData.set(row, new Map());
            }
            const rowMap = cellData.get(row);
            if (rowMap) {
                rowMap.set(col, value);
            }
        }

        return cellData;
    }

    /**
     * 查找最大行
     */
    #findMaxRow(cellData: CellDataMap): number {
        let maxRow = 0;
        for (const row of cellData.keys()) {
            if (row > maxRow) maxRow = row;
        }
        return maxRow;
    }

    /**
     * 獲取所有列
     */
    #getAllColumns(cellData: CellDataMap): ColumnSet {
        const columns = new Set<string>();
        for (const rowMap of cellData.values()) {
            for (const col of rowMap.keys()) {
                columns.add(col);
            }
        }
        return columns;
    }

    /**
     * 排序列
     */
    #sortColumns(columns: ColumnSet): ColumnArray {
        return Array.from(columns).sort((a, b) => {
            if (a.length !== b.length)
                return a.length - b.length;
            return a.localeCompare(b);
        });
    }
}