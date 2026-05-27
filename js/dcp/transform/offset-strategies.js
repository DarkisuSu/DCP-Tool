import { resolveTagSchema, STRATEGY } from "../core/schema.js";
import { EPSILON, safeRatio, wrapDegrees } from "../core/utils.js";
import {
    adaptWhitePoint,
    buildNaturalCubicSpline,
    buildPiecewiseFunction,
    decodeSrgbUnit,
    encodeSrgbUnit,
    evaluatePiecewise,
    evaluateSpline,
    flattenMatrix,
    inferMatrixRowCount,
    invertMonotonicPiecewise,
    invertMonotonicSpline,
    multiplyMatrices,
    pseudoInverse,
    reshapeMatrix,
} from "./math.js";

export function transformEntry({ baseDoc, styleDoc, targetDoc, baseEntry, styleEntry, targetEntry }) {
    const schema = resolveTagSchema(targetEntry.normalizedKey);
    if (!schema) {
        return null;
    }

    switch (schema.strategy) {
        case STRATEGY.ADDITIVE:
            return applyAdditive(baseEntry, styleEntry, targetEntry);
        case STRATEGY.CHANNEL_RATIO:
            return applyPositiveRatio(baseEntry, styleEntry, targetEntry);
        case STRATEGY.GAIN_MAP:
            return applyGainMapOffset(baseEntry, styleEntry, targetEntry);
        case STRATEGY.HSV_TABLE:
            return applyHsvTableOffset({ baseDoc, styleDoc, targetDoc, baseEntry, styleEntry, targetEntry, schema });
        case STRATEGY.MATRIX:
            return applyMatrixOffset(baseEntry, styleEntry, targetEntry);
        case STRATEGY.MONOTONIC_LUT:
            return applyMonotonicLutOffset(baseEntry, styleEntry, targetEntry);
        case STRATEGY.POSITIVE_RATIO:
            return applyPositiveRatio(baseEntry, styleEntry, targetEntry);
        case STRATEGY.TONE_CURVE:
            return applyToneCurveOffset(baseEntry, styleEntry, targetEntry);
        case STRATEGY.WHITE_POINT_XY:
            return applyWhitePointOffset(baseEntry, styleEntry, targetEntry);
        default:
            return null;
    }
}

export function copyEntryValue(styleEntry, targetEntry) {
    if (targetEntry.valueKind === "gain_map") {
        const gainMap = styleEntry.getGainMap();
        if (gainMap) {
            const changed = targetEntry.setGainMap(gainMap, buildSampleSets(null, styleEntry, targetEntry));
            return changed === null ? null : changed;
        }
    }

    const styleValues = styleEntry.getNumericValues();
    if (styleValues) {
        const changed = targetEntry.setNumericValues(styleValues, buildSampleSets(null, styleEntry, targetEntry));
        return changed === null ? null : changed;
    }

    if (typeof targetEntry.setRawValue === "function" && typeof styleEntry.getSerializedValue === "function") {
        return targetEntry.setRawValue(styleEntry.getSerializedValue());
    }

    if (typeof targetEntry.setTextValue === "function" && styleEntry.valueKind === "text") {
        return targetEntry.setTextValue(styleEntry.decodedValue);
    }

    if (styleEntry.patchedBytes) {
        targetEntry.patchedBytes = styleEntry.patchedBytes.slice();
        targetEntry.patchedCount = styleEntry.getEncodedCount();
        return 1;
    }

    if (styleEntry.rawBytes) {
        targetEntry.patchedBytes = styleEntry.rawBytes.slice();
        targetEntry.patchedCount = styleEntry.count;
        return 1;
    }

    return 0;
}

function applyAdditive(baseEntry, styleEntry, targetEntry) {
    const baseValues = baseEntry.getNumericValues();
    const styleValues = styleEntry.getNumericValues();
    const targetValues = targetEntry.getNumericValues();
    if (!sameLength(baseValues, styleValues, targetValues)) {
        return null;
    }

    const outputValues = targetValues.map((value, index) => (
        value + (styleValues[index] - baseValues[index])
    ));

    return setNumericOutput(baseEntry, styleEntry, targetEntry, outputValues);
}

