import { Test, TestingModule } from '@nestjs/testing'
import { Logger } from '@nestjs/common'
import axios from 'axios'
import { DiscordWebhookService } from './discord-webhook.service'

// axios 모듈 전체를 모킹 — 실제 네트워크 호출 차단
jest.mock('axios')
const mockedAxios = axios as jest.Mocked<typeof axios>

// ── 공통 픽스처 ────────────────────────────────────────────────────────────────

const WEBHOOK_URL = 'https://discord.com/api/webhooks/123/abc'
const EMBED = { title: '휴가 승인', description: '홍길동님의 휴가가 승인되었습니다.' }

/**
 * setTimeout(백오프) 호출을 즉시 진행시키는 헬퍼.
 * send 내부의 `await new Promise(r => setTimeout(r, ...))` 가 걸리지 않도록
 * 가짜 타이머의 모든 타이머를 비동기적으로 흘려보낸다.
 */
async function flushBackoff(): Promise<void> {
  // 보류 중인 마이크로태스크가 setTimeout 을 등록할 시간을 준 뒤 타이머를 진행
  await Promise.resolve()
  jest.runOnlyPendingTimers()
}

// ── 테스트 ────────────────────────────────────────────────────────────────────

describe('DiscordWebhookService', () => {
  let service: DiscordWebhookService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DiscordWebhookService],
    }).compile()

    service = module.get<DiscordWebhookService>(DiscordWebhookService)

    jest.clearAllMocks()
    // 로거 노이즈 억제 (warn 호출 여부는 spy 로 별도 검증)
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  // ── happy path ────────────────────────────────────────────────────────────

  describe('첫 시도 성공 (happy path)', () => {
    it('webhookUrl 로 embeds 배열을 감싸 axios.post 를 호출하고 정상 반환한다', async () => {
      mockedAxios.post.mockResolvedValue({ status: 204 })

      await expect(service.send(WEBHOOK_URL, EMBED)).resolves.toBeUndefined()

      // 호출 인자 검증: { embeds: [embed] } 형태로 래핑
      expect(mockedAxios.post).toHaveBeenCalledWith(WEBHOOK_URL, {
        embeds: [EMBED],
      })
    })

    it('첫 시도가 성공하면 재시도하지 않는다 (정확히 1회 호출)', async () => {
      mockedAxios.post.mockResolvedValue({ status: 204 })

      await service.send(WEBHOOK_URL, EMBED)

      expect(mockedAxios.post).toHaveBeenCalledTimes(1)
    })

    it('첫 시도 성공 시 백오프(setTimeout)를 호출하지 않는다', async () => {
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout')
      mockedAxios.post.mockResolvedValue({ status: 204 })

      await service.send(WEBHOOK_URL, EMBED)

      expect(setTimeoutSpy).not.toHaveBeenCalled()
    })

    it('전달된 embed 객체를 변형하지 않고 그대로 배열에 담는다 (불변성)', async () => {
      mockedAxios.post.mockResolvedValue({ status: 204 })
      const embed = { ...EMBED }

      await service.send(WEBHOOK_URL, embed)

      const [, body] = mockedAxios.post.mock.calls[0] as [string, { embeds: object[] }]
      expect(body.embeds[0]).toBe(embed) // 동일 참조를 그대로 사용
      expect(embed).toEqual(EMBED) // 원본 변형 없음
    })
  })

  // ── 재시도(backoff) 동작 ────────────────────────────────────────────────────

  describe('재시도 동작', () => {
    beforeEach(() => {
      jest.useFakeTimers()
    })

    it('2번째 시도에서 성공하면 총 2회 호출하고 정상 반환한다', async () => {
      mockedAxios.post
        .mockRejectedValueOnce(new Error('일시 오류'))
        .mockResolvedValueOnce({ status: 204 })

      const promise = service.send(WEBHOOK_URL, EMBED)
      await flushBackoff() // 1회 실패 후 백오프 진행
      await expect(promise).resolves.toBeUndefined()

      expect(mockedAxios.post).toHaveBeenCalledTimes(2)
    })

    it('3번째 시도에서 성공하면 총 3회 호출한다', async () => {
      mockedAxios.post
        .mockRejectedValueOnce(new Error('실패1'))
        .mockRejectedValueOnce(new Error('실패2'))
        .mockResolvedValueOnce({ status: 204 })

      const promise = service.send(WEBHOOK_URL, EMBED)
      await flushBackoff() // 1차 실패 → 백오프
      await flushBackoff() // 2차 실패 → 백오프
      await expect(promise).resolves.toBeUndefined()

      expect(mockedAxios.post).toHaveBeenCalledTimes(3)
    })

    it('실패할 때마다 선형 백오프(1s, 2s)를 적용한다', async () => {
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout')
      mockedAxios.post
        .mockRejectedValueOnce(new Error('실패1'))
        .mockRejectedValueOnce(new Error('실패2'))
        .mockResolvedValueOnce({ status: 204 })

      const promise = service.send(WEBHOOK_URL, EMBED)
      await flushBackoff()
      await flushBackoff()
      await promise

      // attempt 1 실패 → 1000ms, attempt 2 실패 → 2000ms
      const delays = setTimeoutSpy.mock.calls.map((call) => call[1])
      expect(delays).toEqual([1000, 2000])
    })

    it('재시도 사이에 axios.post 가 동일한 인자로 다시 호출된다', async () => {
      mockedAxios.post
        .mockRejectedValueOnce(new Error('실패1'))
        .mockResolvedValueOnce({ status: 204 })

      const promise = service.send(WEBHOOK_URL, EMBED)
      await flushBackoff()
      await promise

      expect(mockedAxios.post).toHaveBeenNthCalledWith(1, WEBHOOK_URL, { embeds: [EMBED] })
      expect(mockedAxios.post).toHaveBeenNthCalledWith(2, WEBHOOK_URL, { embeds: [EMBED] })
    })
  })

  // ── 최종 실패 ────────────────────────────────────────────────────────────────

  describe('최종 실패', () => {
    beforeEach(() => {
      jest.useFakeTimers()
    })

    it('3회 모두 실패하면 마지막 에러를 그대로 던진다', async () => {
      const lastError = new Error('마지막 실패')
      mockedAxios.post
        .mockRejectedValueOnce(new Error('실패1'))
        .mockRejectedValueOnce(new Error('실패2'))
        .mockRejectedValueOnce(lastError)

      const promise = service.send(WEBHOOK_URL, EMBED)
      // 거부 처리 전에 핸들러를 붙여 unhandled rejection 방지
      const assertion = expect(promise).rejects.toBe(lastError)
      await flushBackoff()
      await flushBackoff()
      await assertion

      expect(mockedAxios.post).toHaveBeenCalledTimes(3)
    })

    it('3회 모두 실패해도 4회차로 넘어가지 않는다 (최대 3회 호출)', async () => {
      mockedAxios.post.mockRejectedValue(new Error('항상 실패'))

      const promise = service.send(WEBHOOK_URL, EMBED)
      const assertion = expect(promise).rejects.toThrow('항상 실패')
      await flushBackoff()
      await flushBackoff()
      await assertion

      expect(mockedAxios.post).toHaveBeenCalledTimes(3)
    })

    it('마지막(3회차) 실패 후에는 추가 백오프를 호출하지 않는다', async () => {
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout')
      mockedAxios.post.mockRejectedValue(new Error('항상 실패'))

      const promise = service.send(WEBHOOK_URL, EMBED)
      const assertion = expect(promise).rejects.toThrow()
      await flushBackoff()
      await flushBackoff()
      await assertion

      // 1·2회차 실패 뒤에만 백오프 → 총 2회 (3회차 실패 후엔 throw)
      expect(setTimeoutSpy).toHaveBeenCalledTimes(2)
    })
  })

  // ── 로깅 ────────────────────────────────────────────────────────────────────

  describe('로깅', () => {
    beforeEach(() => {
      jest.useFakeTimers()
    })

    it('실패한 시도마다 경고 로그를 남긴다', async () => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn')
      mockedAxios.post
        .mockRejectedValueOnce(new Error('실패1'))
        .mockRejectedValueOnce(new Error('실패2'))
        .mockResolvedValueOnce({ status: 204 })

      const promise = service.send(WEBHOOK_URL, EMBED)
      await flushBackoff()
      await flushBackoff()
      await promise

      // 실패한 2회 시도에 대해 경고 로그 2회
      expect(warnSpy).toHaveBeenCalledTimes(2)
      expect(warnSpy).toHaveBeenNthCalledWith(1, 'Discord webhook attempt 1 failed')
      expect(warnSpy).toHaveBeenNthCalledWith(2, 'Discord webhook attempt 2 failed')
    })

    it('성공 시에는 경고 로그를 남기지 않는다', async () => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn')
      mockedAxios.post.mockResolvedValue({ status: 204 })

      await service.send(WEBHOOK_URL, EMBED)

      expect(warnSpy).not.toHaveBeenCalled()
    })

    it('3회 모두 실패하면 경고 로그를 3회 남긴다', async () => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn')
      mockedAxios.post.mockRejectedValue(new Error('항상 실패'))

      const promise = service.send(WEBHOOK_URL, EMBED)
      const assertion = expect(promise).rejects.toThrow()
      await flushBackoff()
      await flushBackoff()
      await assertion

      expect(warnSpy).toHaveBeenCalledTimes(3)
    })
  })

  // ── 입력 변형(에러 객체) 처리 ────────────────────────────────────────────────

  describe('에러 객체 유형', () => {
    beforeEach(() => {
      jest.useFakeTimers()
    })

    it('axios 가 HTTP 상태 코드가 담긴 에러를 던져도 그대로 전파한다 (4xx)', async () => {
      // 현재 구현은 4xx/5xx 를 구분하지 않으므로 4xx 도 3회 재시도 후 throw
      const httpError = Object.assign(new Error('Request failed with status code 400'), {
        response: { status: 400 },
        isAxiosError: true,
      })
      mockedAxios.post.mockRejectedValue(httpError)

      const promise = service.send(WEBHOOK_URL, EMBED)
      const assertion = expect(promise).rejects.toBe(httpError)
      await flushBackoff()
      await flushBackoff()
      await assertion

      // 4xx 도 재시도 대상이라 3회 호출됨 (동작 명세 고정)
      expect(mockedAxios.post).toHaveBeenCalledTimes(3)
    })

    it('네트워크 오류(ECONNREFUSED)도 재시도 후 전파한다', async () => {
      const networkError = Object.assign(new Error('connect ECONNREFUSED'), {
        code: 'ECONNREFUSED',
        isAxiosError: true,
      })
      mockedAxios.post
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce({ status: 204 })

      const promise = service.send(WEBHOOK_URL, EMBED)
      await flushBackoff()
      await expect(promise).resolves.toBeUndefined()

      expect(mockedAxios.post).toHaveBeenCalledTimes(2)
    })
  })
})
