import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../../prisma/prisma.service'
import { CompanySettingsService } from '../../companies/company-settings.service'
import { AiProvider, PatchAiSettingsDto } from './ai-settings.dto'

const SECTION = 'ai'

/** FE camelCase ↔ DB key (section='ai') */
const FIELDS = {
  enabled: 'enabled',
  provider: 'provider',
  baseUrl: 'base_url',
  model: 'model',
  apiKey: 'api_key',
  maxTokens: 'max_tokens',
  temperature: 'temperature',
} as const

const DEFAULTS = {
  enabled: false,
  provider: 'vllm' as AiProvider,
  baseUrl: '',
  model: '',
  apiKey: '',
  maxTokens: 512,
  temperature: 0.3,
}

/** 마스킹 표식 — FE가 이 값을 그대로 보내오면 "변경 안 함"으로 간주 */
export const MASKED_API_KEY = '••••••••'

/** 실제 호출에 쓰는 설정 (apiKey 평문 포함, 내부용) */
export interface AiConfig {
  enabled: boolean
  provider: AiProvider
  baseUrl: string
  model: string
  apiKey: string
  maxTokens: number
  temperature: number
}

/** FE 응답 (apiKey 마스킹) */
export interface AiSettingsView extends Omit<AiConfig, 'apiKey'> {
  apiKey: string
  apiKeySet: boolean
}

/**
 * AI 설정 — company_settings(section='ai')에 저장. CompanySettingsService를 재사용한다.
 * apiKey는 응답 시 마스킹한다. MVP 단계에서는 평문 저장한다
 * (TODO: 외부 LLM 본격 도입 시 암호화 또는 SSM SecureString으로 이전).
 */
@Injectable()
export class AiSettingsService {
  constructor(
    private readonly settings: CompanySettingsService,
    private readonly prisma: PrismaService,
  ) {}

  /** 내부용 — 실제 apiKey 포함 (LlmService가 사용) */
  async getConfig(companyId: string): Promise<AiConfig> {
    return {
      enabled: await this.settings.get(companyId, SECTION, FIELDS.enabled, DEFAULTS.enabled),
      provider: await this.settings.get<AiProvider>(companyId, SECTION, FIELDS.provider, DEFAULTS.provider),
      baseUrl: await this.settings.get(companyId, SECTION, FIELDS.baseUrl, DEFAULTS.baseUrl),
      model: await this.settings.get(companyId, SECTION, FIELDS.model, DEFAULTS.model),
      apiKey: await this.settings.get(companyId, SECTION, FIELDS.apiKey, DEFAULTS.apiKey),
      maxTokens: await this.settings.getNumber(companyId, SECTION, FIELDS.maxTokens, DEFAULTS.maxTokens),
      temperature: await this.settings.getNumber(companyId, SECTION, FIELDS.temperature, DEFAULTS.temperature),
    }
  }

  /** FE 응답 — apiKey 마스킹 + 설정 여부 플래그 */
  async getForApi(companyId: string): Promise<AiSettingsView> {
    const { apiKey, ...rest } = await this.getConfig(companyId)
    return { ...rest, apiKey: apiKey ? MASKED_API_KEY : '', apiKeySet: !!apiKey }
  }

  /** FE 입력 일괄 저장 — apiKey가 빈값/마스킹값이면 기존 키를 유지 */
  async patchFromApi(companyId: string, patch: PatchAiSettingsDto): Promise<AiSettingsView> {
    const upserts: Prisma.PrismaPromise<unknown>[] = []
    const set = (key: string, value: unknown) =>
      upserts.push(
        this.prisma.companySetting.upsert({
          where: { companyId_section_key: { companyId, section: SECTION, key } },
          update: { value: value as Prisma.InputJsonValue },
          create: { companyId, section: SECTION, key, value: value as Prisma.InputJsonValue },
        }),
      )

    if (patch.enabled !== undefined) set(FIELDS.enabled, patch.enabled)
    if (patch.provider !== undefined) set(FIELDS.provider, patch.provider)
    if (patch.baseUrl !== undefined) set(FIELDS.baseUrl, patch.baseUrl)
    if (patch.model !== undefined) set(FIELDS.model, patch.model)
    if (patch.maxTokens !== undefined) set(FIELDS.maxTokens, patch.maxTokens)
    if (patch.temperature !== undefined) set(FIELDS.temperature, patch.temperature)
    // 새 키가 실제로 입력된 경우에만 저장(빈값/마스킹값은 기존 유지)
    if (patch.apiKey !== undefined && patch.apiKey !== '' && patch.apiKey !== MASKED_API_KEY) {
      set(FIELDS.apiKey, patch.apiKey)
    }

    if (upserts.length > 0) {
      await this.prisma.$transaction(upserts)
      this.settings.invalidate(companyId)
    }
    return this.getForApi(companyId)
  }
}
