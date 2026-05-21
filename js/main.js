import { DcpPreviewApp } from "./app.js";

if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", () => {
        const app = new DcpPreviewApp(document);
        app.initialize();
    });
}
