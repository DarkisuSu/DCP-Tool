export const DEFAULT_OUTPUT_POSTFIX = "_offset";

export function buildOutputFilename(file, postfix = DEFAULT_OUTPUT_POSTFIX) {
    const normalizedPostfix = normalizePostfix(postfix);
    if (!file || !file.name) {
        return `offset-style${normalizedPostfix}.dcp`;
    }

    return file.name.replace(/(\.[^.]+)?$/u, `${normalizedPostfix}$1`);
}

export function applyOutputPostfix(document, postfix = DEFAULT_OUTPUT_POSTFIX) {
    const normalizedPostfix = normalizePostfix(postfix);
    const profileNameEntry = document.findEntries("profilename")[0];
    if (!profileNameEntry) {
        return 0;
    }

    const currentName = readEntryText(profileNameEntry);
    if (!currentName) {
        return 0;
    }

    return writeEntryText(profileNameEntry, `${currentName}${normalizedPostfix}`);
}

export function normalizePostfix(postfix) {
    return typeof postfix === "string" ? postfix : DEFAULT_OUTPUT_POSTFIX;
}

function readEntryText(entry) {
    if (typeof entry.getSerializedValue === "function") {
        return entry.getSerializedValue();
    }

    if (typeof entry.decodedValue === "string") {
        return entry.decodedValue;
    }

    if (typeof entry.rawValue === "string") {
        return entry.rawValue;
    }

    return null;
}

function writeEntryText(entry, value) {
    if (typeof entry.setTextValue === "function") {
        return entry.setTextValue(value);
    }

    if (typeof entry.setRawValue === "function") {
        return entry.setRawValue(value);
    }

    return null;
}
