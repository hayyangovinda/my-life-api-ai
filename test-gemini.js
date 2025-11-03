const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

async function testGemini() {
  try {
    const genAI = new GoogleGenerativeAI(process.env.API_KEY);

    // Try different model names
    const modelNames = [
      "gemini-2.5-flash",
      "gemini-2.5-pro",
      "gemini-2.0-flash"
    ];

    for (const modelName of modelNames) {
      try {
        console.log(`\nTrying model: ${modelName}`);
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent("Say hello");
        const response = await result.response;
        const text = response.text();
        console.log(`SUCCESS with ${modelName}: ${text.slice(0, 50)}...`);
        break;
      } catch (error) {
        console.log(`FAILED with ${modelName}: ${error.message}`);
      }
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

testGemini();
