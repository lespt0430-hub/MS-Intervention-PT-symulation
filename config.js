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

  // 결과 시트에 함께 기록할 분반 이름 (예: '2025-1 물리치료중재론 A반')
  className: '',
};
