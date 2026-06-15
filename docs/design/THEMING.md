# 테마 시스템 (멀티 테마)

> 전 화면(관리자·직원·로그인)에 적용되는 6개 색 테마와 그 전환·영속·SSR 메커니즘을 정의한다.
> SSOT 코드: `apps/web/src/theme/tokens.ts`

---

## 1. 제공 테마

| id | 라벨 | 모드 | 액센트 | 성격 |
|---|---|---|---|---|
| `night-orange` | Night Orange | 다크 | `#f36f20` | 기본값(브랜드). 순수 블랙 + 오렌지 |
| `light-orange` | Light Orange | 라이트 | `#a8480c` | 웜 오프화이트 + 번트 오렌지 |
| `ayu` | Ayu | 다크 | `#ffb454` | 따뜻한 짙은 네이비 + 앰버 |
| `tokyo-night` | Tokyo Night | 다크 | `#7aa2f7` | 블루·퍼플 + 블루 |
| `github-white` | GitHub White | 라이트 | `#0969da` | 또렷한 화이트 + 블루 |
| `dracula` | Dracula | 다크 | `#bd93f9` | 보라 액센트 |

VS Code 동명 테마의 공식 팔레트를 정합. 액센트는 브랜드 오렌지를 강제하지 않고 **각 테마의 정체색**을 따른다.

---

## 2. 아키텍처 — CSS 변수 우선, MUI 동행

화면 룩은 **CSS 커스텀 프로퍼티**(`--ab-bg`, `--fg-1`, `--line`, `--ab-orange`(=액센트) 등)가 지배한다(`styles/ab-admin.css` · `ab-hr.css` · `ab-app.css`). 아직 CSS 클래스로 옮기지 않은 MUI 컴포넌트(DataGrid·Dialog·Menu·Tooltip)는 동일 토큰에서 만든 MUI 테마로 칠한다.

```
theme/tokens.ts  (SSOT)
   ├─ buildThemeCss()   → :root[data-theme="X"]{ --…: … } 6개 블록 (레이아웃 <head> 주입)
   └─ buildMuiTheme(id) → MUI 테마 (theme/index.ts, 캐시)
```

- 토큰 키 ↔ CSS 변수명 매핑은 `CSS_VAR_MAP` 한 곳에서 관리.
- 시맨틱 토큰: `--on-accent`(액센트 면 위 글씨), `--on-err`(에러 면 위 글씨), `--dialog-bg`, `--toast-bg`, `--overlay`, `--scrollbar-*`, `--toggle-*`, `--tooltip-bg`, `--info`, `--color-scheme`.
- 상태색 틴트는 `color-mix(in srgb, var(--x) N%, transparent)` 로 액센트/상태색을 따라간다(테마별 별도 정의 불필요).

### 특이도 규칙
주입 블록은 `:root[data-theme]`(특이도 0,1,1)라 `ab-admin.css` 의 `:root`(0,1,0) 기본값을 **항상** 이긴다 → 시트 로드 순서와 무관. `ab-*.css` 에는 `:root[data-theme]` 셀렉터를 두지 말 것(SSOT 위반).

---

## 3. 전환 · 영속 · SSR (FOUC/하이드레이션 안전)

- 영속화: 쿠키 `ablework-theme`(1년, `samesite=lax`, HTTPS 시 `secure`).
- **서버**(`app/layout.tsx`): `cookies()` 로 테마를 읽어 `<html data-theme>` 와 `ThemeRegistry initialThemeId` 에 동일 값을 내리고, `buildThemeCss()` 를 `<head><style id="ab-theme-tokens">` 로 주입. → 첫 페인트부터 올바른 테마(무플래시). 루트에서 쿠키를 읽으므로 전 라우트가 동적 렌더.
- **클라이언트**: `stores/theme.store.ts`(Zustand)가 같은 쿠키를 동기 읽기로 초기화 → 서버/클라 첫 렌더 일치(하이드레이션 불일치 없음). `ThemeRegistry` 는 mounted 전 `initialThemeId`, 후 스토어 값을 사용.
- 전환: `setTheme(id)` → 쿠키 기록 + `document.documentElement.dataset.theme` 갱신 + 스토어 갱신 → CSS는 즉시, MUI는 `buildMuiTheme` 재계산으로 반영.
- 잘못된/없는 쿠키 → `DEFAULT_THEME_ID`(night-orange) 폴백(서버·클라 일관).

### 전환 UI
`components/ab/ThemeSwitcher.tsx` — 팔레트 아이콘 트리거 + 라이트/다크 그룹 메뉴(각 항목 미니 UI 프리뷰 스와치 + 현재 테마 체크). 관리자 헤더(`AdminShell`)·직원 헤더(`MeShell`)·로그인 화면 공용.

---

## 4. 새 테마 추가

`theme/tokens.ts` 한 곳만 수정하면 CSS·MUI·전환 UI가 모두 반영된다.

1. `ThemeId` 유니온에 id 추가.
2. `ThemeTokens` 전체 키를 채운 토큰 상수 정의.
3. `THEMES` 에 `{ id, label, mode, group, swatch, tokens }` 등록.
4. `THEME_ORDER` 에 노출 순서 추가.

---

## 5. 접근성(대비) 메모

- 라이트 테마는 accent/상태색이 **텍스트**로도 쓰이므로(eyebrow·뱃지·링크) 라이트 배경 위 AA(4.5)를 만족하도록 충분히 어둡게 잡음(예: light-orange accent `#a8480c`). 채움 버튼 흰 글씨 대비도 함께 확보.
- 액센트 면 위 글씨는 테마별 `--on-accent` 로 가독 보장(밝은 액센트=어두운 글씨, 어두운 액센트=흰 글씨). 에러 면은 `--on-err`.
- **기존 한계(미변경)**: 기본 테마 `night-orange` 의 흰 글씨 on 오렌지(`#f36f20`)는 ≈2.96:1 로 AA 미달이나, 출시 브랜드 룩이라 보존. 변경 시 1차 버튼 글씨를 검정으로 돌리는 광범위 브랜드 변경이 필요 → 별도 결정 사항.
- `--fg-4`/`--fg-5` 는 비활성·장식·아이콘 전용(본문/라벨 텍스트로 쓰지 말 것).
