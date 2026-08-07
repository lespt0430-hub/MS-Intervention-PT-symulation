# vendor/three-lib.js

Three.js **r185** 본체와 후처리 애드온을 하나로 묶은 파일입니다.
`window.THREE`(본체)와 `window.TX`(애드온)를 정의하며, `index.html`에서 일반
`<script>` 태그로 불러옵니다.

## 왜 CDN을 쓰지 않는가

구버전은 `cdnjs.cloudflare.com`에서 three r128을 받아 썼습니다. 수업 중
외부 CDN이 느려지거나 차단되면 그 시간 실습 전체가 멈춥니다. 이 파일은
GitHub Pages(또는 로컬 폴더)에서 함께 제공되므로 의존하는 외부 호스트가
하나도 없습니다.

## 포함된 애드온 (`window.TX`)

| 이름 | 용도 |
|---|---|
| `EffectComposer` / `RenderPass` / `OutputPass` | 후처리 체인. `OutputPass`가 톤매핑·sRGB 변환을 담당 |
| `SMAAPass` | 안티에일리어싱 (보통·높음 화질) |
| `GTAOPass` | 주변광 차폐 — 접촉면 그림자 (높음 화질 전용) |
| `UnrealBloomPass` | 형광등 패널 빛번짐 (높음 화질 전용) |
| `RoomEnvironment` | 절차적 실내 환경맵. HDRI 파일을 받지 않고 금속·유리 반사를 만든다 |
| `RectAreaLightUniformsLib` | 면광원(형광등 패널) 사용 전 초기화 필요 |

## 다시 만드는 방법

three 버전을 올리거나 애드온을 추가할 때만 필요합니다. 임시 폴더에서:

```bash
npm init -y
npm install three esbuild
```

`three-entry.js`를 만들고:

```js
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';

window.THREE = THREE;
window.TX = {
  EffectComposer, RenderPass, OutputPass, SMAAPass, GTAOPass,
  UnrealBloomPass, RoomEnvironment, RectAreaLightUniformsLib,
};
```

번들:

```bash
npx esbuild three-entry.js --bundle --format=iife --minify \
  --target=es2019 --legal-comments=none --outfile=three-lib.js
```

나온 `three-lib.js`를 이 폴더에 덮어씁니다. (약 1.0MB, gzip 전송 시 약 250KB)

> **주의** — three는 메이저 리비전마다 API를 바꿉니다. 버전을 올린 뒤에는
> 반드시 `render.js`의 `createRenderer`(색공간·톤매핑), `buildEnvironment`
> (`PMREMGenerator.fromScene`), `buildComposer`(패스 생성자 인자)를 확인하세요.
> r128 → r185 업그레이드 때 실제로 바뀐 것들입니다.
