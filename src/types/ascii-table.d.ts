declare module 'ascii-table' {
  class AsciiTable {
    constructor(title?: string);
    setHeading(...args: string[]): this;
    addRow(...args: (string | number | boolean)[]): this;
    toString(): string;
    static factory(title?: string): AsciiTable;
  }
  export = AsciiTable;
}
