# Nebel native colorless glass

`haze-glass.node` is an in-process Windows x64 Node-API addon. It creates a click-through DirectComposition surface immediately behind an Electron `BrowserWindow`, samples that window's monitor through DXGI Desktop Duplication, and renders the supplied physical-pixel polygon as color-neutral refractive glass.

API:

- `create(nativeWindowHandleBuffer)` returns `0` or a signed HRESULT.
- `configure(x, y, width, height, flatPolygon, blur, strength)` returns `0` or a signed HRESULT. Coordinates are physical screen pixels; polygon coordinates are relative physical pixels. Blur is `0..18`; strength is `0..1`.
- `tick()` returns `{ error, frames }`. A zero error includes capture timeouts where no new frame was available.
- `destroy()` releases capture, graphics resources and the native HWND, then restores the owner's previous display affinity.
- `test()` runs the synthetic renderer checks and returns `63` when all six checks pass, or a signed HRESULT on failure. It never reads live desktop pixels.
- `status()` returns the current status without capturing.

Build with `powershell -ExecutionPolicy Bypass -File .\build.ps1`. The addon dynamically resolves the stable Node-API entry points from its host and has no Node/Electron header or import-library dependency.

Limits are deliberate: Windows x64, SDR sRGB, unrotated monitor, panel at most 2048 x 2048 and 4,194,304 pixels, and at most 2,048 polygon points. Unsupported HDR/color spaces and rotated outputs fail creation without showing a native surface.
