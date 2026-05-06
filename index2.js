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
  userId: Number, // foydalanuvchi ID
  type: String, // 'kirim' yoki 'chiqim'
  text: String,
  amount: Number, // summani alohida saqlaymiz
  date: { type: Date, default: Date.now },
});

const Record = mongoose.model("Record", recordSchema);

// Foydalanuvchi holatini saqlash
let userState = {};

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(
    chatId,
    "Salom! Men senga kirim va chiqimlarni yozib boraman.",
    {
      reply_markup: {
        keyboard: [["Kirim", "Chiqim"], ["Ro'yhat"]],
        resize_keyboard: true,
      },
    },
  );
});

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text === "Kirim") {
    userState[chatId] = "kirim";
    bot.sendMessage(chatId, "Kirim yozing (masalan: 100 ming oldim):");
  } else if (text === "Chiqim") {
    userState[chatId] = "chiqim";
    bot.sendMessage(
      chatId,
      "Chiqim yozing (masalan: telefonga 70 ming paynet qildim):",
    );
  } else if (text === "Ro'yhat") {
    // Faqat shu foydalanuvchining yozuvlarini olish
    const kirimlar = await Record.find({ userId: chatId, type: "kirim" });
    const chiqimlar = await Record.find({ userId: chatId, type: "chiqim" });

    const workbook = new ExcelJS.Workbook();

    // Kirim varaq
    const kirimSheet = workbook.addWorksheet("Kirim");
    kirimSheet.addRow(["#", "Kirim matni", "Sana", "Summ"]);

    kirimSheet.getColumn(1).width = 5;
    kirimSheet.getColumn(2).width = 60;
    kirimSheet.getColumn(3).width = 27;
    kirimSheet.getColumn(4).width = 10;

    kirimSheet.getRow(1).eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFF00" },
      };
      cell.font = { size: 17, bold: true };
      cell.alignment = { horizontal: "center", vertical: "middle" };
    });

    let kirimTotal = 0;
    kirimlar.forEach((item, index) => {
      kirimTotal += item.amount || 0;
      const row = kirimSheet.addRow([
        index + 1,
        item.text,
        item.date.toLocaleString(),
        item.amount || 0,
      ]);
      row.eachCell((cell) => {
        cell.font = { size: 14 };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });
      row.getCell(4).font = { color: { argb: "FF0000" }, bold: true };
    });

    // Chiqim varaq
    const chiqimSheet = workbook.addWorksheet("Chiqim");
    chiqimSheet.addRow(["#", "Chiqim matni", "Sana", "Summ"]);

    chiqimSheet.getColumn(1).width = 5;
    chiqimSheet.getColumn(2).width = 60;
    chiqimSheet.getColumn(3).width = 27;
    chiqimSheet.getColumn(4).width = 10;

    chiqimSheet.getRow(1).eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFF00" },
      };
      cell.font = { size: 17, bold: true };
      cell.alignment = { horizontal: "center", vertical: "middle" };
    });

    let chiqimTotal = 0;
    chiqimlar.forEach((item, index) => {
      chiqimTotal += item.amount || 0;
      const row = chiqimSheet.addRow([
        index + 1,
        item.text,
        item.date.toLocaleString(),
        item.amount || 0,
      ]);
      row.eachCell((cell) => {
        cell.font = { size: 14 };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });
      row.getCell(4).font = { color: { argb: "FF0000" }, bold: true };
    });

    const filePath = `royhat_${chatId}.xlsx`;
    await workbook.xlsx.writeFile(filePath);

    bot.sendDocument(chatId, filePath).then(() => {
      fs.unlinkSync(filePath);
    });
  } else {
    if (userState[chatId] === "kirim") {
      const numbers = text.match(/\d+/g);
      const amount = numbers ? parseInt(numbers[numbers.length - 1]) : 0;

      const rec = new Record({ userId: chatId, type: "kirim", text, amount });
      await rec.save();
      bot.sendMessage(chatId, "✅ Kirim saqlandi!");
      userState[chatId] = null;
    } else if (userState[chatId] === "chiqim") {
      const numbers = text.match(/\d+/g);
      const amount = numbers ? parseInt(numbers[numbers.length - 1]) : 0;

      const rec = new Record({ userId: chatId, type: "chiqim", text, amount });
      await rec.save();
      bot.sendMessage(chatId, "✅ Chiqim saqlandi!");
      userState[chatId] = null;
    }
  }
});

console.log("Bot ishga tushdi 🚀");
