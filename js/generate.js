const NUMBER_PATTERN = /[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g;
const INLINE_XML_LINE_PATTERN = /^([ \t]*)<([A-Za-z_][\w:.-]*)(?:\s[^>]*)?>([^<>]+)<\/\2>\s*$/u;
const LINE_VALUE_PATTERN = /^([ \t]*)([A-Za-z_][\w:.-]*)([ \t]*[:=][ \t]*)(.+)$/;

const EPSILON = 1e-9;
const BRADFORD = [
    [0.8951, 0.2664, -0.1614],
    [-0.7502, 1.7135, 0.0367],
    [0.0389, -0.0685, 1.0296],
];
const BRADFORD_INVERSE = [
    [0.9869929, -0.1470543, 0.1599627],
    [0.4323053, 0.5183603, 0.0492912],
    [-0.0085287, 0.0400428, 0.9684867],
];

const STRATEGY = {
    ADDITIVE: "additive",
    CHANNEL_RATIO: "channel_ratio",
    COPY_STYLE: "copy_style",
    GAIN_MAP: "gain_map",
    HSV_TABLE: "hsv_table",
    MATRIX: "matrix",
    MONOTONIC_LUT: "monotonic_lut",
    POSITIVE_RATIO: "positive_ratio",
    TONE_CURVE: "tone_curve",
    WHITE_POINT_XY: "white_point_xy",
};

const EXACT_STRATEGIES = new Map([
    ["analogbalance", STRATEGY.CHANNEL_RATIO],
    ["antialiasstrength", STRATEGY.POSITIVE_RATIO],
    ["asshotneutral", STRATEGY.CHANNEL_RATIO],
    ["asshotwhitexy", STRATEGY.WHITE_POINT_XY],
    ["baselineexposure", STRATEGY.ADDITIVE],
    ["baselineexposureoffset", STRATEGY.ADDITIVE],
    ["baselinenoise", STRATEGY.POSITIVE_RATIO],
    ["baselinesharpness", STRATEGY.POSITIVE_RATIO],
    ["bayergreensplit", STRATEGY.ADDITIVE],
    ["blacklevel", STRATEGY.ADDITIVE],
    ["blackleveldeltah", STRATEGY.ADDITIVE],
    ["blackleveldeltav", STRATEGY.ADDITIVE],
    ["chromablurradius", STRATEGY.POSITIVE_RATIO],
    ["defaultblackrender", STRATEGY.COPY_STYLE],
    ["linearizationtable", STRATEGY.MONOTONIC_LUT],
    ["linearresponselimit", STRATEGY.POSITIVE_RATIO],
    ["profilegaintablemap", STRATEGY.GAIN_MAP],
    ["profilegaintablemap2", STRATEGY.GAIN_MAP],
    ["profilehuesatmapdata1", STRATEGY.HSV_TABLE],
    ["profilehuesatmapdata2", STRATEGY.HSV_TABLE],
    ["profilehuesatmapencoding", STRATEGY.COPY_STYLE],
    ["profilelooktabledata", STRATEGY.HSV_TABLE],
    ["profilelooktableencoding", STRATEGY.COPY_STYLE],
    ["profiletonecurve", STRATEGY.TONE_CURVE],
    ["shadowscale", STRATEGY.POSITIVE_RATIO],
    ["whitelevel", STRATEGY.ADDITIVE],
]);

const MATRIX_PREFIXES = [
    "cameracalibration",
    "colormatrix",
    "currentpreprofilematrix",
    "forwardmatrix",
    "reductionmatrix",
    "asshotpreprofilematrix",
];

const METADATA_PREFIXES = [
    "activearea",
    "asshotprofilename",
    "bestqualityscale",
    "blacklevelrepeatdim",
    "calibrationilluminant",
    "cameracalibrationsignature",
    "cameramodel",
    "cameraserialnumber",
    "cfalayout",
    "cfaplanecolor",
    "colorimetricreference",
    "copyright",
    "datetime",
    "defaultcrop",
    "defaultscale",
    "digest",
    "dngbackwardversion",
    "dngversion",
    "exif",
    "extracameraprofiles",
    "filename",
    "groupname",
    "lensinfo",
    "localizedcamera",
    "makernotesafety",
    "maskedareas",
    "name",
    "noisereductionapplied",
    "originalraw",
    "preview",
    "private",
    "profilecalibrationsignature",
    "profilecopyright",
    "profileembedpolicy",
    "profilehuesatmapdims",
    "profilelooktabledims",
    "rawdatauniqueid",
    "rawimagedigest",
    "semantic",
    "serial",
    "signature",
    "subtileblocksize",
    "uniquecamera",
    "version",
];

function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
    });
}

