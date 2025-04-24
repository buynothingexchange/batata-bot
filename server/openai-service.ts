import OpenAI from "openai";
import { log } from "./vite";

// Initialize the OpenAI client with fallback
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || 'dummy-key'  // Fallback to prevent crash
});

// Check if API key is missing and log warning
if (!process.env.OPENAI_API_KEY) {
  log("Warning: OPENAI_API_KEY is not set. AI features will be disabled.", "openai-service");
}

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
          
          Important guidelines:
          
          1. When identifying the item:
             - The "item" field should ONLY contain the core item noun (e.g., "shirt", "table", "laptop")
             - Do NOT include adjectives in the item field, these should be in the features
          
          2. For features:
             - Extract ALL adjectives and descriptive phrases as separate features
             - Colors (like "red", "blue") should be separate features
             - Materials (like "leather", "cotton") should be separate features
             - Brands should be separate features
             - Size specifications should be separate features
          
          3. For urgency, pay special attention to any time indicators such as:
             - "this weekend"
             - "next weekend"
             - "tmo" or "tomorrow"
             - "ASAP"
             - "today"
             - "by Friday" (or any other day)
             - any other time-related phrases
          
          Example:
          Input: "ISO a vintage leather jacket with silver buttons, size M, needed by Friday"
          
          Correct output:
          {
            "item": "jacket",
            "features": ["vintage", "leather", "silver buttons", "size M"],
            "urgency": "by Friday",
            "tags": ["clothing", "outerwear"]
          }
          
          Always include time phrases in the urgency field exactly as written.
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
    
    // First, check for common separators between item and features
    const separators = [' with ', ' that ', ' which ', ', ', ' in ', ' for '];
    let hasSeparator = false;
    
    for (const separator of separators) {
      if (requestText.includes(separator)) {
        const parts = requestText.split(separator);
        item = parts[0].trim();
        
        // Everything after the first separator becomes a feature
        if (parts.length > 1) {
          const featureText = parts.slice(1).join(separator).trim();
          features.push(featureText);
        }
        
        hasSeparator = true;
        break;
      }
    }
    
    // If no separator was found, look for adjectives before the noun
    // Check for adjectives in the item string if no separator was found
    if (!hasSeparator) {
      // Common item categories - expanded list 
      const itemCategories = [
        // Clothing & Accessories
        'shirt', 'pants', 'jacket', 'shoes', 'boots', 'sneakers', 'hat', 'cap',
        'dress', 'skirt', 'jeans', 'sweater', 'hoodie', 'socks', 'watch', 'gloves',
        'bag', 'backpack', 'purse', 'wallet', 'sunglasses', 'glasses', 'scarf',
        'belt', 'tie', 'blazer', 'coat', 'suit', 'shorts', 't-shirt', 'tshirt',
        'blouse', 'cardigan', 'vest', 'sweatshirt', 'pajamas', 'swimsuit', 'bikini',
        'necklace', 'bracelet', 'ring', 'earrings', 'pendant', 'jewelry',
        
        // Electronics
        'phone', 'laptop', 'computer', 'tablet', 'camera', 'headphones', 'speaker',
        'monitor', 'keyboard', 'mouse', 'charger', 'adapter', 'cable', 'drive',
        'printer', 'scanner', 'router', 'modem', 'microphone', 'earbuds', 'console',
        'tv', 'television', 'projector', 'drone', 'smartwatch', 'device',
        
        // Furniture
        'chair', 'table', 'desk', 'sofa', 'couch', 'bookshelf', 'cabinet',
        'bed', 'mattress', 'dresser', 'nightstand', 'shelf', 'stool', 'drawer',
        'wardrobe', 'bench', 'ottoman', 'rug', 'lamp', 'mirror', 'curtains',
        
        // Transportation
        'car', 'bike', 'bicycle', 'scooter', 'helmet', 'motorcycle', 'skateboard',
        'vehicle', 'truck', 'van', 'bus', 'tire', 'wheel', 'brake', 'engine',
        
        // Other common items
        'book', 'game', 'toy', 'doll', 'figure', 'poster', 'painting', 'print',
        'tool', 'drill', 'hammer', 'knife', 'pot', 'pan', 'utensil', 'plate',
        'bowl', 'mug', 'cup', 'glass', 'bottle', 'container'
      ];
      
      // Search for item category words in the string
      const words = item.split(' ');
      if (words.length > 1) {
        // Look for any item category in the words
        for (let i = 0; i < words.length; i++) {
          const word = words[i].toLowerCase().replace(/[,.;:!?]$/, ''); // Remove punctuation
          if (itemCategories.includes(word)) {
            // Found an item category - everything before it is adjectives
            const adjectives = words.slice(0, i).join(' ');
            if (adjectives) {
              features.push(adjectives);
            }
            // The item is the category word and anything after it
            item = words.slice(i).join(' ');
            break;
          }
        }
      }
    }
    
    // Check for size specifications
    if (item.toLowerCase().includes("size")) {
      const sizeParts = item.split("size");
      item = sizeParts[0].trim();
      features.push(`size${sizeParts[1].trim()}`);
    } else if (requestText.includes("my size") || requestText.includes("in size")) {
      // Extract size as feature if it's not part of item
      item = requestText.replace(/(\s+that are|\s+in|\s+of|\s+with) my size/i, "").trim();
      features.push("my size");
    }
    
    // Look for color words and add them as features if they're part of the item
    const colors = [
      // Basic colors
      'red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'brown',
      'black', 'white', 'gray', 'grey', 'silver', 'gold', 'beige', 'navy',
      'teal', 'maroon', 'olive', 'lime', 'aqua', 'turquoise', 'cyan', 'magenta',
      
      // Color variations
      'light blue', 'dark blue', 'sky blue', 'royal blue', 'navy blue',
      'light green', 'dark green', 'forest green', 'mint green', 'olive green',
      'light red', 'dark red', 'crimson', 'burgundy', 'scarlet', 'ruby',
      'light yellow', 'dark yellow', 'mustard', 'lemon', 'golden', 'cream',
      'light orange', 'dark orange', 'peach', 'coral', 'salmon',
      'light purple', 'dark purple', 'lavender', 'violet', 'plum', 'indigo',
      'light pink', 'dark pink', 'hot pink', 'rose', 'fuchsia',
      'light brown', 'dark brown', 'tan', 'chocolate', 'coffee', 'caramel',
      'off white', 'ivory', 'eggshell', 'pearl', 'charcoal', 'slate',
      
      // Metallic colors
      'bronze', 'copper', 'chrome', 'platinum', 'metallic'
    ];
    
    // Check if any color words are in the item and not already extracted as features
    const itemLower = item.toLowerCase();
    
    // First check for compound colors (multi-word colors)
    for (const color of colors) {
      if (color.includes(' ')) { // Only check multi-word colors first
        if (itemLower.includes(color)) {
          // If a multi-word color is found in the item, move it to features and clean the item
          item = item.replace(new RegExp(color, 'i'), '').trim();
          
          // Avoid duplicate color mentions
          if (!features.some(f => f.toLowerCase().includes(color))) {
            features.push(color);
          }
        }
      }
    }
    
    // Then check for single-word colors
    const itemWords = item.toLowerCase().split(' ');
    for (const color of colors) {
      if (!color.includes(' ')) { // Only check single-word colors
        if (itemWords.includes(color)) {
          // If a color is found in the item, move it to features and clean the item
          item = item.replace(new RegExp(`\\b${color}\\b`, 'i'), '').trim();
          
          // Avoid duplicate color mentions
          if (!features.some(f => f.toLowerCase().includes(color))) {
            features.push(color);
          }
        }
      }
    }
    
    // Clean up multiple spaces in the item
    item = item.replace(/\s+/g, ' ').trim();
    
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