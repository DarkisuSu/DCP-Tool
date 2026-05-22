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
    node.textContent = file ? file.name : "未選擇檔案";
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

    btn.addEventListener("click", async () => {
        btn.disabled = true;
        btn.textContent = "產生中...";

        try {
            const files = [file1, file2, file3].map((input) => (
                input.files && input.files[0] ? input.files[0] : null
            ));

            if (files.some((file) => !file)) {
                throw new Error("請先選擇三個 DCP 檔案。");
            }

            const buffers = await Promise.all(files.map((file) => readFileAsArrayBuffer(file)));
            const baseDoc = parseDcpDocument(buffers[0]);
            const styleDoc = parseDcpDocument(buffers[1]);
            const targetDoc = parseDcpDocument(buffers[2]);
            const report = createOffsetReport(baseDoc, styleDoc, targetDoc);

            if (report.summary.pixelEntryCount === 0) {
                throw new Error("找不到可處理的像素欄位。");
            }

            downloadBlob(buildOutputFilename(files[2]), report.outputDocument.toBlob());
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
