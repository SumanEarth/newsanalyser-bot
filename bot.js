// ============================================
//   NewsAnalyser AI — Telegram Bot
//   Using Google Gemini API (FREE tier)
//   Model: gemini-2.0-flash (60 req/min free)
// ============================================

require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!TELEGRAM_TOKEN) throw new Error("❌ TELEGRAM_TOKEN is missing from environment!");
if (!GEMINI_API_KEY)  throw new Error("❌ GEMINI_API_KEY is missing from environment!");

const bot   = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

console.log("✅ Bot connected to Telegram");
console.log("✅ Google Gemini AI ready (FREE tier)");
console.log("🚀 NewsAnalyser Bot is running on Railway!\n");

// ── Per-user session ──
const sessions = {};

// ── Modes ──
const MODES = {
  grammar: { emoji: "🔬", label: "Grammar Analysis"  },
  vocab:   { emoji: "📖", label: "Vocabulary Builder" },
  mcq:     { emoji: "✅", label: "MCQ Generator"      },
  affairs: { emoji: "🌐", label: "Current Affairs"    },
  cloze:   { emoji: "✏️",  label: "Cloze Test"         },
  summary: { emoji: "💡", label: "Critical Summary"   },
};

const modeKeyboard = {
  inline_keyboard: [
    [
      { text: "🔬 Grammar",       callback_data: "mode_grammar"  },
      { text: "📖 Vocabulary",    callback_data: "mode_vocab"    },
    ],
    [
      { text: "✅ MCQ (10 Qs)",   callback_data: "mode_mcq"      },
      { text: "🌐 Current Affairs", callback_data: "mode_affairs" },
    ],
    [
      { text: "✏️ Cloze Test",    callback_data: "mode_cloze"    },
      { text: "💡 Summary",       callback_data: "mode_summary"  },
    ],
  ],
};

// ── Claude Prompts ──
function buildPrompt(mode, article) {
  const base = `You are an expert English teacher helping Bangladeshi students prepare for BCS, job exams, and university admissions. Be thorough and educational. Format with headings and bullet points. Keep under 3000 characters for Telegram.\n\nARTICLE:\n${article}\n\n`;

  return {
    grammar: base + `TASK: Analyze the grammar:
1. **Sentence Types** (Simple/Compound/Complex) — give examples from text
2. **Key Phrases** — label NP, VP, PP, AdvP with quotes from the article
3. **Special Structures** — passive voice, relative clauses, correlative conjunctions (not only...but also)
4. **Idioms & Collocations** found in the text`,

    vocab: base + `TASK: Vocabulary list from the article. For each of 8 key words:
**Word** (Part of Speech) — meaning — synonym — antonym — example sentence
Then list 3 important idioms/phrases from the text with meanings.`,

    mcq: base + `TASK: Generate 8 BCS-style MCQs. Mix: 3 comprehension + 2 vocabulary + 2 grammar + 1 inference.
Format each:
Q1. [question]
A) ... B) ... C) ... D) ...
✔ Answer: [letter] — [brief reason]`,

    affairs: base + `TASK: Current affairs extraction for exam prep:
1. **Key Facts & Data** (numbers, stats, distances)
2. **People & Organizations** mentioned
3. **Places & Geography**
4. **Bangladesh Relevance**
5. **5 Likely Exam Questions** with one-line answers`,

    cloze: base + `TASK: Cloze test from one key paragraph.
Remove 10 important words → numbered blanks (1), (2)...
📝 CLOZE PASSAGE
📦 WORD BOX (missing words + 3 distractors, scrambled)
✔ ANSWER KEY with brief reason for each`,

    summary: base + `TASK: Critical analysis:
1. **One-Sentence Summary**
2. **Main Idea** (2-3 sentences)
3. **Key Arguments** (bullet points)
4. **Tone & Purpose**
5. **Exam Relevance** — which BCS subjects this connects to
6. **3 Discussion Points**`,
  }[mode] || base + "Summarize this article for exam preparation.";
}

