import { clamp } from "./utils.js";

export class PreviewViewport {
    constructor(elements) {
        this.elements = elements;
        this.state = {
            splitRatio: 0.56,
            scale: 1,
            fitScale: 1,
            minScale: 0.1,
            maxScale: 6,
            translateX: 0,
            translateY: 0,
            imageLoaded: false,
            imageWidth: 0,
            imageHeight: 0,
            imageName: "",
            imageKind: "",
            objectUrl: "",
            pointerMode: null,
            pointerId: null,
            panStartX: 0,
            panStartY: 0,
            panOriginX: 0,
            panOriginY: 0,
        };
    }

    initialize() {
        this.bindViewportInteractions();
        this.bindControls();
        this.applySplit();
        this.updateScaleReadouts();
    }

    async loadImageFile(file) {
        this.clearObjectUrl();
        const objectUrl = URL.createObjectURL(file);
        this.state.objectUrl = objectUrl;

        try {
            const metadata = await this.loadImageSource(objectUrl, file.name, file.type || "Local file");
            return {
                ...metadata,
                fileSize: file.size,
            };
        } catch (error) {
            this.clearObjectUrl();
            throw error;
        }
    }

    handleResize() {
        if (!this.state.imageLoaded) {
            this.applySplit();
            return;
        }

        this.fitToScreen();
        this.applySplit();
    }

    clearObjectUrl() {
        if (!this.state.objectUrl) {
            return;
        }

        URL.revokeObjectURL(this.state.objectUrl);
        this.state.objectUrl = "";
    }

    bindViewportInteractions() {
        const { viewport, splitBar } = this.elements;

        viewport.addEventListener("pointerdown", (event) => this.onViewportPointerDown(event));
        viewport.addEventListener("pointermove", (event) => this.onViewportPointerMove(event));
        viewport.addEventListener("pointerup", (event) => this.onViewportPointerUp(event));
        viewport.addEventListener("pointercancel", (event) => this.onViewportPointerUp(event));
        viewport.addEventListener("wheel", (event) => this.onViewportWheel(event), { passive: false });
        viewport.addEventListener("dblclick", (event) => this.onViewportDoubleClick(event));

        splitBar.addEventListener("pointerdown", (event) => {
            event.stopPropagation();
            this.state.pointerMode = "split";
            this.state.pointerId = event.pointerId;
            splitBar.setPointerCapture(event.pointerId);
            this.updateSplitFromClientY(event.clientY);
        });

        splitBar.addEventListener("pointermove", (event) => {
            if (this.state.pointerMode !== "split" || this.state.pointerId !== event.pointerId) {
                return;
            }

            this.updateSplitFromClientY(event.clientY);
        });

        splitBar.addEventListener("pointerup", (event) => {
            if (this.state.pointerId !== event.pointerId) {
                return;
            }

            splitBar.releasePointerCapture(event.pointerId);
            this.state.pointerMode = null;
            this.state.pointerId = null;
        });

        splitBar.addEventListener("pointercancel", (event) => {
            if (this.state.pointerId !== event.pointerId) {
                return;
            }

            this.state.pointerMode = null;
            this.state.pointerId = null;
        });
    }

    bindControls() {
        const { zoomSlider, fitButton, resetButton } = this.elements;

        zoomSlider.addEventListener("input", () => {
            if (!this.state.imageLoaded) {
                return;
            }

            const rect = this.elements.viewport.getBoundingClientRect();
            this.setScaleAroundPoint(
                clamp(Number(zoomSlider.value) / 100, this.state.minScale, this.state.maxScale),
                rect.width / 2,
                rect.height / 2
            );
        });

        fitButton.addEventListener("click", () => this.fitToScreen());
        resetButton.addEventListener("click", () => this.centerCurrentScale());
    }

    loadImageSource(src, name, kind) {
        return new Promise((resolve, reject) => {
            const loader = new Image();

            loader.onload = () => {
                this.state.imageLoaded = true;
                this.state.imageName = name;
                this.state.imageKind = kind;
                this.state.imageWidth = loader.naturalWidth || loader.width;
                this.state.imageHeight = loader.naturalHeight || loader.height;

                this.elements.baseImage.src = src;
                this.elements.styledImage.src = src;
                this.elements.imageCanvas.style.width = `${this.state.imageWidth}px`;
                this.elements.imageCanvas.style.height = `${this.state.imageHeight}px`;
                this.elements.emptyState.hidden = true;
                this.state.splitRatio = 0.56;

                this.fitToScreen();
                this.applySplit();
                this.updateMetaReadouts();

                resolve({
                    imageName: this.state.imageName,
                    imageKind: this.state.imageKind,
                    imageWidth: this.state.imageWidth,
                    imageHeight: this.state.imageHeight,
                });
            };

            loader.onerror = () => {
                reject(new Error("Image could not be decoded for preview."));
            };

            loader.src = src;
        });
    }

    updateMetaReadouts() {
        this.elements.overlayDimensionsLabel.textContent = `${this.state.imageWidth} x ${this.state.imageHeight} px`;
        this.updateScaleReadouts();
    }

