import { parseDcpDocument } from "./dcp/formats/document-factory.js";
import { createOffsetReport } from "./dcp/transform/offset-engine.js";

function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(file);
    });
}

function downloadBlob(filename, blob) {
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

function setFilenameLabel(node, file) {
    node.textContent = file ? file.name : "No file selected";
}

function formatSummary(summary) {
    const unhandled = summary.unhandledKeys.length > 0
        ? summary.unhandledKeys.join(", ")
        : "(none)";

    return [
        `changedNumberCount=${summary.changedNumberCount}`,
        `pixelEntryCount=${summary.pixelEntryCount}`,
        `skippedMismatchCount=${summary.skippedMismatchCount}`,
        `unhandledKeys=${unhandled}`,
    ].join(", ");
}

function bindUi() {
    const file1 = document.getElementById("dcp-file-1");
    const file2 = document.getElementById("dcp-file-2");
    const file3 = document.getElementById("dcp-file-3");
    const name1 = document.getElementById("dcp-name-1");
    const name2 = document.getElementById("dcp-name-2");
    const name3 = document.getElementById("dcp-name-3");
    const button = document.getElementById("generate-download");

    [file1, file2, file3].forEach((input, index) => {
        input.addEventListener("change", () => {
            const file = input.files && input.files[0] ? input.files[0] : null;
            if (index === 0) {
                setFilenameLabel(name1, file);
            }
            if (index === 1) {
                setFilenameLabel(name2, file);
            }
            if (index === 2) {
                setFilenameLabel(name3, file);
            }
        });
    });

    button.addEventListener("click", async () => {
        button.disabled = true;
        button.textContent = "Processing...";

        try {
            const files = [file1, file2, file3].map((input) => (
                input.files && input.files[0] ? input.files[0] : null
            ));

            if (files.some((file) => !file)) {
                throw new Error("Please choose DCP 1, DCP 2, and DCP 3 before generating.");
            }

            const buffers = await Promise.all(files.map((file) => readFileAsArrayBuffer(file)));
            const baseDoc = parseDcpDocument(buffers[0]);
            const styleDoc = parseDcpDocument(buffers[1]);
            const targetDoc = parseDcpDocument(buffers[2]);
            const report = createOffsetReport(baseDoc, styleDoc, targetDoc);
            const summary = report.summary;

            console.info("DCP offset summary", summary);

            if (summary.pixelEntryCount === 0) {
                throw new Error("No transformable pixel tags were found in DCP 3.");
            }

            if (summary.changedNumberCount === 0) {
                throw new Error(`Offset produced no pixel changes. ${formatSummary(summary)}`);
            }

            if (summary.skippedMismatchCount > 0 || summary.unhandledKeys.length > 0) {
                console.warn("DCP offset completed with partial coverage.", summary);
            }

            downloadBlob(buildOutputFilename(files[2]), report.outputDocument.toBlob());
        } catch (error) {
            console.error("Failed to generate offset DCP.", error);
            alert(`Failed to generate offset DCP: ${error && error.message ? error.message : String(error)}`);
        } finally {
            button.disabled = false;
            button.textContent = "Generate and download offset-style DCP";
        }
    });
}

if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", bindUi);
}
