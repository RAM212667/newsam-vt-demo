# VT Model Demo Site

This folder now contains:
- `models/sample.vrm` (sample VTuber model)
- `index.html` (viewer page)
- `app.js` (Three.js + VRM loader logic)

## Run it

Use a local server (required for loading `.vrm`):

```powershell
py -3 -m http.server 8080
```

Then open:

- `http://127.0.0.1:8080`

## How it works

- `app.js` imports Three.js and `three-vrm` from CDN.
- `GLTFLoader` + `VRMLoaderPlugin` load `./models/sample.vrm`.
- On load, the model is added to the scene and updated each animation frame with `vrm.update(delta)`.
- Orbit controls let you rotate/zoom/pan around the avatar.

## Notes

- If you open `index.html` directly with `file://`, model loading can fail due to browser security. Use the local server command above.