/**
 * exceljs 的最小类型声明（2026-10-28）。
 *
 * 背景：npm install 当前会因 node_modules/call-bind 被并发会话占用而
 * ENOTEMPTY 失败，`@types/exceljs` 装不上。这里只声明团队账号导出
 * 实际用到的那几个 API，够编译通过、也够类型安全。
 * 等 npm 恢复后可以直接 `npm i -D @types/exceljs` 并删掉本文件。
 */
declare module "exceljs" {
  export interface WorksheetColumn {
    header?: string;
    width?: number;
    key?: string;
    font?: Partial<Font>;
  }

  export interface Font {
    bold?: boolean;
    name?: string;
    size?: number;
  }

  export interface Alignment {
    vertical?: "top" | "middle" | "bottom";
    horizontal?: "left" | "center" | "right";
  }

  export interface WorksheetView {
    state?: "normal" | "frozen" | "split";
    ySplit?: number;
    xSplit?: number;
  }

  export type CellValue = string | number | boolean | Date | null;

  export class Row {
    values: CellValue[];
    font?: Partial<Font>;
    alignment?: Alignment;
  }

  export class Column {
    font?: Partial<Font>;
    width?: number;
  }

  export class Worksheet {
    columns: WorksheetColumn[];
    views: WorksheetView[];
    addRow(values: CellValue[]): Row;
    getRow(number: number): Row;
    getColumn(key: number | string): Column;
  }

  export class Workbook {
    creator?: string;
    created?: Date;
    addWorksheet(name?: string): Worksheet;
    getWorksheet(name: string): Worksheet | undefined;
    readonly xlsx: {
      writeBuffer(): Promise<Buffer>;
      writeFile(path: string): Promise<void>;
    };
    readonly csv: {
      writeBuffer(): Promise<Buffer>;
    };
  }
}
