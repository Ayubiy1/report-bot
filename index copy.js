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

    // const kirimTotalRow = kirimSheet.addRow(["", "", "Jami", kirimTotal]);
    // kirimTotalRow.eachCell((cell) => {
    //   cell.fill = {
    //     type: "pattern",
    //     pattern: "solid",
    //     fgColor: { argb: "FF9999" },
    //   };
    //   cell.border = {
    //     top: { style: "thin" },
    //     left: { style: "thin" },
    //     bottom: { style: "thin" },
    //     right: { style: "thin" },
    //   };
    //   cell.font = { size: 15, bold: true };
    //   cell.alignment = { horizontal: "center", vertical: "middle" };
    // });

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

    // const chiqimTotalRow = chiqimSheet.addRow(["", "", "Jami", chiqimTotal]);
    // chiqimTotalRow.eachCell((cell) => {
    //   cell.fill = {
    //     type: "pattern",
    //     pattern: "solid",
    //     fgColor: { argb: "FF9999" },
    //   };
    //   cell.border = {
    //     top: { style: "thin" },
    //     left: { style: "thin" },
    //     bottom: { style: "thin" },
    //     right: { style: "thin" },
    //   };
    //   cell.font = { size: 15, bold: true };
    //   cell.alignment = { horizontal: "center", vertical: "middle" };
    // });

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

