import { formatNumber, normalizeKey } from "../core/utils.js";

const NUMBER_PATTERN = /[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g;
const INLINE_XML_LINE_PATTERN = /^([ \t]*)<([A-Za-z_][\w:.-]*)(?:\s[^>]*)?>([^<>]+)<\/\2>\s*$/u;
const LINE_VALUE_PATTERN = /^([ \t]*)([A-Za-z_][\w:.-]*)([ \t]*[:=][ \t]*)(.+)$/u;

function extractNumbers(text) {
    const numbers = [];

    for (const match of text.matchAll(NUMBER_PATTERN)) {
        numbers.push({
            raw: match[0],
            value: Number(match[0]),
            start: match.index,
            end: match.index + match[0].length,
        });
    }

    return numbers;
}

function collectLines(text) {
    const lines = [];
    const newlinePattern = /\r?\n/gu;
    let start = 0;
    let match;

    while ((match = newlinePattern.exec(text))) {
        lines.push({
            start,
            text: text.slice(start, match.index),
        });
        start = match.index + match[0].length;
    }

    lines.push({
        start,
        text: text.slice(start),
    });

    return lines;
}

export class TextDcpEntry {
    constructor({ key, rawValue, numbers, valueStart, valueEnd }) {
        this.key = key;
        this.normalizedKey = normalizeKey(key);
        this.rawValue = rawValue;
        this.numbers = numbers;
        this.valueStart = valueStart;
        this.valueEnd = valueEnd;
        this.replacementValue = null;
    }

    getNumericValues() {
        return this.numbers.map((token) => token.value);
    }

    getGainMap() {
        return parseFlatGainMap(this.getNumericValues());
    }

    setNumericValues(values, sampleSets = []) {
        let cursor = 0;
        let changed = 0;
        let output = "";

        this.numbers.forEach((token, index) => {
            const prefix = this.rawValue.slice(cursor, token.start);
            const formatted = formatNumber(values[index], [
                token.raw,
                ...(sampleSets[index] || []),
            ]);

            if (formatted !== token.raw) {
                changed += 1;
            }

            output += prefix + formatted;
            cursor = token.end;
        });

        output += this.rawValue.slice(cursor);
        this.replacementValue = output;
        return changed;
    }

    setGainMap(gainMap, sampleSets = []) {
        const flat = flattenGainMap(gainMap);
        if (!flat) {
            return null;
        }
        return this.setNumericValues(flat, sampleSets);
    }

    setRawValue(rawValue) {
        this.replacementValue = rawValue;
        return rawValue === this.rawValue ? 0 : 1;
    }

    getSerializedValue() {
        return this.replacementValue ?? this.rawValue;
    }
}

export class TextDcpDocument {
    constructor(text, entries) {
        this.format = "text";
        this.text = text;
        this.entries = entries;
        this.groupedEntries = groupEntries(entries);
    }

    static fromArrayBuffer(arrayBuffer) {
        const text = new TextDecoder("utf-8").decode(arrayBuffer);
        const entries = parseTextEntries(text);
        return new TextDcpDocument(text, entries);
    }

    findEntries(normalizedKey) {
        return this.groupedEntries.get(normalizedKey) || [];
    }

    serialize() {
        const replacements = this.entries
            .filter((entry) => entry.replacementValue !== null)
            .map((entry) => ({
                start: entry.valueStart,
                end: entry.valueEnd,
                value: entry.getSerializedValue(),
            }))
            .sort((left, right) => left.start - right.start);

        if (replacements.length === 0) {
            return this.text;
        }

        let cursor = 0;
        let output = "";

        replacements.forEach((replacement) => {
            output += this.text.slice(cursor, replacement.start);
            output += replacement.value;
            cursor = replacement.end;
        });

        output += this.text.slice(cursor);
        return output;
    }

    toBlob() {
        return new Blob([this.serialize()], { type: "text/plain" });
    }
}

function groupEntries(entries) {
    const groups = new Map();

    entries.forEach((entry) => {
        const bucket = groups.get(entry.normalizedKey) || [];
        bucket.push(entry);
        groups.set(entry.normalizedKey, bucket);
    });

    return groups;
}

function parseXmlEntries(text) {
    const entries = [];

    collectLines(text).forEach((lineInfo) => {
        const match = lineInfo.text.match(INLINE_XML_LINE_PATTERN);
        if (!match) {
            return;
        }

        const key = match[2];
        const rawValue = match[3];
        const numbers = extractNumbers(rawValue);
        if (numbers.length === 0) {
            return;
        }

        const valueOffset = lineInfo.text.indexOf(rawValue);
        entries.push(new TextDcpEntry({
            key,
            rawValue,
            numbers,
            valueStart: lineInfo.start + valueOffset,
            valueEnd: lineInfo.start + valueOffset + rawValue.length,
        }));
    });

    return entries;
}

function parseLineEntries(text, blockedRanges) {
    const entries = [];

    collectLines(text).forEach((lineInfo) => {
        const match = lineInfo.text.match(LINE_VALUE_PATTERN);
        if (!match) {
            return;
        }

        const key = match[2];
        const rawValue = match[4];
        const valueOffset = lineInfo.text.indexOf(rawValue);
        const valueStart = lineInfo.start + valueOffset;
        const valueEnd = valueStart + rawValue.length;
        const overlapsXml = blockedRanges.some((range) => valueStart >= range.start && valueEnd <= range.end);
        if (overlapsXml) {
            return;
        }

        const numbers = extractNumbers(rawValue);
        if (numbers.length === 0) {
            return;
        }

        entries.push(new TextDcpEntry({
            key,
            rawValue,
            numbers,
            valueStart,
            valueEnd,
        }));
    });

    return entries;
}

function parseTextEntries(text) {
    const xmlEntries = parseXmlEntries(text);
    const blockedRanges = xmlEntries.map((entry) => ({
        start: entry.valueStart,
        end: entry.valueEnd,
    }));
    const lineEntries = parseLineEntries(text, blockedRanges);
    return [...xmlEntries, ...lineEntries].sort((left, right) => left.valueStart - right.valueStart);
}

function parseFlatGainMap(values) {
    if (!values || values.length < 14) {
        return null;
    }

    const mapPointsV = Math.round(values[0]);
    const mapPointsH = Math.round(values[1]);
    const mapSpacingV = values[2];
    const mapSpacingH = values[3];
    const mapOriginV = values[4];
    const mapOriginH = values[5];
    const mapPointsN = Math.round(values[6]);
    const dataCount = mapPointsV * mapPointsH * mapPointsN;

    if (values.length === 12 + dataCount) {
        return {
            version: 1,
            mapPointsV,
            mapPointsH,
            mapSpacingV,
            mapSpacingH,
            mapOriginV,
            mapOriginH,
            mapPointsN,
            mapInputWeights: values.slice(7, 12),
            dataType: 3,
            gamma: 1,
            gainMin: 0,
            gainMax: 0,
            data: values.slice(12),
        };
    }

    if (values.length === 16 + dataCount) {
        return {
            version: 2,
            mapPointsV,
            mapPointsH,
            mapSpacingV,
            mapSpacingH,
            mapOriginV,
            mapOriginH,
            mapPointsN,
            mapInputWeights: values.slice(7, 12),
            dataType: Math.round(values[12]),
            gamma: values[13],
            gainMin: values[14],
            gainMax: values[15],
            data: values.slice(16),
        };
    }

    return null;
}

function flattenGainMap(gainMap) {
    if (!gainMap) {
        return null;
    }

    const header = [
        gainMap.mapPointsV,
        gainMap.mapPointsH,
        gainMap.mapSpacingV,
        gainMap.mapSpacingH,
        gainMap.mapOriginV,
        gainMap.mapOriginH,
        gainMap.mapPointsN,
        ...gainMap.mapInputWeights,
    ];

    if (gainMap.version === 2) {
        header.push(gainMap.dataType, gainMap.gamma, gainMap.gainMin, gainMap.gainMax);
    }

    return [...header, ...gainMap.data];
}
