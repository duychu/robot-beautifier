'use strict';

import { CancellationToken, DocumentFormattingEditProvider, FormattingOptions, Range, TextDocument, TextEdit } from 'vscode';

/* eslint-disable @typescript-eslint/naming-convention */
enum Type {
    Resource = 0,
    Body,
    Name,
    Comment,
    Empty,
    For,
    Keyword,
    Undefined
}
/* eslint-enable @typescript-eslint/naming-convention */

/* eslint-disable @typescript-eslint/naming-convention */
enum SectionType {
    Settings = 0,
    Comments,
    Variables,
    TestCases,
    Keywords,
    Undefined
};
/* eslint-enable @typescript-eslint/naming-convention */

type SectionRange = {
    start: number,
    stop: number
};

type SectionNoFormat = {
    lines: number[]
};

type SectionDocument = {
    type: SectionType,
    range: SectionRange,
    noFormat: SectionNoFormat
};

function multiplyString(base: string, times: number): string {
    let result = '';
    for (let i = 0; i < times; i++) {
        result += base;
    }
    return result;
}

function getEmptyArrayOfString(length: number): string[] {
    let str = new Array(length);
    for (let i = 0; i < length; i++) {
        str[i] = "";
    }
    return str;
}

function documentEditor(ranges: Range[], newStr: string[]): TextEdit[] {
    let editor: TextEdit[] = [];
    for (let i = 0; i < newStr.length; i++) {
        editor.push(new TextEdit(ranges[i], newStr[i]));
    }
    return editor;
}
export class RobotFormatProvider implements DocumentFormattingEditProvider {

    public provideDocumentFormattingEdits(document: TextDocument, options: FormattingOptions, token: CancellationToken): Thenable<TextEdit[]> | TextEdit[] {
        let ranges = RobotFormatProvider.getAllLineRange(document);
        let sections = RobotFormatProvider.splitDocumentToSections(document);
        let formatted = RobotFormatProvider.groupFormat(document, sections);
        return documentEditor(ranges, formatted);
    }

    private static getAllLineRange(document: TextDocument): Range[] {
        let ranges: Range[] = [];
        for (let i = 0; i < document.lineCount; i++) {
            let range = document.lineAt(i).range;
            ranges.push(range);
        }
        return ranges;
    }

