import { CAMERA_PROFILE_MAGIC, TIFF_MAGIC, TIFF_TYPES, tagNameFromId } from "../core/schema.js";
import { clamp, normalizeKey } from "../core/utils.js";

const HALF_FLOAT_MIN_NORMAL = 0.00006103515625;

export function looksLikeBinaryDcp(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    if (bytes.length < 8) {
        return false;
    }

    const littleEndian = bytes[0] === 0x49 && bytes[1] === 0x49;
    const bigEndian = bytes[0] === 0x4D && bytes[1] === 0x4D;
    if (!littleEndian && !bigEndian) {
        return false;
    }

    const view = new DataView(arrayBuffer);
    const magic = view.getUint16(2, littleEndian);
    return magic === CAMERA_PROFILE_MAGIC || magic === TIFF_MAGIC;
}

export class BinaryDcpEntry {
    constructor(descriptor) {
        Object.assign(this, descriptor);
        this.key = descriptor.key;
        this.normalizedKey = normalizeKey(descriptor.key);
        this.patchedBytes = null;
        this.patchedCount = null;
    }

    getNumericValues() {
        return this.valueKind === "numbers" ? this.decodedValue.slice() : null;
    }

    setNumericValues(values) {
        if (this.valueKind !== "numbers") {
            return null;
        }

        this.patchedBytes = encodeNumericValues({
            typeId: this.typeId,
            count: this.count,
            values,
            byteLength: this.byteLength,
            littleEndian: this.littleEndian,
        });

        return values.reduce((changed, value, index) => (
            value !== this.decodedValue[index] ? changed + 1 : changed
        ), 0);
    }

    getGainMap() {
        return this.valueKind === "gain_map" ? cloneGainMap(this.decodedValue) : null;
    }

    setGainMap(gainMap) {
        if (this.valueKind !== "gain_map") {
            return null;
        }

        const encoded = encodeProfileGainMap(gainMap, this.littleEndian);
        if (encoded.byteLength !== this.byteLength) {
            return null;
        }

        this.patchedBytes = encoded;
        this.patchedCount = this.count;
        return countDifferentBytes(encoded, this.rawBytes);
    }

    setTextValue(text) {
        if (this.valueKind !== "text") {
            return null;
        }

        const encoded = encodeTextValue(this.typeId, text);
        this.patchedBytes = encoded;
        this.patchedCount = encoded.length;
        const changed = text === this.decodedValue ? 0 : 1;
        this.decodedValue = text;
        return changed;
    }

    getEncodedBytes() {
        if (this.patchedBytes) {
            return this.patchedBytes;
        }

        return this.inline
            ? this.inlineFieldBytes.slice()
            : this.rawBytes.slice();
    }

    getEncodedCount() {
        return this.patchedCount ?? this.count;
    }

    getEncodedByteLength() {
        return this.getEncodedBytes().length;
    }
}

export class BinaryDcpDocument {
    constructor({ arrayBuffer, littleEndian, magic, firstIfdOffset, ifdOffsets, entries }) {
        this.format = "binary";
        this.arrayBuffer = arrayBuffer;
        this.littleEndian = littleEndian;
        this.magic = magic;
        this.firstIfdOffset = firstIfdOffset;
        this.ifdOffsets = ifdOffsets;
        this.entries = entries;
        this.groupedEntries = groupEntries(entries);
    }

    static fromArrayBuffer(arrayBuffer) {
        if (!looksLikeBinaryDcp(arrayBuffer)) {
            throw new Error("File does not look like a binary DCP/TIFF camera profile.");
        }

        const view = new DataView(arrayBuffer);
        const littleEndian = view.getUint8(0) === 0x49;
        const magic = view.getUint16(2, littleEndian);
        const firstIfdOffset = view.getUint32(4, littleEndian);
        const { ifdOffsets, entries } = parseIfdChain(view, firstIfdOffset, littleEndian);

        return new BinaryDcpDocument({
            arrayBuffer,
            littleEndian,
            magic,
            firstIfdOffset,
            ifdOffsets,
            entries,
        });
    }

    findEntries(normalizedKey) {
        return this.groupedEntries.get(normalizedKey) || [];
    }

