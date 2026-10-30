/**
 * Telegram Approval Notifications — PostEngine
 * Sends post previews to Lance via Telegram with Approve/Reject buttons.
 * Use a dedicated PostEngine bot. Do not reuse Ada's OpenClaw bot.
 */

function getBotToken(): string {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() || "";
}

function chatId(): string {
  return process.env.TELEGRAM_CHAT_ID?.trim() || "";
}

/** Telegram is optional. Unset token or chat id means every send is a no-op. */
export function telegramNotificationsEnabled(): boolean {
  return Boolean(getBotToken() && chatId());
}

export async function sendApprovalRequest(post: any, dealershipName: string): Promise<boolean> {
  const token = getBotToken();
  if (!telegramNotificationsEnabled()) return false;

  const caption = post.caption?.substring(0, 800) || "";
  const scheduledDate = post.scheduledFor
    ? new Date(post.scheduledFor).toLocaleString("en-US", { timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "ASAP";

  const text = `📸 *${dealershipName} — ${post.postType}*\n📅 ${scheduledDate}\n\n${caption}`;

  const keyboard = {
    inline_keyboard: [[
      { text: "✅ Approve", callback_data: `approve_${post.id}` },
      { text: "❌ Reject", callback_data: `reject_${post.id}` },
    ]]
  };

  try {
    // Send photo with caption and buttons
    const mediaUrls = post.mediaUrls ? JSON.parse(post.mediaUrls) : [];
    const imageUrl = mediaUrls[0] || "";

    if (imageUrl) {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId(),
          photo: imageUrl,
          caption: text,
          parse_mode: "Markdown",
          reply_markup: keyboard,
        }),
      });
      const data = await res.json() as any;
      if (data.ok) {
        console.log(`[Telegram] Approval request sent for post ${post.id}`);
        return true;
      } else {
        console.error("[Telegram] sendPhoto failed:", data.description);
      }
    }

    // Fallback: text only
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId(),
        text,
        parse_mode: "Markdown",
        reply_markup: keyboard,
      }),
    });
    const data = await res.json() as any;
    return data.ok;
  } catch (e: any) {
    console.error("[Telegram] Error:", e.message);
    return false;
  }
}

export async function sendWeeklySummary(posts: any[], dealerships: any[]): Promise<void> {
  const token = getBotToken();
  if (!telegramNotificationsEnabled()) return;

  const byDealer: Record<string, any[]> = {};
  for (const post of posts) {
    const dealer = dealerships.find(d => d.id === post.dealershipId);
    const name = dealer?.name || "Unknown";
    if (!byDealer[name]) byDealer[name] = [];
    byDealer[name].push(post);
  }

  let text = `🗓 *PostEngine Weekly Summary*\n${posts.length} post(s) ready for review:\n\n`;
  for (const [dealer, dealerPosts] of Object.entries(byDealer)) {
    text += `*${dealer}:* ${dealerPosts.length} post(s)\n`;
    for (const p of dealerPosts) {
      const date = p.scheduledFor
        ? new Date(p.scheduledFor).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
        : "TBD";
      text += `  • ${p.postType} — ${date}\n`;
    }
  }
  const appUrl = (process.env.PUBLIC_APP_URL || "http://localhost:3456").replace(/\/$/, "");
  text += `\nOpen PostEngine to review: ${appUrl}/#/queue`;

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId(),
      text,
      parse_mode: "Markdown",
    }),
  });
}
