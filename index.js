// index.js
require("dotenv").config();

const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const mongoose = require("mongoose");
const ExcelJS = require("exceljs");
const fs = require("fs");

const TOKEN = process.env.BOT_TOKEN;
const DOMAIN = process.env.DOMAIN; // https://your-app.onrender.com
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;

if (!TOKEN) {
  console.error("BOT_TOKEN .env da aniqlanmagan!");
  process.exit(1);
}
if (!DOMAIN) {
  console.error(
    "DOMAIN .env da aniqlanmagan! Masalan: https://your-app.onrender.com",
  );
  process.exit(1);
}

const app = express();
app.use(express.json());

// --- Telegram bot (webhook mode, polling o'chirilgan) ---
const bot = new TelegramBot(TOKEN); // polling false by default
const hookPath = `/bot${TOKEN}`;
const webhookUrl = `${DOMAIN}${hookPath}`;

// --- Dedup va user state ---
const lastMessageId = {}; // chatId -> last message_id
let userState = {}; // chatId -> "kirim" | "chiqim" | null

// --- MongoDB ulanish (zamonaviy) ---
async function connectMongo() {
  if (!MONGO_URI) {
    console.warn("MONGO_URI aniqlanmagan, DB ishlamaydi.");
    return;
  }
  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ MongoDB Atlas ulanish muvaffaqiyatli");
  } catch (err) {
    console.error("❌ MongoDB ulanish xatosi:", err);
  }
}
connectMongo();

// --- Schema va model ---
const recordSchema = new mongoose.Schema({
  userId: Number,
  type: String, // '📝kirim' yoki '📝chiqim'
  text: String,
  amount: Number,
  date: { type: Date, default: Date.now },
});
const Record = mongoose.model("Record", recordSchema);

// --- Webhook o'rnatish bilan bog'liq xavfsiz funksiya (retry/backoff) ---
async function ensureWebhook(url) {
  try {
    const info = await bot.getWebhookInfo();
    if (info && info.url === url) {
      console.log("Webhook allaqachon o'rnatilgan:", url);
      return;
    }
  } catch (e) {
    console.warn("getWebhookInfo xatosi (davom etamiz):", e.message || e);
  }

  let attempt = 0;
  while (attempt < 6) {
    try {
      await bot.setWebHook(url);
      console.log("Webhook o'rnatildi:", url);
      return;
    } catch (err) {
      attempt++;
      // Telegram xatosidan retry_after olamiz, bo'lmasa exponential backoff
      let retryAfter = 2 ** attempt;
      try {
        const body = err?.response?.body;
        if (body && body.parameters && body.parameters.retry_after) {
          retryAfter = Number(body.parameters.retry_after);
        }
      } catch (e) {
        /* ignore */
      }
      console.warn(
        `setWebHook xatosi: ${err.message || err}. Retry after ${retryAfter}s (attempt ${attempt})`,
      );
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
    }
  }
  console.error("Webhookni o'rnatib bo'lmadi — keyinroq urinib ko'ring.");
}

// --- Express endpoint: Telegram POSTlarni qabul qiladi ---
app.post(hookPath, async (req, res) => {
  try {
    await bot.processUpdate(req.body);
    res.sendStatus(200);
  } catch (err) {
    console.error("processUpdate xatosi:", err);
    res.sendStatus(500);
  }
});

// --- Bot event handlers ---
// /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(
    chatId,
    "Salom! Men senga kirim va chiqimlarni yozib boraman.",
    {
      reply_markup: {
        keyboard: [["📝Kirim", "📝Chiqim"], ["Ro'yhat 📃"]],
        resize_keyboard: true,
      },
    },
  );
});

