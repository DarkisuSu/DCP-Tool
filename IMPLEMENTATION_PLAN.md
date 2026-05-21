# Implementation Plan - DCP Raw Profile Editor & Interactive Preview

We are building a tool to edit DNG Camera Profiles (DCP) and preview the results on raw images.
The ultimate goal of this tool is to **transfer a style profile** by extracting the image-related parameter delta (offset) between a **Reference Original Profile (original2)** and a **Reference Stylish Profile (edited2)**, and applying that delta to a **Base Target Profile**.

Currently, we are building the **high-performance RAW preview function** step-by-step. To ensure the interface perfectly aligns with our final editing method, we will structure the preview system to support two profile sets:

- **Set A (Delta References)**:
  - **Upper Slice**: Reference Original (Standard) Profile
  - **Lower Slice**: Reference Stylish (Edited) Profile
- **Set B (Generate Reference)**:
  - **Upper Slice**: Base Target (Standard) Profile
  - **Lower Slice**: Generated Target (Edited) Profile

The user will be able to instantly swap the preview between **Set A** and **Set B** to compare the style difference on both profiles!

---

## User Review Required

Please review the updated workflow and preview toggle design:

> [!NOTE]
> **Set A & Set B Profile Slots**:
> The left sidebar will contain four structured file dropzones divided into two clear groups:
> - **SET A (Delta References)**
>   1. **Reference Original (.dcp)**: Standard unedited source profile.
>   2. **Reference Stylish (.dcp)**: Edited/stylish source profile.
> - **SET B (Target Generation)**
>   3. **Base Target (.dcp)**: The standard target profile you want to style.
>   4. **Generated Target (.dcp)**: The resulting styled target profile (automatically calculated in the future, currently simulated).

> [!IMPORTANT]
> **Draggable Slice Comparison Bar**:
> We will implement a horizontal comparison slider bar that can be dragged vertically (up and down):
> 1. **Upper Part**: Renders the image with the **Standard (Original / Base) Profile** of the selected set.
> 2. **Lower Part**: Renders the image with the **Stylish (Edited / Generated) Profile** of the selected set.
> 3. **Sync Pan & Zoom**: Both original and edited previews will pan and zoom perfectly in sync.
> 4. **High Performance**: We will use overlapping wrappers with matching CSS 3D transforms (`translate3d` and `scale`). The dividing line will adjust a CSS `clip-path` overlay in real-time. This ensures butter-smooth dragging of the split bar and images at 60 FPS.

> [!TIP]
> **Active Set Swap & Delta Simulation**:
> We will add a prominent **Set Selection Toggle** (`[ Preview Set A: Delta Source ]` vs. `[ Preview Set B: Styled Target ]`) floating above the preview area.
> Toggling between Set A and Set B will instantly update the style treatment of the lower slice:
> - **Set A Preview**: Simulates the source style (e.g. dramatic high-contrast cinematic style).
> - **Set B Preview**: Simulates the style applied to the target base (which might have a different default brightness or tone, showing how the style transfers to the target camera profile).
> - **Delta Sliders**: Interactive sliders in the left panel allow you to tweak the style offsets dynamically to see the impact.

---

## Proposed Changes

We will modify `index.html`, `style.css`, and `script.js` to create the editor interface.

### 1. Main Workspace

#### [MODIFY] `index.html`
- Clean up the "Hello World" template.
- Implement the split-screen structure:
  - **Left Sidebar Container**:
    - **Header**: Tech-accented logo, system status dot, active profile indicator.
    - **File Workflow Section**:
      - **SET A (Delta Source)** slots: Reference Original Dropzone, Reference Stylish Dropzone.
      - **SET B (Generated Target)** slots: Base Target Dropzone, Generated Target Dropzone.
    - **Raw Image Picker Section**:
      - Drag-and-drop zone for custom Raw/Image preview files.
      - Beautiful visual cards to quickly select 3 high-resolution sample images.
    - **Style Delta Sliders (Active Simulation)**:
      - Sliders for Exposure Delta, Contrast Delta, Saturation Offset, and Temperature Shift.
    - **Action Button**: "Generate Target Profile" button (disabled/mocked for now).
    - **Diagnostics/Info**: Downscaling stats, metadata readouts (ISO, Aperture, Dimensions).
  - **Right Preview Panel Container**:
    - **Interactive Viewport**: Contains the overlapping Before and After layers.
    - **Set Selection Tab Toggle**: Segmented toggle to choose between `PREVIEW SET A` and `PREVIEW SET B`.
    - **Draggable Split Bar**: A horizontal divider with a styled drag handle overlay.
    - Viewport overlays: Zoom Slider, Zoom Percent Indicator, "Fit to Screen" button, "Reset Pan" button.
    - Visual overlay metadata showing active set, filename, dimensions, and performance stats.

#### [MODIFY] `style.css`
- Implement a premium dark studio theme (deep slate, dark charcoal, vibrant neon blue/green accents).
- Setup layout classes for the split-screen (`display: grid` or `flex` with height locked to `100vh`).
- Style the file dropzone slots and the Set Selection segmented toggle.
- Style the split preview container and draggable comparison bar. Ensure full hardware acceleration support is active (`will-change: transform, clip-path`).

#### [MODIFY] `script.js`
- Implement raw image loader (supports user uploads and sample select).
- **Interactive Handlers**:
  - Mouse drag / Touch drag to pan.
  - Mouse wheel to zoom centered on cursor.
  - Double click to toggle between "Fit" and "100% Zoom".
  - **Vertical Slider Dragging**: Dragging the horizontal split bar vertically updates the CSS `clip-path` of the upper preview wrapper.
  - **Set Swapping & Live Filter Pipeline**:
    - Keep track of selected set (`A` or `B`).
    - Adjust CSS filters on the lower (stylish) layer based on the selected Set and the Delta Sliders:
      - **Set A (Source style)**: e.g. classic cinematic teal-and-orange grading simulation.
      - **Set B (Target style)**: e.g. clean portrait/editorial style simulation.
- Implement file drag-and-drop listeners for files.

---

## Verification Plan

### Manual & Interactive Testing
1. **Set Swap Toggle**: Click between `PREVIEW SET A` and `PREVIEW SET B`. Verify the lower preview slice updates immediately to show the respective profile style.
2. **DCP Slots UI**: Verify all 4 DCP slots (Set A standard/stylish, Set B standard/stylish) display correctly and support drag/drop feedback.
3. **Slice Slider Dragging**: Click and drag the horizontal split bar up and down. Verify it smoothly shifts the division line between the original image (top) and edited image (bottom).
4. **Interactive Zooming & Panning**: Zoom and pan the image. Verify that both parts zoom/pan in perfect synchronization, centered on the cursor, with no lag.
5. **Adjustment Effect**: Modify the left sidebar exposure/saturation sliders. Verify the changes apply *only* to the lower part of the image, while the upper part remains unchanged.
6. **Sample Picker**: Switch between sample images. Verify the zoom/pan/divider positions reset cleanly.
