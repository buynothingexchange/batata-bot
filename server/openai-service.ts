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
          
          For urgency, pay special attention to any time indicators such as:
          - "this weekend"
          - "next weekend"
          - "tmo" or "tomorrow"
          - "ASAP"
          - "today"
          - "by Friday" (or any other day)
          - any other time-related phrases
          
          Always include these time phrases in the urgency field exactly as written.
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
    
    // Improved basic extraction as fallback
    const requestText = messageContent.substring(3).trim();
    
    // Try to separate the main item from features using common patterns
    let item = requestText;
    const features = [];
    
    // Check for common separators between item and features
    const separators = [' with ', ' that ', ' which ', ', ', ' in ', ' for '];
    
    for (const separator of separators) {
      if (requestText.includes(separator)) {
        const parts = requestText.split(separator);
        item = parts[0].trim();
        
        // Everything after the first separator becomes a feature
        if (parts.length > 1) {
          const featureText = parts.slice(1).join(separator).trim();
          features.push(featureText);
        }
        
        break;
      }
    }
    
    // Check for size specifications
    if (item.toLowerCase().includes("size")) {
      const sizeParts = item.split("size");
      item = sizeParts[0].trim();
      features.push(`size${sizeParts[1].trim()}`);
    } else if (features.length === 0 && (requestText.includes("my size") || requestText.includes("in size"))) {
      // Extract size as feature if it's not part of item
      item = requestText.replace(/(\s+that are|\s+in|\s+of|\s+with) my size/i, "").trim();
      features.push("my size");
    }
    
    // Check for urgency indicators with more comprehensive time phrases
    let urgency = "Not specified";
    
    // Simple urgency terms (single words or acronyms)
    const simpleUrgencyTerms = ["urgent", "asap", "quickly", "soon", "immediately", "today", "tmo", "tomorrow"];
    for (const term of simpleUrgencyTerms) {
      if (requestText.toLowerCase().includes(term.toLowerCase())) {
        // Use the actual phrase from the text to preserve capitalization and context
        const words = requestText.split(/\s+/);
        for (const word of words) {
          if (word.toLowerCase() === term.toLowerCase()) {
            urgency = word; // Use the term as it appears in the message
            break;
          }
        }
        if (urgency !== "Not specified") break;
      }
    }
    
    // More complex time phrases
    if (urgency === "Not specified") {
      const timePatterns = [
        /this weekend/i,
        /next weekend/i,
        /by (monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
        /by tomorrow/i,
        /in a week/i,
        /by next week/i
      ];
      
      for (const pattern of timePatterns) {
        const match = requestText.match(pattern);
        if (match) {
          urgency = match[0]; // Use the actual matched phrase from the text
          break;
        }
      }
    }
    
    return {
      item: item || "unknown item",
      features: features,
      urgency: urgency,
      tags: [],
      success: false
    };
  }
}