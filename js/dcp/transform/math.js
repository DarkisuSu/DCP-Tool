import { EPSILON, clamp, nearlyZero } from "../core/utils.js";

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

export function transpose(matrix) {
    return matrix[0].map((_, columnIndex) => matrix.map((row) => row[columnIndex]));
}

export function multiplyMatrices(left, right) {
    const rows = left.length;
    const cols = right[0].length;
    const inner = right.length;
    const output = Array.from({ length: rows }, () => Array(cols).fill(0));

    for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
            let sum = 0;
            for (let index = 0; index < inner; index += 1) {
                sum += left[row][index] * right[index][col];
            }
            output[row][col] = sum;
        }
    }

    return output;
}

export function invertMatrix(matrix) {
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

export function pseudoInverse(matrix) {
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

export function reshapeMatrix(values, rowCount) {
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

export function flattenMatrix(matrix) {
    return matrix.flat();
}

export function inferMatrixRowCount(values) {
    if (values.length % 3 === 0) {
        return 3;
    }

    const side = Math.sqrt(values.length);
    if (Number.isInteger(side)) {
        return side;
    }

    return null;
}

export function multiplyMatrixVector(matrix, vector) {
    return matrix.map((row) => row.reduce((sum, value, index) => sum + value * vector[index], 0));
}

export function xyToXyz(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || y <= EPSILON) {
        return null;
    }

    return [x / y, 1, (1 - x - y) / y];
}

export function xyzToXy(xyz) {
    const sum = xyz[0] + xyz[1] + xyz[2];
    if (!Number.isFinite(sum) || nearlyZero(sum)) {
        return null;
    }

    return [xyz[0] / sum, xyz[1] / sum];
}

export function adaptWhitePoint(baseXy, styleXy, targetXy) {
    const baseXyz = xyToXyz(baseXy[0], baseXy[1]);
    const styleXyz = xyToXyz(styleXy[0], styleXy[1]);
    const targetXyz = xyToXyz(targetXy[0], targetXy[1]);
    if (!baseXyz || !styleXyz || !targetXyz) {
        return null;
    }

    const baseCone = multiplyMatrixVector(BRADFORD, baseXyz);
    const styleCone = multiplyMatrixVector(BRADFORD, styleXyz);
    const targetCone = multiplyMatrixVector(BRADFORD, targetXyz);
    const adaptedCone = targetCone.map((value, index) => {
        if (Math.abs(baseCone[index]) <= EPSILON) {
            return value;
        }
        return value * (styleCone[index] / baseCone[index]);
    });

    const adaptedXyz = multiplyMatrixVector(BRADFORD_INVERSE, adaptedCone);
    return xyzToXy(adaptedXyz);
}

export function buildNaturalCubicSpline(points) {
    if (points.length < 2) {
        return null;
    }

    const x = points.map((pair) => pair[0]);
    const y = points.map((pair) => pair[1]);
    const a = y.slice();
    const b = Array(points.length - 1).fill(0);
    const c = Array(points.length).fill(0);
    const d = Array(points.length - 1).fill(0);
    const h = Array(points.length - 1).fill(0);

    for (let index = 0; index < points.length - 1; index += 1) {
        h[index] = x[index + 1] - x[index];
        if (h[index] <= EPSILON) {
            return null;
        }
    }

    const alpha = Array(points.length).fill(0);
    for (let index = 1; index < points.length - 1; index += 1) {
        alpha[index] =
            (3 / h[index]) * (a[index + 1] - a[index]) -
            (3 / h[index - 1]) * (a[index] - a[index - 1]);
    }

    const l = Array(points.length).fill(0);
    const mu = Array(points.length).fill(0);
    const z = Array(points.length).fill(0);
    l[0] = 1;

    for (let index = 1; index < points.length - 1; index += 1) {
        l[index] = 2 * (x[index + 1] - x[index - 1]) - h[index - 1] * mu[index - 1];
        if (nearlyZero(l[index])) {
            return null;
        }
        mu[index] = h[index] / l[index];
        z[index] = (alpha[index] - h[index - 1] * z[index - 1]) / l[index];
    }

    l[points.length - 1] = 1;

    for (let index = points.length - 2; index >= 0; index -= 1) {
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
        maxX: x[x.length - 1],
        minY: y[0],
        maxY: y[y.length - 1],
    };
}

export function evaluateSpline(spline, xValue) {
    const x = clamp(xValue, spline.minX, spline.maxX);
    const segment = spline.segments.find((item) => x >= item.x0 && x <= item.x1) || spline.segments[spline.segments.length - 1];
    const dx = x - segment.x0;
    return segment.a + segment.b * dx + segment.c * dx * dx + segment.d * dx * dx * dx;
}

export function invertMonotonicSpline(spline, yValue) {
    const target = clamp(yValue, spline.minY, spline.maxY);
    let low = spline.minX;
    let high = spline.maxX;

    for (let iteration = 0; iteration < 48; iteration += 1) {
        const mid = (low + high) / 2;
        const sample = evaluateSpline(spline, mid);
        if (sample < target) {
            low = mid;
        } else {
            high = mid;
        }
    }

    return (low + high) / 2;
}

export function buildPiecewiseFunction(values) {
    if (values.length < 2) {
        return null;
    }

    const domain = values.map((_, index) => (
        values.length === 1 ? 0 : index / (values.length - 1)
    ));
    return { domain, range: values.slice() };
}

export function evaluatePiecewise(func, xValue) {
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

export function invertMonotonicPiecewise(func, yValue) {
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

export function encodeSrgbUnit(value) {
    const linear = clamp(value, 0, 1);
    if (linear <= 0.0031308) {
        return 12.92 * linear;
    }
    return 1.055 * (linear ** (1 / 2.4)) - 0.055;
}

export function decodeSrgbUnit(value) {
    const encoded = clamp(value, 0, 1);
    if (encoded <= 0.04045) {
        return encoded / 12.92;
    }
    return ((encoded + 0.055) / 1.055) ** 2.4;
}

export function lerp(a, b, t) {
    return a + (b - a) * t;
}
