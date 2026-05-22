import assert from "node:assert/strict";

import { CAMERA_PROFILE_MAGIC } from "../js/dcp/core/schema.js";
import { parseDcpDocument } from "../js/dcp/formats/document-factory.js";
import { createOffsetReport } from "../js/dcp/transform/offset-engine.js";

const encoder = new TextEncoder();
const LITTLE_ENDIAN = true;

runTextFixture();
runBinaryFixture();

console.log("ok");

function runTextFixture() {
    const baseDocument = createTextDocument({
        colorMatrix: [1, 0, 0, 0, 1, 0, 0, 0, 1],
        whitePoint: [0.3127, 0.329],
        toneCurve: [0, 0, 0.5, 0.5, 1, 1],
        hueSatMap: [0, 1, 1, 0, 1, 1],
        hueSatMap3: [0, 1, 1, 0, 1, 1],
        lookTable: [0, 1, 1, 0, 1, 1],
        baselineExposure: 0.1,
        gainMap: [1, 1.2],
        hueSatEncoding: 0,
        lookEncoding: 0,
        copyright: "Keep Base",
    });

    const styleDocument = createTextDocument({
        colorMatrix: [2, 0, 0, 0, 2, 0, 0, 0, 2],
        whitePoint: [0.34567, 0.3585],
        toneCurve: [0, 0, 0.5, 0.7, 1, 1],
        hueSatMap: [15, 1.2, 0.8, -10, 0.9, 1.1],
        hueSatMap3: [25, 1.15, 0.85, -4, 0.95, 1.08],
        lookTable: [8, 1.1, 0.9, -6, 1.05, 1.2],
        baselineExposure: 0.3,
        gainMap: [1.26, 1.333333],
        hueSatEncoding: 1,
        lookEncoding: 1,
        copyright: "Keep Style",
    });

    const targetDocument = createTextDocument({
        colorMatrix: [1, 0, 0, 0, 1, 0, 0, 0, 1],
        whitePoint: [0.3127, 0.329],
        toneCurve: [0, 0, 0.5, 0.5, 1, 1],
        hueSatMap: [0, 1, 1, 0, 1, 1],
        hueSatMap3: [0, 1, 1, 0, 1, 1],
        lookTable: [0, 1, 1, 0, 1, 1],
        baselineExposure: 0.1,
        gainMap: [1, 1.2],
        hueSatEncoding: 0,
        lookEncoding: 0,
        copyright: "Keep Target",
    });

    const baseDoc = parseDcpDocument(encoder.encode(baseDocument).buffer);
    const styleDoc = parseDcpDocument(encoder.encode(styleDocument).buffer);
    const targetDoc = parseDcpDocument(encoder.encode(targetDocument).buffer);
    const report = createOffsetReport(baseDoc, styleDoc, targetDoc);
    const output = report.outputDocument.serialize();

    assert.equal(report.summary.skippedMismatchCount, 0);
    assert.equal(report.summary.pixelEntryCount > 0, true);
    assert.equal(report.summary.changedTagCount > 0, true);
    assert.match(report.summary.changedKeys.join(","), /ProfileHueSatMapData3/u);
    assert.match(output, /ColorMatrix1 = 2 0 0 0 2 0 0 0 2/u);
    assert.match(output, /<AsShotWhiteXY>0\.34567 0\.3585<\/AsShotWhiteXY>/u);
    assert.match(output, /ProfileToneCurve = 0 0 0\.5 0\.7 1 1/u);
    assert.match(output, /ProfileHueSatMapData1 = 15 1\.2 0\.8 -10 0\.9 1\.1/u);
    assert.match(output, /ProfileHueSatMapData3 = 25 1\.15 0\.85 -4 0\.95 1\.08/u);
    assert.match(output, /ProfileLookTableEncoding = 1/u);
    assert.match(output, /ProfileGainTableMap = 1 1 1 1 0 0 2 0\.333333 0\.333333 0\.333333 0 0 1\.26 1\.333333/u);
    assert.match(output, /ProfileCopyright = Keep Target/u);
}

