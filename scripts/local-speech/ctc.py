"""Offline CTC Viterbi alignment; syllable emission spans, NOT phoneme boundaries."""
import argparse
import json
import math
import os
from pathlib import Path
import unicodedata
import torch


def vowel(char):
    return 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'[(ord(char)-0xAC00)//28 % 21] if len(char)==1 and '가' <= char <= '힣' else None


def validate_audio(audio, sample_rate):
    if sample_rate <= 0 or audio.ndim != 1 or not audio.numel() or not torch.isfinite(audio).all():
        raise ValueError('invalid mono audio')
    if audio.numel()/sample_rate > 30:
        raise ValueError('audio exceeds 30 seconds')
    if audio.square().mean().sqrt() < 1e-5:
        raise ValueError('silent audio')


def targets_for(text, vocab):
    text = unicodedata.normalize('NFC', text)
    normalized = ''.join(c for c in text if not unicodedata.category(c).startswith('P'))
    normalized = ' '.join(normalized.split())
    chars = list(normalized.replace(' ', '|'))
    if not chars or len(chars)>300:
        raise ValueError('text must contain 1..300 normalized characters')
    if any(c not in vocab or (c != '|' and vowel(c) is None) for c in chars):
        raise ValueError('OOV or unsupported transcript character')
    return normalized, chars, [vocab[c] for c in chars]


def align_emissions(logits, targets, blank, frame_seconds, min_confidence=0.001):
    if not math.isfinite(frame_seconds) or frame_seconds<=0 or not math.isfinite(min_confidence) or not 0<min_confidence<=1:
        raise ValueError('invalid timing or confidence threshold')
    if logits.ndim!=3 or logits.shape[0]!=1 or not torch.isfinite(logits).all():
        raise ValueError('invalid emissions')
    lp=logits[0].detach().double().cpu().log_softmax(-1)
    T,V=lp.shape
    if not 0<=blank<V or not targets or any(type(x)!=int or x==blank or not 0<=x<V for x in targets):
        raise ValueError('invalid targets')
    if T<len(targets)+sum(a==b for a,b in zip(targets,targets[1:])):
        raise ValueError('unalignable transcript')
    states=[blank]
    for token in targets: states.extend([token,blank])
    S=len(states)
    scores=torch.full((T,S),-torch.inf,dtype=torch.float64)
    back=torch.full((T,S),-1,dtype=torch.long)
    scores[0,0]=lp[0,blank]; scores[0,1]=lp[0,targets[0]]
    for t in range(1,T):
        for s,token in enumerate(states):
            predecessors=[s]
            if s: predecessors.append(s-1)
            if s>=2 and token!=blank and token!=states[s-2]: predecessors.append(s-2)
            best=max(predecessors,key=lambda p:float(scores[t-1,p]))
            scores[t,s]=scores[t-1,best]+lp[t,token]; back[t,s]=best
    state=max([S-1,S-2],key=lambda s:float(scores[-1,s]))
    if not torch.isfinite(scores[-1,state]): raise ValueError('unalignable transcript')
    path=[state]
    for t in range(T-1,0,-1):
        state=int(back[t,state]); path.append(state)
    path.reverse()
    spans=[]
    for i,token in enumerate(targets):
        frames=[t for t,s in enumerate(path) if s==2*i+1]
        if not frames: raise ValueError('unalignable transcript')
        confidence=float(lp[frames,token].mean().exp())
        if not math.isfinite(confidence) or confidence<min_confidence:
            raise ValueError(f'invalid confidence at target {i}: {confidence:.8g} < {min_confidence}')
        a,b=frames[0],frames[-1]+1
        spans.append(dict(start_frame=a,end_frame=b,start_seconds=a*frame_seconds,end_seconds=b*frame_seconds,confidence=confidence))
    return spans
