// config.js — 실습실 공통 설정
//
// 교수님이 이 파일 한 줄만 채우면 학생 결과가 교수님 구글 시트로 모입니다.
// 채우는 방법은 PROFESSOR_SETUP.md 를 보세요 (5분, 한 번만 하면 됩니다).
//
// 비워 두면(기본값) 수집 기능이 꺼진 채로 동작합니다 —
// 결과는 예전처럼 각 학생 PC에만 저장되고, 외부로 아무것도 전송하지 않습니다.

window.PTSIM_CONFIG = {
  // 구글 Apps Script 웹 앱 주소 (…/exec 로 끝납니다)
  collectUrl: 'https://script.google.com/macros/s/AKfycbwscYCGJIVbtQ2go6QcCdnCqzn4w9D8QR04bEgtsZn6eQ79ArdowQ7FFbQGXXC1v4M/exec',

  // 분반 기본값. 학생이 입장할 때 분반 칸에 미리 채워져 나옵니다.
  // (학생이 직접 고쳐 넣을 수도 있습니다. 비워 두면 학생이 매번 입력합니다.)
  // 여기 적어 두면 표기가 통일되어 엑셀에서 분반별로 묶기 좋습니다.
  // 예: '2026-2 물리치료중재론 A반'
  className: '',
};
