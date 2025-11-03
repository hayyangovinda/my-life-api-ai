require('dotenv').config();

console.log("API Key starts with:", process.env.API_KEY.substring(0, 15) + "...");
console.log("API Key length:", process.env.API_KEY.length);

// Test with REST API
const https = require('https');

const testUrl = `https://generativelanguage.googleapis.com/v1/models?key=${process.env.API_KEY}`;

https.get(testUrl, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log("\nResponse status:", res.statusCode);
    if (res.statusCode === 200) {
      const models = JSON.parse(data);
      console.log("\nAvailable models:");
      models.models.forEach(model => {
        console.log(" -", model.name);
      });
    } else {
      console.log("Error response:", data);
    }
  });
}).on('error', (err) => {
  console.error("Error:", err.message);
});