// message handler (dedup + menyu logikasi)
bot.on("message", async (msg) => {
  try {
    const chatId = msg.chat.id;
    const text = msg.text;

    // Agar text bo'lmasa (media va hokazo) o'tkazib yubor
    if (!text) return;

    // --- Dedup: agar xuddi shu message_id allaqachon qayta ishlangan bo'lsa, o'tkazib yubor ---
    const msgId = msg.message_id;
    if (lastMessageId[chatId] === msgId) {
      console.log("Duplicate message ignored:", chatId, msgId);
      return;
    }
    lastMessageId[chatId] = msgId;

    // --- Menyular va holatlar ---
    const MAIN_MENU = {
      reply_markup: {
        keyboard: [["📝Kirim", "📝Chiqim"], ["Ro'yhat 📃"]],
        resize_keyboard: true,
      },
    };

    // Kirim boshlash
    if (text === "📝Kirim") {
      userState[chatId] = "📝kirim";
      return bot.sendMessage(
        chatId,
        "Kirim yozing (masalan: 100 ming oldim):",
        {
          reply_markup: {
            keyboard: [["⬅️ Bekor qilish"]],
            resize_keyboard: true,
          },
        },
      );
    }

    // Chiqim boshlash
    if (text === "📝Chiqim") {
      userState[chatId] = "📝chiqim";
      return bot.sendMessage(
        chatId,
        "Chiqim yozing (masalan: telefonga 70 ming paynet qildim):",
        {
          reply_markup: {
            keyboard: [["⬅️ Bekor qilish"]],
            resize_keyboard: true,
          },
        },
      );
    }

    // Bekor qilish (kirim/chiqim jarayonidan chiqish)
    if (text === "⬅️ Bekor qilish") {
      userState[chatId] = null;
      return bot.sendMessage(chatId, "Asosiy menyu:", MAIN_MENU);
    }

    // Ro'yhat menyusi
    if (text === "Ro'yhat 📃") {
      return bot.sendMessage(chatId, "Ro'yhatni qanday ko'rishni xohlaysiz?", {
        reply_markup: {
          keyboard: [
            ["📂 Excel yuklash", "📊 Botda ko'rish"],
            ["⬅️ Ortga qaytish"],
          ],
          resize_keyboard: true,
        },
      });
    }

    // Excel yaratish va yuborish (style bilan)
    if (text === "📂 Excel yuklash") {
      const kirimlar = await Record.find({
        userId: chatId,
        type: "📝kirim",
      }).sort({ date: 1 });
      const chiqimlar = await Record.find({
        userId: chatId,
        type: "📝chiqim",
      }).sort({ date: 1 });

      const workbook = new ExcelJS.Workbook();

      function prepareSheet(sheet, title) {
        sheet.properties.defaultRowHeight = 20;
        sheet.columns = [
          { header: "#", key: "idx", width: 6 },
          { header: title + " matni", key: "text", width: 60 },
          { header: "Sana", key: "date", width: 27 },
          { header: "Summ", key: "amount", width: 15 },
        ];
        sheet.getRow(1).eachCell((cell) => {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFFF00" },
          };
          cell.font = { size: 14, bold: true };
          cell.alignment = { horizontal: "center", vertical: "middle" };
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
        });
      }

      const kirimSheet = workbook.addWorksheet("Kirim");
      prepareSheet(kirimSheet, "Kirim");
      let kirimTotal = 0;
      kirimlar.forEach((item, index) => {
        kirimTotal += item.amount || 0;
        const row = kirimSheet.addRow({
          idx: index + 1,
          text: item.text,
          date: item.date.toLocaleString(),
          amount: item.amount || 0,
        });
        row.eachCell((cell, colNumber) => {
          cell.font = { size: 12 };
          cell.alignment = {
            horizontal: colNumber === 2 ? "left" : "center",
            vertical: "middle",
          };
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
        });
        const amountCell = row.getCell(4);
        amountCell.numFmt = "#,##0";
        amountCell.font = { color: { argb: "FF0000" }, bold: true };
      });
      const kirimTotalRow = kirimSheet.addRow(["", "", "Jami", kirimTotal]);
      kirimTotalRow.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF9999" },
        };
        cell.font = { size: 13, bold: true };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });

      const chiqimSheet = workbook.addWorksheet("Chiqim");
      prepareSheet(chiqimSheet, "Chiqim");
      let chiqimTotal = 0;
      chiqimlar.forEach((item, index) => {
        chiqimTotal += item.amount || 0;
        const row = chiqimSheet.addRow({
          idx: index + 1,
          text: item.text,
          date: item.date.toLocaleString(),
          amount: item.amount || 0,
        });
        row.eachCell((cell, colNumber) => {
          cell.font = { size: 12 };
          cell.alignment = {
            horizontal: colNumber === 2 ? "left" : "center",
            vertical: "middle",
          };
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
        });
        const amountCell = row.getCell(4);
        amountCell.numFmt = "#,##0";
        amountCell.font = { color: { argb: "FF0000" }, bold: true };
      });
      const chiqimTotalRow = chiqimSheet.addRow(["", "", "Jami", chiqimTotal]);
      chiqimTotalRow.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF9999" },
        };
        cell.font = { size: 13, bold: true };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });

      const filePath = `royhat_${chatId}.xlsx`;
      await workbook.xlsx.writeFile(filePath);
      await bot.sendDocument(chatId, filePath);
      fs.unlinkSync(filePath);
      return;
    }

    // Botda ko'rish menyusi
    if (text === "📊 Botda ko'rish") {
      return bot.sendMessage(chatId, "Qaysi ro'yhatni ko'rishni xohlaysiz?", {
        reply_markup: {
          keyboard: [
            ["Kirimni ko'rish 📈", "Chiqimni ko'rish 📉"],
            ["⬅️ Ortga qaytish"],
          ],
          resize_keyboard: true,
        },
      });
    }

    if (text === "Kirimni ko'rish 📈") {
      const kirimlar = await Record.find({
        userId: chatId,
        type: "📝kirim",
      }).sort({ date: 1 });
      if (!kirimlar.length)
        return bot.sendMessage(chatId, "Kirimlar mavjud emas.", {
          reply_markup: {
            keyboard: [["📝Kirim", "📝Chiqim"], ["Ro'yhat 📃"]],
            resize_keyboard: true,
          },
        });
      let msgText = "📊 Kirimlar:\n\n";
      kirimlar.forEach((item, i) => {
        msgText += `${i + 1}) ${item.text} - ${item.amount || 0} so'm (${item.date.toLocaleString()})\n`;
      });
      return bot.sendMessage(chatId, msgText, {
        reply_markup: {
          keyboard: [["📝Kirim", "📝Chiqim"], ["Ro'yhat 📃"]],
          resize_keyboard: true,
        },
      });
    }

    if (text === "Chiqimni ko'rish 📉") {
      const chiqimlar = await Record.find({
        userId: chatId,
        type: "📝chiqim",
      }).sort({ date: 1 });
      if (!chiqimlar.length)
        return bot.sendMessage(chatId, "Chiqimlar mavjud emas.", {
          reply_markup: {
            keyboard: [["📝Kirim", "📝Chiqim"], ["Ro'yhat 📃"]],
            resize_keyboard: true,
          },
        });
      let msgText = "📊 Chiqimlar:\n\n";
      chiqimlar.forEach((item, i) => {
        msgText += `${i + 1}) ${item.text} - ${item.amount || 0} so'm (${item.date.toLocaleString()})\n`;
      });
      return bot.sendMessage(chatId, msgText, {
        reply_markup: {
          keyboard: [["📝Kirim", "📝Chiqim"], ["Ro'yhat 📃"]],
          resize_keyboard: true,
        },
      });
    }

    if (text === "⬅️ Ortga qaytish") {
      return bot.sendMessage(chatId, "Asosiy menyu:", {
        reply_markup: {
          keyboard: [["📝Kirim", "📝Chiqim"], ["Ro'yhat 📃"]],
          resize_keyboard: true,
        },
      });
    }

    // Kirim/Chiqim yozuvlarini saqlash
    if (userState[chatId] === "📝kirim") {
      const numbers = (text && text.match(/\d+/g)) || [];
      const amount = numbers.length
        ? parseInt(numbers[numbers.length - 1], 10)
        : 0;
      const rec = new Record({ userId: chatId, type: "📝kirim", text, amount });
      await rec.save();
      userState[chatId] = null;
      return bot.sendMessage(chatId, "✅ Kirim saqlandi!", {
        reply_markup: {
          keyboard: [["📝Kirim", "📝Chiqim"], ["Ro'yhat 📃"]],
          resize_keyboard: true,
        },
      });
    }

    if (userState[chatId] === "📝chiqim") {
      const numbers = (text && text.match(/\d+/g)) || [];
      const amount = numbers.length
        ? parseInt(numbers[numbers.length - 1], 10)
        : 0;
      const rec = new Record({
        userId: chatId,
        type: "📝chiqim",
        text,
        amount,
      });
      await rec.save();
      userState[chatId] = null;
      return bot.sendMessage(chatId, "✅ Chiqim saqlandi!", {
        reply_markup: {
          keyboard: [["📝Kirim", "📝Chiqim"], ["Ro'yhat 📃"]],
          resize_keyboard: true,
        },
      });
    }

    // Default: asosiy menyu
    return bot.sendMessage(chatId, "Nimani xohlaysiz? Asosiy menyu:", {
      reply_markup: {
        keyboard: [["📝Kirim", "📝Chiqim"], ["Ro'yhat 📃"]],
        resize_keyboard: true,
      },
    });
  } catch (err) {
    console.error("Bot message handler xatosi:", err);
  }
});

