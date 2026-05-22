# DCP Offset Tool

GitHub Pages: https://darkisusu.github.io/DCP-Tool/

This is a browser-based DCP offset tool. It takes the image-related change from `DCP1 -> DCP2`, applies that offset to `DCP3`, and downloads a new offset-style DCP.

## Usage

1. Open the GitHub Pages site.
2. Select `DCP 1` as the base profile.
3. Select `DCP 2` as the style/source profile.
4. Select `DCP 3` as the target profile.
5. Click `Generate and download offset-style DCP`.

## What It Transforms

The tool applies offset transforms to image-affecting fields such as:

- `ColorMatrix` / `ForwardMatrix` / `CameraCalibration`
- `AsShotWhiteXY`
- `ProfileToneCurve`
- `ProfileHueSatMapData`
- `ProfileLookTableData`
- `ProfileGainTableMap`
- `BaselineExposure`, `BlackLevel`, and `WhiteLevel`

Informational fields such as camera name, copyright, profile name, digest, and preview metadata keep the original `DCP3` value.

## Notes

- This GitHub Pages version supports both native Adobe binary `.dcp` files and text-based DCP exports that can be parsed in the browser.
- The binary workflow patches supported tags in place so the original DCP container layout stays intact.