function applyPositiveRatio(baseEntry, styleEntry, targetEntry) {
    const baseValues = baseEntry.getNumericValues();
    const styleValues = styleEntry.getNumericValues();
    const targetValues = targetEntry.getNumericValues();
    if (!sameLength(baseValues, styleValues, targetValues)) {
        return null;
    }

    const outputValues = [];
    for (let index = 0; index < targetValues.length; index += 1) {
        const ratio = safeRatio(baseValues[index], styleValues[index]);
        if (ratio === null) {
            return null;
        }
        outputValues.push(targetValues[index] * ratio);
    }

    return setNumericOutput(baseEntry, styleEntry, targetEntry, outputValues);
}

function applyMatrixOffset(baseEntry, styleEntry, targetEntry) {
    const baseValues = baseEntry.getNumericValues();
    const styleValues = styleEntry.getNumericValues();
    const targetValues = targetEntry.getNumericValues();
    if (!sameLength(baseValues, styleValues, targetValues)) {
        return null;
    }

    const rowCount = inferMatrixRowCount(targetValues);
    if (!rowCount) {
        return null;
    }

    const baseMatrix = reshapeMatrix(baseValues, rowCount);
    const styleMatrix = reshapeMatrix(styleValues, rowCount);
    const targetMatrix = reshapeMatrix(targetValues, rowCount);
    if (!baseMatrix || !styleMatrix || !targetMatrix) {
        return null;
    }

    const inverseBase = pseudoInverse(baseMatrix);
    if (!inverseBase) {
        return null;
    }

    const offsetMatrix = multiplyMatrices(styleMatrix, inverseBase);
    const outputMatrix = multiplyMatrices(offsetMatrix, targetMatrix);
    return setNumericOutput(baseEntry, styleEntry, targetEntry, flattenMatrix(outputMatrix), 1e-7);
}

function applyWhitePointOffset(baseEntry, styleEntry, targetEntry) {
    const baseValues = baseEntry.getNumericValues();
    const styleValues = styleEntry.getNumericValues();
    const targetValues = targetEntry.getNumericValues();
    if (!sameLength(baseValues, styleValues, targetValues) || targetValues.length !== 2) {
        return null;
    }

    const output = adaptWhitePoint(baseValues, styleValues, targetValues);
    if (!output) {
        return null;
    }

    return setNumericOutput(baseEntry, styleEntry, targetEntry, output, 1e-9);
}

function applyToneCurveOffset(baseEntry, styleEntry, targetEntry) {
    const basePairs = parseCurvePairs(baseEntry.getNumericValues(), { requireMonotonicY: true });
    const stylePairs = parseCurvePairs(styleEntry.getNumericValues(), { requireMonotonicY: false, repairMonotonicY: true });
    const targetPairs = parseCurvePairs(targetEntry.getNumericValues(), { requireMonotonicY: false, repairMonotonicY: true });
    if (!basePairs || !stylePairs || !targetPairs) {
        return null;
    }

    const baseSpline = buildNaturalCubicSpline(basePairs);
    const styleSpline = buildNaturalCubicSpline(stylePairs);
    const targetSpline = buildNaturalCubicSpline(targetPairs);
    if (!baseSpline || !styleSpline || !targetSpline) {
        return null;
    }

    const outputValues = [];
    targetPairs.forEach(([xValue]) => {
        const targetY = evaluateSpline(targetSpline, xValue);
        const baseX = invertMonotonicSpline(baseSpline, targetY);
        const outputY = evaluateSpline(styleSpline, baseX);
        outputValues.push(xValue, outputY);
    });

    return setNumericOutput(baseEntry, styleEntry, targetEntry, outputValues, 1e-7);
}

