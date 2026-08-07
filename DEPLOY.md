# 배포 가이드 — GitHub Pages

학생은 **URL 하나만 열면** 되고, 자료를 고치면 즉시 반영됩니다.
USB로 폴더를 복사해 돌릴 필요가 없어집니다.

## 왜 파일 더블클릭으로는 안 되는가

`index.html`을 그냥 더블클릭하면 브라우저는 `file://` 로 엽니다. 이 상태에서는
브라우저 보안 정책상 `vendor/three-lib.js` 같은 파일을 정상적으로 못 읽는
경우가 있고, 앞으로 3D 모델(`.glb`)이나 실습실 스캔을 추가하면 **반드시**
차단됩니다. 그래서 웹 주소로 서비스해야 합니다.

---

## 준비 (한 번만)

1. [github.com](https://github.com) 계정 생성 (무료)
2. [git-scm.com](https://git-scm.com/download/win) 에서 Git 설치 — 이미 설치되어 있습니다

## 1단계 — 저장소 만들기

GitHub에서 **New repository**:

- Repository name: `pt-simulation` (원하는 이름)
- **Public** 선택 ← 무료 계정은 Pages를 쓰려면 공개여야 합니다
- 나머지는 건드리지 않고 **Create repository**

> **공개해도 되는지 확인** — 이 프로젝트에는 API 키나 학생 정보가 들어 있지
> 않습니다. Gemini API 키는 각 PC의 localStorage에만 저장되고 코드에는
> 없습니다. 학생 이름·점수도 그 PC 브라우저에만 남습니다. 공개해도
> 유출되는 것은 없습니다.
>
> 다만 **CPG 원문을 그대로 옮겨 적은 부분이 있다면** 저작권을 한 번
> 확인하세요. 현재 환자 데이터는 지침을 근거로 재구성한 것이므로 문제될
> 소지는 낮지만, 판단은 교수님께서 해주셔야 합니다.

## 2단계 — 올리기

이 폴더에서 터미널을 열고 (아래 `<주소>`는 GitHub가 알려주는 주소로 교체):

```bash
git add .
git commit -m "3D 렌더링 파이프라인 현대화 (three r185)"
git branch -M main
git remote add origin <주소>
git push -u origin main
```

`<주소>` 형태: `https://github.com/사용자명/pt-simulation.git`

## 3단계 — Pages 켜기

저장소 → **Settings** → 왼쪽 **Pages**

- Source: **Deploy from a branch**
- Branch: **main** / **/ (root)** → **Save**

1~2분 뒤 주소가 나옵니다:

```
https://사용자명.github.io/pt-simulation/
```

이 주소를 학생들에게 공지하면 끝입니다.

## 이후 자료를 수정했을 때

```bash
git add .
git commit -m "환자 3번 검사 결과 수정"
git push
```

1분 안에 학생 화면에 반영됩니다.

---

## 실습실 운영 체크리스트

- [ ] 실습실 PC 한 대에서 URL을 열어 **입장까지** 확인
- [ ] 화질 선택을 **자동**으로 두고 진행 → 느리면 자동으로 낮춰집니다
- [ ] 그래도 버벅이면 시작 화면에서 **낮음**으로 고정 (그 PC에 저장됨)
- [ ] `F3` 키로 실제 fps 확인 (교수용 표시)
- [ ] AI 문진 모드를 쓸 PC에서 **교수 모드 → Gemini 키 등록** (PC별로 1회)
- [ ] 수업 후 공용 PC는 교수 모드에서 **연동 해제**

## 인터넷이 끊겼을 때 대비 (선택)

폴더를 USB에 복사해 두고, PC에 Python이 있으면:

```bash
python -m http.server 8000
```

브라우저에서 `http://localhost:8000` — 인터넷 없이 동일하게 동작합니다.
(AI 문진 모드만 인터넷이 필요합니다. 내장 답변 모드는 완전 오프라인)

필요하시면 더블클릭 한 번으로 이걸 자동 실행하는 `start.bat`을 만들어
드릴 수 있습니다 — 말씀만 주세요.
