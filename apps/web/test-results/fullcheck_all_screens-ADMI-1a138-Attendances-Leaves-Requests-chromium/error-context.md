# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: fullcheck_all_screens.spec.ts >> ADMIN SCREENS >> Admin: Dashboard, Employees, Positions, Shifts, Attendances, Leaves, Requests
- Location: e2e/fullcheck_all_screens.spec.ts:131:7

# Error details

```
Test timeout of 30000ms exceeded.
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e4]:
    - generic [ref=e5]:
      - generic [ref=e6]:
        - heading "AbleWork" [level=6] [ref=e7]
        - text: 관리자
      - button "로그아웃" [ref=e8] [cursor=pointer]:
        - img [ref=e9]
    - separator [ref=e11]
    - list [ref=e12]:
      - listitem [ref=e13]:
        - button "대시보드" [ref=e14] [cursor=pointer]:
          - img [ref=e16]
          - paragraph [ref=e19]: 대시보드
      - listitem [ref=e21]:
        - button "인사/조직" [ref=e22] [cursor=pointer]:
          - img [ref=e24]
          - paragraph [ref=e27]: 인사/조직
          - img [ref=e28]
      - generic [ref=e30]:
        - listitem [ref=e31]:
          - button "근무일정" [ref=e32] [cursor=pointer]:
            - img [ref=e34]
            - paragraph [ref=e37]: 근무일정
            - img [ref=e38]
        - list [ref=e43]:
          - listitem [ref=e44]:
            - button "달력" [ref=e45] [cursor=pointer]:
              - paragraph [ref=e47]: 달력
          - listitem [ref=e48]:
            - button "유형 관리" [ref=e49] [cursor=pointer]:
              - paragraph [ref=e51]: 유형 관리
          - listitem [ref=e52]:
            - button "템플릿" [ref=e53] [cursor=pointer]:
              - paragraph [ref=e55]: 템플릿
          - listitem [ref=e56]:
            - button "스케줄 패턴" [ref=e57] [cursor=pointer]:
              - paragraph [ref=e59]: 스케줄 패턴
      - listitem [ref=e61]:
        - button "출퇴근" [ref=e62] [cursor=pointer]:
          - img [ref=e64]
          - paragraph [ref=e68]: 출퇴근
          - img [ref=e69]
      - listitem [ref=e72]:
        - button "휴가" [ref=e73] [cursor=pointer]:
          - img [ref=e75]
          - paragraph [ref=e78]: 휴가
          - img [ref=e79]
      - listitem [ref=e82]:
        - button "요청" [ref=e83] [cursor=pointer]:
          - img [ref=e85]
          - paragraph [ref=e88]: 요청
          - img [ref=e89]
      - listitem [ref=e92]:
        - button "전자결재" [ref=e93] [cursor=pointer]:
          - img [ref=e95]
          - paragraph [ref=e98]: 전자결재
          - img [ref=e99]
      - listitem [ref=e102]:
        - button "리포트" [ref=e103] [cursor=pointer]:
          - img [ref=e105]
          - paragraph [ref=e108]: 리포트
          - img [ref=e109]
      - listitem [ref=e112]:
        - button "메시지" [ref=e113] [cursor=pointer]:
          - img [ref=e115]
          - paragraph [ref=e118]: 메시지
          - img [ref=e119]
      - listitem [ref=e122]:
        - button "설정" [ref=e123] [cursor=pointer]:
          - img [ref=e125]
          - paragraph [ref=e128]: 설정
          - img [ref=e129]
  - main [ref=e131]:
    - progressbar [ref=e133]:
      - img [ref=e134]
```