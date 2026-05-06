const TelegramBot = require("node-telegram-bot-api");
const ExcelJS = require("exceljs");
const mongoose = require("mongoose");
const fs = require("fs");

const token = "8640140362:AAH5ViVxnvySziW7TwBATSSR4sAAk0CAS1E"; // BotFather’dan olgan tokenni qo‘y
const bot = new TelegramBot(token, { polling: true });

// MongoDB ulanish
// mongoose.connect(
//   "mongodb://ayubiyurinboyev_db_user:3xz21uZId3meE5II@ac-gfowzmw-shard-00-00.8yvyqmq.mongodb.net:27017,ac-gfowzmw-shard-00-01.8yvyqmq.mongodb.net:27017,ac-gfowzmw-shard-00-02.8yvyqmq.mongodb.net:27017/?ssl=true&replicaSet=atlas-htvmnh-shard-0&authSource=admin&appName=Cluster0",
//   {
//     useNewUrlParser: true,
//     useUnifiedTopology: true,
//   },
// );

// MongoDB ulanish (Atlas connection string)
mongoose.connect(
  "mongodb://ayubiyurinboyev_db_user:TbIIZYSHWUmpygwi@ac-gfowzmw-shard-00-00.8yvyqmq.mongodb.net:27017,ac-gfowzmw-shard-00-01.8yvyqmq.mongodb.net:27017,ac-gfowzmw-shard-00-02.8yvyqmq.mongodb.net:27017/?ssl=true&replicaSet=atlas-htvmnh-shard-0&authSource=admin&appName=Cluster0",
);

// Schema va model
const recordSchema = new mongoose.Schema({
  type: String, // 'kirim' yoki 'chiqim'
  text: String,
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
    // MongoDB’dan ma’lumotlarni olish
    const kirimlar = await Record.find({ type: "kirim" });
    const chiqimlar = await Record.find({ type: "chiqim" });

    // Excel fayl yaratish
    const workbook = new ExcelJS.Workbook();

    const kirimSheet = workbook.addWorksheet("Kirim");
    kirimSheet.addRow(["#", "Kirim matni", "Sana"]);
    kirimlar.forEach((item, index) => {
      kirimSheet.addRow([index + 1, item.text, item.date.toLocaleString()]);
    });

    const chiqimSheet = workbook.addWorksheet("Chiqim");
    chiqimSheet.addRow(["#", "Chiqim matni", "Sana"]);
    chiqimlar.forEach((item, index) => {
      chiqimSheet.addRow([index + 1, item.text, item.date.toLocaleString()]);
    });

    const filePath = `royhat.xlsx`;
    await workbook.xlsx.writeFile(filePath);

    bot.sendDocument(chatId, filePath).then(() => {
      fs.unlinkSync(filePath);
    });
  } else {
    if (userState[chatId] === "kirim") {
      const rec = new Record({ type: "kirim", text });
      await rec.save();
      bot.sendMessage(chatId, "✅ Kirim saqlandi!");
      userState[chatId] = null;
    } else if (userState[chatId] === "chiqim") {
      const rec = new Record({ type: "chiqim", text });
      await rec.save();
      bot.sendMessage(chatId, "✅ Chiqim saqlandi!");
      userState[chatId] = null;
    }
  }
});

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