// --- Serverni ishga tushurish va webhookni o'rnatish ---
app.listen(PORT, async () => {
  console.log(`Server ishlayapti. Port: ${PORT}`);
  console.log(`Webhook path: ${hookPath}`);
  await ensureWebhook(webhookUrl);
});

{
  // require("dotenv").config();
  // const express = require("express");
  // const TelegramBot = require("node-telegram-bot-api");
  // const mongoose = require("mongoose");
  // const ExcelJS = require("exceljs");
  // const fs = require("fs");
  // const TOKEN = process.env.BOT_TOKEN;
  // const DOMAIN = process.env.DOMAIN || "https://report-bot-s3ti.onrender.com"; // https://your-app.onrender.com
  // const PORT = process.env.PORT || 3000;
  // if (!TOKEN) {
  //   console.error("BOT_TOKEN .env da aniqlanmagan!");
  //   process.exit(1);
  // }
  // if (!DOMAIN) {
  //   console.error(
  //     "DOMAIN .env da aniqlanmagan! Masalan: https://report-bot-s3ti.onrender.com",
  //   );
  //   process.exit(1);
  // }
  // const app = express();
  // app.use(express.json()); // Telegram POST body uchun
  // // --- Telegram bot (polling o'chirilgan) ---
  // const bot = new TelegramBot(TOKEN); // polling false by default
  // // Webhook path — token bilan himoyalangan oddiy yo'l
  // const hookPath = `/bot${TOKEN}`;
  // const webhookUrl = `${DOMAIN}${hookPath}`;
  // // Set webhook (Telegramga webhook URLni o'rnatamiz)
  // (async () => {
  //   try {
  //     await bot.setWebHook(webhookUrl);
  //     console.log("Webhook o'rnatildi:", webhookUrl);
  //   } catch (err) {
  //     console.error("Webhook o'rnatishda xato:", err);
  //     process.exit(1);
  //   }
  // })();
  // // --- MongoDB ulanish ---
  // if (process.env.MONGO_URI) {
  //   mongoose
  //     .connect(process.env.MONGO_URI)
  //     .then(() => console.log("Mongo connected"))
  //     .catch((err) => console.error("Mongo connection error:", err));
  //   // mongoose
  //   //   .connect(process.env.MONGO_URI, {
  //   //     useNewUrlParser: true,
  //   //     useUnifiedTopology: true,
  //   //   })
  //   //   .then(() => console.log("✅ MongoDB Atlas ulanish muvaffaqiyatli"))
  //   //   .catch((err) => console.error("❌ MongoDB ulanish xatosi:", err));
  // } else {
  //   console.warn("MONGO_URI aniqlanmagan, DB ishlamaydi.");
  // }
  // // --- Schema va model (soddalashtirilgan) ---
  // const recordSchema = new mongoose.Schema({
  //   userId: Number,
  //   type: String,
  //   text: String,
  //   amount: Number,
  //   date: { type: Date, default: Date.now },
  // });
  // const Record = mongoose.model("Record", recordSchema);
  // // --- Bot logikasi (xuddi avvalgidek) ---
  // let userState = {};
  // const MAIN_MENU = {
  //   reply_markup: {
  //     keyboard: [["📝Kirim", "📝Chiqim"], ["Ro'yhat 📃"]],
  //     resize_keyboard: true,
  //   },
  // };
  // app.post(hookPath, async (req, res) => {
  //   try {
  //     // Telegram update ni botga uzatamiz
  //     await bot.processUpdate(req.body);
  //     res.sendStatus(200);
  //   } catch (err) {
  //     console.error("processUpdate xatosi:", err);
  //     res.sendStatus(500);
  //   }
  // });
  // // --- Bot event handlerlari (message) ---
  // bot.onText(/\/start/, (msg) => {
  //   const chatId = msg.chat.id;
  //   bot.sendMessage(
  //     chatId,
  //     "Salom! Men senga kirim va chiqimlarni yozib boraman.",
  //     MAIN_MENU,
  //   );
  // });
  // bot.on("message", async (msg) => {
  //   // Telegram webhook orqali kelgan har bir update shu yerga tushadi
  //   const chatId = msg.chat.id;
  //   const text = msg.text;
  //   // Agar text bo'lmasa (masalan media) o'tkazib yubor
  //   if (!text) return;
  //   try {
  //     if (text === "📝Kirim") {
  //       userState[chatId] = "📝kirim";
  //       return bot.sendMessage(
  //         chatId,
  //         "Kirim yozing (masalan: 100 ming oldim):",
  //         {
  //           reply_markup: {
  //             keyboard: [["⬅️ Bekor qilish"]],
  //             resize_keyboard: true,
  //           },
  //         },
  //       );
  //     }
  //     if (text === "📝Chiqim") {
  //       userState[chatId] = "📝chiqim";
  //       return bot.sendMessage(
  //         chatId,
  //         "Chiqim yozing (masalan: telefonga 70 ming paynet qildim):",
  //         {
  //           reply_markup: {
  //             keyboard: [["⬅️ Bekor qilish"]],
  //             resize_keyboard: true,
  //           },
  //         },
  //       );
  //     }
  //     if (text === "⬅️ Bekor qilish") {
  //       userState[chatId] = null;
  //       return bot.sendMessage(chatId, "Asosiy menyu:", MAIN_MENU);
  //     }
  //     if (text === "Ro'yhat 📃") {
  //       return bot.sendMessage(chatId, "Ro'yhatni qanday ko'rishni xohlaysiz?", {
  //         reply_markup: {
  //           keyboard: [
  //             ["📂 Excel yuklash", "📊 Botda ko'rish"],
  //             ["⬅️ Ortga qaytish"],
  //           ],
  //           resize_keyboard: true,
  //         },
  //       });
  //     }
  //     if (text === "📂 Excel yuklash") {
  //       const kirimlar = await Record.find({
  //         userId: chatId,
  //         type: "📝kirim",
  //       }).sort({ date: 1 });
  //       const chiqimlar = await Record.find({
  //         userId: chatId,
  //         type: "📝chiqim",
  //       }).sort({ date: 1 });
  //       const workbook = new ExcelJS.Workbook();
  //       // prepare sheet helper
  //       function prepareSheet(sheet, title) {
  //         sheet.properties.defaultRowHeight = 20;
  //         sheet.columns = [
  //           { header: "#", key: "idx", width: 6 },
  //           { header: title + " matni", key: "text", width: 60 },
  //           { header: "Sana", key: "date", width: 27 },
  //           { header: "Summ", key: "amount", width: 15 },
  //         ];
  //         sheet.getRow(1).eachCell((cell) => {
  //           cell.fill = {
  //             type: "pattern",
  //             pattern: "solid",
  //             fgColor: { argb: "FFFF00" },
  //           };
  //           cell.font = { size: 14, bold: true };
  //           cell.alignment = { horizontal: "center", vertical: "middle" };
  //           cell.border = {
  //             top: { style: "thin" },
  //             left: { style: "thin" },
  //             bottom: { style: "thin" },
  //             right: { style: "thin" },
  //           };
  //         });
  //       }
  //       const kirimSheet = workbook.addWorksheet("Kirim");
  //       prepareSheet(kirimSheet, "Kirim");
  //       let kirimTotal = 0;
  //       kirimlar.forEach((item, index) => {
  //         kirimTotal += item.amount || 0;
  //         const row = kirimSheet.addRow({
  //           idx: index + 1,
  //           text: item.text,
  //           date: item.date.toLocaleString(),
  //           amount: item.amount || 0,
  //         });
  //         row.eachCell((cell, colNumber) => {
  //           cell.font = { size: 12 };
  //           cell.alignment = {
  //             horizontal: colNumber === 2 ? "left" : "center",
  //             vertical: "middle",
  //           };
  //           cell.border = {
  //             top: { style: "thin" },
  //             left: { style: "thin" },
  //             bottom: { style: "thin" },
  //             right: { style: "thin" },
  //           };
  //         });
  //         const amountCell = row.getCell(4);
  //         amountCell.numFmt = "#,##0";
  //         amountCell.font = { color: { argb: "FF0000" }, bold: true };
  //       });
  //       const kirimTotalRow = kirimSheet.addRow(["", "", "Jami", kirimTotal]);
  //       kirimTotalRow.eachCell((cell) => {
  //         cell.fill = {
  //           type: "pattern",
  //           pattern: "solid",
  //           fgColor: { argb: "FF9999" },
  //         };
  //         cell.font = { size: 13, bold: true };
  //         cell.alignment = { horizontal: "center", vertical: "middle" };
  //         cell.border = {
  //           top: { style: "thin" },
  //           left: { style: "thin" },
  //           bottom: { style: "thin" },
  //           right: { style: "thin" },
  //         };
  //       });
  //       const chiqimSheet = workbook.addWorksheet("Chiqim");
  //       prepareSheet(chiqimSheet, "Chiqim");
  //       let chiqimTotal = 0;
  //       chiqimlar.forEach((item, index) => {
  //         chiqimTotal += item.amount || 0;
  //         const row = chiqimSheet.addRow({
  //           idx: index + 1,
  //           text: item.text,
  //           date: item.date.toLocaleString(),
  //           amount: item.amount || 0,
  //         });
  //         row.eachCell((cell, colNumber) => {
  //           cell.font = { size: 12 };
  //           cell.alignment = {
  //             horizontal: colNumber === 2 ? "left" : "center",
  //             vertical: "middle",
  //           };
  //           cell.border = {
  //             top: { style: "thin" },
  //             left: { style: "thin" },
  //             bottom: { style: "thin" },
  //             right: { style: "thin" },
  //           };
  //         });
  //         const amountCell = row.getCell(4);
  //         amountCell.numFmt = "#,##0";
  //         amountCell.font = { color: { argb: "FF0000" }, bold: true };
  //       });
  //       const chiqimTotalRow = chiqimSheet.addRow(["", "", "Jami", chiqimTotal]);
  //       chiqimTotalRow.eachCell((cell) => {
  //         cell.fill = {
  //           type: "pattern",
  //           pattern: "solid",
  //           fgColor: { argb: "FF9999" },
  //         };
  //         cell.font = { size: 13, bold: true };
  //         cell.alignment = { horizontal: "center", vertical: "middle" };
  //         cell.border = {
  //           top: { style: "thin" },
  //           left: { style: "thin" },
  //           bottom: { style: "thin" },
  //           right: { style: "thin" },
  //         };
  //       });
  //       const filePath = `royhat_${chatId}.xlsx`;
  //       await workbook.xlsx.writeFile(filePath);
  //       await bot.sendDocument(chatId, filePath);
  //       fs.unlinkSync(filePath);
  //       return;
  //     }
  //     if (text === "📊 Botda ko'rish") {
  //       return bot.sendMessage(chatId, "Qaysi ro'yhatni ko'rishni xohlaysiz?", {
  //         reply_markup: {
  //           keyboard: [
  //             ["Kirimni ko'rish 📈", "Chiqimni ko'rish 📉"],
  //             ["⬅️ Ortga qaytish"],
  //           ],
  //           resize_keyboard: true,
  //         },
  //       });
  //     }
  //     if (text === "Kirimni ko'rish 📈") {
  //       const kirimlar = await Record.find({
  //         userId: chatId,
  //         type: "📝kirim",
  //       }).sort({ date: 1 });
  //       if (!kirimlar.length)
  //         return bot.sendMessage(chatId, "Kirimlar mavjud emas.", MAIN_MENU);
  //       let msgText = "📊 Kirimlar:\n\n";
  //       kirimlar.forEach((item, i) => {
  //         msgText += `${i + 1}) ${item.text} - ${item.amount || 0} so'm (${item.date.toLocaleString()})\n`;
  //       });
  //       return bot.sendMessage(chatId, msgText, MAIN_MENU);
  //     }
  //     if (text === "Chiqimni ko'rish 📉") {
  //       const chiqimlar = await Record.find({
  //         userId: chatId,
  //         type: "📝chiqim",
  //       }).sort({ date: 1 });
  //       if (!chiqimlar.length)
  //         return bot.sendMessage(chatId, "Chiqimlar mavjud emas.", MAIN_MENU);
  //       let msgText = "📊 Chiqimlar:\n\n";
  //       chiqimlar.forEach((item, i) => {
  //         msgText += `${i + 1}) ${item.text} - ${item.amount || 0} so'm (${item.date.toLocaleString()})\n`;
  //       });
  //       return bot.sendMessage(chatId, msgText, MAIN_MENU);
  //     }
  //     if (text === "⬅️ Ortga qaytish") {
  //       return bot.sendMessage(chatId, "Asosiy menyu:", MAIN_MENU);
  //     }
  //     // Kirim/Chiqim yozuvlarini saqlash
  //     if (userState[chatId] === "📝kirim") {
  //       const numbers = (text && text.match(/\d+/g)) || [];
  //       const amount = numbers.length
  //         ? parseInt(numbers[numbers.length - 1], 10)
  //         : 0;
  //       const rec = new Record({ userId: chatId, type: "📝kirim", text, amount });
  //       await rec.save();
  //       userState[chatId] = null;
  //       return bot.sendMessage(chatId, "✅ Kirim saqlandi!", MAIN_MENU);
  //     }
  //     if (userState[chatId] === "📝chiqim") {
  //       const numbers = (text && text.match(/\d+/g)) || [];
  //       const amount = numbers.length
  //         ? parseInt(numbers[numbers.length - 1], 10)
  //         : 0;
  //       const rec = new Record({
  //         userId: chatId,
  //         type: "📝chiqim",
  //         text,
  //         amount,
  //       });
  //       await rec.save();
  //       userState[chatId] = null;
  //       return bot.sendMessage(chatId, "✅ Chiqim saqlandi!", MAIN_MENU);
  //     }
  //     // Default
  //     return bot.sendMessage(
  //       chatId,
  //       "Nimani xohlaysiz? Asosiy menyu:",
  //       MAIN_MENU,
  //     );
  //   } catch (err) {
  //     console.error("Xato:", err);
  //     return bot.sendMessage(
  //       chatId,
  //       "Xatolik yuz berdi. Iltimos, keyinroq urinib ko'ring.",
  //     );
  //   }
  // });
  // // --- Serverni ishga tushurish ---
  // app.listen(PORT, () => {
  //   console.log(`Server ishlayapti. Port: ${PORT}`);
  //   console.log(`Webhook path: ${hookPath}`);
  // });
}

