"""Offline utterance packs: normative G2P + estimated CTC grapheme occupancy, not phonemes."""
import os
os.environ.update(HF_HUB_OFFLINE='1', TRANSFORMERS_OFFLINE='1', HF_HUB_DISABLE_TELEMETRY='1')
import argparse
import base64
import io
import wave
import hashlib
import json
import math
from pathlib import Path
import subprocess
import time
import unicodedata

class Unsupported(ValueError):
    pass

def normalize_targets(text, normalizer, vocab):
    if not isinstance(text, str) or not text.strip() or len(text) > 1000:
        raise Unsupported('empty or excessive input')
    normalized = normalizer(unicodedata.normalize('NFC', text), descriptive=False, verbose=False, group_vowels=False, to_syl=True)
    cleaned = ' '.join(''.join(c for c in normalized if not unicodedata.category(c).startswith('P')).split())
    chars = ''
    for c in cleaned:
        if c == ' ':
            chars += '|'
        elif '가' <= c <= '힣':
            n = ord(c) - 0xAC00
            chars += 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'[n // 588]
            chars += 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'[n // 28 % 21]
            chars += ['', 'ㄱ', 'ㄲ', 'ㄱㅅ', 'ㄴ', 'ㄴㅈ', 'ㄴㅎ', 'ㄷ', 'ㄹ', 'ㄹㄱ', 'ㄹㅁ', 'ㄹㅂ', 'ㄹㅅ', 'ㄹㅌ', 'ㄹㅍ', 'ㄹㅎ', 'ㅁ', 'ㅂ', 'ㅂㅅ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'][n % 28]
        else:
            raise Unsupported('unsupported normalized character U+%04X' % ord(c))
    if not chars or len(chars) > 300 or any(c not in vocab for c in chars):
        raise Unsupported('OOV or target length outside 1..300')
    return normalized, chars, [vocab[c] for c in chars]

def digest(path):
    with Path(path).open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()

def save(path, data):
    path = Path(path)
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False))
    tmp.replace(path)

def export_pack(folder):
    folder = Path(folder)
    target = folder / 'utterance.speech.json'
    target.unlink(missing_ok=True)
    row = json.loads((folder / 'timeline.json').read_text())
    if row['status'] != 'aligned':
        raise ValueError('Only aligned results produce a speech pack')
    audio = (folder / 'audio.wav').read_bytes()
    if hashlib.sha256(audio).hexdigest() != row['wav_sha256']:
        raise ValueError('WAV hash mismatch')
    with wave.open(io.BytesIO(audio)) as wav:
        duration = wav.getnframes() / wav.getframerate()
    if not 0 < duration <= 30 or abs(duration-row['audio_duration_seconds']) > .002:
        raise ValueError('WAV duration mismatch')
    tokens = [{k: t[k] for k in ('token', 'start_seconds', 'end_seconds', 'confidence')} for t in row['tokens']]
    end = 0
    for t in tokens:
        if t['token'] not in 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ|' or len(t['token']) != 1 or not end <= t['start_seconds'] < t['end_seconds'] <= duration or not .001 <= t['confidence'] <= 1:
            raise ValueError('Invalid observed tokens')
        end = t['end_seconds']
    if not 1 <= len(tokens) <= 300 or not isinstance(row['text'], str) or not row['text'].strip() or len(row['text']) > 1000:
        raise ValueError('Invalid text/tokens')
    pack = dict(kind='standrig-speech', schema_version=1, status='aligned', text=row['text'], audio='data:audio/wav;base64,'+base64.b64encode(audio).decode('ascii'), sha256=row['wav_sha256'], duration=duration, tokens=tokens)
    if len(json.dumps(pack, ensure_ascii=False, indent=2, allow_nan=False).encode()) > 5*1024*1024:
        raise ValueError('Pack exceeds 5MB')
    save(target, pack)
    return target

