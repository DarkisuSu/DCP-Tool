import { isMetadataKey, resolveTagSchema } from "../core/schema.js";
import { transformEntry } from "./offset-strategies.js";

export function createOffsetReport(baseDoc, styleDoc, targetDoc) {
    const usage = new Map();
    const strategyCounts = {};
    const unhandledKeys = new Set();

    let pixelEntryCount = 0;
    let changedNumberCount = 0;
    let skippedMetadataCount = 0;
    let skippedMismatchCount = 0;

    targetDoc.entries.forEach((targetEntry) => {
        const schema = resolveTagSchema(targetEntry.normalizedKey);
        if (!schema) {
            skippedMetadataCount += 1;
            if (!isMetadataKey(targetEntry.normalizedKey)) {
                unhandledKeys.add(targetEntry.key);
            }
            return;
        }

        const occurrenceIndex = usage.get(targetEntry.normalizedKey) || 0;
        usage.set(targetEntry.normalizedKey, occurrenceIndex + 1);

        const baseEntry = baseDoc.findEntries(targetEntry.normalizedKey)[occurrenceIndex];
        const styleEntry = styleDoc.findEntries(targetEntry.normalizedKey)[occurrenceIndex];
        if (!baseEntry || !styleEntry) {
            skippedMismatchCount += 1;
            return;
        }

        const changed = transformEntry({
            baseDoc,
            styleDoc,
            targetDoc,
            baseEntry,
            styleEntry,
            targetEntry,
        });

        if (changed === null) {
            skippedMismatchCount += 1;
            return;
        }

        pixelEntryCount += 1;
        changedNumberCount += changed;
        strategyCounts[schema.strategy] = (strategyCounts[schema.strategy] || 0) + 1;
    });

    return {
        summary: {
            changedNumberCount,
            pixelEntryCount,
            skippedMetadataCount,
            skippedMismatchCount,
            strategyCounts,
            unhandledKeys: Array.from(unhandledKeys),
        },
        outputDocument: targetDoc,
    };
}
