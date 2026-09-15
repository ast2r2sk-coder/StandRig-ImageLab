# Image Lab 소재 수령 상태 — 이전 계획 대체

이 문서는 과거의 추가 소재 생성 요청·생성 차단 계획을 대체한다. 해당 요청은 역사적 상태이며 더 이상 실행 지시나 진행 차단 조건이 아니다. 사용자 제공 소재를 수령했으며 추가 이미지 생성이나 제출을 더 요청하지 않는다.

## 현재 소스와 적용 범위

- `assets/character/front.jpg`: 정면 원본, 수동 마스크와 색상 키 기반 분리.
- `assets/character/reference-sheet.jpg`: 참고용 표시, 파트 추출에는 사용하지 않음.
- `assets/character/head-reference.jpg`: 수작업 2D 차등 변형의 방향 참고. 정밀 각도 측정이나 3D 복원이 아님.
- `assets/character/expression-sheet.jpg`: 반쯤/완전히 닫힌 눈과 A/E/O 입 텍스처에 사용.
- `assets/character/head-underlay.jpg`, `assets/character/body-underlay.jpg`: 수령·보관했지만 정렬 미검증으로 런타임에서 사용하지 않음.

파일별 해시와 적용 한계는 [소스 매니페스트](../assets/character/source-manifest.json)를 따른다.

## 복원본의 한계

현재 결과는 복원된 실행 초안이며 완성된 Live2D 모델이나 Model Freeze가 아니다. 숨은 신체·옷·머리카락의 복원, 최대·복합 머리/몸 포즈와 연결부, 눈·입 피부 경계 및 중간 표정의 시각 검증이 남아 있다. 숫자 각도는 슬라이더 초안 값이며 실측 3D 각도가 아니다. 빌드·자동 테스트 성공만으로 미술적 완성도를 증명하지 않는다.

Cubism `.moc3` / `.cmo3` 출력, 카메라 얼굴 추적, 마이크·TTS·음소 정렬은 지원하지 않는다. Image Lab은 로컬 오디오 파일의 진폭 기반 입 열기를 지원한다. StandRig 이미지 포함 JSON은 Cubism 형식이 아니다. 새 가이드와 오디오 기능은 모델의 미술적 품질을 개선하거나 Model Freeze를 보증하지 않는다.

## 공개와 권리

제공자의 허락으로 사용자 제공 이미지를 이 공개 포크와 해당 빌드에 포함해 배포한다. 코드의 Apache-2.0은 유지하며 캐릭터 아트에 자동 적용하지 않는다. 저작권 소유를 주장하거나 별도의 아트 상업 이용·재배포 라이선스를 부여하지 않는다. [캐릭터 고지](../assets/character/NOTICE.md)와 [사용법·배포 고지 안내](../README-IMAGE-LAB.md)를 따른다.