    //Split Section
    private static splitDocumentToSections(document: TextDocument): SectionDocument[] {
        let noFormatFlag: boolean = false;
        let sections: SectionDocument[] = [];

        for (let i = 0; i < document.lineCount; i++) {
            let type: SectionType = SectionType.Undefined;
            let isNewSection: boolean = false;
            const line = document.lineAt(i).text;

            if (sections.length === 0) {
                isNewSection = true;
                type = SectionType.Undefined;
            } else if (/^(\*+)(\s+)?(Settings|Setting)(\s+)?(\*+)/.test(line)) {
                isNewSection = true;
                type = SectionType.Settings;
            } else if (/^(\*+)(\s+)?(Comments|Comment)(\s+)?(\*+)/.test(line)) {
                isNewSection = true;
                type = SectionType.Comments;
            } else if (/^(\*+)(\s+)?(Variables|Variable)(\s+)?(\*+)/.test(line)) {
                isNewSection = true;
                type = SectionType.Variables;
            } else if (/^(\*+)(\s+)?(Test Cases|TestCase|Test Case)(\s+)?(\*+)/.test(line)) {
                isNewSection = true;
                type = SectionType.TestCases;
            } else if (/^(\*+)(\s+)?(Keywords|Keyword)(\s+)?(\*+)/.test(line)) {
                isNewSection = true;
                type = SectionType.Keywords;
            }

            if (isNewSection) {
                noFormatFlag = false;
            }

            if ((/^(\s+)?#(\s+)?fmt: off/).test(line)) {
                noFormatFlag = true;
            } else if ((/^(\s+)?#(\s+)?fmt: on/).test(line)) {
                noFormatFlag = false;
            }

            if (isNewSection) {
                let currentSection: SectionDocument = {
                    type: type,
                    range: {
                        start: i,
                        stop: i
                    },
                    noFormat: {
                        lines: []
                    }
                };
                sections.push(currentSection);
            } else {
                sections[sections.length - 1].range.stop = i;
                if (noFormatFlag === true) {
                    sections[sections.length - 1].noFormat.lines.push(i);
                }
            }

        }
        return sections;
    }

    /**
     * 
     * @param lineIndex current line read from document
     * @param sections sections dectection
     * @returns true if this line is formatable, (e.g. not in Comments Section)
     */
    private static isFormatable(lineIndex: number, sections: SectionDocument[]): boolean {
        for (let index = 0; index < sections.length; index++) {
            // if it is comment
            if (sections[index].type === SectionType.Comments) {
                if (sections[index].range.start <= lineIndex && sections[index].range.stop >= lineIndex) {
                    return false;
                }
            }
            // or it is wrapped by fmt: off/on block
            else {
                if (sections[index].noFormat.lines.indexOf(lineIndex) !== -1) {
                    return false;
                }
            }
        }
        return true;
    }

    //Group format
    private static groupFormat(document: TextDocument, sections: SectionDocument[]): string[] {
        const lines = new Array(document.lineCount + 1);
        for (let i = 0; i < document.lineCount; i++) {
            lines[i] = document.lineAt(i).text;
        }
        lines[lines.length - 1] = '';

        let lastType = Type.Undefined;
        let bucket: number[] = [];
        for (let i = 0; i < lines.length; i++) {
            if (RobotFormatProvider.isFormatable(i, sections) === false) {
                continue;
            }
            let line = lines[i].replace(/\s+$/, '');
            const type = RobotFormatProvider.getLineType(line);
            if (type === Type.Name || type === Type.Empty || type === Type.For) {
                if (bucket.length > 0) {
                    const columns = RobotFormatProvider.identifyBucketColumns(bucket, lines);
                    RobotFormatProvider.formatBucket(bucket, columns, lines);
                }

                lines[i] = line.split(/\s{2,}/).join('    ');
                bucket = [];
            } else if (type === Type.Comment) {
                lines[i] = line;
            } else {
                bucket.push(i);
            }
            if (type !== Type.Comment) {
                lastType = type;
            }
        }

        lines.splice(lines.length - 1);
        return lines;
    }

    private static identifyBucketColumns(bucket: number[], lines: string[]): number[] {
        let columns = [];

        for (var index of bucket) {
            let line = lines[index];
            let arr = line.split(/\s{2,}/);
            for (let i = columns.length; i < arr.length; i++) {
                columns.push(0);
            }
            for (let i = 0; i < arr.length; i++) {
                columns[i] = columns[i] < arr[i].length
                    ? arr[i].length
                    : columns[i];
            }
        }
        return columns;
    }

    private static formatBucket(bucket: number[], columns: number[], lines: string[]) {
        for (let index of bucket) {
            lines[index] = RobotFormatProvider.formatLine(lines[index], columns);
        }
    }

    private static formatLine(line: string, columns: number[]): string {
        let arr = line.split(/\s{2,}/);

        for (let i = 0; i < arr.length; i++) {

            arr[i] = arr[i] + (i === arr.length - 1
                ? ''
                : multiplyString(' ', columns[i] - arr[i].length));
        }
        return arr.join('    ');
    }

    private static getLineType(line: string): Type {
        let l = line.replace(/\s+$/, "");
        if (/^\S+/.test(l)) {
            if (l.replace(/^\\\s+/, "\\ ").split(/\s{2,}/).length > 1) {
                return Type.Resource;
            } else {
                return Type.Name;
            }
        }
        if (l.length === 0) {
            return Type.Empty;
        }
        if (/^\s*#/.test(l)) {
            return Type.Comment;
        }
        if (/^\s*:/.test(l)) {
            return Type.For;
        }
        // if (/^\s+\[.*?\]/.test(l)) {     return Type.Keyword; }
        return Type.Body;
    }

    // End group format



    // Begin All file format
    private static getFormattedLines(document: TextDocument): string[] {
        let formatted: string[] = getEmptyArrayOfString(document.lineCount);
        let formatCode: number[] = [];
        let temp: string[] = [];
        for (let i = 0; i < document.lineCount; i++) {
            let line = document.lineAt(i).text;
            temp.push(line.replace(/\s+$/, ""));
            if (/^\S+/.test(line)) {
                if (line.replace(/\s+$/, "").replace(/^\\\s+/, "\\ ").split(/\s{2,}/).length > 1) {
                    formatCode.push(0);
                }
                else {
                    formatCode.push(2);
                }
            }
            else if (/^\s*$/.test(line)) {
                formatCode.push(4);
            }
            else if (/^\s*#/.test(line)) {
                formatCode.push(2);
            }
            else if (/^\s*:/.test(line)) {
                formatCode.push(3);
            }
            else {
                formatCode.push(1);
            }
        }
        let lengthGuide: number[][] = RobotFormatProvider.getLengthGuide(temp, formatCode);
        for (let i = 0; i < temp.length; i++) {
            let line = temp[i];
            if (formatCode[i] === 0 || formatCode[i] === 1) {
                let sentences: string[];
                let guide = formatCode[i];
                if (formatCode[i] === 1) {
                    formatted[i] = "    ";
                    sentences = line.replace(/^\s+/, "").replace(/^\\\s+/, "\\ ").split(/\s{2,}/);
                }
                else {
                    sentences = line.split(/\s{2,}/);
                }
                for (let j = 0; j < sentences.length; j++) {
                    let sentence = sentences[j].replace(/\\\s/, "\\    ");
                    while (sentence.length < lengthGuide[guide][j] && j < sentences.length - 1) {
                        sentence = sentence + " ";
                    }
                    formatted[i] = formatted[i] + sentence;
                }
            }
            else if (formatCode[i] === 2) {
                formatted[i] = line;
            }
            else if (formatCode[i] === 3) {
                let sentences = line.replace(/^\s+/, "").split(/\s{2,}/);
                formatted[i] = "    ";
                for (let j = 0; j < sentences.length; j++) {
                    let sentence = sentences[j];
                    formatted[i] = formatted[i] + sentence;
                    if (j < sentences.length - 1) {
                        formatted[i] = formatted[i] + "  ";
                    }
                }
            }
        }
        return formatted;
    }

    private static getLengthGuide(lines: string[], formatCode: number[]): number[][] {
        let guides: number[][] = [];
        guides.push([]);
        guides.push([]);
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];
            if (formatCode[i] === 0 || formatCode[i] === 1) {
                let sentences: string[];
                let code = formatCode[i];
                if (code === 1) {
                    sentences = line.replace(/^\s+/, "").replace(/^\\\s+/, "\\ ").split(/\s{2,}/);
                }
                else {
                    sentences = line.split(/\s{2,}/);
                }
                for (let j = 0; j < sentences.length; j++) {
                    let sentence = sentences[j].replace(/^\\\s/, "\\    ");
                    if (j === sentences.length - 1 && /^#/.test(sentence)) {
                        break;
                    }
                    if (guides[code].length === j) {
                        guides[code].push(sentence.length + 4);
                    }
                    else if (guides[code][j] < sentence.length + 4) {
                        guides[code][j] = sentence.length + 4;
                    }
                }
            }
        }
        return guides;
    }

    // End All code format

}