function runBinaryFixture() {
    const baseBuffer = buildBinaryProfile({
        colorMatrix: [1, 0, 0, 0, 1, 0, 0, 0, 1],
        whitePoint: [0.3127, 0.329],
        toneCurve: [0, 0, 0.5, 0.5, 1, 1],
        hueSatMap: [0, 1, 1, 0, 1, 1],
        hueSatMap3: [0, 1, 1, 0, 1, 1],
        lookTable: [0, 1, 1, 0, 1, 1],
        baselineExposure: 0.1,
        gainMap: [1, 1.2],
        hueSatEncoding: 0,
        lookEncoding: 0,
        copyright: "Keep Base",
    });

    const styleBuffer = buildBinaryProfile({
        colorMatrix: [2, 0, 0, 0, 2, 0, 0, 0, 2],
        whitePoint: [0.34567, 0.3585],
        toneCurve: [0, 0, 0.5, 0.7, 1, 1],
        hueSatMap: [15, 1.2, 0.8, -10, 0.9, 1.1],
        hueSatMap3: [25, 1.15, 0.85, -4, 0.95, 1.08],
        lookTable: [8, 1.1, 0.9, -6, 1.05, 1.2],
        baselineExposure: 0.3,
        gainMap: [1.26, 1.333333],
        hueSatEncoding: 1,
        lookEncoding: 1,
        copyright: "Keep Style",
    });

    const targetBuffer = buildBinaryProfile({
        colorMatrix: [1, 0, 0, 0, 1, 0, 0, 0, 1],
        whitePoint: [0.3127, 0.329],
        toneCurve: [0, 0, 0.5, 0.5, 1, 1],
        hueSatMap: [0, 1, 1, 0, 1, 1],
        hueSatMap3: [0, 1, 1, 0, 1, 1],
        lookTable: [0, 1, 1, 0, 1, 1],
        baselineExposure: 0.1,
        gainMap: [1, 1.2],
        hueSatEncoding: 0,
        lookEncoding: 0,
        copyright: "Keep Target",
    });

    const baseDoc = parseDcpDocument(baseBuffer);
    const styleDoc = parseDcpDocument(styleBuffer);
    const targetDoc = parseDcpDocument(targetBuffer);
    const report = createOffsetReport(baseDoc, styleDoc, targetDoc);
    const outputBuffer = report.outputDocument.serializeArrayBuffer();
    const reparsed = parseDcpDocument(outputBuffer);

    assert.equal(baseDoc.format, "binary");
    assert.equal(styleDoc.format, "binary");
    assert.equal(targetDoc.format, "binary");
    assert.equal(report.summary.skippedMismatchCount, 0);
    assert.equal(report.summary.pixelEntryCount > 0, true);
    assert.equal(report.summary.changedTagCount > 0, true);
    assert.equal(countByteDifferences(targetBuffer, outputBuffer) > 0, true);
    assert.deepEqual(report.summary.unhandledKeys, []);

    const colorMatrix = readNumbers(reparsed, "colormatrix1");
    assertArrayApproximatelyEqual(colorMatrix, [2, 0, 0, 0, 2, 0, 0, 0, 2]);

    const whitePoint = readNumbers(reparsed, "asshotwhitexy");
    assertArrayApproximatelyEqual(whitePoint, [0.34567, 0.3585], 3e-5);

    const toneCurve = readNumbers(reparsed, "profiletonecurve");
    assertArrayApproximatelyEqual(toneCurve, [0, 0, 0.5, 0.7, 1, 1], 2e-5);

    const hueSatMap = readNumbers(reparsed, "profilehuesatmapdata1");
    assertArrayApproximatelyEqual(hueSatMap, [15, 1.2, 0.8, -10, 0.9, 1.1], 2e-5);

    const hueSatMap3 = readNumbers(reparsed, "profilehuesatmapdata3");
    assertArrayApproximatelyEqual(hueSatMap3, [25, 1.15, 0.85, -4, 0.95, 1.08], 2e-5);

    const lookTable = readNumbers(reparsed, "profilelooktabledata");
    assertArrayApproximatelyEqual(lookTable, [8, 1.1, 0.9, -6, 1.05, 1.2], 2e-5);

    const baselineExposure = readNumbers(reparsed, "baselineexposure");
    assertApproximatelyEqual(baselineExposure[0], 0.3, 1e-6);

    const hueSatEncoding = readNumbers(reparsed, "profilehuesatmapencoding");
    assert.equal(hueSatEncoding[0], 1);

    const lookEncoding = readNumbers(reparsed, "profilelooktableencoding");
    assert.equal(lookEncoding[0], 1);

    const gainMap = reparsed.findEntries("profilegaintablemap")[0].getGainMap();
    assert.ok(gainMap);
    assertArrayApproximatelyEqual(gainMap.data, [1.26, 1.333333], 2e-5);

    const copyright = reparsed.findEntries("profilecopyright")[0];
    assert.equal(copyright.valueKind, "text");
    assert.equal(copyright.decodedValue, "Keep Target");
}

