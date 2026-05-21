import { clamp, formatSigned } from "./utils.js";

export class StyleSimulator {
    constructor({ sliderInputs, sliderOutputs, styledImage, toneOverlay }) {
        this.sliderInputs = sliderInputs;
        this.sliderOutputs = sliderOutputs;
        this.styledImage = styledImage;
        this.toneOverlay = toneOverlay;
        this.activeSet = "A";
    }

    initialize(onChange) {
        Object.values(this.sliderInputs).forEach((input) => {
            input.addEventListener("input", () => {
                this.updateOutputs();
                this.apply(this.activeSet);

                if (typeof onChange === "function") {
                    onChange(this.getValues());
                }
            });
        });

        this.updateOutputs();
        this.apply(this.activeSet);
    }

    setActiveSet(activeSet) {
        this.activeSet = activeSet;
        this.apply(activeSet);
    }

    getValues() {
        return {
            exposure: Number(this.sliderInputs.exposure.value),
            contrast: Number(this.sliderInputs.contrast.value),
            saturation: Number(this.sliderInputs.saturation.value),
            temperature: Number(this.sliderInputs.temperature.value),
        };
    }

    updateOutputs() {
        const { exposure, contrast, saturation, temperature } = this.getValues();

        this.sliderOutputs.exposure.textContent = formatSigned(exposure, 2, " EV");
        this.sliderOutputs.contrast.textContent = formatSigned(contrast);
        this.sliderOutputs.saturation.textContent = formatSigned(saturation);
        this.sliderOutputs.temperature.textContent = formatSigned(temperature);
    }

    apply(activeSet = this.activeSet) {
        const { exposure, contrast, saturation, temperature } = this.getValues();
        let brightness;
        let contrastFactor;
        let saturationFactor;
        let sepia;
        let hueRotate;
        let overlayOpacity;
        let overlayGradient;

        if (activeSet === "A") {
            brightness = 1 + exposure * 0.18;
            contrastFactor = 1.1 + contrast * 0.012;
            saturationFactor = 1.16 + saturation * 0.012;
            sepia = clamp(0.1 + Math.abs(temperature) * 0.004, 0, 0.5);
            hueRotate = -12 - temperature * 0.42;
            overlayOpacity = clamp(0.22 + saturation * 0.002 + Math.abs(temperature) * 0.002, 0.12, 0.42);
            overlayGradient = "linear-gradient(135deg, rgba(17, 167, 188, 0.95), rgba(17, 167, 188, 0) 42%), linear-gradient(315deg, rgba(255, 146, 61, 0.88), rgba(255, 146, 61, 0) 48%)";
        } else {
            brightness = 1.02 + exposure * 0.14;
            contrastFactor = 1.02 + contrast * 0.009;
            saturationFactor = 1.06 + saturation * 0.009;
            sepia = clamp(0.04 + Math.max(temperature, 0) * 0.003, 0, 0.22);
            hueRotate = temperature * 0.18;
            overlayOpacity = clamp(0.16 + saturation * 0.0015 + Math.abs(temperature) * 0.0012, 0.08, 0.3);
            overlayGradient = "linear-gradient(135deg, rgba(250, 214, 186, 0.92), rgba(250, 214, 186, 0) 36%), linear-gradient(315deg, rgba(126, 189, 255, 0.78), rgba(126, 189, 255, 0) 48%)";
        }

        this.styledImage.style.filter = [
            `brightness(${brightness.toFixed(3)})`,
            `contrast(${contrastFactor.toFixed(3)})`,
            `saturate(${saturationFactor.toFixed(3)})`,
            `sepia(${sepia.toFixed(3)})`,
            `hue-rotate(${hueRotate.toFixed(1)}deg)`,
        ].join(" ");

        this.toneOverlay.style.opacity = overlayOpacity.toFixed(3);
        this.toneOverlay.style.background = overlayGradient;
    }
}
