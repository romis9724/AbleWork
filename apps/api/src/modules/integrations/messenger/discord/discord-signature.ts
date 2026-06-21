import { createPublicKey, verify } from 'node:crypto'

/** Ed25519 raw 공개키(32B)를 SPKI DER로 감싸기 위한 고정 prefix */
const SPKI_ED25519_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')

/**
 * Discord Interaction 요청 서명 검증 (Ed25519).
 * 외부 의존성 없이 Node 내장 crypto만 사용한다 — 봇 토큰이 아닌 Application Public Key로 검증.
 * @see https://discord.com/developers/docs/interactions/receiving-and-responding#security-and-authorization
 */
export function verifyDiscordSignature(args: {
  publicKey: string
  signature: string
  timestamp: string
  rawBody: Buffer
}): boolean {
  const { publicKey, signature, timestamp, rawBody } = args
  if (!publicKey || !signature || !timestamp || !rawBody) return false
  try {
    const key = createPublicKey({
      key: Buffer.concat([SPKI_ED25519_PREFIX, Buffer.from(publicKey, 'hex')]),
      format: 'der',
      type: 'spki',
    })
    const message = Buffer.concat([Buffer.from(timestamp, 'utf8'), rawBody])
    return verify(null, message, key, Buffer.from(signature, 'hex'))
  } catch {
    return false
  }
}