function createTextDocument(profile) {
    return [
        `ColorMatrix1 = ${profile.colorMatrix.join(" ")}`,
        `<AsShotWhiteXY>${profile.whitePoint.join(" ")}</AsShotWhiteXY>`,
        `ProfileToneCurve = ${profile.toneCurve.join(" ")}`,
        "ProfileHueSatMapDims = 2 1 1",
        `ProfileHueSatMapData1 = ${profile.hueSatMap.join(" ")}`,
        `ProfileHueSatMapData3 = ${profile.hueSatMap3.join(" ")}`,
        "ProfileLookTableDims = 2 1 1",
        `ProfileLookTableData = ${profile.lookTable.join(" ")}`,
        `BaselineExposure = ${profile.baselineExposure}`,
        `ProfileGainTableMap = 1 1 1 1 0 0 2 0.333333 0.333333 0.333333 0 0 ${profile.gainMap.join(" ")}`,
        `ProfileHueSatMapEncoding = ${profile.hueSatEncoding}`,
        `ProfileLookTableEncoding = ${profile.lookEncoding}`,
        `ProfileCopyright = ${profile.copyright}`,
        "",
    ].join("\n");
}

function buildBinaryProfile(profile) {
    const tags = [
        { id: 50721, type: 10, value: profile.colorMatrix },
        { id: 50729, type: 5, value: profile.whitePoint },
        { id: 50730, type: 10, value: [profile.baselineExposure] },
        { id: 50937, type: 4, value: [2, 1, 1] },
        { id: 50938, type: 11, value: profile.hueSatMap },
        { id: 52533, type: 11, value: profile.hueSatMap3 },
        { id: 50940, type: 11, value: profile.toneCurve },
        { id: 50942, type: 2, value: profile.copyright },
        { id: 50981, type: 4, value: [2, 1, 1] },
        { id: 50982, type: 11, value: profile.lookTable },
        { id: 51107, type: 4, value: [profile.hueSatEncoding] },
        { id: 51108, type: 4, value: [profile.lookEncoding] },
        { id: 52525, type: 7, value: buildGainMapBlob(profile.gainMap) },
    ];

    const encodedTags = tags
        .map((tag) => ({ ...tag, ...encodeTagValue(tag) }))
        .sort((left, right) => left.id - right.id);

    const entryCount = encodedTags.length;
    const ifdSize = 2 + (entryCount * 12) + 4;
    const entryBytes = encodedTags.reduce((sum, tag) => sum + (tag.inline ? 0 : align4(tag.bytes.length)), 0);
    const output = new Uint8Array(8 + ifdSize + entryBytes);
    const view = new DataView(output.buffer);

    output[0] = 0x49;
    output[1] = 0x49;
    view.setUint16(2, CAMERA_PROFILE_MAGIC, LITTLE_ENDIAN);
    view.setUint32(4, 8, LITTLE_ENDIAN);
    view.setUint16(8, entryCount, LITTLE_ENDIAN);

    let dataCursor = 8 + ifdSize;
    encodedTags.forEach((tag, index) => {
        const entryOffset = 10 + (index * 12);
        view.setUint16(entryOffset, tag.id, LITTLE_ENDIAN);
        view.setUint16(entryOffset + 2, tag.type, LITTLE_ENDIAN);
        view.setUint32(entryOffset + 4, tag.count, LITTLE_ENDIAN);

        if (tag.inline) {
            output.fill(0, entryOffset + 8, entryOffset + 12);
            output.set(tag.bytes, entryOffset + 8);
            return;
        }

        view.setUint32(entryOffset + 8, dataCursor, LITTLE_ENDIAN);
        output.set(tag.bytes, dataCursor);
        dataCursor += align4(tag.bytes.length);
    });

    view.setUint32(8 + 2 + (entryCount * 12), 0, LITTLE_ENDIAN);
    return output.buffer;
}

