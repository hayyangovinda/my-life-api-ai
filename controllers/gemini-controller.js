const { GoogleGenerativeAI } = require("@google/generative-ai");

// Access your API key as an environment variable (see "Set up your API key" above)

getGeminiResponse = async (req, res) => {
  try {
    const prompt = req.body.prompt;

    // Ensure the prompt is provided
    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    const genAI = new GoogleGenerativeAI(process.env.API_KEY);

    // Get the Gemini model
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // Generate content based on the prompt
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = await response.text(); // Wait for the text response

    // Send the generated text as the response
    res.json({ generatedText: text });
  } catch (error) {
    res.status(500).json({ error: "Failed to generate content" });
  }
};

module.exports = { getGeminiResponse };