function normalizeKey(key) {
    return String(key || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function countDecimals(token) {
    const mantissa = String(token).toLowerCase().split("e")[0];
    const dotIndex = mantissa.indexOf(".");
    return dotIndex === -1 ? 0 : mantissa.length - dotIndex - 1;
}

function formatNumber(value, sampleTokens = []) {
    const finiteValue = Number.isFinite(value) ? value : 0;
    const precision = Math.max(...sampleTokens.map(countDecimals), 0);
    const rendered = precision > 0
        ? finiteValue.toFixed(Math.min(precision, 8))
        : String(Math.round(finiteValue));

    if (precision === 0) {
        return rendered;
    }

    return rendered
        .replace(/(\.\d*?[1-9])0+$/u, "$1")
        .replace(/\.0+$/u, ".0");
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function wrapDegrees(value) {
    let wrapped = value % 360;
    if (wrapped <= -180) {
        wrapped += 360;
    }
    if (wrapped > 180) {
        wrapped -= 360;
    }
    return wrapped;
}

function nearlyZero(value) {
    return Math.abs(value) <= EPSILON;
}

function isPositiveFinite(value) {
    return Number.isFinite(value) && value > EPSILON;
}

function safeRatio(base, style) {
    if (!isPositiveFinite(base) || !Number.isFinite(style)) {
        return null;
    }
    return style / base;
}

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

function looksBinaryContent(text) {
    return /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(text);
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
        entries.push({
            key,
            normalizedKey: normalizeKey(key),
            rawValue,
            numbers,
            valueStart: lineInfo.start + valueOffset,
            valueEnd: lineInfo.start + valueOffset + rawValue.length,
        });
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

        entries.push({
            key,
            normalizedKey: normalizeKey(key),
            rawValue,
            numbers,
            valueStart,
            valueEnd,
        });
    });

    return entries;
}

function parseDcpEntries(text) {
    const xmlEntries = parseXmlEntries(text);
    const blockedRanges = xmlEntries.map((entry) => ({
        start: entry.valueStart,
        end: entry.valueEnd,
    }));
    const lineEntries = parseLineEntries(text, blockedRanges);
    return [...xmlEntries, ...lineEntries].sort((left, right) => left.valueStart - right.valueStart);
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

function isMetadataKey(normalizedKey) {
    return METADATA_PREFIXES.some((prefix) => normalizedKey.startsWith(prefix));
}

function resolveStrategy(normalizedKey) {
    if (EXACT_STRATEGIES.has(normalizedKey)) {
        return EXACT_STRATEGIES.get(normalizedKey);
    }

    if (MATRIX_PREFIXES.some((prefix) => normalizedKey.startsWith(prefix))) {
        return STRATEGY.MATRIX;
    }

    if (isMetadataKey(normalizedKey)) {
        return null;
    }

    return null;
}

function replaceNumbersInRawValue(rawValue, originalTokens, newValues, tokenSamples = []) {
    let cursor = 0;
    let changed = 0;
    let output = "";

    originalTokens.forEach((token, index) => {
        const prefix = rawValue.slice(cursor, token.start);
        const sampleSet = [
            token.raw,
            ...(tokenSamples[index] || []),
        ];
        const formatted = formatNumber(newValues[index], sampleSet);
        if (formatted !== token.raw) {
            changed += 1;
        }
        output += prefix + formatted;
        cursor = token.end;
    });

    output += rawValue.slice(cursor);

    return {
        changed,
        value: output,
    };
}

function buildTokenSamples(baseEntry, styleEntry, targetEntry) {
    return targetEntry.numbers.map((_, index) => [
        baseEntry.numbers[index] ? baseEntry.numbers[index].raw : "",
        styleEntry.numbers[index] ? styleEntry.numbers[index].raw : "",
        targetEntry.numbers[index] ? targetEntry.numbers[index].raw : "",
    ]);
}

function applyAdditive(baseEntry, styleEntry, targetEntry) {
    if (
        baseEntry.numbers.length !== styleEntry.numbers.length ||
        baseEntry.numbers.length !== targetEntry.numbers.length
    ) {
        return null;
    }

    const values = targetEntry.numbers.map((token, index) => (
        token.value + (styleEntry.numbers[index].value - baseEntry.numbers[index].value)
    ));

    return replaceNumbersInRawValue(
        targetEntry.rawValue,
        targetEntry.numbers,
        values,
        buildTokenSamples(baseEntry, styleEntry, targetEntry),
    );
}

function applyPositiveRatio(baseEntry, styleEntry, targetEntry) {
    if (
        baseEntry.numbers.length !== styleEntry.numbers.length ||
        baseEntry.numbers.length !== targetEntry.numbers.length
    ) {
        return null;
    }

    const values = [];
    for (let index = 0; index < targetEntry.numbers.length; index += 1) {
        const ratio = safeRatio(baseEntry.numbers[index].value, styleEntry.numbers[index].value);
        if (ratio === null || !Number.isFinite(targetEntry.numbers[index].value)) {
            return null;
        }
        values.push(targetEntry.numbers[index].value * ratio);
    }

    return replaceNumbersInRawValue(
        targetEntry.rawValue,
        targetEntry.numbers,
        values,
        buildTokenSamples(baseEntry, styleEntry, targetEntry),
    );
}

function applyChannelRatio(baseEntry, styleEntry, targetEntry) {
    return applyPositiveRatio(baseEntry, styleEntry, targetEntry);
}

function transpose(matrix) {
    return matrix[0].map((_, columnIndex) => matrix.map((row) => row[columnIndex]));
}

function multiplyMatrices(left, right) {
    const rows = left.length;
    const cols = right[0].length;
    const inner = right.length;
    const output = Array.from({ length: rows }, () => Array(cols).fill(0));

    for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
            let sum = 0;
            for (let i = 0; i < inner; i += 1) {
                sum += left[row][i] * right[i][col];
            }
            output[row][col] = sum;
        }
    }

    return output;
}