def main():
    p = argparse.ArgumentParser(description=__doc__)
    source = p.add_mutually_exclusive_group(required=True)
    source.add_argument('--corpus', type=Path)
    source.add_argument('--text', help='Original dialogue, passed unchanged to local say')
    source.add_argument('--pack-existing', type=Path, help='Export an existing aligned timeline + WAV directory, no inference')
    p.add_argument('--model', type=Path)
    p.add_argument('--output', type=Path, help='New directory only')
    args = p.parse_args()
    if args.pack_existing:
        print(export_pack(args.pack_existing))
        return
    if not args.model or not args.output:
        p.error('--model and --output required for generation')
    cases = json.loads(args.corpus.read_text()) if args.corpus else [dict(id='utterance', kind='arbitrary', text=args.text)]
    if not isinstance(cases, list) or not cases or len(cases) > 100:
        p.error('corpus must contain 1..100 cases')
    ids = set()
    for c in cases:
        if not isinstance(c, dict) or not isinstance(c.get('text'), str) or not c['text'].strip() or len(c['text']) > 1000:
            p.error('input text must be a nonempty string of at most 1000 characters')
        if not isinstance(c.get('id'), str) or not c['id'].isascii() or not c['id'].replace('-', '').replace('_', '').isalnum() or c['id'] in ids:
            p.error('invalid/duplicate case id or text')
        ids.add(c['id'])
    args.output.mkdir(parents=True, exist_ok=False)
    save(args.output / 'corpus.json', cases)  # frozen before synthesis/inference
    started = time.perf_counter()
    import torch
    import soundfile as sf
    from scipy.signal import resample_poly
    from g2pk2 import G2p
    from transformers import Wav2Vec2FeatureExtractor, Wav2Vec2ForCTC
    from ctc import validate_audio, align_emissions
    torch.set_num_threads(4)
    normalizer = G2p(use_konlpy=False)
    config = json.loads((args.model / 'config.json').read_text())
    vocab = json.loads((args.model / 'vocab.json').read_text())
    fe = Wav2Vec2FeatureExtractor.from_pretrained(str(args.model), local_files_only=True)
    model = Wav2Vec2ForCTC.from_pretrained(str(args.model), local_files_only=True, use_safetensors=True).eval()
    report = dict(schema_version=1, minimum_confidence=0.001, voice='Yuna', rate=140, threads=4,
        timing_kind='estimated CTC grapheme emission occupancy; NOT exact phoneme boundaries',
        normalization='g2pk2 prescriptive; group_vowels=False; to_syl=True; use_konlpy=False',
        corpus_sha256=digest(args.output / 'corpus.json'), model_sha256=digest(args.model / 'model.safetensors'),
        cli_sha256=digest(__file__), aligner_sha256=digest(Path(__file__).with_name('ctc.py')),
        setup_seconds=time.perf_counter()-started, cases=[])
    def checkpoint():
        rows = report['cases']
        report['counts'] = dict(planned=len(cases), completed=sum(r['status'] != 'started' for r in rows), aligned=sum(r['status']=='aligned' for r in rows), unsupported=sum(r['status']=='unsupported' for r in rows), low_confidence=sum(r['status']=='low_confidence' for r in rows), errors=sum(r['status']=='error' for r in rows), inferred=sum('inference_seconds' in r['timings'] for r in rows))
        report['elapsed_seconds'] = time.perf_counter()-started
        save(args.output / 'results.json', report)
    checkpoint()
    for case in cases:
        begin = time.perf_counter()
        folder = args.output / case['id']
        folder.mkdir()
        text_path = folder / 'original.txt'
        text_path.write_text(case['text'])
        row = dict(case, status='started', text_sha256=digest(text_path), timings={}, tokens=[])
        report['cases'].append(row)
        checkpoint()
        try:
            t = time.perf_counter()
            normalized, chars, targets = normalize_targets(case['text'], normalizer, vocab)
            row.update(normalized_text=normalized, target_graphemes=chars)
            row['timings']['normalization_seconds'] = time.perf_counter()-t
            checkpoint()  # validate target budget before synthesis
            t = time.perf_counter()
            # Original text only: never synthesize the normalized target.
            subprocess.run(['say', '-v', 'Yuna', '-r', '140', '-f', str(text_path), '-o', str(folder / 'audio.aiff')], check=True, capture_output=True, timeout=45)
            subprocess.run(['afconvert', '-f', 'WAVE', '-d', 'LEI16', str(folder / 'audio.aiff'), str(folder / 'audio.wav')], check=True, capture_output=True, timeout=15)
            row['timings']['synthesis_seconds'] = time.perf_counter()-t
            row.update(audio_path=str((folder / 'audio.wav').resolve()), wav_sha256=digest(folder / 'audio.wav'))
            raw, sr = sf.read(folder / 'audio.wav', dtype='float32')
            validate_audio(torch.from_numpy(raw), sr)
            row['audio_duration_seconds'] = len(raw)/sr
            g = math.gcd(sr, 16000)
            audio = resample_poly(raw, 16000//g, sr//g)
            t = time.perf_counter()
            with torch.inference_mode():
                logits = model(**fe(audio, sampling_rate=16000, return_tensors='pt')).logits
            row['timings']['inference_seconds'] = time.perf_counter()-t
            row['emission_shape'] = list(logits.shape)
            row['logits_sha256'] = hashlib.sha256(logits.detach().cpu().numpy().tobytes()).hexdigest()
            frames = len(audio)
            for k, s in zip(config['conv_kernel'], config['conv_stride']):
                frames = (frames-k)//s+1
            if list(logits.shape) != [1, frames, config['vocab_size']]:
                raise ValueError('emission shape mismatch')
            step = math.prod(config['conv_stride'])/16000
            t = time.perf_counter()
            try:
                spans = align_emissions(logits, targets, config['pad_token_id'], step, min_confidence=0.001)
            finally:
                row['timings']['alignment_seconds'] = time.perf_counter()-t
            if any(not 0 <= s['start_seconds'] < s['end_seconds'] <= len(raw)/sr for s in spans):
                raise ValueError('invalid timeline bounds')
            row.update(status='aligned', frame_seconds=step, tokens=[dict(s, token=c) for s,c in zip(spans, chars)])
        except Unsupported as exc:
            row.update(status='unsupported', error=str(exc))
        except Exception as exc:
            row.update(status='low_confidence' if isinstance(exc, ValueError) and str(exc).startswith('invalid confidence at target') else 'error', error_type=type(exc).__name__, error=str(exc)[:500])
        row['timings']['total_seconds'] = time.perf_counter()-begin
        row['timing_kind'] = report['timing_kind']
        save(folder / 'timeline.json', row)
        if row['status'] == 'aligned':
            try:
                export_pack(folder)
            except Exception as exc:
                row.update(status='error', error='pack export: '+str(exc))
                save(folder / 'timeline.json', row)
        row['timeline_sha256'] = digest(folder / 'timeline.json')
        checkpoint()
        print(json.dumps(dict(id=row['id'], status=row['status'], timings=row['timings'], error=row.get('error')), ensure_ascii=False), flush=True)
    print(json.dumps(report['counts']), flush=True)
    # Retain partial outputs; results.json counts, not directory existence, are authoritative.
    return 0 if report['counts']['aligned'] == report['counts']['planned'] else 1

if __name__ == '__main__':
    raise SystemExit(main())
