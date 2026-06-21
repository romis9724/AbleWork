import { AiSettingsService, MASKED_API_KEY } from './ai-settings.service'
import { CompanySettingsService } from '../../companies/company-settings.service'
import { PrismaService } from '../../../prisma/prisma.service'

const settings = { get: jest.fn(), getNumber: jest.fn(), invalidate: jest.fn() }
const prisma = { companySetting: { upsert: jest.fn() }, $transaction: jest.fn() }

/** settings.get(companyId, section, key, default) → 주어진 맵에서 key로 조회 */
const mockGet = (map: Record<string, unknown>) =>
  settings.get.mockImplementation((_c: string, _s: string, key: string, def: unknown) =>
    key in map ? map[key] : def,
  )

describe('AiSettingsService', () => {
  let service: AiSettingsService

  beforeEach(() => {
    jest.clearAllMocks()
    settings.getNumber.mockResolvedValue(512)
    prisma.companySetting.upsert.mockImplementation((arg: unknown) => arg)
    prisma.$transaction.mockResolvedValue([])
    service = new AiSettingsService(
      settings as unknown as CompanySettingsService,
      prisma as unknown as PrismaService,
    )
  })

  it('getForApi — apiKey가 있으면 마스킹하고 apiKeySet=true', async () => {
    mockGet({ enabled: true, provider: 'vllm', base_url: 'http://vllm:8000/v1', model: 'qwen', api_key: 'secret' })
    const view = await service.getForApi('c1')
    expect(view.apiKey).toBe(MASKED_API_KEY)
    expect(view.apiKeySet).toBe(true)
    expect(view.baseUrl).toBe('http://vllm:8000/v1')
    expect(view.provider).toBe('vllm')
  })

  it('getForApi — apiKey가 없으면 빈 문자열·apiKeySet=false', async () => {
    mockGet({ enabled: false, provider: 'vllm', base_url: '', model: '', api_key: '' })
    const view = await service.getForApi('c1')
    expect(view.apiKey).toBe('')
    expect(view.apiKeySet).toBe(false)
  })

  it('patch — apiKey가 마스킹값이면 저장하지 않는다(기존 키 유지)', async () => {
    mockGet({})
    await service.patchFromApi('c1', { baseUrl: 'http://vllm:8000/v1', apiKey: MASKED_API_KEY })
    const keys = prisma.companySetting.upsert.mock.calls.map(
      (c) => (c[0] as { where: { companyId_section_key: { key: string } } }).where.companyId_section_key.key,
    )
    expect(keys).toContain('base_url')
    expect(keys).not.toContain('api_key')
  })

  it('patch — 새 apiKey가 입력되면 저장한다', async () => {
    mockGet({})
    await service.patchFromApi('c1', { apiKey: 'sk-new-key' })
    const keys = prisma.companySetting.upsert.mock.calls.map(
      (c) => (c[0] as { where: { companyId_section_key: { key: string } } }).where.companyId_section_key.key,
    )
    expect(keys).toContain('api_key')
    expect(settings.invalidate).toHaveBeenCalledWith('c1')
  })

  it('patch — 변경 필드가 없으면 트랜잭션·무효화를 호출하지 않는다', async () => {
    mockGet({})
    await service.patchFromApi('c1', { apiKey: '' }) // 빈 키는 무시
    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(settings.invalidate).not.toHaveBeenCalled()
  })
})
