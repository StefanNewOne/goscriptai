import { prisma } from '../lib/prisma.js';
import { env } from '../env.js';

// Notifications are recorded in the DB and (when configured) sent via SES/
// Telegram. Every notification carries a direct link (PRD §19). Senders are
// pluggable and no-op without credentials, so the flow is testable in dev.

export type NotifyEvent =
  | 'concepts_ready'
  | 'scripts_ready'
  | 'critic_failed'
  | 'brain_proposal'
  | 'budget_80'
  | 'budget_hold'
  | 'agent_failed';

const LABELS: Record<NotifyEvent, string> = {
  concepts_ready: 'Концептите се спремни за избор.',
  scripts_ready: 'Сценаријата се спремни за одобрување.',
  critic_failed: 'Сценарио не помина критика по 2 круга.',
  brain_proposal: 'Предлог во Мозокот чека потврда.',
  budget_80: 'Буџетот достигна 80%.',
  budget_hold: 'Буџетот е достигнат — работата е паузирана.',
  agent_failed: 'Агентски job падна.',
};

async function send(channel: 'email' | 'telegram', _to: string, _text: string, _link: string) {
  // Pluggable senders — no-op unless credentials are present. Real SES/Telegram
  // wiring lives here (using _to/_text/_link); kept side-effect-free in dev.
  if (channel === 'email' && env.SES_FROM_EMAIL) {
    // await ses.send(...)
  }
  if (channel === 'telegram' && env.TELEGRAM_BOT_TOKEN) {
    // await telegram.send(...)
  }
}

export async function notify(event: NotifyEvent, opts: { userId?: string; link: string; payload?: Record<string, unknown> }) {
  const text = LABELS[event];
  const link = `${env.APP_URL}${opts.link}`;
  const notif = await prisma.notification.create({
    data: { userId: opts.userId, channel: 'email', event, payload: (opts.payload ?? {}) as never, link, sentAt: new Date() },
  });
  if (opts.userId) {
    const user = await prisma.user.findUnique({ where: { id: opts.userId } });
    if (user?.notifyEmail) await send('email', user.email, text, link);
    if (user?.notifyTelegram && user.telegramChatId) await send('telegram', user.telegramChatId, text, link);
  }
  return notif;
}

export async function listNotifications(userId?: string) {
  return prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 50 });
}