// ── Call Gemini ──
async function analyzeWithGemini(mode, article) {
  const result   = await model.generateContent(buildPrompt(mode, article));
  const response = await result.response;
  return response.text();
}

// ── Split long messages (Telegram 4096 char limit) ──
function splitMessage(text, maxLen = 4000) {
  if (text.length <= maxLen) return [text];
  const parts = [];
  while (text.length > maxLen) {
    let cut = text.lastIndexOf("\n", maxLen);
    if (cut < maxLen * 0.5) cut = maxLen;
    parts.push(text.slice(0, cut));
    text = text.slice(cut).trim();
  }
  if (text) parts.push(text);
  return parts;
}

// ── Run analysis + send result ──
async function runAnalysis(chatId, article, mode) {
  const m = MODES[mode];
  try {
    const result = await analyzeWithGemini(mode, article);
    const header = `${m.emoji} *${m.label} Result*\n${"─".repeat(28)}\n\n`;
    const footer = `\n\n${"─".repeat(28)}\n📚 _NewsAnalyser AI · BCS & Exam Prep_\n_Powered by Google Gemini (Free)_`;
    const parts  = splitMessage(header + result + footer);

    for (const part of parts) {
      await bot.sendMessage(chatId, part, { parse_mode: "Markdown" });
    }

    // Offer re-analysis
    await bot.sendMessage(chatId, "🔄 *Analyse the same article with a different mode?*", {
      parse_mode: "Markdown",
      reply_markup: modeKeyboard,
    });
  } catch (err) {
    console.error("Analysis error:", err.message);
    bot.sendMessage(chatId, `❌ *Analysis failed.*\n\n${err.message}\n\nPlease try again.`, {
      parse_mode: "Markdown",
    });
  }
}

// ════════════════════════════════════
//  COMMANDS
// ════════════════════════════════════

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  sessions[chatId] = { article: null, mode: "summary" };
  bot.sendMessage(chatId,
`📰 *Welcome to NewsAnalyser AI!*

I help you master English newspaper articles for:
🎯 BCS Prelim & Written
🏦 Bank & Govt Job Exams
🎓 University Admission Tests

*How to use:*
1️⃣ Paste any newspaper article text
2️⃣ Choose an analysis mode
3️⃣ Get instant AI-powered analysis!

*Quick commands:*
/analyse — Pick a mode and start
/sample — Try with a sample article
/help — Full instructions
/modes — See all 6 modes`,
    { parse_mode: "Markdown" }
  );
});

bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.chat.id,
`📚 *How to Use NewsAnalyser AI*

*Method 1 (Easiest):*
Just paste an article → choose mode → done!

*Method 2 (Direct):*
Type /grammar, /vocab, /mcq, /affairs, /cloze, or /summary
Then paste your article

*Tips:*
• Works best with 2–5 paragraph articles
• Copy from The Daily Star, The Business Standard, Prothom Alo English
• Paste the full article text (not a link)
• After analysis, you can re-analyse with a different mode!`,
    { parse_mode: "Markdown" }
  );
});

bot.onText(/\/modes/, (msg) => {
  bot.sendMessage(msg.chat.id,
`*📋 6 Analysis Modes:*

🔬 /grammar — Phrases, clauses, passive voice, idioms
📖 /vocab — 8 words with meanings, synonyms, antonyms
✅ /mcq — 8 BCS-style questions with answers
🌐 /affairs — Key facts, data, Bangladesh relevance
✏️ /cloze — Fill-in-the-blank exercise + answer key
💡 /summary — Critical analysis, tone, exam relevance`,
    { parse_mode: "Markdown" }
  );
});

bot.onText(/\/analyse/, (msg) => {
  const chatId = msg.chat.id;
  sessions[chatId] = sessions[chatId] || {};
  bot.sendMessage(chatId, "🎯 *Choose your analysis mode:*", {
    parse_mode: "Markdown",
    reply_markup: modeKeyboard,
  });
});

