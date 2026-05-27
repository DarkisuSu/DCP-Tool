import { isMetadataKey, resolveTagSchema } from "../core/schema.js";
import { transformEntry, copyEntryValue } from "./offset-strategies.js";

export function createOffsetReport(baseDoc, styleDoc, targetDoc) {
    const usage = new Map();
    const strategyCounts = {};
    const unhandledKeys = new Set();
    const changedKeys = [];
    const unchangedPixelKeys = [];
    const skippedKeys = [];

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

        // 1. 如果 dcp2 不存在，則改用 identity (保持 dcp3 不變)
        if (!styleEntry) {
            pixelEntryCount += 1;
            unchangedPixelKeys.push(targetEntry.key);
            return;
        }

        // 2. 如果 dcp1 不存在，但 dcp2 存在，則直接修改為 dcp2 的像素資訊
        if (!baseEntry) {
            pixelEntryCount += 1;
            const changed = copyEntryValue(styleEntry, targetEntry);
            if (changed > 0) {
                changedKeys.push(targetEntry.key);
                changedNumberCount += changed;
            } else {
                unchangedPixelKeys.push(targetEntry.key);
            }
            return;
        }

        // 3. 如果兩者都存在，沿用原本的 offset 計算邏輯
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
            skippedKeys.push(targetEntry.key);
            return;
        }

        pixelEntryCount += 1;
        changedNumberCount += changed;
        strategyCounts[schema.strategy] = (strategyCounts[schema.strategy] || 0) + 1;
        if (changed > 0) {
            changedKeys.push(targetEntry.key);
        } else {
            unchangedPixelKeys.push(targetEntry.key);
        }
    });

    return {
        summary: {
            changedNumberCount,
            changedTagCount: changedKeys.length,
            changedKeys,
            pixelEntryCount,
            skippedMetadataCount,
            skippedMismatchCount,
            skippedKeys,
            strategyCounts,
            unchangedPixelKeys,
            unhandledKeys: Array.from(unhandledKeys),
        },
        outputDocument: targetDoc,
    };
}