function encodeTagValue(tag) {
    if (tag.type === 2) {
        const bytes = encoder.encode(`${tag.value}\0`);
        return { count: bytes.length, bytes, inline: bytes.length <= 4 };
    }

    if (tag.type === 7) {
        const bytes = tag.value;
        return { count: bytes.length, bytes, inline: bytes.length <= 4 };
    }

    const values = Array.isArray(tag.value) ? tag.value : [tag.value];
    if (tag.type === 4) {
        const bytes = new Uint8Array(values.length * 4);
        const view = new DataView(bytes.buffer);
        values.forEach((value, index) => {
            view.setUint32(index * 4, value, LITTLE_ENDIAN);
        });
        return { count: values.length, bytes, inline: bytes.length <= 4 };
    }

    if (tag.type === 5 || tag.type === 10) {
        const bytes = new Uint8Array(values.length * 8);
        const view = new DataView(bytes.buffer);
        values.forEach((value, index) => {
            const [numerator, denominator] = encodeRational(value, tag.type === 10);
            const offset = index * 8;
            if (tag.type === 10) {
                view.setInt32(offset, numerator, LITTLE_ENDIAN);
                view.setInt32(offset + 4, denominator, LITTLE_ENDIAN);
                return;
            }
            view.setUint32(offset, numerator, LITTLE_ENDIAN);
            view.setUint32(offset + 4, denominator, LITTLE_ENDIAN);
        });
        return { count: values.length, bytes, inline: false };
    }

    if (tag.type === 11) {
        const bytes = new Uint8Array(values.length * 4);
        const view = new DataView(bytes.buffer);
        values.forEach((value, index) => {
            view.setFloat32(index * 4, value, LITTLE_ENDIAN);
        });
        return { count: values.length, bytes, inline: bytes.length <= 4 };
    }

    throw new Error(`Unsupported tag type ${tag.type}.`);
}

function encodeRational(value, signed) {
    if (!Number.isFinite(value)) {
        return [0, 1];
    }

    const sign = value < 0 ? -1 : 1;
    const scaled = Math.round(Math.abs(value) * 1000000);
    const divisor = greatestCommonDivisor(scaled, 1000000);
    const numerator = (scaled / divisor) * sign;
    const denominator = 1000000 / divisor;
    return signed ? [numerator, denominator] : [Math.abs(numerator), denominator];
}

function buildGainMapBlob(values) {
    const output = new Uint8Array(64 + (values.length * 4));
    const view = new DataView(output.buffer);

    view.setUint32(0, 1, LITTLE_ENDIAN);
    view.setUint32(4, 1, LITTLE_ENDIAN);
    view.setFloat64(8, 1, LITTLE_ENDIAN);
    view.setFloat64(16, 1, LITTLE_ENDIAN);
    view.setFloat64(24, 0, LITTLE_ENDIAN);
    view.setFloat64(32, 0, LITTLE_ENDIAN);
    view.setUint32(40, values.length, LITTLE_ENDIAN);

    [0.333333, 0.333333, 0.333333, 0, 0].forEach((value, index) => {
        view.setFloat32(44 + (index * 4), value, LITTLE_ENDIAN);
    });

    values.forEach((value, index) => {
        view.setFloat32(64 + (index * 4), value, LITTLE_ENDIAN);
    });

    return output;
}

function readNumbers(document, normalizedKey) {
    const entry = document.findEntries(normalizedKey)[0];
    assert.ok(entry, `Missing ${normalizedKey}`);
    return entry.getNumericValues();
}

function assertArrayApproximatelyEqual(actual, expected, epsilon = 1e-6) {
    assert.equal(actual.length, expected.length);
    actual.forEach((value, index) => {
        assertApproximatelyEqual(value, expected[index], epsilon);
    });
}

function assertApproximatelyEqual(actual, expected, epsilon = 1e-6) {
    assert.ok(
        Math.abs(actual - expected) <= epsilon,
        `Expected ${actual} to be within ${epsilon} of ${expected}`,
    );
}

function align4(length) {
    return Math.ceil(length / 4) * 4;
}

function greatestCommonDivisor(left, right) {
    let a = Math.abs(left);
    let b = Math.abs(right);
    while (b) {
        [a, b] = [b, a % b];
    }
    return a || 1;
}

function countByteDifferences(leftBuffer, rightBuffer) {
    const left = new Uint8Array(leftBuffer);
    const right = new Uint8Array(rightBuffer);
    const limit = Math.max(left.length, right.length);
    let changed = 0;

    for (let index = 0; index < limit; index += 1) {
        if ((left[index] ?? -1) !== (right[index] ?? -1)) {
            changed += 1;
        }
    }

    return changed;
}