//

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
  //   userId: Number, // foydalanuvchi ID
  //   type: String, // 'kirim' yoki 'chiqim'
  //   text: String,
  //   amount: Number, // summani alohida saqlaymiz
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
  //         keyboard: [["Kirim", "Chiqim"], ["Ro'yhat"]],
  //         resize_keyboard: true,
  //       },
  //     },
  //   );
  // });
  // bot.on("message", async (msg) => {
  //   const chatId = msg.chat.id;
  //   const text = msg.text;
  //   if (text === "Kirim") {
  //     userState[chatId] = "kirim";
  //     bot.sendMessage(chatId, "Kirim yozing (masalan: 100 ming oldim):");
  //   } else if (text === "Chiqim") {
  //     userState[chatId] = "chiqim";
  //     bot.sendMessage(
  //       chatId,
  //       "Chiqim yozing (masalan: telefonga 70 ming paynet qildim):",
  //     );
  //   } else if (text === "Ro'yhat") {
  //     // Faqat shu foydalanuvchining yozuvlarini olish
  //     const kirimlar = await Record.find({ userId: chatId, type: "kirim" });
  //     const chiqimlar = await Record.find({ userId: chatId, type: "chiqim" });
  //     const workbook = new ExcelJS.Workbook();
  //     // Kirim varaq
  //     const kirimSheet = workbook.addWorksheet("Kirim");
  //     kirimSheet.addRow(["#", "Kirim matni", "Sana", "Summ"]);
  //     kirimSheet.getColumn(1).width = 5; // # ustuni
  //     kirimSheet.getColumn(2).width = 60; // Chiqim matni
  //     kirimSheet.getColumn(3).width = 27; // Sana
  //     kirimSheet.getColumn(4).width = 10; // Summ
  //     // Sarlavhalarni rangli qilish
  //     kirimSheet.getRow(1).eachCell((cell) => {
  //       cell.fill = {
  //         type: "pattern",
  //         pattern: "darkGray",
  //         fgColor: { argb: "FFFF00" },
  //       };
  //       cell.font = { size: 17, bold: true };
  //       cell.alignment = { horizontal: "center", vertical: "middle" };
  //     });
  //     let kirimTotal = 0;
  //     kirimlar.forEach((item, index) => {
  //       kirimTotal += item.amount || 0;
  //       const row = kirimSheet.addRow([
  //         index + 1,
  //         item.text,
  //         item.date.toLocaleString(),
  //         item.amount || 0,
  //       ]);
  //       // Har bir katakka style berish
  //       row.eachCell((cell) => {
  //         cell.font = { size: 16 }; // shrift o‘lchami
  //         cell.alignment = { horizontal: "left" }; // chapga tekislash
  //         cell.border = {
  //           top: { style: "thin" },
  //           left: { style: "thin" },
  //           bottom: { style: "thin" },
  //           right: { style: "thin" },
  //         };
  //         cell.alignment = { horizontal: "center", vertical: "middle" };
  //       });
  //       // Masalan, summ ustunini qizil rangda ko‘rsatish
  //       row.getCell(4).font = { color: { argb: "FF0000" }, bold: true };
  //     });
  //     const kirimTotalRow = kirimSheet.addRow(["", "", "Jami", kirimTotal]);
  //     kirimTotalRow.eachCell((cell) => {
  //       cell.fill = {
  //         type: "pattern",
  //         pattern: "solid",
  //         fgColor: { argb: "FF9999" },
  //       };
  //       cell.font = { size: 15, bold: true };
  //       cell.alignment = { horizontal: "center", vertical: "middle" };
  //     });
  //     // Chiqim varaq
  //     const chiqimSheet = workbook.addWorksheet("Chiqim");
  //     chiqimSheet.addRow(["#", "Chiqim matni", "Sana", "Summ"]);
  //     chiqimSheet.getColumn(1).width = 5; // # ustuni
  //     chiqimSheet.getColumn(2).width = 60; // Chiqim matni
  //     chiqimSheet.getColumn(3).width = 27; // Sana
  //     chiqimSheet.getColumn(4).width = 10; // Summ
  //     chiqimSheet.getRow(1).eachCell((cell) => {
  //       cell.fill = {
  //         type: "pattern",
  //         pattern: "solid",
  //         fgColor: { argb: "FFFF00" },
  //       };
  //       cell.font = { size: 17, bold: true };
  //       cell.alignment = { horizontal: "center", vertical: "middle" };
  //     });
  //     let chiqimTotal = 0;
  //     chiqimlar.forEach((item, index) => {
  //       chiqimTotal += item.amount || 0;
  //       const row = chiqimSheet.addRow([
  //         index + 1,
  //         item.text,
  //         item.date.toLocaleString(),
  //         item.amount || 0,
  //       ]);
  //       // Har bir katakka style berish
  //       row.eachCell((cell) => {
  //         cell.font = { size: 16 }; // shrift o‘lchami
  //         cell.alignment = { horizontal: "left" }; // chapga tekislash
  //         cell.border = {
  //           top: { style: "thin" },
  //           left: { style: "thin" },
  //           bottom: { style: "thin" },
  //           right: { style: "thin" },
  //         };
  //         cell.alignment = { horizontal: "center", vertical: "middle" };
  //       });
  //       // Masalan, summ ustunini qizil rangda ko‘rsatish
  //       row.getCell(4).font = { color: { argb: "FF0000" }, bold: true };
  //     });
  //     const chiqimTotalRow = chiqimSheet.addRow(["", "", "Jami", chiqimTotal]);
  //     chiqimTotalRow.eachCell((cell) => {
  //       cell.fill = {
  //         type: "pattern",
  //         pattern: "solid",
  //         fgColor: { argb: "FF9999" },
  //       };
  //       cell.font = { size: 15, bold: true };
  //     });
  //     const filePath = `royhat_${chatId}.xlsx`;
  //     await workbook.xlsx.writeFile(filePath);
  //     bot.sendDocument(chatId, filePath).then(() => {
  //       fs.unlinkSync(filePath);
  //     });
  //   } else {
  //     if (userState[chatId] === "kirim") {
  //       // summani matndan ajratib olish (raqamlarni qidiramiz)
  //       const amountMatch = text.match(/\d+/);
  //       const amount = amountMatch ? parseInt(amountMatch[0]) : 0;
  //       const rec = new Record({ userId: chatId, type: "kirim", text, amount });
  //       await rec.save();
  //       bot.sendMessage(chatId, "✅ Kirim saqlandi!");
  //       userState[chatId] = null;
  //     } else if (userState[chatId] === "chiqim") {
  //       const amountMatch = text.match(/\d+/);
  //       const amount = amountMatch ? parseInt(amountMatch[0]) : 0;
  //       const rec = new Record({
  //         userId: chatId,
  //         type: "chiqim",
  //         text,
  //         amount,
  //       });
  //       await rec.save();
  //       bot.sendMessage(chatId, "✅ Chiqim saqlandi!");
  //       userState[chatId] = null;
  //     }
  //   }
  // });
}

