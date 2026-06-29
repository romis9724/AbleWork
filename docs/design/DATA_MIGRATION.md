# 데이터 마이그레이션 — kakaowork + Shiftee → AbleWork

> 이전 플랫폼(kakaowork 메신저, Shiftee 근태) 데이터를 AbleWork 회사로 이전하는 절차·규칙·재사용 가이드.
> 최초 적용: 2026-06-29, 회사 **"에이비웍스"**(`0835261f-c42e-4afb-9dac-ce44fa6b3193`). 코드 변경·배포 없음(운영 데이터 작업).

## 1. 소스 파일과 매핑

| 파일 | 용도 | 매핑 | 비고 |
|---|---|---|---|
| kakaowork_members CSV | **직원 기준** | 이름·소속(조직)·직위(직무)·ID(이메일)·계정생성일 | 로그인 이메일 출처 |
| SHIFTEE-EMPLOYEES | 직원 보강 | 입사일·사원번호(이름 매칭) | 퇴사일은 export 아티팩트 |
| SHIFTEE-TIMECLOCK-AREAS | 출퇴근 장소 | name·좌표`(lat,lng)[Nm]`·주소 → `TimeclockArea` | 좌표 없으면 authMethod none |
| SHIFTEE-SHIFT-TEMPLATES | 근무 템플릿 | name·시작/종료·색 → `ShiftTemplate` | 기존 ShiftType "일반근로"에 연결 |
| SHIFTEE-LEAVES | 휴가 사용이력 | 직원·그룹·유형·기간·차감일수 → `Leave` | **연차만 유지**(아래) |
| SHIFTEE-WAGES | (미반영) | 근무규칙 템플릿·시급0 | 직원별 wageInfo 아님 |
| SHIFTEE-REALTIME-REPORT | (미반영) | 계산된 집계 리포트 | 원천 데이터 아님 |

조직/직무/휴가유형은 **에이비웍스 기존 마스터에 이름으로 연결**(생성하지 않음). 조직명은 공백 정규화 매칭(예 `지니TV 본부`=`지니TV본부`).

## 2. 확정 규칙 (인터뷰 합의)
- 직원=kakaowork 60명 기준, Shiftee로 입사일/사원번호 보강(이름 매칭). 입사일 없으면 kakaowork 계정생성일.
- 로그인=kakaowork 이메일 + **공통 임시 비밀번호 `Abmwc2026!`**(앱과 동일 **bcryptjs**로 해시·강제변경 아님). 전원 `accessLevel=EMPLOYEE`로 생성(이후 승격).
- `AB, LABL` 대표 2명(이승훈·최민석)=조직 미지정. 이름 중복(박지현 2명)=이메일로 구분, 휴가는 소속(콘텐츠제작 본부)으로 귀속.
- 퇴사 처리: Shiftee 퇴사일을 따르되, **일괄 2025-09-04(27명)은 export 아티팩트**로 판단 → 사후 전원 재직 전환.
- **휴가는 연차만**: 보상·포상은 발생규칙·잔액 추적 대상이 아니므로 사용이력 삭제. 연차 사용이력만 유지하고 잔액에 반영.

## 3. 연차 잔여 계산
- 에이비웍스 연차휴가 그룹(`a781ece6…`), 대표 유형 **연차전일**(`de7d061b…`). 발생규칙 2개(회계연도/입사일 기준)로 **부여량 자동 산정**(LeaveBalance.accruedDays).
- 마이그레이션은 직접 insert라 잔액에 반영되지 않으므로, **연차 사용합을 직원별 2026 연차 잔액에 반영**: `usedDays=Σ(연차 사용)`, `remainingDays=accrued−used`. 잔액 없으면 생성(accrued 0).
- **잔여 음수 5명**(이한빈·백민수·양다은·고지수·전병준): 입사 1년 미만으로 부여 0인데 연차 사용 → 발생규칙(입사일 기준) 실행으로 부여 채워 보정 필요.

## 4. 실행 방식 (재사용)
1. 로컬 venv(openpyxl)로 파일 파싱·정규화 → `mig-data.json`(scratchpad `build_migration.py`).
2. Node `mig.js`(dry-run 기본, `--commit` 트랜잭션) — 조직/직무/휴가유형 이름→id 해석, 재실행 안전(직원=이메일 스킵, 휴가=회사 휴가 삭제 후 재삽입).
3. prod 전송: base64 청크를 여러 `aws ssm send-command`로 컨테이너에 적재 후 `docker exec`(S3 직접쓰기는 차단됨). 자세한 SSM 기법은 [AWS_OPERATIONS.md](./AWS_OPERATIONS.md).
4. **dry-run 리포트 검토 → `--commit`**. 완료 후 컨테이너 임시파일(PII·임시비번) 삭제.

## 5. 반영 결과 (검증)
직원 61(60+admin·재직 61), users 61, leaves 66(연차만), timeclockAreas 4(기존1+신규3), shiftTemplates 4. 연차 잔액 부여 유지·사용 반영 완료.

## 6. 후속 TODO
- 잔여 음수 5명 발생규칙 실행으로 보정.
- `AB, LABL` 2명 조직 배정 · 대표/임원/관리자 권한 승격 · 임시비번 배포·교체 안내.
