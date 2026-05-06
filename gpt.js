GPT;

require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");
const fs = require("fs");
const XLSX = require("xlsx");
const bot = new Telegraf("8640140362:AAH5ViVxnvySziW7TwBATSSR4sAAk0CAS1E");
// ===== DATABASE FILE =====
const DB_FILE = "data.json";
// ===== LOAD DATA =====
function loadData() {
  if (!fs.existsSync(DB_FILE)) return {};
  return JSON.parse(fs.readFileSync(DB_FILE));
}
// ===== SAVE DATA =====
function saveData(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}
// ===== USER STATE =====
const userState = {};
// ===== START =====
bot.start((ctx) => {
  ctx.reply(
    "Assalomu alaykum 👋\nQuyidagilardan birini tanlang:",
    Markup.keyboard([["📥 Kirim", "📤 Chiqim"], ["📊 Ro'yhat"]]).resize(),
  );
});
// ===== KIRIM =====
bot.hears("📥 Kirim", (ctx) => {
  userState[ctx.from.id] = "kirim";
  ctx.reply("Kirim yozing:\nMasalan: 100000 ish haqi");
});
// ===== CHIQIM =====
bot.hears("📤 Chiqim", (ctx) => {
  userState[ctx.from.id] = "chiqim";
  ctx.reply("Chiqim yozing:\nMasalan: 70000 paynet");
});
// ===== TEXT HANDLE =====
bot.on("text", (ctx) => {
  const userId = ctx.from.id;
  const state = userState[userId];
  // Agar user hech narsa tanlamagan bo‘lsa
  if (!state) return;
  const data = loadData();
  if (!data[userId]) {
    data[userId] = {
      kirim: [],
      chiqim: [],
    };
  }
  const entry = {
    text: ctx.message.text,
    date: new Date().toLocaleString(),
  };
  if (state === "kirim") {
    data[userId].kirim.push(entry);
  } else {
    data[userId].chiqim.push(entry);
  }
  saveData(data);
  ctx.reply("✅ Saqlandi");
  // reset state
  userState[userId] = null;
});
// ===== EXCEL EXPORT =====
bot.hears("📊 Ro'yhat", async (ctx) => {
  const userId = ctx.from.id;
  const data = loadData();
  if (!data[userId]) {
    return ctx.reply("Hali ma'lumot yo'q ❌");
  }
  const kirim = data[userId].kirim || [];
  const chiqim = data[userId].chiqim || [];
  // Sheetlar
  const kirimSheet = XLSX.utils.json_to_sheet(kirim);
  const chiqimSheet = XLSX.utils.json_to_sheet(chiqim);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, kirimSheet, "Kirim");
  XLSX.utils.book_append_sheet(workbook, chiqimSheet, "Chiqim");
  // 🔥 BUFFER orqali yuborish
  const buffer = XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
  });
  await ctx.replyWithDocument({
    source: buffer,
    filename: "hisobot.xlsx",
  });
});
// ===== ERROR HANDLE =====
bot.catch((err) => {
  console.log("Xatolik:", err);
});
// ===== START BOT =====
bot.launch();
console.log("🤖 Bot ishga tushdi...");

// require("dotenv").config();
// const { Telegraf, Markup } = require("telegraf");
// const fs = require("fs");
// const XLSX = require("xlsx");
// const bot = new Telegraf("8640140362:AAH5ViVxnvySziW7TwBATSSR4sAAk0CAS1E"); // <-- tokenni shu yerga qo'y
// // ===== DATABASE (JSON FILE) =====
// const DB_FILE = "data.json";
// function loadData() {
//   if (!fs.existsSync(DB_FILE)) return {};
//   return JSON.parse(fs.readFileSync(DB_FILE));
// }
// function saveData(data) {
//   fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
// }
// // ===== USER STATE =====
// const userState = {}; // kirim yoki chiqim yozayotganini saqlaydi
// // ===== START =====
// bot.start((ctx) => {
//   ctx.reply(
//     "Assalomu alaykum 👋\nQuyidagilardan birini tanlang:",
//     Markup.keyboard([["📥 Kirim", "📤 Chiqim"], ["📊 Ro'yhat"]]).resize(),
//   );
// });
// // ===== BUTTON HANDLERS =====
// bot.hears("📥 Kirim", (ctx) => {
//   userState[ctx.from.id] = "kirim";
//   ctx.reply("Kirim yozing (masalan: 100000 ish haqi)");
// });
// bot.hears("📤 Chiqim", (ctx) => {
//   userState[ctx.from.id] = "chiqim";
//   ctx.reply("Chiqim yozing (masalan: 70000 paynet)");
// });
// // ===== TEXT INPUT =====
// bot.on("text", (ctx) => {
//   const userId = ctx.from.id;
//   const state = userState[userId];
//   if (!state) return;
//   const data = loadData();
//   if (!data[userId]) {
//     data[userId] = {
//       kirim: [],
//       chiqim: [],
//     };
//   }
//   const text = ctx.message.text;
//   const entry = {
//     text,
//     date: new Date().toLocaleString(),
//   };
//   if (state === "kirim") {
//     data[userId].kirim.push(entry);
//   } else {
//     data[userId].chiqim.push(entry);
//   }
//   saveData(data);
//   ctx.reply("✅ Saqlandi!");
//   userState[userId] = null;
// });
// // ===== EXCEL EXPORT =====
// bot.hears("📊 Ro'yhat", (ctx) => {
//   const userId = ctx.from.id;
//   const data = loadData();
//   if (!data[userId]) {
//     return ctx.reply("Hali ma'lumot yo'q ❌");
//   }
//   const kirim = data[userId].kirim || [];
//   const chiqim = data[userId].chiqim || [];
//   // ===== SHEET 1: KIRIM =====
//   const kirimSheet = XLSX.utils.json_to_sheet(kirim);
//   // ===== SHEET 2: CHIQIM =====
//   const chiqimSheet = XLSX.utils.json_to_sheet(chiqim);
//   const workbook = XLSX.utils.book_new();
//   XLSX.utils.book_append_sheet(workbook, kirimSheet, "Kirim");
//   XLSX.utils.book_append_sheet(workbook, chiqimSheet, "Chiqim");
//   const fileName = `hisobot_${userId}.xlsx`;
//   XLSX.writeFile(workbook, fileName);
//   ctx.replyWithDocument({
//     source: fileName,
//   });
// });
// // ===== RUN =====
// bot.launch();
// console.log("Bot ishga tushdi 🚀");
