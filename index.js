require("dotenv").config();

const TelegramBot = require("node-telegram-bot-api");
const ExcelJS = require("exceljs");
const mongoose = require("mongoose");
const fs = require("fs");

const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

// MongoDB ulanish
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Atlas ulanish muvaffaqiyatli"))
  .catch((err) => console.error("❌ MongoDB ulanish xatosi:", err));

// Schema va model
const recordSchema = new mongoose.Schema({
  userId: Number,
  type: String, // '📝kirim' yoki '📝chiqim'
  text: String,
  amount: Number,
  date: { type: Date, default: Date.now },
});
const Record = mongoose.model("Record", recordSchema);

// Foydalanuvchi holatini saqlash
let userState = {};

const MAIN_MENU = {
  keyboard: [["📝Kirim", "📝Chiqim"], ["Ro'yhat 📃"]],
  resize_keyboard: true,
};
const CANCEL_MENU = {
  keyboard: [["⬅️ Bekor qilish"]],
  resize_keyboard: true,
};

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(
    chatId,
    "Salom! Men senga kirim va chiqimlarni yozib boraman.",
    {
      reply_markup: MAIN_MENU,
    },
  );
});

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  try {
    // --- Kirim boshlash ---
    if (text === "📝Kirim") {
      userState[chatId] = "📝kirim";
      return bot.sendMessage(
        chatId,
        "Kirim yozing (masalan: 100 ming oldim):",
        {
          reply_markup: CANCEL_MENU,
        },
      );
    }

    // --- Chiqim boshlash ---
    if (text === "📝Chiqim") {
      userState[chatId] = "📝chiqim";
      return bot.sendMessage(
        chatId,
        "Chiqim yozing (masalan: telefonga 70 ming paynet qildim):",
        {
          reply_markup: CANCEL_MENU,
        },
      );
    }

    // --- Bekor qilish (kirim/chiqim jarayonidan chiqish) ---
    if (text === "⬅️ Bekor qilish") {
      userState[chatId] = null;
      return bot.sendMessage(chatId, "Asosiy menyu:", {
        reply_markup: MAIN_MENU,
      });
    }

    // --- Ro'yhat menyusi ---
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

    // --- Excel yuklash (fayl yaratish va style qo'shish) ---
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

      // --- umumiy funksiya: sheet yaratish va style qo'yish ---
      function prepareSheet(sheet, title) {
        sheet.properties.defaultRowHeight = 20;
        sheet.columns = [
          { header: "#", key: "idx", width: 6 },
          { header: title + " matni", key: "text", width: 60 },
          { header: "Sana", key: "date", width: 27 },
          { header: "Summ", key: "amount", width: 15 },
        ];

        // Sarlavha style
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

      // Kirim sheet
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

        // Har bir katakka style
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

        // Summ ustuniga raqam format va qizil rang
        const amountCell = row.getCell(4);
        amountCell.numFmt = "#,##0";
        amountCell.font = { color: { argb: "FF0000" }, bold: true };
      });

      // Jami satr
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
        // Jami summani ham raqam formatiga o'tkazish
        if (cell.address && cell.address.endsWith("4")) {
          cell.numFmt = "#,##0";
        }
      });

      // Chiqim sheet
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
        if (cell.address && cell.address.endsWith("4")) {
          cell.numFmt = "#,##0";
        }
      });

      // Faylni saqlash va yuborish
      const filePath = `royhat_${chatId}.xlsx`;
      await workbook.xlsx.writeFile(filePath);
      await bot.sendDocument(chatId, filePath);
      fs.unlinkSync(filePath);
      return;
    }

    // --- Botda ko'rish menyusi ---
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

    // --- Kirimni botda ko'rsatish ---
    if (text === "Kirimni ko'rish 📈") {
      const kirimlar = await Record.find({
        userId: chatId,
        type: "📝kirim",
      }).sort({ date: 1 });
      if (kirimlar.length === 0) {
        return bot.sendMessage(chatId, "Kirimlar mavjud emas.");
      }
      let msgText = "📊 Kirimlar:\n\n";
      kirimlar.forEach((item, i) => {
        msgText += `${i + 1}) ${item.text} - ${item.amount || 0} so'm (${item.date.toLocaleString()})\n`;
      });
      return bot.sendMessage(chatId, msgText, { reply_markup: MAIN_MENU });
    }

    // --- Chiqimni botda ko'rsatish ---
    if (text === "Chiqimni ko'rish 📉") {
      const chiqimlar = await Record.find({
        userId: chatId,
        type: "📝chiqim",
      }).sort({ date: 1 });
      if (chiqimlar.length === 0) {
        return bot.sendMessage(chatId, "Chiqimlar mavjud emas.");
      }
      let msgText = "📊 Chiqimlar:\n\n";
      chiqimlar.forEach((item, i) => {
        msgText += `${i + 1}) ${item.text} - ${item.amount || 0} so'm (${item.date.toLocaleString()})\n`;
      });
      return bot.sendMessage(chatId, msgText, { reply_markup: MAIN_MENU });
    }

    // --- Ortga qaytish (Ro'yhat menyusidan asosiy menyuga) ---
    if (text === "⬅️ Ortga qaytish") {
      return bot.sendMessage(chatId, "Asosiy menyu:", {
        reply_markup: MAIN_MENU,
      });
    }

    // --- Kirim/Chiqim yozuvlarini saqlash (userState ga qarab) ---
    if (userState[chatId] === "📝kirim") {
      const numbers = (text && text.match(/\d+/g)) || [];
      const amount = numbers.length
        ? parseInt(numbers[numbers.length - 1], 10)
        : 0;
      const rec = new Record({ userId: chatId, type: "📝kirim", text, amount });
      await rec.save();
      userState[chatId] = null;
      return bot.sendMessage(chatId, "✅ Kirim saqlandi!", {
        reply_markup: MAIN_MENU,
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
        reply_markup: MAIN_MENU,
      });
    }

    // Agar hech qanday holatga to'g'ri kelmasa, asosiy menyuni takroran ko'rsatish
    return bot.sendMessage(chatId, "Nimani xohlaysiz? Asosiy menyu:", {
      reply_markup: MAIN_MENU,
    });
  } catch (err) {
    console.error("Xato:", err);
    bot.sendMessage(
      chatId,
      "Xatolik yuz berdi. Iltimos, keyinroq urinib ko'ring.",
    );
  }
});

console.log("Bot ishga tushdi 🚀");

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
