# Broadcast, microphone and camera — experimental

## Run locally

```sh
npm ci
npm run build
node scripts/package-image-lab.mjs
python3 -m http.server 8766 --bind 127.0.0.1 --directory workspace/delivery
```

Open http://127.0.0.1:8766/Image-Lab.html in desktop Chrome. Keep CAMERA beside the HTML. Camera mode rejects file://; single HTML is insufficient. If the port is occupied, stop only the server you started with Ctrl+C or choose another port and change the URL. Development: `npm run dev`, http://127.0.0.1:5181/image-lab.html.

## Controls and privacy

- **마이크 시작** requests audio only. RMS drives mouth opening, not phoneme recognition. Sensitivity: 0.25–4. Input diagnostics count browser-visible inputs, possibly including default aliases or privacy filtering.
- **카메라 시작 → 중립 보정** requests video only and locally tracks eyes/jaw and small mirrored whole-character position/roll. No isolated head yaw/pitch, hands, arms or full-body following is implemented.
- Active mic/TTS/audio/pack owns the mouth; camera continues to drive eyes. No new automatic mesh warp is applied. Face loss returns to neutral.
- **방송 화면** hides panels; Escape restores them. Dark, green and transparent backgrounds are available. Start inputs before entering broadcast mode and move the pointer away. Hover or keyboard focus may expose controls in capture.
- Stop/reset/source/project transitions/pagehide release capture and cancel stale permission/model completions. The camera model closes on stop.

The application does not record/save/upload captured media or monitor the microphone through speakers. Model/WASM requests use local CAMERA files, not a runtime CDN. OBS audio must be configured separately.

## Missing device

NotFoundError means a matching input was not found; it is not the same as NotAllowedError permission denial. Check actual hardware, operating-system input selection and browser input settings. A computer without microphone/camera hardware needs an external device or a different computer. The application cannot create missing physical hardware.

## OBS guidance — not tested integration

For macOS 13+, use OBS **macOS Screen Capture** to select Chrome, crop browser chrome and test a chroma-key filter if needed. Inspect mint hair carefully: green removal may damage it. Transparent canvas does not guarantee window-capture alpha. OBS Browser Source has a separate runtime/permission context and is unverified. Test local recording and separate microphone audio before live streaming. No physical-device or OBS acceptance is claimed.

## Evidence and remaining limits

- Node 126 tests, schema validation and 16 smoke checks passed.
- Actual local MediaPipe/WASM with native Chromium fake video: 7 checks passed. Public portrait plus synthetic movement/blank frames verified expression/position changes, face-loss neutral, no unsolicited capture, track shutdown and local-only requests. Not a test of a real person's changing expressions or a physical webcam.
- Earlier native fake microphone: 9 checks passed, including 60 seconds of activity. Permission-denial automation did not pass due to an environment error; the whole microphone harness is not PASS.
- Independent camera source review found no confirmed blocker in its limited scope. Hardware, permission races, OBS, long-session stability and naturalness remain unverified.
- Test portraits, synthetic video and private logs are excluded from the repository. This is an experimental capture feature, not a completed VTuber system.

## Dependencies and sources

Pinned @mediapipe/tasks-vision 0.10.32; official Face Landmarker float16 revision 1. Vendor files/model are local in apps/preview/public/CAMERA and copied to delivery by the packager. Preserve vendor notices with distribution; artwork permissions are separate.

- https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js
- https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
- https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
- https://obsproject.com/kb/macos-screen-capture-source
