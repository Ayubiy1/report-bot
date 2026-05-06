// Claude

require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const TOKEN = process.env.BOT_TOKEN;
const bot = new TelegramBot(TOKEN, { polling: true });
console.log("Bot ishga tushdi...");
// /start buyrug'i
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name;
  bot.sendMessage(
    chatId,
    `Salom, ${firstName}! Men sizning botingizman.\n\nMavjud buyruqlar:\n/start - Botni ishga tushirish\n/help - Yordam\n/echo - Xabarni qaytarish\n/info - Ma'lumot`,
  );
});
// /help buyrug'i
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(
    chatId,
    `Yordam bo'limi:\n\n` +
      `/start - Boshlash\n` +
      `/echo [matn] - Xabaringizni qaytaradi\n` +
      `/info - Siz haqingizda ma'lumot\n` +
      `/joke - Hazil aytadi`,
  );
});
// /echo buyrug'i
bot.onText(/\/echo (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const userText = match[1];
  bot.sendMessage(chatId, `Siz yozdingiz: "${userText}"`);
});
// /info buyrug'i
bot.onText(/\/info/, (msg) => {
  const chatId = msg.chat.id;
  const user = msg.from;
  bot.sendMessage(
    chatId,
    `Sizning ma'lumotlaringiz:\n\n` +
      `ID: ${user.id}\n` +
      `Ism: ${user.first_name}\n` +
      `Familiya: ${user.last_name || "Kiritilmagan"}\n` +
      `Username: @${user.username || "Yo'q"}`,
  );
});
// /joke buyrug'i
bot.onText(/\/joke/, (msg) => {
  const chatId = msg.chat.id;
  const jokes = [
    "Dasturchi nima uchun kun botsa uxlay olmaydi? Chunki bug' bor edi!",
    "Java va JavaScript qanday bog'liq? Xuddi avtomobil va avtomatika kabi!",
    "Nol va bir birga yashay olmadi. Sababi? Ikkilik munosabat!",
  ];
  const randomJoke = jokes[Math.floor(Math.random() * jokes.length)];
  bot.sendMessage(chatId, randomJoke);
});
// Inline keyboard misoli
bot.onText(/\/menu/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, "Menyuni tanlang:", {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "Yordam", callback_data: "help" },
          { text: "Hazil", callback_data: "joke" },
        ],
        [{ text: "Ma'lumot", callback_data: "info" }],
      ],
    },
  });
});
// Callback query (inline tugmalar uchun)
bot.on("callback_query", (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  if (data === "help") {
    bot.sendMessage(chatId, "Yordam kerakmi? /help yozing!");
  } else if (data === "joke") {
    bot.sendMessage(chatId, "Ha-ha! Hazilni /joke orqali ko'ring!");
  } else if (data === "info") {
    bot.sendMessage(chatId, "Ma'lumot uchun /info yozing!");
  }
  bot.answerCallbackQuery(query.id);
});
// Oddiy matnli xabarlar
bot.on("message", (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  // Agar buyruq bo'lmasa
  if (text && !text.startsWith("/")) {
    bot.sendMessage(
      chatId,
      `Siz yubordingiz: "${text}"\n\nBuyruqlar uchun /help yozing.`,
    );
  }
});
// Xatolarni ushlash
bot.on("polling_error", (error) => {
  console.error("Polling xatosi:", error.message);
});