function applyMonotonicLutOffset(baseEntry, styleEntry, targetEntry) {
    const baseValues = baseEntry.getNumericValues();
    const styleValues = styleEntry.getNumericValues();
    const targetValues = targetEntry.getNumericValues();
    if (!sameLength(baseValues, styleValues, targetValues) || baseValues.length < 2) {
        return null;
    }

    for (let index = 1; index < baseValues.length; index += 1) {
        if (baseValues[index] + EPSILON < baseValues[index - 1]) {
            return null;
        }
    }

    const baseFunc = buildPiecewiseFunction(baseValues);
    const styleFunc = buildPiecewiseFunction(styleValues);
    const outputValues = targetValues.map((value) => {
        const normalizedInput = invertMonotonicPiecewise(baseFunc, value);
        return evaluatePiecewise(styleFunc, normalizedInput);
    });

    return setNumericOutput(baseEntry, styleEntry, targetEntry, outputValues);
}

function applyHsvTableOffset({ baseDoc, styleDoc, targetDoc, baseEntry, styleEntry, targetEntry, schema }) {
    const outputDims = readTableDims(targetDoc, schema.dimsKey) || inferTableDims(targetEntry.getNumericValues());
    const baseDims = readTableDims(baseDoc, schema.dimsKey) || inferTableDims(baseEntry.getNumericValues());
    const styleDims = readTableDims(styleDoc, schema.dimsKey) || inferTableDims(styleEntry.getNumericValues());
    if (!outputDims || !baseDims || !styleDims) {
        return null;
    }

    const isLookTable = targetEntry.normalizedKey === "profilelooktabledata";
    const outputEncoding = readEncodingMode(targetDoc, schema.encodingKey);
    const baseEncoding = readEncodingMode(baseDoc, schema.encodingKey);
    const styleEncoding = readEncodingMode(styleDoc, schema.encodingKey);
    const targetEncoding = readEncodingMode(targetDoc, schema.encodingKey);

    const outputValues = [];
    for (let valueIndex = 0; valueIndex < outputDims[2]; valueIndex += 1) {
        for (let hueIndex = 0; hueIndex < outputDims[0]; hueIndex += 1) {
            for (let satIndex = 0; satIndex < outputDims[1]; satIndex += 1) {
                const hueCoord = outputDims[0] <= 1 ? 0 : hueIndex / outputDims[0];
                const satCoord = outputDims[1] <= 1 ? 0 : satIndex / (outputDims[1] - 1);
                const encodedValueCoord = outputDims[2] <= 1 ? 0 : valueIndex / (outputDims[2] - 1);
                const linearValueCoord = outputEncoding === 1
                    ? decodeSrgbUnit(encodedValueCoord)
                    : encodedValueCoord;

                const baseSample = sampleHsvAction(baseEntry.getNumericValues(), baseDims, baseEncoding, hueCoord, satCoord, linearValueCoord);
                const styleSample = sampleHsvAction(styleEntry.getNumericValues(), styleDims, styleEncoding, hueCoord, satCoord, linearValueCoord);
                const targetSample = sampleHsvAction(targetEntry.getNumericValues(), outputDims, targetEncoding, hueCoord, satCoord, linearValueCoord);
                if (!baseSample || !styleSample || !targetSample) {
                    return null;
                }

                // Look tables are degenerate on the S=0 plane: hue is undefined and
                // saturation scale can legitimately be zero, so relative ratios there
                // are not invertible. Anchor that plane directly to the style table.
                if (isLookTable && outputDims[1] > 1 && satIndex === 0) {
                    outputValues.push(styleSample[0], styleSample[1], styleSample[2]);
                    continue;
                }

                const satScale = composeScaleChannel(baseSample[1], styleSample[1], targetSample[1], isLookTable ? styleSample[1] : null);
                const valueScale = composeScaleChannel(baseSample[2], styleSample[2], targetSample[2], isLookTable ? styleSample[2] : null);
                const hueShift = composeHueChannel(baseSample[0], styleSample[0], targetSample[0], isLookTable ? styleSample[0] : null);
                if (satScale === null || valueScale === null || hueShift === null) {
                    return null;
                }

                outputValues.push(hueShift, satScale, valueScale);
            }
        }
    }

    return setNumericOutput(baseEntry, styleEntry, targetEntry, outputValues, 1e-7);
}

