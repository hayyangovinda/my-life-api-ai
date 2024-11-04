require("dotenv").config();

const { OpenAI } = require("openai");
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

(async () => {
  try {
    const response = await openai.models.list();
    console.log("Connection successful:", response);
  } catch (error) {
    console.error("Connection test failed:", error);
  }
})();
