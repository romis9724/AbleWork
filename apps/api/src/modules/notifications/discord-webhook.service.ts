import { Injectable, Logger } from '@nestjs/common'
import axios from 'axios'

@Injectable()
export class DiscordWebhookService {
  private readonly logger = new Logger(DiscordWebhookService.name)

  async send(webhookUrl: string, embed: object): Promise<void> {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await axios.post(webhookUrl, { embeds: [embed] })
        return
      } catch (e) {
        this.logger.warn(`Discord webhook attempt ${attempt} failed`)
        if (attempt === 3) throw e
        await new Promise(r => setTimeout(r, attempt * 1000))
      }
    }
  }
}