function applyGainMapOffset(baseEntry, styleEntry, targetEntry) {
    const baseMap = baseEntry.getGainMap();
    const styleMap = styleEntry.getGainMap();
    const targetMap = targetEntry.getGainMap();
    if (!baseMap || !styleMap || !targetMap) {
        return null;
    }

    const output = {
        ...targetMap,
        mapInputWeights: styleMap.mapInputWeights.slice(),
        data: [],
    };

    if (output.version === 2) {
        output.gamma = styleMap.gamma;
        output.gainMin = targetMap.gainMin;
        output.gainMax = targetMap.gainMax;
    }

    for (let vIndex = 0; vIndex < targetMap.mapPointsV; vIndex += 1) {
        for (let hIndex = 0; hIndex < targetMap.mapPointsH; hIndex += 1) {
            for (let nIndex = 0; nIndex < targetMap.mapPointsN; nIndex += 1) {
                const vCoord = targetMap.mapPointsV <= 1 ? 0 : vIndex / (targetMap.mapPointsV - 1);
                const hCoord = targetMap.mapPointsH <= 1 ? 0 : hIndex / (targetMap.mapPointsH - 1);
                const nCoord = targetMap.mapPointsN <= 1 ? 0 : nIndex / (targetMap.mapPointsN - 1);

                const baseGain = sampleGainMap(baseMap, vCoord, hCoord, nCoord);
                const styleGain = sampleGainMap(styleMap, vCoord, hCoord, nCoord);
                const targetGain = sampleGainMap(targetMap, vCoord, hCoord, nCoord);
                const ratio = safeRatio(baseGain, styleGain);
                if (ratio === null) {
                    return null;
                }

                output.data.push(targetGain * ratio);
            }
        }
    }

    if (arraysNearlyEqual(targetMap.data, output.data, 1e-7)) {
        return 0;
    }

    return targetEntry.setGainMap(output, buildSampleSets(baseEntry, styleEntry, targetEntry));
}

function sameLength(...arrays) {
    return arrays.every((array) => Array.isArray(array)) &&
        arrays.every((array) => array.length === arrays[0].length);
}

function buildSampleSets(baseEntry, styleEntry, targetEntry) {
    if (!targetEntry || !styleEntry) {
        return [];
    }
    if (!("numbers" in targetEntry) || !("numbers" in styleEntry)) {
        return [];
    }
    const hasBase = baseEntry && ("numbers" in baseEntry);

    return targetEntry.numbers.map((_, index) => [
        hasBase && baseEntry.numbers[index] ? baseEntry.numbers[index].raw : "",
        styleEntry.numbers[index] ? styleEntry.numbers[index].raw : "",
        targetEntry.numbers[index] ? targetEntry.numbers[index].raw : "",
    ]);
}

function parseCurvePairs(values, options = {}) {
    const { requireMonotonicY = true, repairMonotonicY = false } = options;
    if (!values || values.length < 4 || values.length % 2 !== 0) {
        return null;
    }

    const pairs = [];
    for (let index = 0; index < values.length; index += 2) {
        pairs.push([values[index], values[index + 1]]);
    }

    for (let index = 1; index < pairs.length; index += 1) {
        if (!(pairs[index][0] > pairs[index - 1][0])) {
            return null;
        }
        if (pairs[index][1] + EPSILON < pairs[index - 1][1]) {
            if (repairMonotonicY) {
                pairs[index][1] = pairs[index - 1][1];
            } else if (requireMonotonicY) {
                return null;
            }
        }
    }

    return pairs;
}