{
  // require("dotenv").config();
  // const TelegramBot = require("node-telegram-bot-api");
  // const ExcelJS = require("exceljs");
  // const mongoose = require("mongoose");
  // const fs = require("fs");
  // const token = process.env.BOT_TOKEN;
  // const bot = new TelegramBot(token, { polling: true });
  // // MongoDB ulanish
  // mongoose
  //   .connect(process.env.MONGO_URI)
  //   .then(() => console.log("✅ MongoDB Atlas ulanish muvaffaqiyatli"))
  //   .catch((err) => console.error("❌ MongoDB ulanish xatosi:", err));
  // // Schema va model
  // const recordSchema = new mongoose.Schema({
  //   userId: Number,
  //   type: String, // '📝kirim' yoki '📝chiqim'
  //   text: String,
  //   amount: Number,
  //   date: { type: Date, default: Date.now },
  // });
  // const Record = mongoose.model("Record", recordSchema);
  // // Foydalanuvchi holatini saqlash
  // let userState = {};
  // const MAIN_MENU = {
  //   keyboard: [["📝Kirim", "📝Chiqim"], ["Ro'yhat 📃"]],
  //   resize_keyboard: true,
  // };
  // const CANCEL_MENU = {
  //   keyboard: [["⬅️ Bekor qilish"]],
  //   resize_keyboard: true,
  // };
  // bot.onText(/\/start/, (msg) => {
  //   const chatId = msg.chat.id;
  //   bot.sendMessage(
  //     chatId,
  //     "Salom! Men senga kirim va chiqimlarni yozib boraman.",
  //     {
  //       reply_markup: MAIN_MENU,
  //     },
  //   );
  // });
  // bot.on("message", async (msg) => {
  //   const chatId = msg.chat.id;
  //   const text = msg.text;
  //   try {
  //     // --- Kirim boshlash ---
  //     if (text === "📝Kirim") {
  //       userState[chatId] = "📝kirim";
  //       return bot.sendMessage(
  //         chatId,
  //         "Kirim yozing (masalan: 100 ming oldim):",
  //         {
  //           reply_markup: CANCEL_MENU,
  //         },
  //       );
  //     }
  //     // --- Chiqim boshlash ---
  //     if (text === "📝Chiqim") {
  //       userState[chatId] = "📝chiqim";
  //       return bot.sendMessage(
  //         chatId,
  //         "Chiqim yozing (masalan: telefonga 70 ming paynet qildim):",
  //         {
  //           reply_markup: CANCEL_MENU,
  //         },
  //       );
  //     }
  //     // --- Bekor qilish (kirim/chiqim jarayonidan chiqish) ---
  //     if (text === "⬅️ Bekor qilish") {
  //       userState[chatId] = null;
  //       return bot.sendMessage(chatId, "Asosiy menyu:", {
  //         reply_markup: MAIN_MENU,
  //       });
  //     }
  //     // --- Ro'yhat menyusi ---
  //     if (text === "Ro'yhat 📃") {
  //       return bot.sendMessage(chatId, "Ro'yhatni qanday ko'rishni xohlaysiz?", {
  //         reply_markup: {
  //           keyboard: [
  //             ["📂 Excel yuklash", "📊 Botda ko'rish"],
  //             ["⬅️ Ortga qaytish"],
  //           ],
  //           resize_keyboard: true,
  //         },
  //       });
  //     }
  //     // --- Excel yuklash (fayl yaratish va style qo'shish) ---
  //     if (text === "📂 Excel yuklash") {
  //       const kirimlar = await Record.find({
  //         userId: chatId,
  //         type: "📝kirim",
  //       }).sort({ date: 1 });
  //       const chiqimlar = await Record.find({
  //         userId: chatId,
  //         type: "📝chiqim",
  //       }).sort({ date: 1 });
  //       const workbook = new ExcelJS.Workbook();
  //       // --- umumiy funksiya: sheet yaratish va style qo'yish ---
  //       function prepareSheet(sheet, title) {
  //         sheet.properties.defaultRowHeight = 20;
  //         sheet.columns = [
  //           { header: "#", key: "idx", width: 6 },
  //           { header: title + " matni", key: "text", width: 60 },
  //           { header: "Sana", key: "date", width: 27 },
  //           { header: "Summ", key: "amount", width: 15 },
  //         ];
  //         // Sarlavha style
  //         sheet.getRow(1).eachCell((cell) => {
  //           cell.fill = {
  //             type: "pattern",
  //             pattern: "solid",
  //             fgColor: { argb: "FFFF00" },
  //           };
  //           cell.font = { size: 14, bold: true };
  //           cell.alignment = { horizontal: "center", vertical: "middle" };
  //           cell.border = {
  //             top: { style: "thin" },
  //             left: { style: "thin" },
  //             bottom: { style: "thin" },
  //             right: { style: "thin" },
  //           };
  //         });
  //       }
  //       // Kirim sheet
  //       const kirimSheet = workbook.addWorksheet("Kirim");
  //       prepareSheet(kirimSheet, "Kirim");
  //       let kirimTotal = 0;
  //       kirimlar.forEach((item, index) => {
  //         kirimTotal += item.amount || 0;
  //         const row = kirimSheet.addRow({
  //           idx: index + 1,
  //           text: item.text,
  //           date: item.date.toLocaleString(),
  //           amount: item.amount || 0,
  //         });
  //         // Har bir katakka style
  //         row.eachCell((cell, colNumber) => {
  //           cell.font = { size: 12 };
  //           cell.alignment = {
  //             horizontal: colNumber === 2 ? "left" : "center",
  //             vertical: "middle",
  //           };
  //           cell.border = {
  //             top: { style: "thin" },
  //             left: { style: "thin" },
  //             bottom: { style: "thin" },
  //             right: { style: "thin" },
  //           };
  //         });
  //         // Summ ustuniga raqam format va qizil rang
  //         const amountCell = row.getCell(4);
  //         amountCell.numFmt = "#,##0";
  //         amountCell.font = { color: { argb: "FF0000" }, bold: true };
  //       });
  //       // Jami satr
  //       const kirimTotalRow = kirimSheet.addRow(["", "", "Jami", kirimTotal]);
  //       kirimTotalRow.eachCell((cell) => {
  //         cell.fill = {
  //           type: "pattern",
  //           pattern: "solid",
  //           fgColor: { argb: "FF9999" },
  //         };
  //         cell.font = { size: 13, bold: true };
  //         cell.alignment = { horizontal: "center", vertical: "middle" };
  //         cell.border = {
  //           top: { style: "thin" },
  //           left: { style: "thin" },
  //           bottom: { style: "thin" },
  //           right: { style: "thin" },
  //         };
  //         // Jami summani ham raqam formatiga o'tkazish
  //         if (cell.address && cell.address.endsWith("4")) {
  //           cell.numFmt = "#,##0";
  //         }
  //       });
  //       // Chiqim sheet
  //       const chiqimSheet = workbook.addWorksheet("Chiqim");
  //       prepareSheet(chiqimSheet, "Chiqim");
  //       let chiqimTotal = 0;
  //       chiqimlar.forEach((item, index) => {
  //         chiqimTotal += item.amount || 0;
  //         const row = chiqimSheet.addRow({
  //           idx: index + 1,
  //           text: item.text,
  //           date: item.date.toLocaleString(),
  //           amount: item.amount || 0,
  //         });
  //         row.eachCell((cell, colNumber) => {
  //           cell.font = { size: 12 };
  //           cell.alignment = {
  //             horizontal: colNumber === 2 ? "left" : "center",
  //             vertical: "middle",
  //           };
  //           cell.border = {
  //             top: { style: "thin" },
  //             left: { style: "thin" },
  //             bottom: { style: "thin" },
  //             right: { style: "thin" },
  //           };
  //         });
  //         const amountCell = row.getCell(4);
  //         amountCell.numFmt = "#,##0";
  //         amountCell.font = { color: { argb: "FF0000" }, bold: true };
  //       });
  //       const chiqimTotalRow = chiqimSheet.addRow(["", "", "Jami", chiqimTotal]);
  //       chiqimTotalRow.eachCell((cell) => {
  //         cell.fill = {
  //           type: "pattern",
  //           pattern: "solid",
  //           fgColor: { argb: "FF9999" },
  //         };
  //         cell.font = { size: 13, bold: true };
  //         cell.alignment = { horizontal: "center", vertical: "middle" };
  //         cell.border = {
  //           top: { style: "thin" },
  //           left: { style: "thin" },
  //           bottom: { style: "thin" },
  //           right: { style: "thin" },
  //         };
  //         if (cell.address && cell.address.endsWith("4")) {
  //           cell.numFmt = "#,##0";
  //         }
  //       });
  //       // Faylni saqlash va yuborish
  //       const filePath = `royhat_${chatId}.xlsx`;
  //       await workbook.xlsx.writeFile(filePath);
  //       await bot.sendDocument(chatId, filePath);
  //       fs.unlinkSync(filePath);
  //       return;
  //     }
  //     // --- Botda ko'rish menyusi ---
  //     if (text === "📊 Botda ko'rish") {
  //       return bot.sendMessage(chatId, "Qaysi ro'yhatni ko'rishni xohlaysiz?", {
  //         reply_markup: {
  //           keyboard: [
  //             ["Kirimni ko'rish 📈", "Chiqimni ko'rish 📉"],
  //             ["⬅️ Ortga qaytish"],
  //           ],
  //           resize_keyboard: true,
  //         },
  //       });
  //     }
  //     // --- Kirimni botda ko'rsatish ---
  //     if (text === "Kirimni ko'rish 📈") {
  //       const kirimlar = await Record.find({
  //         userId: chatId,
  //         type: "📝kirim",
  //       }).sort({ date: 1 });
  //       if (kirimlar.length === 0) {
  //         return bot.sendMessage(chatId, "Kirimlar mavjud emas.");
  //       }
  //       let msgText = "📊 Kirimlar:\n\n";
  //       kirimlar.forEach((item, i) => {
  //         msgText += `${i + 1}) ${item.text} - ${item.amount || 0} so'm (${item.date.toLocaleString()})\n`;
  //       });
  //       return bot.sendMessage(chatId, msgText);
  //     }
  //     // --- Chiqimni botda ko'rsatish ---
  //     if (text === "Chiqimni ko'rish 📉") {
  //       const chiqimlar = await Record.find({
  //         userId: chatId,
  //         type: "📝chiqim",
  //       }).sort({ date: 1 });
  //       if (chiqimlar.length === 0) {
  //         return bot.sendMessage(chatId, "Chiqimlar mavjud emas.");
  //       }
  //       let msgText = "📊 Chiqimlar:\n\n";
  //       chiqimlar.forEach((item, i) => {
  //         msgText += `${i + 1}) ${item.text} - ${item.amount || 0} so'm (${item.date.toLocaleString()})\n`;
  //       });
  //       return bot.sendMessage(chatId, msgText);
  //     }
  //     // --- Ortga qaytish (Ro'yhat menyusidan asosiy menyuga) ---
  //     if (text === "⬅️ Ortga qaytish") {
  //       return bot.sendMessage(chatId, "Asosiy menyu:", {
  //         reply_markup: MAIN_MENU,
  //       });
  //     }
  //     // --- Kirim/Chiqim yozuvlarini saqlash (userState ga qarab) ---
  //     if (userState[chatId] === "📝kirim") {
  //       const numbers = (text && text.match(/\d+/g)) || [];
  //       const amount = numbers.length
  //         ? parseInt(numbers[numbers.length - 1], 10)
  //         : 0;
  //       const rec = new Record({ userId: chatId, type: "📝kirim", text, amount });
  //       await rec.save();
  //       userState[chatId] = null;
  //       return bot.sendMessage(chatId, "✅ Kirim saqlandi!", {
  //         reply_markup: MAIN_MENU,
  //       });
  //     }
  //     if (userState[chatId] === "📝chiqim") {
  //       const numbers = (text && text.match(/\d+/g)) || [];
  //       const amount = numbers.length
  //         ? parseInt(numbers[numbers.length - 1], 10)
  //         : 0;
  //       const rec = new Record({
  //         userId: chatId,
  //         type: "📝chiqim",
  //         text,
  //         amount,
  //       });
  //       await rec.save();
  //       userState[chatId] = null;
  //       return bot.sendMessage(chatId, "✅ Chiqim saqlandi!", {
  //         reply_markup: MAIN_MENU,
  //       });
  //     }
  //     // Agar hech qanday holatga to'g'ri kelmasa, asosiy menyuni takroran ko'rsatish
  //     return bot.sendMessage(
  //       chatId,
  //       "Nimani xohlaysiz? Asosiy menyu: 1111111111",
  //       {
  //         reply_markup: MAIN_MENU,
  //       },
  //     );
  //   } catch (err) {
  //     console.error("Xato:", err);
  //     bot.sendMessage(
  //       chatId,
  //       "Xatolik yuz berdi. Iltimos, keyinroq urinib ko'ring.",
  //     );
  //   }
  // });
  // console.log("Bot ishga tushdi 🚀");
}

