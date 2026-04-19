const API_KEY = localStorage.getItem('NEXUS_GROQ_KEY');
const MODEL_NAME = "meta-llama/llama-4-scout-17b-16e-instruct";

/**
 * Extracts business data from an Instagram screenshot using Groq.
 * @param {string} base64Image - Base64 encoded image string.
 * @param {Array<string>} customFields - List of dynamic field names to look for.
 * @returns {Promise<Object>} The extracted JSON data.
 */
export async function processImageWithGroq(base64Image, customFields = []) {
  const dynamicFieldsSnippet = customFields.length > 0
    ? `Additionally, check the bio for information regarding: ${customFields.join(', ')}. Add them as additional keys in the JSON if found.`
    : "";

  const promptText = `
You are an expert data extraction assistant analyzing an Instagram business profile screenshot.

Analyze the image carefully and extract the following information. Leave fields as empty string "" if unknown.

${dynamicFieldsSnippet}

For the "instagramLink" field, extract the Instagram profile URL in the exact format: "instagram.com/USERNAME" — only include the username part, no @, no extra paths.

Return ONLY a valid JSON object with NO markdown, NO backticks, NO extra text:
{
  "businessName": "extracted business or account name",
  "instagramLink": "instagram.com/username",
  "contactNumber": "extracted phone number",
  "email": "extracted email address",
  "remarks": "short summary of what the business does or any remaining important info from bio"
}`;

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: promptText },
            { type: "image_url", image_url: { url: base64Image } }
          ]
        }
      ],
      model: MODEL_NAME,
      temperature: 0.1
    })
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error?.message || "Groq API request failed");
  }

  const resData = await response.json();
  let content = resData.choices[0].message.content;

  // Strip any markdown backticks the LLM may add
  content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  
  // Find JSON object within the response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No valid JSON in model response.");
  
  return JSON.parse(jsonMatch[0]);
}
