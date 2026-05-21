import { PreviewViewport } from "./preview-viewport.js";
import { StyleSimulator } from "./style-simulator.js";
import { attachDropzone, detectPlatform, formatMegabytes } from "./utils.js";

export class DcpPreviewApp {
    constructor(doc = document) {
        this.document = doc;
        this.state = {
            activeSet: "A",
        };
        this.elements = this.collectElements();
        this.previewViewport = new PreviewViewport({
            viewport: this.elements.viewport,
            imageCanvas: this.elements.imageCanvas,
            baseLayer: this.elements.baseLayer,
            baseImage: this.elements.baseImage,
            styledImage: this.elements.styledImage,
            splitBar: this.elements.splitBar,
            emptyState: this.elements.emptyState,
            zoomSlider: this.elements.zoomSlider,
            zoomReadout: this.elements.zoomReadout,
            fitButton: this.elements.fitButton,
            resetButton: this.elements.resetButton,
            diagDownscale: this.elements.diagDownscale,
            overlayDimensionsLabel: this.elements.overlayDimensionsLabel,
            overlayPerformanceLabel: this.elements.overlayPerformanceLabel,
        });
        this.styleSimulator = new StyleSimulator({
            sliderInputs: this.elements.sliderInputs,
            sliderOutputs: this.elements.sliderOutputs,
            styledImage: this.elements.styledImage,
            toneOverlay: this.elements.toneOverlay,
        });
    }

    initialize() {
        this.bindClock();
        this.bindPlatformInfo();
        this.bindSlotInputs();
        this.bindImageInput();
        this.bindSetToggle();
        this.bindGenerateButton();
        this.previewViewport.initialize();
        this.styleSimulator.initialize();
        this.updateSetUI();

        window.addEventListener("resize", () => this.previewViewport.handleResize());
    }

    collectElements() {
        return {
            statusText: this.document.getElementById("status-text"),
            activeSetPill: this.document.getElementById("active-set-pill"),
            diagClock: this.document.getElementById("diag-clock"),
            diagPlatform: this.document.getElementById("diag-platform"),
            diagDimensions: this.document.getElementById("diag-dimensions"),
            diagDownscale: this.document.getElementById("diag-downscale"),
            diagLens: this.document.getElementById("diag-lens"),
            diagSlice: this.document.getElementById("diag-slice"),
            overlaySetLabel: this.document.getElementById("overlay-set-label"),
            overlayFileLabel: this.document.getElementById("overlay-file-label"),
            overlaySliceLabel: this.document.getElementById("overlay-slice-label"),
            overlayDimensionsLabel: this.document.getElementById("overlay-dimensions-label"),
            overlayPerformanceLabel: this.document.getElementById("overlay-performance-label"),
            imageDropzone: this.document.getElementById("image-dropzone"),
            imageInput: this.document.getElementById("preview-image-input"),
            imageFileName: this.document.getElementById("image-file-name"),
            setToggle: this.document.getElementById("set-toggle"),
            viewport: this.document.getElementById("preview-viewport"),
            imageCanvas: this.document.getElementById("image-canvas"),
            baseLayer: this.document.getElementById("base-layer"),
            baseImage: this.document.getElementById("base-image"),
            styledImage: this.document.getElementById("styled-image"),
            toneOverlay: this.document.getElementById("tone-overlay"),
            splitBar: this.document.getElementById("split-bar"),
            emptyState: this.document.getElementById("empty-state"),
            zoomSlider: this.document.getElementById("zoom-slider"),
            zoomReadout: this.document.getElementById("zoom-readout"),
            fitButton: this.document.getElementById("fit-button"),
            resetButton: this.document.getElementById("reset-button"),
            generateButton: this.document.getElementById("generate-button"),
            slotNames: {
                "a-original": this.document.getElementById("slot-a-original-name"),
                "a-stylish": this.document.getElementById("slot-a-stylish-name"),
                "b-base": this.document.getElementById("slot-b-base-name"),
                "b-generated": this.document.getElementById("slot-b-generated-name"),
            },
            slotInputs: {
                "a-original": this.document.getElementById("slot-a-original-input"),
                "a-stylish": this.document.getElementById("slot-a-stylish-input"),
                "b-base": this.document.getElementById("slot-b-base-input"),
                "b-generated": this.document.getElementById("slot-b-generated-input"),
            },
            sliderInputs: {
                exposure: this.document.getElementById("slider-exposure"),
                contrast: this.document.getElementById("slider-contrast"),
                saturation: this.document.getElementById("slider-saturation"),
                temperature: this.document.getElementById("slider-temperature"),
            },
            sliderOutputs: {
                exposure: this.document.getElementById("slider-exposure-value"),
                contrast: this.document.getElementById("slider-contrast-value"),
                saturation: this.document.getElementById("slider-saturation-value"),
                temperature: this.document.getElementById("slider-temperature-value"),
            },
        };
    }

