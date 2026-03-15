import axios from 'axios';


class NotificationService {
  private discordWebhookUrl: string | undefined;
  private telegramBotToken: string | undefined;
  private telegramChatId: string | undefined;
  private whatsappApiKey: string | undefined; // Using CallMeBot service
  private whatsappPhone: string | undefined;
  private environment: string;

  constructor() {
    this.discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL;
    this.telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
    this.telegramChatId = process.env.TELEGRAM_CHAT_ID;
    this.whatsappApiKey = process.env.WHATSAPP_API_KEY;
    this.whatsappPhone = process.env.WHATSAPP_PHONE_NUMBER;
    this.environment = process.env.NODE_ENV || 'development';
  }

  /**
   * Send a high-priority alert to all configured channels
   */
  public async sendAlert(title: string, message: string, details?: any): Promise<void> {
    // Don't spam alerts in development unless explicitly enabled
    if (this.environment === 'development' && process.env.ENABLE_DEV_ALERTS !== 'true') {
      return;
    }

    const fullMessage = this.formatMessage(title, message, details);

    const tasks = [
      this.sendToDiscord(title, message, details),
      this.sendToTelegram(fullMessage),
      this.sendToWhatsApp(fullMessage),
    ];

    await Promise.allSettled(tasks);
  }

  private formatMessage(title: string, message: string, details?: any): string {
    let formatted = `🚨 *${title}* (${this.environment})\n\n${message}`;
    if (details) {
      const detailStr = typeof details === 'string' ? details : JSON.stringify(details, null, 2);
      formatted += `\n\n*Details:*\n\`\`\`json\n${detailStr.substring(0, 500)}\`\`\``;
    }
    return formatted;
  }

  private async sendToDiscord(title: string, message: string, details?: any): Promise<void> {
    if (!this.discordWebhookUrl) return;

    try {
      await axios.post(this.discordWebhookUrl, {
        embeds: [{
          title: `🚨 Alert: ${title}`,
          description: message,
          color: 15158332, // Red
          fields: [
            { name: 'Environment', value: this.environment, inline: true },
            { name: 'Timestamp', value: new Date().toISOString(), inline: true },
            ...(details ? [{ name: 'Details', value: `\`\`\`json\n${JSON.stringify(details).substring(0, 1000)}\n\`\`\`` }] : []),
          ],
        }],
      });
    } catch (error) {
      console.error('Failed to send Discord alert');
    }
  }

  private async sendToTelegram(message: string): Promise<void> {
    if (!this.telegramBotToken || !this.telegramChatId) return;

    try {
      await axios.post(`https://api.telegram.org/bot${this.telegramBotToken}/sendMessage`, {
        chat_id: this.telegramChatId,
        text: message,
        parse_mode: 'Markdown',
      });
    } catch (error) {
      console.error('Failed to send Telegram alert');
    }
  }

  private async sendToWhatsApp(message: string): Promise<void> {
    if (!this.whatsappApiKey || !this.whatsappPhone) return;

    try {
      // CallMeBot API: https://api.callmebot.com/whatsapp.php?phone=[phone]&text=[text]&apikey=[apikey]
      const url = `https://api.callmebot.com/whatsapp.php`;
      await axios.get(url, {
        params: {
          phone: this.whatsappPhone,
          apikey: this.whatsappApiKey,
          text: message.substring(0, 1000), // WhatsApp has limits
        },
      });
    } catch (error) {
      console.error('Failed to send WhatsApp alert');
    }
  }
}

export default new NotificationService();
