export function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

export function detectPlatform(userAgent = navigator.userAgent) {
    const os = userAgent.includes("Windows")
        ? "Windows"
        : userAgent.includes("Mac")
            ? "macOS"
            : userAgent.includes("Linux")
                ? "Linux"
                : userAgent.includes("Android")
                    ? "Android"
                    : /iPhone|iPad|iPod/.test(userAgent)
                        ? "iOS"
                        : "Unknown OS";

    const browser = userAgent.includes("Edg")
        ? "Edge"
        : userAgent.includes("Chrome")
            ? "Chrome"
            : userAgent.includes("Safari")
                ? "Safari"
                : userAgent.includes("Firefox")
                    ? "Firefox"
                    : "Browser";

    return `${os} / ${browser}`;
}

export function formatSigned(value, digits = 0, suffix = "") {
    const numeric = Number(value);
    const prefix = numeric >= 0 ? "+" : "";
    const formatted = digits > 0 ? numeric.toFixed(digits) : String(Math.round(numeric));
    return `${prefix}${formatted}${suffix}`;
}

export function formatMegabytes(bytes) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function attachDropzone(node, onFile) {
    ["dragenter", "dragover"].forEach((eventName) => {
        node.addEventListener(eventName, (event) => {
            event.preventDefault();
            node.classList.add("is-dragover");
        });
    });

    ["dragleave", "drop"].forEach((eventName) => {
        node.addEventListener(eventName, (event) => {
            event.preventDefault();

            if (eventName === "drop" && event.dataTransfer && event.dataTransfer.files.length > 0) {
                onFile(event.dataTransfer.files[0]);
            }

            node.classList.remove("is-dragover");
        });
    });
}