function invertMatrix(matrix) {
    const size = matrix.length;
    const augmented = matrix.map((row, rowIndex) => [
        ...row.map((value) => Number(value)),
        ...Array.from({ length: size }, (_, colIndex) => (rowIndex === colIndex ? 1 : 0)),
    ]);

    for (let pivot = 0; pivot < size; pivot += 1) {
        let pivotRow = pivot;
        for (let row = pivot + 1; row < size; row += 1) {
            if (Math.abs(augmented[row][pivot]) > Math.abs(augmented[pivotRow][pivot])) {
                pivotRow = row;
            }
        }

        if (nearlyZero(augmented[pivotRow][pivot])) {
            return null;
        }

        if (pivotRow !== pivot) {
            [augmented[pivot], augmented[pivotRow]] = [augmented[pivotRow], augmented[pivot]];
        }

        const pivotValue = augmented[pivot][pivot];
        for (let col = 0; col < augmented[pivot].length; col += 1) {
            augmented[pivot][col] /= pivotValue;
        }

        for (let row = 0; row < size; row += 1) {
            if (row === pivot) {
                continue;
            }

            const factor = augmented[row][pivot];
            if (nearlyZero(factor)) {
                continue;
            }

            for (let col = 0; col < augmented[row].length; col += 1) {
                augmented[row][col] -= factor * augmented[pivot][col];
            }
        }
    }

    return augmented.map((row) => row.slice(size));
}

function pseudoInverse(matrix) {
    const rows = matrix.length;
    const cols = matrix[0].length;
    const transposed = transpose(matrix);

    if (rows >= cols) {
        const normal = multiplyMatrices(transposed, matrix);
        const inverseNormal = invertMatrix(normal);
        if (!inverseNormal) {
            return null;
        }
        return multiplyMatrices(inverseNormal, transposed);
    }

    const normal = multiplyMatrices(matrix, transposed);
    const inverseNormal = invertMatrix(normal);
    if (!inverseNormal) {
        return null;
    }
    return multiplyMatrices(transposed, inverseNormal);
}

function reshapeMatrix(values, rowCount) {
    if (values.length % rowCount !== 0) {
        return null;
    }

    const matrix = [];
    const colCount = values.length / rowCount;

    for (let row = 0; row < rowCount; row += 1) {
        matrix.push(values.slice(row * colCount, (row + 1) * colCount));
    }

    return matrix;
}

function flattenMatrix(matrix) {
    return matrix.flat();
}

function inferMatrixRowCount(entry) {
    if (entry.numbers.length % 3 === 0) {
        return 3;
    }

    const side = Math.sqrt(entry.numbers.length);
    if (Number.isInteger(side)) {
        return side;
    }

    return null;
}

