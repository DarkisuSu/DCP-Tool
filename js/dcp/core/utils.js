export const EPSILON = 1e-9;

export function normalizeKey(key) {
    return String(key || "").toLowerCase().replace(/[^a-z0-9]+/gu, "");
}

export function countDecimals(token) {
    const mantissa = String(token).toLowerCase().split("e")[0];
    const dotIndex = mantissa.indexOf(".");
    return dotIndex === -1 ? 0 : mantissa.length - dotIndex - 1;
}

export function formatNumber(value, sampleTokens = []) {
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

export function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

export function wrapDegrees(value) {
    let wrapped = value % 360;
    if (wrapped <= -180) {
        wrapped += 360;
    }
    if (wrapped > 180) {
        wrapped -= 360;
    }
    return wrapped;
}

export function nearlyZero(value) {
    return Math.abs(value) <= EPSILON;
}

export function isPositiveFinite(value) {
    return Number.isFinite(value) && value > EPSILON;
}

export function safeRatio(base, style) {
    if (!isPositiveFinite(base) || !Number.isFinite(style)) {
        return null;
    }

    return style / base;
}

export function getArrayBufferSlice(buffer) {
    if (buffer instanceof ArrayBuffer) {
        return buffer;
    }

    if (ArrayBuffer.isView(buffer)) {
        return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    }

    throw new Error("Expected ArrayBuffer or ArrayBufferView.");
}