// Claude
{
  // require("dotenv").config();
  // const TelegramBot = require("node-telegram-bot-api");
  // const TOKEN = process.env.BOT_TOKEN;
  // const bot = new TelegramBot(TOKEN, { polling: true });
  // console.log("Bot ishga tushdi...");
  // // /start buyrug'i
  // bot.onText(/\/start/, (msg) => {
  //   const chatId = msg.chat.id;
  //   const firstName = msg.from.first_name;
  //   bot.sendMessage(
  //     chatId,
  //     `Salom, ${firstName}! Men sizning botingizman.\n\nMavjud buyruqlar:\n/start - Botni ishga tushirish\n/help - Yordam\n/echo - Xabarni qaytarish\n/info - Ma'lumot`,
  //   );
  // });
  // // /help buyrug'i
  // bot.onText(/\/help/, (msg) => {
  //   const chatId = msg.chat.id;
  //   bot.sendMessage(
  //     chatId,
  //     `Yordam bo'limi:\n\n` +
  //       `/start - Boshlash\n` +
  //       `/echo [matn] - Xabaringizni qaytaradi\n` +
  //       `/info - Siz haqingizda ma'lumot\n` +
  //       `/joke - Hazil aytadi`,
  //   );
  // });
  // // /echo buyrug'i
  // bot.onText(/\/echo (.+)/, (msg, match) => {
  //   const chatId = msg.chat.id;
  //   const userText = match[1];
  //   bot.sendMessage(chatId, `Siz yozdingiz: "${userText}"`);
  // });
  // // /info buyrug'i
  // bot.onText(/\/info/, (msg) => {
  //   const chatId = msg.chat.id;
  //   const user = msg.from;
  //   bot.sendMessage(
  //     chatId,
  //     `Sizning ma'lumotlaringiz:\n\n` +
  //       `ID: ${user.id}\n` +
  //       `Ism: ${user.first_name}\n` +
  //       `Familiya: ${user.last_name || "Kiritilmagan"}\n` +
  //       `Username: @${user.username || "Yo'q"}`,
  //   );
  // });
  // // /joke buyrug'i
  // bot.onText(/\/joke/, (msg) => {
  //   const chatId = msg.chat.id;
  //   const jokes = [
  //     "Dasturchi nima uchun kun botsa uxlay olmaydi? Chunki bug' bor edi!",
  //     "Java va JavaScript qanday bog'liq? Xuddi avtomobil va avtomatika kabi!",
  //     "Nol va bir birga yashay olmadi. Sababi? Ikkilik munosabat!",
  //   ];
  //   const randomJoke = jokes[Math.floor(Math.random() * jokes.length)];
  //   bot.sendMessage(chatId, randomJoke);
  // });
  // // Inline keyboard misoli
  // bot.onText(/\/menu/, (msg) => {
  //   const chatId = msg.chat.id;
  //   bot.sendMessage(chatId, "Menyuni tanlang:", {
  //     reply_markup: {
  //       inline_keyboard: [
  //         [
  //           { text: "Yordam", callback_data: "help" },
  //           { text: "Hazil", callback_data: "joke" },
  //         ],
  //         [{ text: "Ma'lumot", callback_data: "info" }],
  //       ],
  //     },
  //   });
  // });
  // // Callback query (inline tugmalar uchun)
  // bot.on("callback_query", (query) => {
  //   const chatId = query.message.chat.id;
  //   const data = query.data;
  //   if (data === "help") {
  //     bot.sendMessage(chatId, "Yordam kerakmi? /help yozing!");
  //   } else if (data === "joke") {
  //     bot.sendMessage(chatId, "Ha-ha! Hazilni /joke orqali ko'ring!");
  //   } else if (data === "info") {
  //     bot.sendMessage(chatId, "Ma'lumot uchun /info yozing!");
  //   }
  //   bot.answerCallbackQuery(query.id);
  // });
  // // Oddiy matnli xabarlar
  // bot.on("message", (msg) => {
  //   const chatId = msg.chat.id;
  //   const text = msg.text;
  //   // Agar buyruq bo'lmasa
  //   if (text && !text.startsWith("/")) {
  //     bot.sendMessage(
  //       chatId,
  //       `Siz yubordingiz: "${text}"\n\nBuyruqlar uchun /help yozing.`,
  //     );
  //   }
  // });
  // // Xatolarni ushlash
  // bot.on("polling_error", (error) => {
  //   console.error("Polling xatosi:", error.message);
  // });
}
