# Local Korean speech packs

This optional macOS CLI synthesizes the original text with `say -v Yuna -r 140`, converts it with `afconvert`, normalizes targets with g2pk2, and aligns actual local Wav2Vec2 CTC emissions to compatibility jamo. It does not use hosted inference. Timing is **estimated grapheme emission occupancy, not exact phoneme boundaries**. Browser local-voice TTS is a separate event-based approximation; ordinary audio files use RMS opening only.

## Installation (explicit setup; not performed by the CLI)

Use Python **3.11** (verified with 3.11.14). Installed distribution metadata confirms scipy 1.17.1 and numpy 2.4.6 require >=3.11; nltk 3.10.3 requires >=3.10; torch and transformers require >=3.9. Other Python versions/platform wheels are not verified. All ten pins in requirements.txt match the existing tested venv. Python 3.10 is not sufficient for these requirements.

```sh
python3.11 -m venv workspace/.venv-local-speech
workspace/.venv-local-speech/bin/python -m pip install -r scripts/local-speech/requirements.txt
workspace/.venv-local-speech/bin/python -m nltk.downloader cmudict
say -v '?'
```

Install the Korean Yuna voice through macOS voice settings if it is absent. `say` and `afconvert` are macOS tools, not pip dependencies. g2pk2 uses `G2p(use_konlpy=False)`, python-mecab-ko and its dictionary; Java/KoNLPy is not the selected backend. NLTK cmudict must be provisioned before offline use (including English normalization). Setup needs network access; normal generation loads existing local files only. No dependency, voice, corpus or model was downloaded during publication preparation.

## Model setup (optional download, run only when desired)

Selected publisher: [Miniijune/wav2vec2-xls-r-300m-Korean-children-pronunciation-jamo-based-V2](https://huggingface.co/Miniijune/wav2vec2-xls-r-300m-Korean-children-pronunciation-jamo-based-V2).
Pinned revision: `448e988f77d2e95cc0636bf0eb98132b4a544849`.
The weight is about 1.26 GB. Keep it local and excluded from Git. Download only safetensors and root configuration/tokenizer files, not duplicate checkpoints or pickle weights:

```sh
workspace/.venv-local-speech/bin/python -c "from huggingface_hub import snapshot_download; snapshot_download(repo_id='Miniijune/wav2vec2-xls-r-300m-Korean-children-pronunciation-jamo-based-V2', revision='448e988f77d2e95cc0636bf0eb98132b4a544849', local_dir='workspace/local-speech/alternative-model', allow_patterns=['model.safetensors','config.json','vocab.json','preprocessor_config.json','tokenizer_config.json','special_tokens_map.json','added_tokens.json','README.md'])"
export STANDRIG_SPEECH_MODEL=workspace/local-speech/alternative-model
```

The CLI requires config.json, vocab.json, preprocessor_config.json and model.safetensors; keep the tokenizer files and publisher card with them. Download workflow reference: [Hugging Face snapshot_download](https://huggingface.co/docs/huggingface_hub/guides/download). The model card declares Apache-2.0 but leaves training-data and intended-use details incomplete. Its published CER is not our accuracy measurement; commercial dataset provenance remains unverified. Model weights are not included in this repository.

## Generate and play

From the repository root, use a **new output directory** each time:

```sh
workspace/.venv-local-speech/bin/python -B scripts/local-speech/speech.py --text '반가워요! 저는 오늘 처음 왔어요.' --model "$STANDRIG_SPEECH_MODEL" --output workspace/local-speech/my-run
# Or use the source-controlled corpus:
workspace/.venv-local-speech/bin/python -B scripts/local-speech/speech.py --corpus scripts/local-speech/corpus.json --model "$STANDRIG_SPEECH_MODEL" --output workspace/local-speech/my-batch
# Re-export an existing aligned result without inference:
workspace/.venv-local-speech/bin/python -B scripts/local-speech/speech.py --pack-existing workspace/local-speech/my-run/utterance
```

Only aligned cases produce `utterance.speech.json`. In Image Lab select that file with the speech-pack input, then use **팩 재생 / 팩 정지**. Audio and mouth shapes share the audio-context clock. Maximum pack size is 5 MiB, audio 30 seconds, text 1000 characters, and targets 300. Hash, WAV structure/duration, token bounds and confidence are checked, plus decoded duration at playback.

Generation exits **0 only when every case is aligned; 1 for any case failure**, retaining successful partial outputs. Invalid arguments/input can exit 2 before output/model setup. Consult results.json counts, not directory existence. Low-confidence cases do not receive fabricated timing or a success pack.

I-family `ㅣ/ㅟ/ㅡ/ㅢ` explicitly substitutes the existing **E texture**: there is no dedicated I artwork. E-family uses E, rounded O/U uses O, and A/ㅓ uses A. Original observed token intervals are unchanged; rendering may hold a vowel for at most 0.12 seconds, gated by RMS. This is visual interpolation, not an observed phoneme duration. Packs embed text and WAV; results may contain local paths. Never publish private logs, recordings, model caches or the workspace directory.

## Tests and bounded evidence

```sh
# Default: no model needed. Integration skips with an explicit reason.
workspace/.venv-local-speech/bin/python -B -m unittest discover -s scripts/local-speech -p 'test_*.py' -v
# Opt in to real macOS synthesis and model inference:
STANDRIG_SPEECH_MODEL=workspace/local-speech/alternative-model workspace/.venv-local-speech/bin/python -B -m unittest discover -s scripts/local-speech -p 'test_*.py' -v
```

Normalization tests use a small synthetic vocabulary, not a private vocab file or simulated acoustic evidence. Integration uses the repository corpus; only the model directory is supplied by environment. Dependencies and cmudict remain required for normalization tests.

Publication-preparation rerun: default 4 passed / 1 explicitly skipped; opt-in 5 passed. Real subprocess results: good exit 0, low-confidence exit 1, mixed batch exit 1 with the aligned pack retained and oversized targets rejected before synthesis.

Earlier fixed-corpus experiment: 12 actual inferences, 11 aligned, one low-confidence rejection; the ten new sentences were 10/10 aligned. This is **not generalized speech or perceptual lip-sync accuracy**. Existing browser pack evidence records 13 passed checks; those browser checks were reviewed, not rerun during documentation preparation. Independent pack review's CLI failure-return blocker was resolved in follow-up. This is not release approval.

## Third-party rights

Preserve LICENSE, NOTICE, THIRD_PARTY_NOTICES.md, licenses/ and assets/character/NOTICE.md when distributing a build. The optional speech dependencies and model retain their own licenses: [g2pk2](https://github.com/tenebo/g2pk2) declares Apache-2.0, [PyPI metadata](https://pypi.org/project/g2pk2/); see the linked publisher model card and [base model](https://huggingface.co/facebook/wav2vec2-xls-r-300m). macOS voices remain subject to Apple's terms; code licensing does not grant unrestricted voice/audio or artwork redistribution rights.
