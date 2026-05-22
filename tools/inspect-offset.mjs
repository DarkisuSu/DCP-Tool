import fs from "node:fs";

import { resolveTagSchema } from "../js/dcp/core/schema.js";
import { parseDcpDocument } from "../js/dcp/formats/document-factory.js";
import { createOffsetReport } from "../js/dcp/transform/offset-engine.js";

const [basePath, stylePath, targetPath] = process.argv.slice(2);

if (!basePath || !stylePath || !targetPath) {
    console.error("Usage: npm run inspect -- <dcp1> <dcp2> <dcp3>");
    process.exit(1);
}

const baseBuffer = fs.readFileSync(basePath);
const styleBuffer = fs.readFileSync(stylePath);
const targetBuffer = fs.readFileSync(targetPath);

const baseDoc = parseDcpDocument(toArrayBuffer(baseBuffer));
const styleDoc = parseDcpDocument(toArrayBuffer(styleBuffer));
const targetOriginal = parseDcpDocument(toArrayBuffer(targetBuffer));
const targetDoc = parseDcpDocument(toArrayBuffer(targetBuffer));

const report = createOffsetReport(baseDoc, styleDoc, targetDoc);
const outputDoc = report.outputDocument;
const baseStyleDiffs = collectDocumentDiffs(baseDoc, styleDoc);
const targetOutputDiffs = collectDocumentDiffs(targetOriginal, outputDoc);
const rawDelta = measureRawDelta(targetOriginal, outputDoc);

console.log("Formats");
console.log(`  DCP1=${baseDoc.format} DCP2=${styleDoc.format} DCP3=${targetDoc.format}`);
console.log("");
console.log("Offset summary");
console.log(JSON.stringify(report.summary, null, 2));
console.log("");
console.log("Raw output delta");
console.log(JSON.stringify(rawDelta, null, 2));
console.log("");
console.log("DCP1 -> DCP2 pixel tag diffs");
printDiffs(baseStyleDiffs);
console.log("");
console.log("DCP3 -> Output pixel tag diffs");
printDiffs(targetOutputDiffs);

function collectDocumentDiffs(leftDoc, rightDoc) {
    const usage = new Map();
    const diffs = [];

    rightDoc.entries.forEach((rightEntry) => {
        const schema = resolveTagSchema(rightEntry.normalizedKey);
        if (!schema) {
            return;
        }

        const occurrenceIndex = usage.get(rightEntry.normalizedKey) || 0;
        usage.set(rightEntry.normalizedKey, occurrenceIndex + 1);
        const leftEntry = leftDoc.findEntries(rightEntry.normalizedKey)[occurrenceIndex];
        if (!leftEntry) {
            diffs.push({
                key: rightEntry.key,
                occurrenceIndex,
                reason: "missing-in-left",
            });
            return;
        }

        const leftValues = leftEntry.getNumericValues();
        const rightValues = rightEntry.getNumericValues();
        if (leftValues && rightValues) {
            const differenceCount = countValueDifferences(leftValues, rightValues);
            if (differenceCount > 0) {
                diffs.push({
                    key: rightEntry.key,
                    occurrenceIndex,
                    differenceCount,
                    leftPreview: previewValues(leftValues),
                    rightPreview: previewValues(rightValues),
                });
            }
            return;
        }

        const leftGain = leftEntry.getGainMap ? leftEntry.getGainMap() : null;
        const rightGain = rightEntry.getGainMap ? rightEntry.getGainMap() : null;
        if (leftGain && rightGain) {
            const differenceCount = countValueDifferences(leftGain.data, rightGain.data);
            if (differenceCount > 0) {
                diffs.push({
                    key: rightEntry.key,
                    occurrenceIndex,
                    differenceCount,
                    leftPreview: previewValues(leftGain.data),
                    rightPreview: previewValues(rightGain.data),
                });
            }
        }
    });

    return diffs;
}

function countValueDifferences(left, right, epsilon = 1e-9) {
    if (left.length !== right.length) {
        return Math.max(left.length, right.length);
    }

    let changed = 0;
    for (let index = 0; index < left.length; index += 1) {
        if (Math.abs(left[index] - right[index]) > epsilon) {
            changed += 1;
        }
    }
    return changed;
}

function previewValues(values, count = 8) {
    return values.slice(0, count).map((value) => Number(value.toFixed(6)));
}

function measureRawDelta(originalDoc, outputDoc) {
    if (outputDoc.format === "binary") {
        return {
            kind: "bytes",
            changedUnits: countByteDifferences(originalDoc.arrayBuffer, outputDoc.serializeArrayBuffer()),
        };
    }

    return {
        kind: "chars",
        changedUnits: originalDoc.text === outputDoc.serialize() ? 0 : 1,
    };
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

function printDiffs(diffs) {
    if (diffs.length === 0) {
        console.log("  (none)");
        return;
    }

    diffs.forEach((diff) => {
        if (diff.reason) {
            console.log(`  ${diff.key} [${diff.occurrenceIndex}] ${diff.reason}`);
            return;
        }

        console.log(`  ${diff.key} [${diff.occurrenceIndex}] changed=${diff.differenceCount}`);
        console.log(`    left:  ${diff.leftPreview.join(", ")}`);
        console.log(`    right: ${diff.rightPreview.join(", ")}`);
    });
}

function toArrayBuffer(buffer) {
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}