    bindClock() {
        const renderClock = () => {
            this.elements.diagClock.textContent = new Date().toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
            });
        };

        renderClock();
        window.setInterval(renderClock, 1000);
    }

    bindPlatformInfo() {
        this.elements.diagPlatform.textContent = detectPlatform();
    }

    bindSlotInputs() {
        Object.entries(this.elements.slotInputs).forEach(([slotKey, input]) => {
            const card = input.closest(".dropzone-card");

            input.addEventListener("change", () => {
                if (input.files && input.files[0]) {
                    this.registerSlotFile(slotKey, input.files[0], card);
                }
                input.value = "";
            });

            attachDropzone(card, (file) => this.registerSlotFile(slotKey, file, card));
        });
    }

    bindImageInput() {
        this.elements.imageInput.addEventListener("change", async () => {
            if (this.elements.imageInput.files && this.elements.imageInput.files[0]) {
                await this.handlePreviewImage(this.elements.imageInput.files[0]);
            }
            this.elements.imageInput.value = "";
        });

        attachDropzone(this.elements.imageDropzone, (file) => {
            void this.handlePreviewImage(file);
        });
    }

    bindSetToggle() {
        this.elements.setToggle.querySelectorAll("[data-set]").forEach((button) => {
            button.addEventListener("click", () => {
                this.state.activeSet = button.dataset.set;
                this.updateSetUI();
                this.styleSimulator.setActiveSet(this.state.activeSet);
            });
        });
    }

    bindGenerateButton() {
        this.elements.generateButton.addEventListener("click", () => {
            this.elements.statusText.textContent = "TARGET GENERATION NOT WIRED";
        });
    }

    registerSlotFile(slotKey, file, card) {
        this.elements.slotNames[slotKey].textContent = file.name;
        card.classList.add("is-loaded");
        this.elements.statusText.textContent = `${this.labelFromSlot(slotKey)} LOADED`;

        if (slotKey === "b-generated") {
            this.elements.statusText.textContent = "GENERATED TARGET PLACEHOLDER UPDATED";
        }
    }

    labelFromSlot(slotKey) {
        const labels = {
            "a-original": "REFERENCE ORIGINAL",
            "a-stylish": "REFERENCE STYLISH",
            "b-base": "BASE TARGET",
            "b-generated": "GENERATED TARGET",
        };

        return labels[slotKey];
    }

    async handlePreviewImage(file) {
        try {
            const metadata = await this.previewViewport.loadImageFile(file);
            this.elements.imageFileName.textContent = `${file.name} · ${formatMegabytes(metadata.fileSize)}`;
            this.elements.imageDropzone.classList.add("is-loaded");
            this.elements.overlayFileLabel.textContent = `${metadata.imageKind}: ${metadata.imageName}`;
            this.elements.diagDimensions.textContent = `${metadata.imageWidth} x ${metadata.imageHeight}`;
            this.elements.diagLens.textContent = "ISO / Aperture unavailable in browser simulation";
            this.elements.statusText.textContent = "PREVIEW READY";
            this.styleSimulator.apply(this.state.activeSet);
        } catch {
            this.elements.statusText.textContent = "PREVIEW FORMAT NOT SUPPORTED BY BROWSER";
            this.elements.imageFileName.textContent = `${file.name} could not be decoded for in-browser preview.`;
        }
    }

    updateSetUI() {
        this.elements.setToggle.querySelectorAll("[data-set]").forEach((button) => {
            button.classList.toggle("is-active", button.dataset.set === this.state.activeSet);
        });

        this.elements.activeSetPill.textContent = `SET ${this.state.activeSet} ACTIVE`;
        this.elements.overlaySetLabel.textContent = this.state.activeSet === "A"
            ? "SET A · Delta Source"
            : "SET B · Styled Target";
        this.elements.diagSlice.textContent = this.state.activeSet === "A"
            ? "Upper: Reference Original / Lower: Reference Stylish"
            : "Upper: Base Target / Lower: Generated Target";
        this.elements.overlaySliceLabel.textContent = this.state.activeSet === "A"
            ? "Upper: Reference Original · Lower: Reference Stylish"
            : "Upper: Base Target · Lower: Generated Target";
    }
}
