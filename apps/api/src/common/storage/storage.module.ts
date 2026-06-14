import { Global, Module } from '@nestjs/common'
import { StorageService } from './storage.service'

/** 오브젝트 스토리지(MinIO) — 전역 모듈로 어느 도메인에서나 주입 가능 */
@Global()
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