function applyMatrixOffset(baseEntry, styleEntry, targetEntry) {
    const rowCount = inferMatrixRowCount(targetEntry);
    if (!rowCount) {
        return null;
    }

    const baseMatrix = reshapeMatrix(baseEntry.numbers.map((token) => token.value), rowCount);
    const styleMatrix = reshapeMatrix(styleEntry.numbers.map((token) => token.value), rowCount);
    const targetMatrix = reshapeMatrix(targetEntry.numbers.map((token) => token.value), rowCount);

    if (!baseMatrix || !styleMatrix || !targetMatrix) {
        return null;
    }

    const inverseBase = pseudoInverse(baseMatrix);
    if (!inverseBase) {
        return null;
    }

    const offsetMatrix = multiplyMatrices(styleMatrix, inverseBase);
    const outputMatrix = multiplyMatrices(offsetMatrix, targetMatrix);
    const outputValues = flattenMatrix(outputMatrix);

    return replaceNumbersInRawValue(
        targetEntry.rawValue,
        targetEntry.numbers,
        outputValues,
        buildTokenSamples(baseEntry, styleEntry, targetEntry),
    );
}

function multiplyMatrixVector(matrix, vector) {
    return matrix.map((row) => row.reduce((sum, value, index) => sum + value * vector[index], 0));
}

function xyToXyz(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || y <= EPSILON) {
        return null;
    }

    const X = x / y;
    const Y = 1;
    const Z = (1 - x - y) / y;
    return [X, Y, Z];
}

function xyzToXy(xyz) {
    const sum = xyz[0] + xyz[1] + xyz[2];
    if (!Number.isFinite(sum) || nearlyZero(sum)) {
        return null;
    }

    return [
        xyz[0] / sum,
        xyz[1] / sum,
    ];
}

function applyWhitePointOffset(baseEntry, styleEntry, targetEntry) {
    if (
        baseEntry.numbers.length !== 2 ||
        styleEntry.numbers.length !== 2 ||
        targetEntry.numbers.length !== 2
    ) {
        return null;
    }

    const baseXyz = xyToXyz(baseEntry.numbers[0].value, baseEntry.numbers[1].value);
    const styleXyz = xyToXyz(styleEntry.numbers[0].value, styleEntry.numbers[1].value);
    const targetXyz = xyToXyz(targetEntry.numbers[0].value, targetEntry.numbers[1].value);
    if (!baseXyz || !styleXyz || !targetXyz) {
        return null;
    }

    const baseCone = multiplyMatrixVector(BRADFORD, baseXyz);
    const styleCone = multiplyMatrixVector(BRADFORD, styleXyz);
    const targetCone = multiplyMatrixVector(BRADFORD, targetXyz);

    const adaptedCone = targetCone.map((value, index) => {
        if (!isPositiveFinite(baseCone[index])) {
            return value;
        }
        return value * (styleCone[index] / baseCone[index]);
    });

    const adaptedXyz = multiplyMatrixVector(BRADFORD_INVERSE, adaptedCone);
    const adaptedXy = xyzToXy(adaptedXyz);
    if (!adaptedXy) {
        return null;
    }

    return replaceNumbersInRawValue(
        targetEntry.rawValue,
        targetEntry.numbers,
        adaptedXy,
        buildTokenSamples(baseEntry, styleEntry, targetEntry),
    );
}

function parseCurvePairs(entry) {
    if (entry.numbers.length < 4 || entry.numbers.length % 2 !== 0) {
        return null;
    }

    const pairs = [];
    for (let index = 0; index < entry.numbers.length; index += 2) {
        pairs.push([entry.numbers[index].value, entry.numbers[index + 1].value]);
    }

    for (let index = 1; index < pairs.length; index += 1) {
        if (!(pairs[index][0] > pairs[index - 1][0])) {
            return null;
        }
        if (pairs[index][1] + EPSILON < pairs[index - 1][1]) {
            return null;
        }
    }

    return pairs;
}