    serializeArrayBuffer() {
        if (this.entries.some((entry) => entry.patchedBytes && (
            entry.getEncodedByteLength() !== entry.byteLength ||
            entry.getEncodedCount() !== entry.count
        ))) {
            return appendPatchedValues(this);
        }

        const output = this.arrayBuffer.slice(0);
        const bytes = new Uint8Array(output);

        this.entries.forEach((entry) => {
            const patch = entry.patchedBytes;
            if (!patch) {
                return;
            }

            if (entry.inline) {
                bytes.fill(0, entry.inlineFieldOffset, entry.inlineFieldOffset + 4);
                bytes.set(patch, entry.inlineFieldOffset);
                return;
            }

            bytes.set(patch, entry.valueOffset);
        });

        return output;
    }

    toBlob() {
        return new Blob([this.serializeArrayBuffer()], { type: "application/octet-stream" });
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

function parseIfdChain(view, firstIfdOffset, littleEndian) {
    const ifdOffsets = [];
    const entries = [];
    const visited = new Set();
    let offset = firstIfdOffset;

    while (offset && !visited.has(offset)) {
        visited.add(offset);
        ifdOffsets.push(offset);
        const ifdIndex = ifdOffsets.length - 1;

        const entryCount = view.getUint16(offset, littleEndian);
        const tableStart = offset + 2;
        for (let index = 0; index < entryCount; index += 1) {
            const entryOffset = tableStart + (index * 12);
            entries.push(parseIfdEntry(view, entryOffset, littleEndian, ifdIndex));
        }

        offset = view.getUint32(tableStart + (entryCount * 12), littleEndian);
    }

    return { ifdOffsets, entries };
}

function parseIfdEntry(view, entryOffset, littleEndian, ifdIndex) {
    const tagId = view.getUint16(entryOffset, littleEndian);
    const typeId = view.getUint16(entryOffset + 2, littleEndian);
    const count = view.getUint32(entryOffset + 4, littleEndian);
    const typeInfo = TIFF_TYPES[typeId];

    if (!typeInfo) {
        throw new Error(`Unsupported TIFF field type ${typeId} for tag ${tagId}.`);
    }

    const byteLength = typeInfo.size * count;
    const inline = byteLength <= 4;
    const inlineFieldOffset = entryOffset + 8;
    const valueOffset = inline ? inlineFieldOffset : view.getUint32(entryOffset + 8, littleEndian);
    const valueBytes = new Uint8Array(view.buffer, valueOffset, byteLength);
    const rawBytes = new Uint8Array(byteLength);
    rawBytes.set(valueBytes);
    const inlineFieldBytes = new Uint8Array(4);
    inlineFieldBytes.set(new Uint8Array(view.buffer, inlineFieldOffset, 4));

    const key = tagNameFromId(tagId);
    const decoded = decodeEntryValue({
        key,
        tagId,
        typeId,
        count,
        rawBytes,
        littleEndian,
    });

    return new BinaryDcpEntry({
        key,
        tagId,
        typeId,
        count,
        entryOffset,
        byteLength,
        inline,
        inlineFieldOffset,
        inlineFieldBytes,
        valueOffset,
        rawBytes,
        littleEndian,
        ifdIndex,
        valueKind: decoded.kind,
        decodedValue: decoded.value,
    });
}

function decodeEntryValue({ key, tagId, typeId, count, rawBytes, littleEndian }) {
    if (typeId === 7) {
        if (tagId === 52525 || tagId === 52544) {
            const parsed = parseProfileGainMap(rawBytes, littleEndian, tagId === 52544 ? 2 : 1);
            return parsed ? { kind: "gain_map", value: parsed } : { kind: "bytes", value: rawBytes };
        }

        if (looksLikeUtf8Tag(key)) {
            return { kind: "text", value: decodeNullTerminated(rawBytes) };
        }

        return { kind: "bytes", value: rawBytes };
    }

    if (typeId === 2 || (typeId === 1 && looksLikeUtf8Tag(key))) {
        return { kind: "text", value: decodeNullTerminated(rawBytes) };
    }

    if (typeId === 1 && count === 16 && looksLikeDigestTag(key)) {
        return { kind: "bytes", value: rawBytes };
    }

    return {
        kind: "numbers",
        value: decodeNumericValues(rawBytes, typeId, count, littleEndian),
    };
}

function encodeTextValue(typeId, text) {
    const encodedText = new TextEncoder().encode(String(text));
    if (typeId === 2) {
        const output = new Uint8Array(encodedText.length + 1);
        output.set(encodedText, 0);
        output[output.length - 1] = 0;
        return output;
    }

    return encodedText;
}

function decodeNumericValues(rawBytes, typeId, count, littleEndian) {
    const view = new DataView(rawBytes.buffer, rawBytes.byteOffset, rawBytes.byteLength);
    const values = [];

    for (let index = 0; index < count; index += 1) {
        switch (typeId) {
            case 1:
                values.push(view.getUint8(index));
                break;
            case 3:
                values.push(view.getUint16(index * 2, littleEndian));
                break;
            case 4:
                values.push(view.getUint32(index * 4, littleEndian));
                break;
            case 5: {
                const numerator = view.getUint32(index * 8, littleEndian);
                const denominator = view.getUint32((index * 8) + 4, littleEndian);
                values.push(denominator === 0 ? 0 : numerator / denominator);
                break;
            }
            case 6:
                values.push(view.getInt8(index));
                break;
            case 8:
                values.push(view.getInt16(index * 2, littleEndian));
                break;
            case 9:
                values.push(view.getInt32(index * 4, littleEndian));
                break;
            case 10: {
                const numerator = view.getInt32(index * 8, littleEndian);
                const denominator = view.getInt32((index * 8) + 4, littleEndian);
                values.push(denominator === 0 ? 0 : numerator / denominator);
                break;
            }
            case 11:
                values.push(view.getFloat32(index * 4, littleEndian));
                break;
            case 12:
                values.push(view.getFloat64(index * 8, littleEndian));
                break;
            default:
                throw new Error(`Unsupported numeric TIFF type ${typeId}.`);
        }
    }

    return values;
}

function encodeNumericValues({ typeId, count, values, byteLength, littleEndian }) {
    if (values.length !== count) {
        throw new Error(`Expected ${count} values for TIFF type ${typeId}, got ${values.length}.`);
    }

    const output = new Uint8Array(byteLength);
    const view = new DataView(output.buffer);

    values.forEach((value, index) => {
        switch (typeId) {
            case 1:
                view.setUint8(index, clamp(Math.round(value), 0, 255));
                break;
            case 3:
                view.setUint16(index * 2, clamp(Math.round(value), 0, 0xFFFF), littleEndian);
                break;
            case 4:
                view.setUint32(index * 4, clamp(Math.round(value), 0, 0xFFFFFFFF), littleEndian);
                break;
            case 5: {
                const [numerator, denominator] = approximateRational(value, false);
                view.setUint32(index * 8, numerator, littleEndian);
                view.setUint32((index * 8) + 4, denominator, littleEndian);
                break;
            }
            case 6:
                view.setInt8(index, clamp(Math.round(value), -128, 127));
                break;
            case 8:
                view.setInt16(index * 2, clamp(Math.round(value), -0x8000, 0x7FFF), littleEndian);
                break;
            case 9:
                view.setInt32(index * 4, clamp(Math.round(value), -0x80000000, 0x7FFFFFFF), littleEndian);
                break;
            case 10: {
                const [numerator, denominator] = approximateRational(value, true);
                view.setInt32(index * 8, numerator, littleEndian);
                view.setInt32((index * 8) + 4, denominator, littleEndian);
                break;
            }
            case 11:
                view.setFloat32(index * 4, value, littleEndian);
                break;
            case 12:
                view.setFloat64(index * 8, value, littleEndian);
                break;
            default:
                throw new Error(`Unsupported numeric TIFF type ${typeId}.`);
        }
    });

    return output;
}

function approximateRational(value, signed, maxDenominator = 1000000) {
    if (!Number.isFinite(value)) {
        return [0, 1];
    }

    if (Number.isInteger(value)) {
        return [value, 1];
    }

    const sign = value < 0 ? -1 : 1;
    const scaled = Math.round(Math.abs(value) * maxDenominator);
    const divisor = greatestCommonDivisor(scaled, maxDenominator);
    const numerator = (scaled / divisor) * sign;
    const denominator = maxDenominator / divisor;
    return signed ? [numerator, denominator] : [Math.abs(numerator), denominator];
}

function decodeNullTerminated(rawBytes) {
    let end = rawBytes.length;
    while (end > 0 && rawBytes[end - 1] === 0) {
        end -= 1;
    }
    return new TextDecoder("utf-8").decode(rawBytes.slice(0, end));
}

function looksLikeUtf8Tag(key) {
    return /copyright|name|model|serial|signature|datetime|group/u.test(key.toLowerCase());
}

function looksLikeDigestTag(key) {
    return /digest/u.test(key.toLowerCase());
}

function parseProfileGainMap(rawBytes, littleEndian, version) {
    const view = new DataView(rawBytes.buffer, rawBytes.byteOffset, rawBytes.byteLength);

    const mapPointsV = view.getUint32(0, littleEndian);
    const mapPointsH = view.getUint32(4, littleEndian);
    const mapSpacingV = view.getFloat64(8, littleEndian);
    const mapSpacingH = view.getFloat64(16, littleEndian);
    const mapOriginV = view.getFloat64(24, littleEndian);
    const mapOriginH = view.getFloat64(32, littleEndian);
    const mapPointsN = view.getUint32(40, littleEndian);
    const mapInputWeights = Array.from({ length: 5 }, (_, index) => view.getFloat32(44 + (index * 4), littleEndian));

    const headerBytes = version === 2 ? 80 : 64;
    if (rawBytes.length < headerBytes) {
        return null;
    }

    let dataType = 3;
    let gamma = 1;
    let gainMin = 0;
    let gainMax = 0;
    let dataOffset = 64;

    if (version === 2) {
        dataType = view.getUint32(64, littleEndian);
        gamma = view.getFloat32(68, littleEndian);
        gainMin = view.getFloat32(72, littleEndian);
        gainMax = view.getFloat32(76, littleEndian);
        dataOffset = 80;
    }

    const dataCount = mapPointsV * mapPointsH * mapPointsN;
    const data = [];
    let cursor = dataOffset;

    for (let index = 0; index < dataCount; index += 1) {
        switch (dataType) {
            case 0: {
                const raw = view.getUint8(cursor);
                cursor += 1;
                data.push(gainMin + (raw / 255) * (gainMax - gainMin));
                break;
            }
            case 1: {
                const raw = view.getUint16(cursor, littleEndian);
                cursor += 2;
                data.push(gainMin + (raw / 65535) * (gainMax - gainMin));
                break;
            }
            case 2:
                data.push(decodeHalfFloat(view.getUint16(cursor, littleEndian)));
                cursor += 2;
                break;
            case 3:
                data.push(view.getFloat32(cursor, littleEndian));
                cursor += 4;
                break;
            default:
                return null;
        }
    }

    return {
        version,
        mapPointsV,
        mapPointsH,
        mapSpacingV,
        mapSpacingH,
        mapOriginV,
        mapOriginH,
        mapPointsN,
        mapInputWeights,
        dataType,
        gamma,
        gainMin,
        gainMax,
        data,
    };
}

function encodeProfileGainMap(gainMap, littleEndian) {
    const version = gainMap.version || 1;
    const headerBytes = version === 2 ? 80 : 64;
    const bytesPerValue = (
        version === 1 ? 4
            : gainMap.dataType === 0 ? 1
                : gainMap.dataType === 1 || gainMap.dataType === 2 ? 2
                    : 4
    );
    const dataCount = gainMap.mapPointsV * gainMap.mapPointsH * gainMap.mapPointsN;
    const output = new Uint8Array(headerBytes + (dataCount * bytesPerValue));
    const view = new DataView(output.buffer);

    view.setUint32(0, gainMap.mapPointsV, littleEndian);
    view.setUint32(4, gainMap.mapPointsH, littleEndian);
    view.setFloat64(8, gainMap.mapSpacingV, littleEndian);
    view.setFloat64(16, gainMap.mapSpacingH, littleEndian);
    view.setFloat64(24, gainMap.mapOriginV, littleEndian);
    view.setFloat64(32, gainMap.mapOriginH, littleEndian);
    view.setUint32(40, gainMap.mapPointsN, littleEndian);
    gainMap.mapInputWeights.forEach((value, index) => {
        view.setFloat32(44 + (index * 4), value, littleEndian);
    });

    let cursor = 64;
    if (version === 2) {
        view.setUint32(64, gainMap.dataType, littleEndian);
        view.setFloat32(68, gainMap.gamma, littleEndian);
        view.setFloat32(72, gainMap.gainMin, littleEndian);
        view.setFloat32(76, gainMap.gainMax, littleEndian);
        cursor = 80;
    }

    gainMap.data.forEach((value) => {
        switch (version === 1 ? 3 : gainMap.dataType) {
            case 0: {
                const normalized = (value - gainMap.gainMin) / (gainMap.gainMax - gainMap.gainMin || 1);
                view.setUint8(cursor, clamp(Math.round(normalized * 255), 0, 255));
                cursor += 1;
                break;
            }
            case 1: {
                const normalized = (value - gainMap.gainMin) / (gainMap.gainMax - gainMap.gainMin || 1);
                view.setUint16(cursor, clamp(Math.round(normalized * 65535), 0, 65535), littleEndian);
                cursor += 2;
                break;
            }
            case 2:
                view.setUint16(cursor, encodeHalfFloat(value), littleEndian);
                cursor += 2;
                break;
            case 3:
                view.setFloat32(cursor, value, littleEndian);
                cursor += 4;
                break;
            default:
                throw new Error(`Unsupported ProfileGainTableMap data type ${gainMap.dataType}.`);
        }
    });

    return output;
}

function decodeHalfFloat(bits) {
    const sign = (bits & 0x8000) ? -1 : 1;
    const exponent = (bits >> 10) & 0x1F;
    const mantissa = bits & 0x03FF;

    if (exponent === 0) {
        if (mantissa === 0) {
            return sign * 0;
        }
        return sign * (mantissa / 1024) * HALF_FLOAT_MIN_NORMAL;
    }

    if (exponent === 0x1F) {
        return mantissa === 0 ? sign * Infinity : NaN;
    }

    return sign * (1 + (mantissa / 1024)) * (2 ** (exponent - 15));
}

function encodeHalfFloat(value) {
    if (!Number.isFinite(value)) {
        return value < 0 ? 0xFC00 : 0x7C00;
    }

    const sign = value < 0 ? 0x8000 : 0;
    const absValue = Math.abs(value);

    if (absValue === 0) {
        return sign;
    }

    if (absValue < HALF_FLOAT_MIN_NORMAL) {
        const mantissa = Math.round((absValue / HALF_FLOAT_MIN_NORMAL) * 1024);
        return sign | clamp(mantissa, 0, 0x03FF);
    }

    const exponent = Math.floor(Math.log2(absValue));
    const normalized = absValue / (2 ** exponent);
    const halfExponent = exponent + 15;
    if (halfExponent >= 0x1F) {
        return sign | 0x7C00;
    }

    const mantissa = Math.round((normalized - 1) * 1024);
    return sign | (halfExponent << 10) | clamp(mantissa, 0, 0x03FF);
}

function cloneGainMap(gainMap) {
    return {
        ...gainMap,
        mapInputWeights: gainMap.mapInputWeights.slice(),
        data: gainMap.data.slice(),
    };
}

function countDifferentBytes(left, right) {
    let changed = 0;
    const limit = Math.min(left.length, right.length);
    for (let index = 0; index < limit; index += 1) {
        if (left[index] !== right[index]) {
            changed += 1;
        }
    }
    return changed;
}

function greatestCommonDivisor(a, b) {
    let left = Math.abs(a);
    let right = Math.abs(b);
    while (right) {
        [left, right] = [right, left % right];
    }
    return left || 1;
}

function alignEven(value) {
    return value + (value % 2);
}

function appendPatchedValues(document) {
    const variableEntries = document.entries.filter((entry) => entry.patchedBytes && (
        entry.getEncodedByteLength() !== entry.byteLength ||
        entry.getEncodedCount() !== entry.count
    ));
    let cursor = document.arrayBuffer.byteLength;
    const appendOffsets = new Map();

    variableEntries.forEach((entry) => {
        if (entry.getEncodedByteLength() <= 4) {
            appendOffsets.set(entry, null);
            return;
        }

        const offset = alignEven(cursor);
        appendOffsets.set(entry, offset);
        cursor = offset + entry.getEncodedByteLength();
    });

    const output = new Uint8Array(cursor);
    output.set(new Uint8Array(document.arrayBuffer), 0);
    const view = new DataView(output.buffer);

    document.entries.forEach((entry) => {
        const patch = entry.patchedBytes;
        if (!patch) {
            return;
        }

        view.setUint32(entry.entryOffset + 4, entry.getEncodedCount(), document.littleEndian);

        if (entry.getEncodedByteLength() <= 4) {
            output.fill(0, entry.inlineFieldOffset, entry.inlineFieldOffset + 4);
            output.set(patch, entry.inlineFieldOffset);
            return;
        }

        const offset = appendOffsets.has(entry) ? appendOffsets.get(entry) : entry.valueOffset;
        view.setUint32(entry.entryOffset + 8, offset, document.littleEndian);
        output.set(patch, offset);
    });

    return output.buffer;
}

function rebuildArrayBuffer(document) {
    const groups = groupEntriesByIfd(document.entries);
    const tableSizes = groups.map((entries) => 2 + (entries.length * 12) + 4);
    const tableOffsets = [];
    let cursor = document.firstIfdOffset;

    tableSizes.forEach((size) => {
        tableOffsets.push(cursor);
        cursor += size;
    });

    const payloads = [];
    groups.forEach((entries, ifdIndex) => {
        entries.forEach((entry) => {
            const bytes = entry.getEncodedBytes();
            const size = bytes.length;
            const payload = {
                entry,
                ifdIndex,
                bytes,
                count: entry.getEncodedCount(),
                size,
                offset: size <= 4 ? null : alignEven(cursor),
            };
            if (payload.offset !== null) {
                cursor = payload.offset + size;
            }
            payloads.push(payload);
        });
    });

    const output = new Uint8Array(cursor);
    const prefixBytes = new Uint8Array(document.arrayBuffer, 0, document.firstIfdOffset);
    output.set(prefixBytes, 0);
    const view = new DataView(output.buffer);

    groups.forEach((entries, ifdIndex) => {
        const ifdOffset = tableOffsets[ifdIndex];
        const nextIfdOffset = ifdIndex + 1 < tableOffsets.length ? tableOffsets[ifdIndex + 1] : 0;
        view.setUint16(ifdOffset, entries.length, document.littleEndian);

        entries.forEach((entry, entryIndex) => {
            const descriptor = payloads.find((item) => item.entry === entry);
            const entryOffset = ifdOffset + 2 + (entryIndex * 12);
            view.setUint16(entryOffset, entry.tagId, document.littleEndian);
            view.setUint16(entryOffset + 2, entry.typeId, document.littleEndian);
            view.setUint32(entryOffset + 4, descriptor.count, document.littleEndian);

            if (descriptor.size <= 4) {
                output.fill(0, entryOffset + 8, entryOffset + 12);
                output.set(descriptor.bytes, entryOffset + 8);
            } else {
                view.setUint32(entryOffset + 8, descriptor.offset, document.littleEndian);
                output.set(descriptor.bytes, descriptor.offset);
            }
        });

        view.setUint32(ifdOffset + 2 + (entries.length * 12), nextIfdOffset, document.littleEndian);
    });

    return output.buffer;
}

function groupEntriesByIfd(entries) {
    const groups = [];

    entries.forEach((entry) => {
        const index = entry.ifdIndex || 0;
        if (!groups[index]) {
            groups[index] = [];
        }
        groups[index].push(entry);
    });

    return groups;
}
