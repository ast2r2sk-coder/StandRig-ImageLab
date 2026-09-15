<div align="center">

# StandRig Image Lab

### You have the illustration. Start experimenting with motion.

A PNG/JPG character playground built on [StandRig](https://github.com/sayaka-aiart/StandRig).<br>
Edit part masks, try expressions and hair physics, then export a portable HTML player.

**[Get started](#get-started) · [What works](#what-works-today) · [Contribute](#help-make-it-better) · [한국어](README.ko.md)**

![Stage: experimental](https://img.shields.io/badge/stage-experimental-ffc857)
[![Code license: Apache 2.0](https://img.shields.io/badge/code-Apache%202.0-63d8c0)](LICENSE)
[![Built on StandRig](https://img.shields.io/badge/built%20on-StandRig-8ab4f8)](https://github.com/sayaka-aiart/StandRig)

![Actual Image Lab playback: supplied character moving and blinking](docs/image-lab/demo.gif)

*Recorded from the working sample. This is 2D deformation, not a 3D model.*

</div>

## Current development snapshot

The default branch `image-lab` includes experimental broadcast mode, opt-in microphone RMS and local camera face following; see [setup, privacy, limitations and verification](docs/BROADCAST.md). The demo GIF illustrates an earlier build, not the new speech-pack feature.

- Speech/audio, blinking and gentle motion run concurrently; pose clicks restart and return to the previous pose without interrupting speech.
- Automatic motion uses small rigid translation/rotation instead of deforming the face/body. Hair spring effects are isolated and conservative. Manual angle sliders/pointer can still warp the image.
- Optional **local Korean speech packs** combine macOS-generated WAV with estimated CTC jamo timing and drive E/A/O from the same audio clock. **I uses E artwork**, not a dedicated I texture. See [setup, usage, tests and licensing](docs/LOCAL-SPEECH.md).
- Generation is a separate local CLI followed by pack import/play. The in-app browser TTS remains event-based; this is **not one-click in-app aligned TTS**.
- Head-only nodding, natural full hair motion, dedicated I artwork and large-angle reconstruction remain unfinished. Greeting poses tilt the whole character, not a hand wave.
- Bounded evidence: 10/10 new sentences aligned, 11/12 including controls; one original long greeting was rejected. Actual packaged-browser checks: 13 passed. These are not a general pronunciation-accuracy or naturalness guarantee.



## Why this fork?

You have a character illustration, but not a layered PSD. You want to try a blink, move the head a little and see the hair respond before committing to a full rigging workflow.

Image Lab adds that starting point to StandRig: load a PNG or JPG, edit the part regions, and experiment in your browser. The included character gives you a working example to inspect and modify.

**It is a hands-on rigging experiment, not a one-click image-to-Live2D converter.** Arbitrary images need mask adjustment and often extra artwork. The included expression sheet is registered specifically to the sample character.

## What works today

| Try this | What you get |
| --- | --- |
| Start without a PSD | PNG/JPG input with editable polygon masks and an optional color key |
| Make the sample blink | Separate left/right eye controls with half-closed and closed-eye artwork |
| Change the sample's mouth | A/E/O texture states, with separate openness and shape controls |
| Experiment with motion | Head/body parameters, pointer input and StandRig hair springs |
| Replace a part | Follow role prompts, import a part, then adjust masks, layer order and placement; importing/resetting a part clears placement |
| Try local audio / speech | Local-file RMS mouth opening, or local-voice TTS with event-based mouth approximation (not RMS or phonemes) |
| Try gentle poses | Small bow, nod and tilt overlays; restore prior angles exactly, not a hand wave |
| Keep editing later | Save and reopen a project JSON |
| Take the result with you | Export an image-embedded StandRig JSON or build one offline HTML file |

The Image Lab editor does not automatically upload your artwork or require an image-generation API key. Exported files can contain your images; check them before sharing.

## Get started

Use **Node.js 22 or 24**, npm, and a desktop browser. Chrome is the browser used for the sample's local checks.

```bash
git clone --branch image-lab https://github.com/ast2r2sk-coder/StandRig-ImageLab.git
cd StandRig-ImageLab
npm ci
npm run build
npm run dev
```

Open **http://127.0.0.1:5181/image-lab.html**.

The sample loads automatically. The editor currently uses Korean labels:

1. Click **재생** (Play) to see motion and blinking.
2. Click **얼굴 확대** (Face zoom) and try the eye and mouth sliders.
3. Use **원본 교체** (Replace source) to bring your own PNG/JPG. Adjust the masks to fit it.
4. Click **편집 프로젝트 JSON** (Save project) before refreshing or closing the page.

Image Lab does not require the StandRig backend service. For the original PSD/MCP workflow, see the [upstream guide](https://github.com/sayaka-aiart/StandRig#readme).

### Build a single offline HTML

After building the project:

```bash
node scripts/package-image-lab.mjs
```

Open `workspace/delivery/Image-Lab.html` in desktop Chrome. The generated file includes the sample, editor and runtime; it does not need a running server. Building it requires Node/npm, but opening it does not.

When distributing a build, include `LICENSE`, `NOTICE`, `THIRD_PARTY_NOTICES.md`, `licenses/` and the [character notice](assets/character/NOTICE.md). The packager does not bundle those notices automatically. Do not publish your entire `workspace/` directory.

### Offline speech packs (local CLI, not one-click TTS)

Generate using `python3 scripts/local-speech/speech.py --text '안녕하세요' --model /path/to/local/model --output workspace/local-speech/new-run` with the local speech Python dependencies installed. Only aligned cases produce `utterance.speech.json`. To package an existing actual alignment without inference:

```bash
python3 scripts/local-speech/speech.py --pack-existing workspace/local-speech/batch/new-01
python3 scripts/local-speech/speech.py --pack-existing workspace/local-speech/batch/new-02
```

In Image Lab, choose the separate speech-pack file input, then **팩 재생** / **팩 정지**. No API/server is required. The embedded WAV and shapes share the audio context clock. Packs are limited to 5MB and 30 seconds; SHA-256, WAV structure/duration and aligned token bounds/confidence are checked, followed by decoded-duration checking at playback.

Timing is **estimated CTC jamo/grapheme emission occupancy, not full phoneme alignment**. Original token intervals are unchanged. Rendering holds a vowel for at most 0.12 seconds after its observed end, gated by audio RMS; this is render interpolation, not additional observed occupancy. I vowels **ㅣ/ㅟ/ㅡ/ㅢ use the closest existing E texture** until dedicated artwork exists: there is no unique I texture. E-family vowels use E, rounded O/U-family vowels use O, and A/ㅓ-family vowels use A. Packs contain dialogue and audio: keep private local artifacts private. Source replacement still disables sample-specific expression artwork.

## What to expect

Small motions and sample expressions are the useful starting point. Large turns are still a research problem here.

- Head/body movement deforms 2D artwork. It does not reconstruct hidden surfaces or reproduce calibrated 3D angles.
- The supplied head/body underlay images are included as references, but are **not applied at runtime**.
- Expression transitions use texture blending. Skin seams, intermediate ghosting, magenta edge residue and thin mesh lines may remain visible.
- Replacing the source disables the sample-specific expression overlays. New characters need their own masks and registered expression artwork.
- Local audio files support amplitude-only mouth opening, not phoneme alignment. TTS accepts only browser-reported local voices, with no remote/default fallback; its mouth rhythm approximates start/boundary events and does not measure audio RMS. Missing local voices produce an error and suggest a local audio file. Microphone RMS and local camera face following are experimental modes described in the broadcast guide; audio is not saved in project JSON. There is **no Cubism `.moc3`/`.cmo3` export**, isolated head rotation or full-body tracking.
- The interface is not yet translated. Mobile file opening and exports need more testing.

See the [detailed usage notes](README-IMAGE-LAB.md) and [material inventory](docs/IMAGE-LAB-MATERIALS.md) before building on the sample.

## Help make it better

Useful contributions are specific, reproducible and visible. These are the next areas worth tackling, not features already shipped:

- **Angle-aware artwork:** register side/up/down views without stretching the face or breaking the neck connection.
- **Playback performance:** compare frame times on the same device and input, not just screenshots.
- **Cleaner expressions:** improve skin blending and intermediate eye/mouth states.
- **More accessible editing:** English labels, better mask manipulation and clearer input guidance.
- **Portable examples:** add artwork that has an explicit license for others to reuse.

For a bug report, include the browser/OS, steps, expected result and a short recording if possible. Only attach artwork you have permission to share. Use the [issue tracker](https://github.com/ast2r2sk-coder/StandRig-ImageLab/issues).

To work on the fork:

```bash
npm ci
npm run build
npm test
```

For motion changes, include a continuous before/after recording with the same input and viewport. A passing unit test or a good-looking still frame is not enough. Open pull requests against **this fork's `image-lab` branch**; changes to the original StandRig project should be proposed separately.

If this is the kind of image-first rigging tool you want to see develop, **star the repo** so you can find it again. A clear bug report or a small fix helps even more.

## Built on StandRig

[**sayaka-aiart/StandRig**](https://github.com/sayaka-aiart/StandRig) provides the modeling core, runtime, mesh deformation, physics and native document format. This fork adds the Image Lab editor, PNG/JPG workflow, sample expression adapter and offline packaging. It is not an official StandRig release or a replacement for Live2D Cubism.

Code is licensed under [Apache-2.0](LICENSE). Preserve the upstream [NOTICE](NOTICE) and [third-party notices](THIRD_PARTY_NOTICES.md).

The sample character artwork is included with the provider's permission. **The code license does not automatically license the artwork for commercial use or redistribution.** See [assets/character/NOTICE.md](assets/character/NOTICE.md).