function buildNaturalCubicSpline(points) {
    const count = points.length;
    if (count < 2) {
        return null;
    }

    const x = points.map((pair) => pair[0]);
    const y = points.map((pair) => pair[1]);
    const a = y.slice();
    const b = Array(count - 1).fill(0);
    const c = Array(count).fill(0);
    const d = Array(count - 1).fill(0);
    const h = Array(count - 1).fill(0);

    for (let index = 0; index < count - 1; index += 1) {
        h[index] = x[index + 1] - x[index];
        if (h[index] <= EPSILON) {
            return null;
        }
    }

    const alpha = Array(count).fill(0);
    for (let index = 1; index < count - 1; index += 1) {
        alpha[index] =
            (3 / h[index]) * (a[index + 1] - a[index]) -
            (3 / h[index - 1]) * (a[index] - a[index - 1]);
    }

    const l = Array(count).fill(0);
    const mu = Array(count).fill(0);
    const z = Array(count).fill(0);
    l[0] = 1;

    for (let index = 1; index < count - 1; index += 1) {
        l[index] = 2 * (x[index + 1] - x[index - 1]) - h[index - 1] * mu[index - 1];
        if (nearlyZero(l[index])) {
            return null;
        }
        mu[index] = h[index] / l[index];
        z[index] = (alpha[index] - h[index - 1] * z[index - 1]) / l[index];
    }

    l[count - 1] = 1;
    c[count - 1] = 0;

    for (let index = count - 2; index >= 0; index -= 1) {
        c[index] = z[index] - mu[index] * c[index + 1];
        b[index] =
            (a[index + 1] - a[index]) / h[index] -
            (h[index] * (c[index + 1] + 2 * c[index])) / 3;
        d[index] = (c[index + 1] - c[index]) / (3 * h[index]);
    }

    return {
        points,
        segments: points.slice(0, -1).map((pair, index) => ({
            x0: x[index],
            x1: x[index + 1],
            a: a[index],
            b: b[index],
            c: c[index],
            d: d[index],
        })),
        minX: x[0],
        maxX: x[count - 1],
        minY: y[0],
        maxY: y[count - 1],
    };
}

function findSplineSegment(spline, xValue) {
    const clampedX = clamp(xValue, spline.minX, spline.maxX);
    let low = 0;
    let high = spline.segments.length - 1;

    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const segment = spline.segments[mid];
        if (clampedX < segment.x0) {
            high = mid - 1;
        } else if (clampedX > segment.x1) {
            low = mid + 1;
        } else {
            return segment;
        }
    }

    return spline.segments[Math.max(0, Math.min(spline.segments.length - 1, low))];
}

function evaluateSpline(spline, xValue) {
    const segment = findSplineSegment(spline, xValue);
    const dx = clamp(xValue, segment.x0, segment.x1) - segment.x0;
    return segment.a + segment.b * dx + segment.c * dx * dx + segment.d * dx * dx * dx;
}

function invertMonotonicSpline(spline, yValue) {
    const clampedY = clamp(yValue, spline.minY, spline.maxY);
    let low = spline.minX;
    let high = spline.maxX;

    for (let iteration = 0; iteration < 48; iteration += 1) {
        const mid = (low + high) / 2;
        const sample = evaluateSpline(spline, mid);
        if (sample < clampedY) {
            low = mid;
        } else {
            high = mid;
        }
    }

    return (low + high) / 2;
}

function applyToneCurveOffset(baseEntry, styleEntry, targetEntry) {
    const basePairs = parseCurvePairs(baseEntry);
    const stylePairs = parseCurvePairs(styleEntry);
    const targetPairs = parseCurvePairs(targetEntry);
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

    return replaceNumbersInRawValue(
        targetEntry.rawValue,
        targetEntry.numbers,
        outputValues,
        buildTokenSamples(baseEntry, styleEntry, targetEntry),
    );
}

function buildPiecewiseFunction(values) {
    if (values.length < 2) {
        return null;
    }

    const domain = values.map((_, index) => (values.length === 1 ? 0 : index / (values.length - 1)));
    return { domain, range: values.slice() };
}

function evaluatePiecewise(func, xValue) {
    const x = clamp(xValue, 0, 1);
    const lastIndex = func.domain.length - 1;
    if (x <= 0) {
        return func.range[0];
    }
    if (x >= 1) {
        return func.range[lastIndex];
    }

    let low = 0;
    let high = lastIndex - 1;
    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const x0 = func.domain[mid];
        const x1 = func.domain[mid + 1];
        if (x < x0) {
            high = mid - 1;
        } else if (x > x1) {
            low = mid + 1;
        } else {
            const t = (x - x0) / (x1 - x0);
            return func.range[mid] + t * (func.range[mid + 1] - func.range[mid]);
        }
    }

    return func.range[lastIndex];
}

function invertMonotonicPiecewise(func, yValue) {
    const minY = func.range[0];
    const maxY = func.range[func.range.length - 1];
    const y = clamp(yValue, minY, maxY);
    let low = 0;
    let high = 1;

    for (let iteration = 0; iteration < 40; iteration += 1) {
        const mid = (low + high) / 2;
        const sample = evaluatePiecewise(func, mid);
        if (sample < y) {
            low = mid;
        } else {
            high = mid;
        }
    }

    return (low + high) / 2;
}