{
  // require("dotenv").config(); // .env fayldan o'qish uchun
  // const TelegramBot = require("node-telegram-bot-api");
  // const ExcelJS = require("exceljs");
  // const mongoose = require("mongoose");
  // const fs = require("fs");
  // // Bot tokenni .env faylda saqlash tavsiya etiladi
  // const token = process.env.BOT_TOKEN;
  // const bot = new TelegramBot(token, { polling: true });
  // // MongoDB ulanish
  // mongoose
  //   .connect(process.env.MONGO_URI)
  //   .then(() => console.log("✅ MongoDB Atlas ulanish muvaffaqiyatli"))
  //   .catch((err) => console.error("❌ MongoDB ulanish xatosi:", err));
  // // Schema va model
  // const recordSchema = new mongoose.Schema({
  //   userId: Number, // foydalanuvchi ID
  //   type: String, // 'kirim' yoki 'chiqim'
  //   text: String,
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
  //         keyboard: [["Kirim", "Chiqim"], ["Ro'yhat"]],
  //         resize_keyboard: true,
  //       },
  //     },
  //   );
  // });
  // bot.on("message", async (msg) => {
  //   const chatId = msg.chat.id;
  //   const text = msg.text;
  //   if (text === "Kirim") {
  //     userState[chatId] = "kirim";
  //     bot.sendMessage(chatId, "Kirim yozing (masalan: 100 ming oldim):");
  //   } else if (text === "Chiqim") {
  //     userState[chatId] = "chiqim";
  //     bot.sendMessage(
  //       chatId,
  //       "Chiqim yozing (masalan: telefonga 70 ming paynet qildim):",
  //     );
  //   } else if (text === "Ro'yhat") {
  //     // MongoDB’dan ma’lumotlarni olish
  //     const kirimlar = await Record.find({ userId: chatId, type: "kirim" });
  //     const chiqimlar = await Record.find({ userId: chatId, type: "chiqim" });
  //     // Excel fayl yaratish
  //     const workbook = new ExcelJS.Workbook();
  //     const kirimSheet = workbook.addWorksheet("Kirim");
  //     kirimSheet.addRow(["#", "Kirim matni", "Sana"]);
  //     kirimlar.forEach((item, index) => {
  //       kirimSheet.addRow([index + 1, item.text, item.date.toLocaleString()]);
  //     });
  //     const chiqimSheet = workbook.addWorksheet("Chiqim");
  //     chiqimSheet.addRow(["#", "Chiqim matni", "Sana"]);
  //     chiqimlar.forEach((item, index) => {
  //       chiqimSheet.addRow([index + 1, item.text, item.date.toLocaleString()]);
  //     });
  //     const filePath = `royhat_${chatId}.xlsx`;
  //     await workbook.xlsx.writeFile(filePath);
  //     bot.sendDocument(chatId, filePath).then(() => {
  //       fs.unlinkSync(filePath);
  //     });
  //   } else {
  //     if (userState[chatId] === "kirim") {
  //       const rec = new Record({ userId: chatId, type: "kirim", text });
  //       await rec.save();
  //       bot.sendMessage(chatId, "✅ Kirim saqlandi!");
  //       userState[chatId] = null;
  //     } else if (userState[chatId] === "chiqim") {
  //       const rec = new Record({ userId: chatId, type: "chiqim", text });
  //       await rec.save();
  //       bot.sendMessage(chatId, "✅ Chiqim saqlandi!");
  //       userState[chatId] = null;
  //     }
  //   }
  // });
}

{
  // // Gimini
  // const TelegramBot = require("node-telegram-bot-api");
  // const ExcelJS = require("exceljs");
  // const fs = require("fs");
  // const token = "8640140362:AAH5ViVxnvySziW7TwBATSSR4sAAk0CAS1E"; // BotFather’dan olgan tokenni qo‘y
  // const bot = new TelegramBot(token, { polling: true });
  // const dbFile = "data.json";
  // // Fayl mavjud bo‘lmasa, bo‘sh obyekt yaratamiz
  // if (!fs.existsSync(dbFile)) {
  //   fs.writeFileSync(dbFile, JSON.stringify({ kirim: [], chiqim: [] }, null, 2));
  // }
  // // JSON fayldan o‘qish
  // function loadData() {
  //   try {
  //     const raw = fs.readFileSync(dbFile);
  //     const parsed = JSON.parse(raw);
  //     if (!parsed.kirim) parsed.kirim = [];
  //     if (!parsed.chiqim) parsed.chiqim = [];
  //     return parsed;
  //   } catch (e) {
  //     return { kirim: [], chiqim: [] };
  //   }
  // }
  // // JSON faylga yozish
  // function saveData(data) {
  //   fs.writeFileSync(dbFile, JSON.stringify(data, null, 2));
  // }
  // // Foydalanuvchi holatini saqlash
  // let userState = {};
  // bot.onText(/\/start/, (msg) => {
  //   const chatId = msg.chat.id;
  //   bot.sendMessage(
  //     chatId,
  //     "Salom! Men senga kirim va chiqimlarni yozib boraman.",
  //     {
  //       reply_markup: {
  //         keyboard: [["Kirim", "Chiqim"], ["Ro'yhat"]],
  //         resize_keyboard: true,
  //       },
  //     },
  //   );
  // });
  // bot.on("message", async (msg) => {
  //   const chatId = msg.chat.id;
  //   const text = msg.text;
  //   let data = loadData();
  //   if (text === "Kirim") {
  //     userState[chatId] = "kirim";
  //     bot.sendMessage(chatId, "Kirim yozing (masalan: 100 ming oldim):");
  //   } else if (text === "Chiqim") {
  //     userState[chatId] = "chiqim";
  //     bot.sendMessage(
  //       chatId,
  //       "Chiqim yozing (masalan: telefonga 70 ming paynet qildim):",
  //     );
  //   } else if (text === "Ro'yhat") {
  //     // Excel fayl yaratish
  //     const workbook = new ExcelJS.Workbook();
  //     // Kirimlar
  //     const kirimSheet = workbook.addWorksheet("Kirim");
  //     kirimSheet.addRow(["#", "Kirim matni"]);
  //     data.kirim.forEach((item, index) => {
  //       kirimSheet.addRow([index + 1, item]);
  //     });
  //     // Chiqimlar
  //     const chiqimSheet = workbook.addWorksheet("Chiqim");
  //     chiqimSheet.addRow(["#", "Chiqim matni"]);
  //     data.chiqim.forEach((item, index) => {
  //       chiqimSheet.addRow([index + 1, item]);
  //     });
  //     const filePath = `royhat.xlsx`;
  //     await workbook.xlsx.writeFile(filePath);
  //     bot.sendDocument(chatId, filePath).then(() => {
  //       fs.unlinkSync(filePath);
  //     });
  //   } else {
  //     // Agar foydalanuvchi holatda bo‘lsa
  //     if (userState[chatId] === "kirim") {
  //       data.kirim.push(text);
  //       saveData(data);
  //       bot.sendMessage(chatId, "✅ Kirim saqlandi!");
  //       userState[chatId] = null;
  //     } else if (userState[chatId] === "chiqim") {
  //       data.chiqim.push(text);
  //       saveData(data);
  //       bot.sendMessage(chatId, "✅ Chiqim saqlandi!");
  //       userState[chatId] = null;
  //     }
  //   }
  // });
  // bot.launch();
}
console.log("Bot ishga tushdi 🚀");

