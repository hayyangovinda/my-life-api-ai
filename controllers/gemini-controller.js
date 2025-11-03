const { GoogleGenAI } = require("@google/genai");

// Access your API key as an environment variable (see "Set up your API key" above)

getGeminiResponse = async (req, res) => {
  try {
    const prompt = req.body.prompt;

    // Ensure the prompt is provided
    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    const ai = new GoogleGenAI({
      apiKey: process.env.API_KEY,
    });

    const model = "gemini-2.5-flash";

    const contents = [
      {
        role: "user",
        parts: [
          {
            text: prompt,
          },
        ],
      },
    ];

    // Generate AI response
    const response = await ai.models.generateContentStream({
      model,
      contents,
    });

    let generatedText = "";
    for await (const chunk of response) {
      generatedText += chunk.text;
    }

    // Clean up any potential formatting artifacts
    generatedText = generatedText.trim();

    // Send the generated text as the response
    res.json({ generatedText });
  } catch (error) {
    console.error("Gemini API Error:", error);
    res.status(500).json({ error: "Failed to generate content", details: error.message });
  }
};

module.exports = { getGeminiResponse };