function setNumericOutput(baseEntry, styleEntry, targetEntry, outputValues, tolerance = 1e-9) {
    const targetValues = targetEntry.getNumericValues();
    if (sameLength(targetValues, outputValues) && arraysNearlyEqual(targetValues, outputValues, tolerance)) {
        return 0;
    }

    const changed = targetEntry.setNumericValues(outputValues, buildSampleSets(baseEntry, styleEntry, targetEntry));
    return changed === null ? null : changed;
}

function arraysNearlyEqual(left, right, tolerance = 1e-9) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
        return false;
    }

    for (let index = 0; index < left.length; index += 1) {
        if (!Number.isFinite(left[index]) || !Number.isFinite(right[index])) {
            return false;
        }
        if (Math.abs(left[index] - right[index]) > tolerance) {
            return false;
        }
    }

    return true;
}

function composeScaleChannel(baseValue, styleValue, targetValue, fallbackValue = null) {
    const ratio = safeRatio(baseValue, styleValue);
    if (ratio !== null && Number.isFinite(targetValue)) {
        return targetValue * ratio;
    }

    if (fallbackValue !== null && Number.isFinite(fallbackValue)) {
        return fallbackValue;
    }

    return null;
}

function composeHueChannel(baseValue, styleValue, targetValue, fallbackValue = null) {
    if (Number.isFinite(baseValue) && Number.isFinite(styleValue) && Number.isFinite(targetValue)) {
        return wrapDegrees(targetValue + wrapDegrees(styleValue - baseValue));
    }

    if (fallbackValue !== null && Number.isFinite(fallbackValue)) {
        return fallbackValue;
    }

    return null;
}

function readTableDims(document, normalizedKey) {
    if (!normalizedKey) {
        return null;
    }

    const entry = document.findEntries(normalizedKey)[0];
    const values = entry ? entry.getNumericValues() : null;
    if (!values || values.length !== 3) {
        return null;
    }

    return values.map((value) => Math.max(1, Math.round(value)));
}

function readEncodingMode(document, normalizedKey) {
    if (!normalizedKey) {
        return 0;
    }

    const entry = document.findEntries(normalizedKey)[0];
    const values = entry ? entry.getNumericValues() : null;
    if (!values || values.length === 0) {
        return 0;
    }

    return Math.round(values[0]);
}

function inferTableDims(values) {
    if (!values || values.length % 3 !== 0) {
        return null;
    }

    return [values.length / 3, 1, 1];
}

function sampleHsvAction(values, dims, encoding, hueCoord, satCoord, linearValueCoord) {
    if (!values || values.length !== dims[0] * dims[1] * dims[2] * 3) {
        return null;
    }

    const valueCoord = encoding === 1 ? encodeSrgbUnit(linearValueCoord) : linearValueCoord;
    return sampleHsvTriplet(values, dims, hueCoord, satCoord, valueCoord);
}

