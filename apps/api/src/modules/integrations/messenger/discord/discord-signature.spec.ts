import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto'
import { verifyDiscordSignature } from './discord-signature'

/** 테스트용 ed25519 키페어 — raw public key(hex, 32B)를 함께 반환 */
function makeKeypair(): { privateKey: KeyObject; rawPublicHex: string } {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const spki = publicKey.export({ format: 'der', type: 'spki' }) as Buffer
  // SPKI DER의 마지막 32바이트가 raw ed25519 공개키
  const rawPublicHex = spki.subarray(spki.length - 32).toString('hex')
  return { privateKey, rawPublicHex }
}

function signRequest(privateKey: KeyObject, timestamp: string, body: string): string {
  const message = Buffer.concat([Buffer.from(timestamp), Buffer.from(body)])
  return sign(null, message, privateKey).toString('hex')
}

describe('verifyDiscordSignature', () => {
  it('유효한 서명을 통과시킨다', () => {
    const { privateKey, rawPublicHex } = makeKeypair()
    const timestamp = '1700000000'
    const body = '{"type":1}'
    const signature = signRequest(privateKey, timestamp, body)

    expect(
      verifyDiscordSignature({ publicKey: rawPublicHex, signature, timestamp, rawBody: Buffer.from(body) }),
    ).toBe(true)
  })

  it('본문이 변조되면 거부한다', () => {
    const { privateKey, rawPublicHex } = makeKeypair()
    const timestamp = '1700000000'
    const signature = signRequest(privateKey, timestamp, '{"type":1}')

    expect(
      verifyDiscordSignature({
        publicKey: rawPublicHex,
        signature,
        timestamp,
        rawBody: Buffer.from('{"type":2}'), // 변조
      }),
    ).toBe(false)
  })

  it('timestamp가 다르면 거부한다 (replay 방어 기반)', () => {
    const { privateKey, rawPublicHex } = makeKeypair()
    const signature = signRequest(privateKey, '1700000000', '{"type":1}')

    expect(
      verifyDiscordSignature({
        publicKey: rawPublicHex,
        signature,
        timestamp: '1700009999',
        rawBody: Buffer.from('{"type":1}'),
      }),
    ).toBe(false)
  })

  it('다른 키로 서명하면 거부한다', () => {
    const a = makeKeypair()
    const b = makeKeypair()
    const timestamp = '1700000000'
    const body = '{"type":1}'
    const signature = signRequest(a.privateKey, timestamp, body)

    expect(
      verifyDiscordSignature({ publicKey: b.rawPublicHex, signature, timestamp, rawBody: Buffer.from(body) }),
    ).toBe(false)
  })

  it('필수값 누락/형식 오류는 예외 없이 false', () => {
    expect(
      verifyDiscordSignature({ publicKey: '', signature: 'x', timestamp: '1', rawBody: Buffer.from('a') }),
    ).toBe(false)
    expect(
      verifyDiscordSignature({ publicKey: 'zz', signature: 'zz', timestamp: '1', rawBody: Buffer.from('a') }),
    ).toBe(false)
  })
})