// Direct mode commands
Object.entries(MODES).forEach(([mode, { emoji, label }]) => {
  bot.onText(new RegExp(`^\\/${mode}$`), (msg) => {
    const chatId = msg.chat.id;
    sessions[chatId] = sessions[chatId] || {};
    sessions[chatId].mode = mode;
    sessions[chatId].waitingForArticle = true;
    bot.sendMessage(chatId,
      `${emoji} *${label}* selected!\n\nNow paste your newspaper article 👇`,
      { parse_mode: "Markdown" }
    );
  });
});

// /sample
bot.onText(/\/sample/, (msg) => {
  const chatId = msg.chat.id;
  const sample = `Bangladesh's export success has never been just about competitive labour or entrepreneurial energy. Logistics—the quiet, disciplined movement of goods from factory floors to port gates, from container yards to mother vessels, and from ships to global retail shelves—has also played a massive part in it. That machinery now faces one of the most serious external stress tests in recent memory.

Amid the ongoing war between US-Israel and Iran, the suspension of trans-Suez services combined with a closure of the Strait of Hormuz will not only disrupt shipping routes but also expose structural vulnerabilities in global trade lanes, as well as in Bangladesh's own trade architecture. These two maritime chokepoints serve different but equally critical roles. The Suez Canal, the 193-km artificial waterway in Egypt, is the principal artery connecting Asia to Europe. When it shuts down, vessels are forced to divert around the Cape of Good Hope in South Africa, which significantly extends sailing distances and transit times.`;

  sessions[chatId] = { article: sample, mode: "summary" };
  bot.sendMessage(chatId,
    `📄 *Sample article loaded!*\n\n_"${sample.slice(0, 150)}..."_\n\nChoose how to analyse it:`,
    { parse_mode: "Markdown", reply_markup: modeKeyboard }
  );
});

// ════════════════════════════════════
//  CALLBACK: Button presses
// ════════════════════════════════════

bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const data   = query.data;
  bot.answerCallbackQuery(query.id);

  if (!data.startsWith("mode_")) return;

  const mode = data.replace("mode_", "");
  sessions[chatId] = sessions[chatId] || {};
  sessions[chatId].mode = mode;
  const m = MODES[mode];

  if (sessions[chatId].article) {
    // Article already stored — run immediately
    bot.editMessageText(
      `${m.emoji} Running *${m.label}*...\n\n⏳ Please wait 5–10 seconds...`,
      { chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown" }
    );
    await runAnalysis(chatId, sessions[chatId].article, mode);
  } else {
    // No article yet — ask for it
    sessions[chatId].waitingForArticle = true;
    bot.editMessageText(
      `${m.emoji} *${m.label}* selected!\n\nNow paste your newspaper article 👇`,
      { chat_id: chatId, message_id: query.message.message_id, parse_mode: "Markdown" }
    );
  }
});

// ════════════════════════════════════
//  MAIN MESSAGE HANDLER
// ════════════════════════════════════

bot.on("message", async (msg) => {
  if (!msg.text || msg.text.startsWith("/")) return;

  const chatId = msg.chat.id;
  const text   = msg.text;

  if (text.length < 100) {
    bot.sendMessage(chatId,
      "📰 Please send a full newspaper article (at least 2-3 paragraphs).\n\nUse /sample to try a sample article first!",
    );
    return;
  }

  // Store article
  sessions[chatId] = sessions[chatId] || { mode: "summary" };
  sessions[chatId].article = text;
  sessions[chatId].waitingForArticle = false;

  // Send "received" message then show mode picker
  await bot.sendMessage(chatId,
    `📰 *Article received!* (${text.split(" ").length} words)\n\nChoose how to analyse it:`,
    { parse_mode: "Markdown", reply_markup: modeKeyboard }
  );
});

// ── Keep-alive for Railway (prevents idle shutdown) ──
const http = require("http");
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200);
  res.end("NewsAnalyser Bot is running! 🤖");
}).listen(PORT, () => console.log(`🌐 Health check server on port ${PORT}`));

// ── Graceful shutdown ──
process.on("SIGINT",  () => { console.log("Shutting down..."); process.exit(0); });
process.on("SIGTERM", () => { console.log("Shutting down..."); process.exit(0); });