function sampleHsvTriplet(values, dims, hueCoord, satCoord, valueCoord) {
    const hueCount = dims[0];
    const satCount = dims[1];
    const valueCount = dims[2];

    const huePosition = hueCount <= 1 ? 0 : hueCoord * hueCount;
    const satPosition = satCount <= 1 ? 0 : satCoord * (satCount - 1);
    const valuePosition = valueCount <= 1 ? 0 : valueCoord * (valueCount - 1);

    const hue0 = hueCount <= 1 ? 0 : Math.floor(huePosition) % hueCount;
    const hue1 = hueCount <= 1 ? 0 : (hue0 + 1) % hueCount;
    const sat0 = satCount <= 1 ? 0 : Math.floor(satPosition);
    const sat1 = satCount <= 1 ? 0 : Math.min(sat0 + 1, satCount - 1);
    const value0 = valueCount <= 1 ? 0 : Math.floor(valuePosition);
    const value1 = valueCount <= 1 ? 0 : Math.min(value0 + 1, valueCount - 1);

    const hueWeight = hueCount <= 1 ? 0 : huePosition - Math.floor(huePosition);
    const satWeight = satCount <= 1 ? 0 : satPosition - sat0;
    const valueWeight = valueCount <= 1 ? 0 : valuePosition - value0;

    const corners = [
        [hue0, sat0, value0, (1 - hueWeight) * (1 - satWeight) * (1 - valueWeight)],
        [hue1, sat0, value0, hueWeight * (1 - satWeight) * (1 - valueWeight)],
        [hue0, sat1, value0, (1 - hueWeight) * satWeight * (1 - valueWeight)],
        [hue1, sat1, value0, hueWeight * satWeight * (1 - valueWeight)],
        [hue0, sat0, value1, (1 - hueWeight) * (1 - satWeight) * valueWeight],
        [hue1, sat0, value1, hueWeight * (1 - satWeight) * valueWeight],
        [hue0, sat1, value1, (1 - hueWeight) * satWeight * valueWeight],
        [hue1, sat1, value1, hueWeight * satWeight * valueWeight],
    ];

    let hueSin = 0;
    let hueCos = 0;
    let saturation = 0;
    let valueScale = 0;

    corners.forEach(([hIndex, sIndex, vIndex, weight]) => {
        const baseIndex = (((vIndex * hueCount) + hIndex) * satCount + sIndex) * 3;
        const hueRadians = (values[baseIndex] * Math.PI) / 180;
        hueSin += Math.sin(hueRadians) * weight;
        hueCos += Math.cos(hueRadians) * weight;
        saturation += values[baseIndex + 1] * weight;
        valueScale += values[baseIndex + 2] * weight;
    });

    const hueShift = wrapDegrees((Math.atan2(hueSin, hueCos) * 180) / Math.PI);
    return [hueShift, saturation, valueScale];
}

function sampleGainMap(gainMap, vCoord, hCoord, nCoord) {
    const vMax = Math.max(gainMap.mapPointsV - 1, 1);
    const hMax = Math.max(gainMap.mapPointsH - 1, 1);
    const nMax = Math.max(gainMap.mapPointsN - 1, 1);

    const vPosition = vCoord * vMax;
    const hPosition = hCoord * hMax;
    const nPosition = nCoord * nMax;

    const v0 = Math.floor(vPosition);
    const h0 = Math.floor(hPosition);
    const n0 = Math.floor(nPosition);
    const v1 = Math.min(v0 + 1, gainMap.mapPointsV - 1);
    const h1 = Math.min(h0 + 1, gainMap.mapPointsH - 1);
    const n1 = Math.min(n0 + 1, gainMap.mapPointsN - 1);

    const tv = vPosition - v0;
    const th = hPosition - h0;
    const tn = nPosition - n0;

    const c000 = gainMap.data[gainIndex(gainMap, v0, h0, n0)];
    const c001 = gainMap.data[gainIndex(gainMap, v0, h0, n1)];
    const c010 = gainMap.data[gainIndex(gainMap, v0, h1, n0)];
    const c011 = gainMap.data[gainIndex(gainMap, v0, h1, n1)];
    const c100 = gainMap.data[gainIndex(gainMap, v1, h0, n0)];
    const c101 = gainMap.data[gainIndex(gainMap, v1, h0, n1)];
    const c110 = gainMap.data[gainIndex(gainMap, v1, h1, n0)];
    const c111 = gainMap.data[gainIndex(gainMap, v1, h1, n1)];

    const c00 = c000 * (1 - tn) + c001 * tn;
    const c01 = c010 * (1 - tn) + c011 * tn;
    const c10 = c100 * (1 - tn) + c101 * tn;
    const c11 = c110 * (1 - tn) + c111 * tn;
    const c0 = c00 * (1 - th) + c01 * th;
    const c1 = c10 * (1 - th) + c11 * th;
    return c0 * (1 - tv) + c1 * tv;
}

function gainIndex(gainMap, vIndex, hIndex, nIndex) {
    return ((vIndex * gainMap.mapPointsH) + hIndex) * gainMap.mapPointsN + nIndex;
}