    fitToScreen() {
        if (!this.state.imageLoaded) {
            return;
        }

        const rect = this.elements.viewport.getBoundingClientRect();
        const usableWidth = Math.max(rect.width - 24, 1);
        const usableHeight = Math.max(rect.height - 24, 1);

        this.state.fitScale = Math.min(usableWidth / this.state.imageWidth, usableHeight / this.state.imageHeight);
        this.state.scale = clamp(this.state.fitScale, this.state.minScale, this.state.maxScale);
        this.centerCurrentScale();
    }

    centerCurrentScale() {
        if (!this.state.imageLoaded) {
            return;
        }

        const rect = this.elements.viewport.getBoundingClientRect();
        this.state.translateX = (rect.width - this.state.imageWidth * this.state.scale) / 2;
        this.state.translateY = (rect.height - this.state.imageHeight * this.state.scale) / 2;
        this.applyTransform();
    }

    applyTransform() {
        this.elements.imageCanvas.style.transform = `translate3d(${this.state.translateX}px, ${this.state.translateY}px, 0) scale(${this.state.scale})`;
        this.updateScaleReadouts();
    }

    updateScaleReadouts() {
        if (!this.state.imageLoaded) {
            this.elements.zoomReadout.textContent = "0%";
            this.elements.diagDownscale.textContent = "Waiting for image";
            return;
        }

        const zoomPercent = Math.round(this.state.scale * 100);
        this.elements.zoomSlider.value = String(clamp(Math.round(this.state.scale * 100), 10, 600));
        this.elements.zoomReadout.textContent = `${zoomPercent}%`;
        this.elements.diagDownscale.textContent = `Fit ${Math.round(this.state.fitScale * 100)}% · Live ${zoomPercent}%`;
    }

    applySplit() {
        const bottomInset = 100 - this.state.splitRatio * 100;
        this.elements.baseLayer.style.clipPath = `inset(0 0 ${bottomInset}% 0)`;

        const viewportHeight = this.elements.viewport.getBoundingClientRect().height;
        this.elements.splitBar.style.top = `${this.state.splitRatio * viewportHeight}px`;
        this.elements.splitBar.setAttribute("aria-valuenow", String(Math.round(this.state.splitRatio * 100)));
        this.elements.overlayPerformanceLabel.textContent = `Split ${Math.round(this.state.splitRatio * 100)}% · CSS clip-path live`;
    }

    updateSplitFromClientY(clientY) {
        const rect = this.elements.viewport.getBoundingClientRect();
        const ratio = (clientY - rect.top) / rect.height;
        this.state.splitRatio = clamp(ratio, 0.1, 0.9);
        this.applySplit();
    }

    onViewportPointerDown(event) {
        if (!this.state.imageLoaded || event.button > 0) {
            return;
        }

        this.state.pointerMode = "pan";
        this.state.pointerId = event.pointerId;
        this.state.panStartX = event.clientX;
        this.state.panStartY = event.clientY;
        this.state.panOriginX = this.state.translateX;
        this.state.panOriginY = this.state.translateY;

        this.elements.viewport.classList.add("is-panning");
        this.elements.viewport.setPointerCapture(event.pointerId);
    }

    onViewportPointerMove(event) {
        if (this.state.pointerMode !== "pan" || this.state.pointerId !== event.pointerId) {
            return;
        }

        this.state.translateX = this.state.panOriginX + (event.clientX - this.state.panStartX);
        this.state.translateY = this.state.panOriginY + (event.clientY - this.state.panStartY);
        this.applyTransform();
    }

    onViewportPointerUp(event) {
        if (this.state.pointerId !== event.pointerId) {
            return;
        }

        this.elements.viewport.classList.remove("is-panning");

        if (this.state.pointerMode === "pan") {
            this.elements.viewport.releasePointerCapture(event.pointerId);
        }

        this.state.pointerMode = null;
        this.state.pointerId = null;
    }

    onViewportWheel(event) {
        if (!this.state.imageLoaded) {
            return;
        }

        event.preventDefault();

        const rect = this.elements.viewport.getBoundingClientRect();
        const pointX = event.clientX - rect.left;
        const pointY = event.clientY - rect.top;
        const scaleDelta = event.deltaY < 0 ? 1.08 : 0.92;

        this.setScaleAroundPoint(
            clamp(this.state.scale * scaleDelta, this.state.minScale, this.state.maxScale),
            pointX,
            pointY
        );
    }

    onViewportDoubleClick(event) {
        if (!this.state.imageLoaded) {
            return;
        }

        const rect = this.elements.viewport.getBoundingClientRect();
        const pointX = event.clientX - rect.left;
        const pointY = event.clientY - rect.top;

        if (Math.abs(this.state.scale - 1) < 0.03) {
            this.fitToScreen();
            return;
        }

        if (Math.abs(this.state.scale - this.state.fitScale) < 0.03) {
            this.setScaleAroundPoint(1, pointX, pointY);
        } else {
            this.fitToScreen();
        }
    }

    setScaleAroundPoint(newScale, pointX, pointY) {
        const imageX = (pointX - this.state.translateX) / this.state.scale;
        const imageY = (pointY - this.state.translateY) / this.state.scale;

        this.state.scale = newScale;
        this.state.translateX = pointX - imageX * this.state.scale;
        this.state.translateY = pointY - imageY * this.state.scale;

        this.applyTransform();
    }
}
