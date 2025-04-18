/*
 * @Author:Sean Chen
 * @Date:2025-04-18 16:07:23
 * @LastEditors:Sean Chen
 * @LastEditTime:2025-04-18 16:07:23
 * @Description:
 */
import { unzipSync } from './unzipsync.js';

export class Table {
    /**
     * Get all sheet names from Excel file
     * @param buffer Excel file buffer
     * @returns Array of sheet names
     */
    static getSheetNames(buffer) {
        const files = unzipSync(new Uint8Array(buffer));
        const workbookXml = new TextDecoder().decode(files['xl/workbook.xml']);
        const sheetsRegex = /<sheet[^>]*name="([^"]*)"[^>]*r:id="([^"]*)"[^>]*\/>/g;
        const sheets = [];
        let sheetMatch;

        while ((sheetMatch = sheetsRegex.exec(workbookXml)) !== null) {
            sheets.push(sheetMatch[1]);
        }

        return sheets;
    }

    /**
     * Read Excel as column-based data
     * @param buffer Excel file buffer
     * @param sheetNameOrIndex Sheet name or index (1-based)
     * @param headerRow Header row number (default: first row)
     * @returns Column-based spreadsheet data
     */
    static readAsColumns(buffer, sheetNameOrIndex, headerRow) {
        const files = unzipSync(new Uint8Array(buffer));

        const workbookXml = new TextDecoder().decode(files['xl/workbook.xml']);
        const sheetsRegex = /<sheet[^>]*name="([^"]*)"[^>]*r:id="([^"]*)"[^>]*\/>/g;
        const sheets = [];
        let sheetMatch;
        while ((sheetMatch = sheetsRegex.exec(workbookXml)) !== null) {
            sheets.push({
                name: sheetMatch[1],
                rId: sheetMatch[2]
            });
        }

        let targetSheet;
        if (typeof sheetNameOrIndex === 'string') {
            targetSheet = sheets.find(sheet => sheet.name === sheetNameOrIndex);
            if (!targetSheet) {
                throw new Error(`Sheet "${sheetNameOrIndex}" not found`);
            }
        }
        else {
            if (sheetNameOrIndex < 1 || sheetNameOrIndex > sheets.length) {
                throw new Error(`Sheet index out of range: ${sheetNameOrIndex}`);
            }
            targetSheet = sheets[sheetNameOrIndex - 1];
        }

        const relsXml = new TextDecoder().decode(files['xl/_rels/workbook.xml.rels']);
        const relRegex = new RegExp(`<Relationship[^>]*Id="${targetSheet.rId}"[^>]*Target="([^"]*)"[^>]*\/>`);
        const relMatch = relRegex.exec(relsXml);
        if (!relMatch) {
            throw new Error(`Path for sheet "${targetSheet.name}" not found`);
        }
        const sheetPath = 'xl/' + relMatch[1];

        const sheetXml = new TextDecoder().decode(files[sheetPath]);

        // Read shared strings if exists
        let sharedStrings = [];
        if (files['xl/sharedStrings.xml']) {
            const ssXml = new TextDecoder().decode(files['xl/sharedStrings.xml']);
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

        // Parse cell data
        const rawData = new Map();
        const cellRegex = /<c\s+r="([A-Z]+)(\d+)"(?:\s+[^>]*t="([^"]*)")?[^>]*>(?:<v>([^<]*)<\/v>)?<\/c>/g;
        let cellMatch;

        let maxRow = 0;
        while ((cellMatch = cellRegex.exec(sheetXml)) !== null) {
            const col = cellMatch[1];
            const row = parseInt(cellMatch[2], 10);
            const type = cellMatch[3] || '';
            const rawValue = cellMatch[4];

            if (row > maxRow)
                maxRow = row;

            let value = null;
            if (rawValue !== undefined) {
                if (type === 's') {
                    const index = parseInt(rawValue, 10);
                    value = index >= 0 && index < sharedStrings.length ? sharedStrings[index] : null;
                }
                else if (type === 'b') {
                    value = rawValue === '1';
                }
                else if (type === 'n' || type === '') {
                    value = rawValue ? parseFloat(rawValue) : null;
                }
                else {
                    value = rawValue;
                }
            }

            if (!rawData.has(col)) {
                rawData.set(col, new Map());
            }
            rawData.get(col).set(row, value);
        }

        // Process headers
        const columnMapping = new Map();
        const dataStartRow = headerRow ? headerRow + 1 : 1;
        if (headerRow && headerRow >= 1) {
            for (const [col, rowsData] of rawData.entries()) {
                const headerValue = rowsData.get(headerRow);
                if (headerValue !== undefined && headerValue !== null) {
                    columnMapping.set(col, String(headerValue));
                }
                else {
                    columnMapping.set(col, col);
                }
            }
        }
        else {
            for (const col of rawData.keys()) {
                columnMapping.set(col, col);
            }
        }

        // Build result
        const result = {};

        for (const [origCol, mappedCol] of columnMapping.entries()) {
            result[mappedCol] = [];
            for (let row = dataStartRow; row <= maxRow; row++) {
                const rowsData = rawData.get(origCol);
                const value = rowsData ? rowsData.get(row) : null;
                result[mappedCol].push(value !== undefined ? value : null);
            }
        }

        return result;
    }

    /**
     * Read Excel as row-based data (objects per row)
     * @param buffer Excel file buffer
     * @param sheetNameOrIndex Sheet name or index (1-based)
     * @param headerRow Header row number (default: first row)
     * @returns Array of objects, each representing a row
     */
    static readAsRows(buffer, sheetNameOrIndex, headerRow = 1) {
        const files = unzipSync(new Uint8Array(buffer));

        const workbookXml = new TextDecoder().decode(files['xl/workbook.xml']);
        const sheetsRegex = /<sheet[^>]*name="([^"]*)"[^>]*r:id="([^"]*)"[^>]*\/>/g;
        const sheets = [];
        let sheetMatch;
        while ((sheetMatch = sheetsRegex.exec(workbookXml)) !== null) {
            sheets.push({
                name: sheetMatch[1],
                rId: sheetMatch[2]
            });
        }

        let targetSheet;
        if (typeof sheetNameOrIndex === 'string') {
            targetSheet = sheets.find(sheet => sheet.name === sheetNameOrIndex);
            if (!targetSheet) {
                throw new Error(`Sheet "${sheetNameOrIndex}" not found`);
            }
        }
        else {
            if (sheetNameOrIndex < 1 || sheetNameOrIndex > sheets.length) {
                throw new Error(`Sheet index out of range: ${sheetNameOrIndex}`);
            }
            targetSheet = sheets[sheetNameOrIndex - 1];
        }

        const relsXml = new TextDecoder().decode(files['xl/_rels/workbook.xml.rels']);
        const relRegex = new RegExp(`<Relationship[^>]*Id="${targetSheet.rId}"[^>]*Target="([^"]*)"[^>]*\/>`);
        const relMatch = relRegex.exec(relsXml);
        if (!relMatch) {
            throw new Error(`Path for sheet "${targetSheet.name}" not found`);
        }
        const sheetPath = 'xl/' + relMatch[1];

        const sheetXml = new TextDecoder().decode(files[sheetPath]);

        let sharedStrings = [];
        if (files['xl/sharedStrings.xml']) {
            const ssXml = new TextDecoder().decode(files['xl/sharedStrings.xml']);
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

        const cellData = new Map();
        const cellRegex = /<c\s+r="([A-Z]+)(\d+)"(?:\s+[^>]*t="([^"]*)")?[^>]*>(?:<v>([^<]*)<\/v>)?<\/c>/g;
        let cellMatch;

        let maxRow = 0;
        const columns = new Set();
        while ((cellMatch = cellRegex.exec(sheetXml)) !== null) {
            const col = cellMatch[1];
            const row = parseInt(cellMatch[2], 10);
            const type = cellMatch[3] || '';
            const rawValue = cellMatch[4];

            if (row > maxRow)
                maxRow = row;
            columns.add(col);

            let value = null;
            if (rawValue !== undefined) {
                if (type === 's') {
                    const index = parseInt(rawValue, 10);
                    value = index >= 0 && index < sharedStrings.length ? sharedStrings[index] : null;
                }
                else if (type === 'b') {
                    value = rawValue === '1';
                }
                else if (type === 'n' || type === '') {
                    value = rawValue ? parseFloat(rawValue) : null;
                }
                else {
                    value = rawValue;
                }
            }

            if (!cellData.has(row)) {
                cellData.set(row, new Map());
            }
            cellData.get(row).set(col, value);
        }

        const sortedColumns = Array.from(columns).sort((a, b) => {
            if (a.length !== b.length)
                return a.length - b.length;
            return a.localeCompare(b);
        });

        const columnMapping = new Map();
        const dataStartRow = headerRow + 1;

        const headerRowData = cellData.get(headerRow);
        if (headerRowData) {
            for (const col of sortedColumns) {
                const headerValue = headerRowData.get(col);
                if (headerValue !== undefined && headerValue !== null) {
                    columnMapping.set(col, String(headerValue));
                }
                else {
                    columnMapping.set(col, col);
                }
            }
        }
        else {
            for (const col of sortedColumns) {
                columnMapping.set(col, col);
            }
        }

        const result = {};

        for (let row = dataStartRow; row <= maxRow; row++) {
            const rowData = {};
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

            result[row] = rowData;
        }

        return result;
    }

    /**
     * Read Excel as 2D array (matrix)
     * @param buffer Excel file buffer
     * @param sheetNameOrIndex Sheet name or index (1-based)
     * @returns 2D array where first row corresponds to Excel's first row
     */
    static readAsMatrix(buffer, sheetNameOrIndex) {
        const files = unzipSync(new Uint8Array(buffer));

        const workbookXml = new TextDecoder().decode(files['xl/workbook.xml']);
        const sheetsRegex = /<sheet[^>]*name="([^"]*)"[^>]*r:id="([^"]*)"[^>]*\/>/g;
        const sheets = [];
        let sheetMatch;
        while ((sheetMatch = sheetsRegex.exec(workbookXml)) !== null) {
            sheets.push({
                name: sheetMatch[1],
                rId: sheetMatch[2]
            });
        }

        let targetSheet;
        if (typeof sheetNameOrIndex === 'string') {
            targetSheet = sheets.find(sheet => sheet.name === sheetNameOrIndex);
            if (!targetSheet) {
                throw new Error(`Sheet "${sheetNameOrIndex}" not found`);
            }
        }
        else {
            if (sheetNameOrIndex < 1 || sheetNameOrIndex > sheets.length) {
                throw new Error(`Sheet index out of range: ${sheetNameOrIndex}`);
            }
            targetSheet = sheets[sheetNameOrIndex - 1];
        }

        const relsXml = new TextDecoder().decode(files['xl/_rels/workbook.xml.rels']);
        const relRegex = new RegExp(`<Relationship[^>]*Id="${targetSheet.rId}"[^>]*Target="([^"]*)"[^>]*\/>`);
        const relMatch = relRegex.exec(relsXml);
        if (!relMatch) {
            throw new Error(`Path for sheet "${targetSheet.name}" not found`);
        }
        const sheetPath = 'xl/' + relMatch[1];

        const sheetXml = new TextDecoder().decode(files[sheetPath]);

        let sharedStrings = [];
        if (files['xl/sharedStrings.xml']) {
            const ssXml = new TextDecoder().decode(files['xl/sharedStrings.xml']);
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

        const cellData = new Map();
        const cellRegex = /<c\s+r="([A-Z]+)(\d+)"(?:\s+[^>]*t="([^"]*)")?[^>]*>(?:<v>([^<]*)<\/v>)?<\/c>/g;
        let cellMatch;

        let maxRow = 0;
        const columnSet = new Set();

        while ((cellMatch = cellRegex.exec(sheetXml)) !== null) {
            const col = cellMatch[1];
            const row = parseInt(cellMatch[2], 10);
            const type = cellMatch[3] || '';
            const rawValue = cellMatch[4];

            columnSet.add(col);

            if (row > maxRow)
                maxRow = row;

            let value = null;
            if (rawValue !== undefined) {
                if (type === 's') {
                    const index = parseInt(rawValue, 10);
                    value = index >= 0 && index < sharedStrings.length ? sharedStrings[index] : null;
                }
                else if (type === 'b') {
                    value = rawValue === '1';
                }
                else if (type === 'n' || type === '') {
                    value = rawValue ? parseFloat(rawValue) : null;
                }
                else {
                    value = rawValue;
                }
            }

            if (!cellData.has(row)) {
                cellData.set(row, new Map());
            }
            cellData.get(row).set(col, value);
        }

        let maxCol = '';
        for (const col of columnSet) {
            if (!maxCol || col > maxCol) {
                maxCol = col;
            }
        }

        // 生成從A到maxCol的所有列名
        const allColumns = [];
        for (let c = 'A'.charCodeAt(0); c <= maxCol.charCodeAt(0); c++) {
            allColumns.push(String.fromCharCode(c));
        }

        const result = [];

        for (let row = 1; row <= maxRow; row++) {
            const rowData = [];
            const rowMap = cellData.get(row);

            for (const col of allColumns) {
                const value = rowMap ? rowMap.get(col) : null;
                rowData.push(value !== undefined ? value : null);
            }
            result.push(rowData);
        }

        return result;
    }
}