function applyMonotonicLutOffset(baseEntry, styleEntry, targetEntry) {
    const baseValues = baseEntry.numbers.map((token) => token.value);
    const styleValues = styleEntry.numbers.map((token) => token.value);
    const targetValues = targetEntry.numbers.map((token) => token.value);

    if (baseValues.length < 2 || styleValues.length < 2 || targetValues.length < 2) {
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

    return replaceNumbersInRawValue(
        targetEntry.rawValue,
        targetEntry.numbers,
        outputValues,
        buildTokenSamples(baseEntry, styleEntry, targetEntry),
    );
}

function applyHsvTableOffset(baseEntry, styleEntry, targetEntry) {
    if (
        baseEntry.numbers.length !== styleEntry.numbers.length ||
        baseEntry.numbers.length !== targetEntry.numbers.length ||
        targetEntry.numbers.length % 3 !== 0
    ) {
        return null;
    }

    const outputValues = [];

    for (let index = 0; index < targetEntry.numbers.length; index += 3) {
        const baseHue = baseEntry.numbers[index].value;
        const styleHue = styleEntry.numbers[index].value;
        const targetHue = targetEntry.numbers[index].value;
        const hueOffset = wrapDegrees(styleHue - baseHue);
        outputValues.push(wrapDegrees(targetHue + hueOffset));

        for (let component = 1; component <= 2; component += 1) {
            const baseValue = baseEntry.numbers[index + component].value;
            const styleValue = styleEntry.numbers[index + component].value;
            const targetValue = targetEntry.numbers[index + component].value;
            const ratio = safeRatio(baseValue, styleValue);
            if (ratio === null) {
                return null;
            }
            outputValues.push(targetValue * ratio);
        }
    }

    return replaceNumbersInRawValue(
        targetEntry.rawValue,
        targetEntry.numbers,
        outputValues,
        buildTokenSamples(baseEntry, styleEntry, targetEntry),
    );
}

function parseGainMap(values) {
    if (values.length < 12) {
        return null;
    }

    const mapPointsV = Math.round(values[0]);
    const mapPointsH = Math.round(values[1]);
    const mapPointsN = Math.round(values[6]);
    const dataCount = mapPointsV * mapPointsH * mapPointsN;

    if (dataCount <= 0) {
        return null;
    }

    if (values.length === 12 + dataCount) {
        return {
            headerSize: 12,
            mapPointsV,
            mapPointsH,
            mapPointsN,
            data: values.slice(12),
        };
    }

    if (values.length === 15 + dataCount) {
        return {
            headerSize: 15,
            mapPointsV,
            mapPointsH,
            mapPointsN,
            data: values.slice(15),
        };
    }

    return null;
}

function gainIndex(structure, vIndex, hIndex, nIndex) {
    return ((vIndex * structure.mapPointsH) + hIndex) * structure.mapPointsN + nIndex;
}

function sampleGain(structure, vCoord, hCoord, nCoord) {
    const vMax = Math.max(structure.mapPointsV - 1, 1);
    const hMax = Math.max(structure.mapPointsH - 1, 1);
    const nMax = Math.max(structure.mapPointsN - 1, 1);

    const v = clamp(vCoord, 0, 1) * vMax;
    const h = clamp(hCoord, 0, 1) * hMax;
    const n = clamp(nCoord, 0, 1) * nMax;

    const v0 = Math.floor(v);
    const h0 = Math.floor(h);
    const n0 = Math.floor(n);
    const v1 = Math.min(v0 + 1, structure.mapPointsV - 1);
    const h1 = Math.min(h0 + 1, structure.mapPointsH - 1);
    const n1 = Math.min(n0 + 1, structure.mapPointsN - 1);
    const tv = v - v0;
    const th = h - h0;
    const tn = n - n0;

    const c000 = structure.data[gainIndex(structure, v0, h0, n0)];
    const c001 = structure.data[gainIndex(structure, v0, h0, n1)];
    const c010 = structure.data[gainIndex(structure, v0, h1, n0)];
    const c011 = structure.data[gainIndex(structure, v0, h1, n1)];
    const c100 = structure.data[gainIndex(structure, v1, h0, n0)];
    const c101 = structure.data[gainIndex(structure, v1, h0, n1)];
    const c110 = structure.data[gainIndex(structure, v1, h1, n0)];
    const c111 = structure.data[gainIndex(structure, v1, h1, n1)];

    const c00 = c000 * (1 - tn) + c001 * tn;
    const c01 = c010 * (1 - tn) + c011 * tn;
    const c10 = c100 * (1 - tn) + c101 * tn;
    const c11 = c110 * (1 - tn) + c111 * tn;
    const c0 = c00 * (1 - th) + c01 * th;
    const c1 = c10 * (1 - th) + c11 * th;
    return c0 * (1 - tv) + c1 * tv;
}

function applyGainMapOffset(baseEntry, styleEntry, targetEntry) {
    const baseStructure = parseGainMap(baseEntry.numbers.map((token) => token.value));
    const styleStructure = parseGainMap(styleEntry.numbers.map((token) => token.value));
    const targetStructure = parseGainMap(targetEntry.numbers.map((token) => token.value));

    if (!baseStructure || !styleStructure || !targetStructure) {
        return null;
    }

    if (
        baseStructure.headerSize !== styleStructure.headerSize ||
        baseStructure.headerSize !== targetStructure.headerSize
    ) {
        return null;
    }

    const rawTargetValues = targetEntry.numbers.map((token) => token.value);
    const outputValues = rawTargetValues.slice();

    // Keep the target geometry, but adopt the style-side application semantics.
    for (let index = 7; index < targetStructure.headerSize; index += 1) {
        outputValues[index] = styleEntry.numbers[index].value;
    }

    let dataOffset = targetStructure.headerSize;
    for (let vIndex = 0; vIndex < targetStructure.mapPointsV; vIndex += 1) {
        for (let hIndex = 0; hIndex < targetStructure.mapPointsH; hIndex += 1) {
            for (let nIndex = 0; nIndex < targetStructure.mapPointsN; nIndex += 1) {
                const vCoord = targetStructure.mapPointsV === 1 ? 0 : vIndex / (targetStructure.mapPointsV - 1);
                const hCoord = targetStructure.mapPointsH === 1 ? 0 : hIndex / (targetStructure.mapPointsH - 1);
                const nCoord = targetStructure.mapPointsN === 1 ? 0 : nIndex / (targetStructure.mapPointsN - 1);
                const baseGain = sampleGain(baseStructure, vCoord, hCoord, nCoord);
                const styleGain = sampleGain(styleStructure, vCoord, hCoord, nCoord);
                const targetGain = rawTargetValues[dataOffset];
                const ratio = safeRatio(baseGain, styleGain);
                if (ratio === null) {
                    return null;
                }
                outputValues[dataOffset] = targetGain * ratio;
                dataOffset += 1;
            }
        }
    }

    return replaceNumbersInRawValue(
        targetEntry.rawValue,
        targetEntry.numbers,
        outputValues,
        buildTokenSamples(baseEntry, styleEntry, targetEntry),
    );
}

function applyCopyStyle(baseEntry, styleEntry, targetEntry) {
    if (styleEntry.rawValue === targetEntry.rawValue) {
        return {
            changed: 0,
            value: targetEntry.rawValue,
        };
    }

    return {
        changed: 1,
        value: styleEntry.rawValue,
    };
}

function transformEntry(strategy, baseEntry, styleEntry, targetEntry) {
    switch (strategy) {
        case STRATEGY.ADDITIVE:
            return applyAdditive(baseEntry, styleEntry, targetEntry);
        case STRATEGY.CHANNEL_RATIO:
            return applyChannelRatio(baseEntry, styleEntry, targetEntry);
        case STRATEGY.COPY_STYLE:
            return applyCopyStyle(baseEntry, styleEntry, targetEntry);
        case STRATEGY.GAIN_MAP:
            return applyGainMapOffset(baseEntry, styleEntry, targetEntry);
        case STRATEGY.HSV_TABLE:
            return applyHsvTableOffset(baseEntry, styleEntry, targetEntry);
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

function createOffsetReport(d1, d2, d3) {
    if ([d1, d2, d3].some(looksBinaryContent)) {
        throw new Error("偵測到二進位 DCP。這個工具目前只支援可讀文字型的 DCP 匯出內容，尚未支援直接編輯 Adobe 原生 binary .dcp。");
    }

    const sourceGroups1 = groupEntries(parseDcpEntries(d1));
    const sourceGroups2 = groupEntries(parseDcpEntries(d2));
    const targetEntries = parseDcpEntries(d3);

    const replacements = [];
    const usage = new Map();
    const unhandledKeys = new Set();
    const strategyCounts = {};

    let pixelEntryCount = 0;
    let changedNumberCount = 0;
    let skippedMetadataCount = 0;
    let skippedMismatchCount = 0;

    targetEntries.forEach((targetEntry) => {
        const strategy = resolveStrategy(targetEntry.normalizedKey);
        if (!strategy) {
            skippedMetadataCount += 1;
            if (!isMetadataKey(targetEntry.normalizedKey)) {
                unhandledKeys.add(targetEntry.key);
            }
            return;
        }

        const sourceList1 = sourceGroups1.get(targetEntry.normalizedKey) || [];
        const sourceList2 = sourceGroups2.get(targetEntry.normalizedKey) || [];
        const occurrenceIndex = usage.get(targetEntry.normalizedKey) || 0;
        const baseEntry = sourceList1[occurrenceIndex];
        const styleEntry = sourceList2[occurrenceIndex];
        usage.set(targetEntry.normalizedKey, occurrenceIndex + 1);

        if (!baseEntry || !styleEntry) {
            skippedMismatchCount += 1;
            return;
        }

        const replacement = transformEntry(strategy, baseEntry, styleEntry, targetEntry);
        if (!replacement) {
            skippedMismatchCount += 1;
            return;
        }

        replacements.push({
            start: targetEntry.valueStart,
            end: targetEntry.valueEnd,
            value: replacement.value,
        });

        pixelEntryCount += 1;
        changedNumberCount += replacement.changed;
        strategyCounts[strategy] = (strategyCounts[strategy] || 0) + 1;
    });

    replacements.sort((left, right) => left.start - right.start);

    let cursor = 0;
    let output = "";
    replacements.forEach((replacement) => {
        output += d3.slice(cursor, replacement.start);
        output += replacement.value;
        cursor = replacement.end;
    });
    output += d3.slice(cursor);

    return {
        output,
        summary: {
            changedNumberCount,
            pixelEntryCount,
            skippedMetadataCount,
            skippedMismatchCount,
            strategyCounts,
            unhandledKeys: Array.from(unhandledKeys),
        },
    };
}

function generateOffsetDcp(d1, d2, d3) {
    const report = createOffsetReport(d1 || "", d2 || "", d3 || "");
    if (report.summary.pixelEntryCount === 0) {
        throw new Error("找不到可處理的 DCP 像素欄位；請確認三份輸入檔案都有可解析的文字型 DCP 內容。");
    }
    return report.output;
}

function downloadText(filename, text) {
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function buildOutputFilename(file) {
    if (!file || !file.name) {
        return "offset-style.dcp";
    }
    return file.name.replace(/(\.[^.]+)?$/u, "-offset$1");
}

function bindUi() {
    const file1 = document.getElementById("dcp-file-1");
    const file2 = document.getElementById("dcp-file-2");
    const file3 = document.getElementById("dcp-file-3");
    const name1 = document.getElementById("dcp-name-1");
    const name2 = document.getElementById("dcp-name-2");
    const name3 = document.getElementById("dcp-name-3");
    const btn = document.getElementById("generate-download");

    [file1, file2, file3].forEach((input, index) => {
        input.addEventListener("change", () => {
            const filename = input.files && input.files[0] ? input.files[0].name : "未選擇檔案";
            if (index === 0) {
                name1.textContent = filename;
            }
            if (index === 1) {
                name2.textContent = filename;
            }
            if (index === 2) {
                name3.textContent = filename;
            }
        });
    });

    btn.addEventListener("click", async () => {
        btn.disabled = true;
        btn.textContent = "產生中...";

        try {
            const reads = [file1, file2, file3].map((input) => (
                input.files && input.files[0] ? readFileAsText(input.files[0]) : Promise.resolve("")
            ));
            const [text1, text2, text3] = await Promise.all(reads);
            const report = createOffsetReport(text1, text2, text3);

            if (report.summary.pixelEntryCount === 0) {
                throw new Error("找不到可處理的像素欄位。");
            }

            downloadText(buildOutputFilename(file3.files && file3.files[0]), report.output);
            console.info("DCP offset summary", report.summary);
        } catch (error) {
            console.error("產生 offset DCP 失敗", error);
            alert(`產生失敗：${error && error.message ? error.message : String(error)}`);
        } finally {
            btn.disabled = false;
            btn.textContent = "產生並下載 offset-style DCP";
        }
    });
}

if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", bindUi);
}

const dcpOffsetApi = {
    createOffsetReport,
    generateOffsetDcp,
    parseDcpEntries,
};

if (typeof module !== "undefined" && module.exports) {
    module.exports = dcpOffsetApi;
}

if (typeof globalThis !== "undefined") {
    globalThis.__dcpOffsetApi = dcpOffsetApi;
}
