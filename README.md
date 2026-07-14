# Quiz Survivor: 분수의 나눗셈 — 독립 복제본

원본 공개 프런트엔드: https://quiz-math-6-1-1.vercel.app/

공개 Vite/React/Phaser 정적 자산을 독립 실행 가능한 형태로 보존한 교육용 복제본입니다. 원본의 저작권·표시·Phaser 고지는 유지합니다.

## 기능

- 6학년 1학기 「분수의 나눗셈」 300문항
- Phaser 3 생존형 자동공격 게임
- 키보드와 모바일 조이스틱
- 난이도 3단계
- 퀴즈 정답에 따른 무기 획득·강화
- 브라우저 localStorage 기반 오프라인 랭킹

Firebase 환경값은 원본 공개 빌드에서도 비활성 상태이며, 이 복제본 역시 별도 원격 랭킹 서버나 개인정보 전송을 추가하지 않습니다.

## 실행

```bash
python3 -m http.server 4178
```

## 검증

```bash
npm test
```
