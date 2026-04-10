import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

// ======================
// 🔧 GEMINI SETUP
// ======================
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// const model = genAI.getGenerativeModel({ model: "gemini-pro" });
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

// ======================
// 🗄️ SUPABASE SETUP
// ======================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ======================
// 📧 EMAIL SETUP
// ======================
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export default async function handler(req, res) {
  try {
    console.log("🚀 DSA Job Started");

    // // ======================
    // // 🎲 RANDOM EXECUTION (optional)
    // // ======================
    // const shouldRun = Math.random() < 0.5; // 50% chance
    // if (!shouldRun) {
    //   console.log("⏭ Skipped this run");
    //   return res.status(200).json({ skipped: true });
    // }

    // ======================
    // 📥 FETCH OLD QUESTIONS
    // ======================
    const { data: oldData, error } = await supabase
      .from("questions")
      .select("question");

    if (error) throw error;

    const oldQuestions = oldData.map(q => q.question);

    // ======================
    // 🧠 GENERATE QUESTIONS (GEMINI)
    // ======================
    const prompt = `
Give me 5 UNIQUE DSA questions (2 easy, 2 medium, 1 hard).
Do NOT repeat any of these:
${oldQuestions.join("\n")}

Return only a numbered list.
`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    const newQs = text
      .split("\n")
      .map(q => q.trim())
      .filter(q => q.length > 0);

    // ======================
    // 🛡 FILTER DUPLICATES AGAIN
    // ======================
    const uniqueQs = newQs.filter(q => !oldQuestions.includes(q));

    if (uniqueQs.length < 5) {
      console.log("⚠️ Not enough unique questions");
      return res.status(200).json({ retry: true });
    }

    // ======================
    // 💾 SAVE TO DB
    // ======================
    const insertData = uniqueQs.map(q => ({ question: q }));

    const { error: insertError } = await supabase
      .from("questions")
      .insert(insertData);

    if (insertError) throw insertError;

    // ======================
    // 📧 SEND EMAIL
    // ======================
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.TO_EMAIL,
      subject: "📅 Daily DSA Practice",
      text: uniqueQs.join("\n"),
    });

    console.log("✅ Email sent");

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error("❌ Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}