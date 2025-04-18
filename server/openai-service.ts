import OpenAI from "openai";
import { log } from "./vite";

// Initialize the OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Analyzes an ISO request to extract structured information
 * @param username The Discord username of the requester
 * @param messageContent The raw message content (starting with "ISO")
 * @returns Structured information about the request
 */
export async function analyzeISORequest(username: string, messageContent: string): Promise<{
  item: string;
  features: string[];
  urgency: string;
  tags: string[];
  success: boolean;
}> {
  try {
    // Remove the "ISO" prefix and trim any extra whitespace
    const requestContent = messageContent.replace(/^ISO/i, "").trim();
    
    // Default values in case the API call fails
    const defaultResponse = {
      item: requestContent || "unknown item",
      features: [],
      urgency: "Not specified",
      tags: [],
      success: false
    };
    
    // If there's no content after "ISO", return default values
    if (!requestContent) {
      return defaultResponse;
    }
    
    // Call OpenAI API to analyze the request
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system",
          content: `You are an assistant that analyzes "In Search Of" (ISO) requests for items in a Discord server. 
          Your task is to extract and organize information about what item the user is looking for,
          what features they want, the urgency of their request, and relevant tags.
          Respond in JSON format only.`
        },
        {
          role: "user",
          content: `Parse this ISO request from Discord user @${username}: "${requestContent}"`
        }
      ],
      response_format: { type: "json_object" }
    });
    
    // Get content from the response and handle potential null/undefined
    let content = '{}';
    if (response.choices && 
        response.choices.length > 0 && 
        response.choices[0].message && 
        typeof response.choices[0].message.content === 'string') {
      content = response.choices[0].message.content;
    }
    
    // Parse the response
    const result = JSON.parse(content);
    
    // Structure the response with appropriate defaults for missing fields
    return {
      item: result.item || defaultResponse.item,
      features: Array.isArray(result.features) ? result.features : [],
      urgency: result.urgency || defaultResponse.urgency,
      tags: Array.isArray(result.tags) ? result.tags : [],
      success: true
    };
    
  } catch (error) {
    log(`Error analyzing ISO request with OpenAI: ${error}`, "openai-service");
    
    // Basic extraction as fallback
    const itemText = messageContent.substring(3).trim();
    
    return {
      item: itemText || "unknown item",
      features: [],
      urgency: "Not specified",
      tags: [],
      success: false
    };
  }
}