{
  // require("dotenv").config();
  // const TelegramBot = require("node-telegram-bot-api");
  // const ExcelJS = require("exceljs");
  // const mongoose = require("mongoose");
  // const fs = require("fs");
  // const token = process.env.BOT_TOKEN;
  // const bot = new TelegramBot(token, { polling: true });
  // // MongoDB ulanish
  // mongoose
  //   .connect(process.env.MONGO_URI)
  //   .then(() => console.log("✅ MongoDB Atlas ulanish muvaffaqiyatli"))
  //   .catch((err) => console.error("❌ MongoDB ulanish xatosi:", err));
  // // Schema va model
  // const recordSchema = new mongoose.Schema({
  //   userId: Number,
  //   type: String, // 'kirim' yoki 'chiqim'
  //   text: String,
  //   amount: Number,
  //   date: { type: Date, default: Date.now },
  // });
  // const Record = mongoose.model("Record", recordSchema);
  // // Foydalanuvchi holatini saqlash
  // let userState = {};
  // bot.onText(/\/start/, (msg) => {
  //   const chatId = msg.chat.id;
  //   bot.sendMessage(
  //     chatId,
  //     "Salom! Men senga kirim va chiqimlarni yozib boraman.",
  //     {
  //       reply_markup: {
  //         keyboard: [["📝Kirim", "📝Chiqim"], ["Ro'yhat 📃"]],
  //         resize_keyboard: true,
  //       },
  //     },
  //   );
  // });
  // bot.on("message", async (msg) => {
  //   const chatId = msg.chat.id;
  //   const text = msg.text;
  //   if (text === "📝Kirim") {
  //     userState[chatId] = "📝kirim";
  //     bot.sendMessage(chatId, "Kirim yozing (masalan: 100 ming oldim):");
  //   } else if (text === "📝Chiqim") {
  //     userState[chatId] = "📝chiqim";
  //     bot.sendMessage(
  //       chatId,
  //       "Chiqim yozing (masalan: telefonga 70 ming paynet qildim):",
  //     );
  //   } else if (text === "Ro'yhat 📃") {
  //     // Tanlov menyusi
  //     bot.sendMessage(chatId, "Ro'yhatni qanday ko'rishni xohlaysiz?", {
  //       reply_markup: {
  //         keyboard: [
  //           ["📂 Excel yuklash", "📊 Botda ko'rish"],
  //           ["⬅️ Ortga qaytish"],
  //         ],
  //         resize_keyboard: true,
  //       },
  //     });
  //   } else if (text === "📂 Excel yuklash") {
  //     // Excel fayl yaratish
  //     const kirimlar = await Record.find({ userId: chatId, type: "📝kirim" });
  //     const chiqimlar = await Record.find({ userId: chatId, type: "📝chiqim" });
  //     const workbook = new ExcelJS.Workbook();
  //     const kirimSheet = workbook.addWorksheet("📝Kirim");
  //     kirimSheet.addRow(["#", "Kirim matni", "Sana", "Summ"]);
  //     let kirimTotal = 0;
  //     kirimlar.forEach((item, index) => {
  //       kirimTotal += item.amount || 0;
  //       kirimSheet.addRow([
  //         index + 1,
  //         item.text,
  //         item.date.toLocaleString(),
  //         item.amount || 0,
  //       ]);
  //     });
  //     kirimSheet.addRow(["", "", "Jami", kirimTotal]);
  //     const chiqimSheet = workbook.addWorksheet("📝Chiqim");
  //     chiqimSheet.addRow(["#", "Chiqim matni", "Sana", "Summ"]);
  //     let chiqimTotal = 0;
  //     chiqimlar.forEach((item, index) => {
  //       chiqimTotal += item.amount || 0;
  //       chiqimSheet.addRow([
  //         index + 1,
  //         item.text,
  //         item.date.toLocaleString(),
  //         item.amount || 0,
  //       ]);
  //     });
  //     chiqimSheet.addRow(["", "", "Jami", chiqimTotal]);
  //     const filePath = `royhat_${chatId}.xlsx`;
  //     await workbook.xlsx.writeFile(filePath);
  //     bot.sendDocument(chatId, filePath).then(() => fs.unlinkSync(filePath));
  //   } else if (text === "📊 Botda ko'rish") {
  //     // Botda ko‘rish menyusi
  //     bot.sendMessage(chatId, "Qaysi ro'yhatni ko'rishni xohlaysiz?", {
  //       reply_markup: {
  //         keyboard: [
  //           ["Kirimni ko'rish 📈", "Chiqimni ko'rish 📉"],
  //           ["⬅️ Ortga qaytish"],
  //         ],
  //         resize_keyboard: true,
  //       },
  //     });
  //   } else if (text === "Kirimni ko'rish 📈") {
  //     const kirimlar = await Record.find({ userId: chatId, type: "📝kirim" });
  //     if (kirimlar.length === 0) {
  //       bot.sendMessage(chatId, "Kirimlar mavjud emas.");
  //     } else {
  //       let msgText = "📊 Kirimlar:\n\n";
  //       kirimlar.forEach((item, i) => {
  //         msgText += `${i + 1}) ${item.text} - ${item.amount || 0} so'm (${item.date.toLocaleString()})\n`;
  //       });
  //       bot.sendMessage(chatId, msgText);
  //     }
  //   } else if (text === "Chiqimni ko'rish 📉") {
  //     const chiqimlar = await Record.find({ userId: chatId, type: "📝chiqim" });
  //     if (chiqimlar.length === 0) {
  //       bot.sendMessage(chatId, "Chiqimlar mavjud emas.");
  //     } else {
  //       let msgText = "📊 Chiqimlar:\n\n";
  //       chiqimlar.forEach((item, i) => {
  //         msgText += `${i + 1}) ${item.text} - ${item.amount || 0} so'm (${item.date.toLocaleString()})\n`;
  //       });
  //       bot.sendMessage(chatId, msgText);
  //     }
  //   } else if (text === "⬅️ Ortga qaytish") {
  //     // Asosiy menyuga qaytish
  //     bot.sendMessage(chatId, "Asosiy menyu:", {
  //       reply_markup: {
  //         keyboard: [["📝Kirim", "📝Chiqim"], ["Ro'yhat 📃"]],
  //         resize_keyboard: true,
  //       },
  //     });
  //   } else {
  //     // Kirim/Chiqim yozuvlarini saqlash
  //     if (userState[chatId] === "📝kirim") {
  //       const numbers = text.match(/\d+/g);
  //       const amount = numbers ? parseInt(numbers[numbers.length - 1]) : 0;
  //       const rec = new Record({ userId: chatId, type: "📝kirim", text, amount });
  //       await rec.save();
  //       bot.sendMessage(chatId, "✅ Kirim saqlandi!");
  //       userState[chatId] = null;
  //     } else if (userState[chatId] === "📝chiqim") {
  //       const numbers = text.match(/\d+/g);
  //       const amount = numbers ? parseInt(numbers[numbers.length - 1]) : 0;
  //       const rec = new Record({
  //         userId: chatId,
  //         type: "📝chiqim",
  //         text,
  //         amount,
  //       });
  //       await rec.save();
  //       bot.sendMessage(chatId, "✅ Chiqim saqlandi!");
  //       userState[chatId] = null;
  //     }
  //   }
  // });
  // console.log("Bot ishga tushdi 🚀");
}