{
  // const TelegramBot = require("node-telegram-bot-api");
  // const ExcelJS = require("exceljs");
  // // Bot tokenini o'z tokening bilan almashtir
  // const token = "8640140362:AAH5ViVxnvySziW7TwBATSSR4sAAk0CAS1E";
  // const bot = new TelegramBot(token, { polling: true });
  // // Ma'lumotlarni saqlash uchun
  // let data = {
  //   kirim: [],
  //   chiqim: [],
  // };
  // // Start komandasi
  // bot.onText(/\/start/, (msg) => {
  //   const chatId = msg.chat.id;
  //   bot.sendMessage(
  //     chatId,
  //     "Salom! Men senga kirim va chiqimlarni yozib boraman.",
  //     {
  //       reply_markup: {
  //         keyboard: [["Kirim", "Chiqim"], ["Ro'yhat"]],
  //         resize_keyboard: true,
  //       },
  //     },
  //   );
  // });
  // // Kirim va chiqim tugmalari
  // bot.on("message", async (msg) => {
  //   const chatId = msg.chat.id;
  //   const text = msg.text;
  //   if (text === "Kirim") {
  //     bot.sendMessage(chatId, "Kirim yozing (masalan: 100 ming oldim):");
  //     bot.once("message", (res) => {
  //       data?.kirim.push(res.text);
  //       bot.sendMessage(chatId, "✅ Kirim saqlandi!");
  //     });
  //   } else if (text === "Chiqim") {
  //     bot.sendMessage(
  //       chatId,
  //       "Chiqim yozing (masalan: telefonga 70 ming paynet qildim):",
  //     );
  //     bot.once("message", (res) => {
  //       data?.chiqim?.push(res.text);
  //       bot.sendMessage(chatId, "✅ Chiqim saqlandi!");
  //     });
  //   } else if (text === "Ro'yhat") {
  //     // Excel fayl yaratish
  //     const workbook = new ExcelJS.Workbook();
  //     const kirimSheet = workbook.addWorksheet("Kirim");
  //     const chiqimSheet = workbook.addWorksheet("Chiqim");
  //     kirimSheet.addRow(["Kirimlar"]);
  //     data?.kirim.forEach((item) => {
  //       kirimSheet.addRow([item]);
  //     });
  //     chiqimSheet.addRow(["Chiqimlar"]);
  //     data?.chiqim?.forEach((item) => {
  //       chiqimSheet.addRow([item]);
  //     });
  //     const filePath = `ro'yhat.xlsx`;
  //     await workbook.xlsx.writeFile(filePath);
  //     bot.sendDocument(chatId, filePath);
  //   }
  // });
  // bot.onText(/\/start/, (msg) => {
  //   console.log("Bot ishlayapti ✅");
  // });
}
