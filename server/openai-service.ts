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
 * Improved fallback parsing that handles common sentence patterns
 */
function parseItemNameFallback(messageContent: string): string {
  // Remove ISO/PIF prefix
  let content = messageContent.replace(/^(ISO|PIF)\s+/i, "").trim();
  
  // Handle possessive patterns like "my laptop", "this hat", "these shoes"
  content = content.replace(/^(my\s+|this\s+|these\s+|the\s+|a\s+|an\s+)/i, "");
  
  // Handle common patterns like "on this", "for this", "about this"
  content = content.replace(/^(on\s+this\s+|for\s+this\s+|about\s+this\s+|of\s+this\s+)/i, "");
  
  // Handle patterns like "hey guys i have this" or "anyone want this"
  content = content.replace(/^(hey\s+guys?\s+i\s+have\s+(this\s+)?|anyone\s+wants?\s+(this\s+)?|i\s+have\s+(this\s+)?)/i, "");
  
  // Handle "if anyone wants it" at the end
  content = content.replace(/(\s+if\s+anyone\s+wants?\s+it.*$)/i, "");
  
  // Handle other trailing phrases
  content = content.replace(/(\s+for\s+free.*$|\s+to\s+give\s+away.*$|\s+available.*$)/i, "");
  
  // Take only the first few words (the actual item name)
  const words = content.trim().split(/\s+/);
  const itemWords = words.slice(0, 3); // Take first 3 words max
  
  // Join the words back
  const cleanedItem = itemWords.join(' ').trim();
  
  // If we got something reasonable, return it with proper article
  if (cleanedItem.length > 0 && cleanedItem.length < 50) {
    // Add article if needed
    const startsWithVowel = /^[aeiou]/i.test(cleanedItem);
    const needsArticle = !cleanedItem.match(/^(a|an|the|some|my|this|these)\s/i);
    
    if (needsArticle) {
      return startsWithVowel ? `an ${cleanedItem}` : `a ${cleanedItem}`;
    }
    return cleanedItem;
  }
  
  return "item";
}

/**
 * Extracts the item name from an ISO or PIF request
 * @param messageContent The raw message content (starting with "ISO" or "PIF")
 * @returns The extracted item name
 */
export async function extractItemName(messageContent: string): Promise<string> {
  try {
    if (!process.env.OPENAI_API_KEY) {
      // Fallback to improved parsing if no API key
      return parseItemNameFallback(messageContent);
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system",
          content: "Extract only the item name from this ISO/PIF request. Return just the item name, nothing else. Examples: 'ISO headphones' -> 'headphones', 'PIF hey guys i have this pair of shoes if anyone wants it' -> 'pair of shoes'"
        },
        {
          role: "user",
          content: messageContent
        }
      ],
      max_tokens: 50,
      temperature: 0
    });

    const extractedItem = response.choices[0].message.content?.trim();
    return extractedItem || "item";
  } catch (error) {
    log(`Error extracting item name: ${error}`, "openai-service");
    // Fallback to improved parsing
    return parseItemNameFallback(messageContent);
  }
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
          Your task is to extract and organize information about what item the user is looking for
          and what features they want.
          
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
          
          3. For tags, ONLY use these FOUR specific categories for internal classification:
             - "clothing": For all wearable items like shirts, pants, dresses, jackets, shoes, etc.
             - "electronics": For all electronic devices like computers, phones, TVs, cameras, etc.
             - "accessories": For wearable/carryable accessories like jewelry, watches, bags, wallets, etc.
             - "home-and-furniture": For household items, furniture, and home decor
             
             Every item MUST be categorized into AT LEAST ONE of these four categories.
             This is only used for category buttons, not displayed to users.
          
          Example:
          Input: "ISO a vintage leather jacket with silver buttons, size M"
          
          Correct output:
          {
            "item": "jacket",
            "features": ["vintage", "leather", "silver buttons", "size M"],
            "tags": ["clothing"]
          }
          
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
    const itemWordsArray = item.toLowerCase().split(' ');
    for (const color of colors) {
      if (!color.includes(' ')) { // Only check single-word colors
        if (itemWordsArray.includes(color)) {
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
        // Weekend patterns
        /this weekend/i,
        /next weekend/i,
        /weekend/i,
        
        // Day of week patterns with by/before/after
        /(?:by|before|after) (monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
        /(?:by|before|after) (?:this|next) (monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
        
        // General timing patterns
        /(?:by|before|after) tomorrow/i,
        /in a week/i,
        /(?:by|before|after) next week/i,
        /(?:by|before|after) (?:the )?end of (?:the )?(?:this|next)? week/i,
        /(?:by|before|after) (?:the )?end of (?:the )?month/i,
        /(?:by|before|after) (?:the )?weekend/i,
        /(?:by|before|after) (?:the )?end of (?:the )?day/i,
        
        // Plain days of the week (without by/before/after)
        /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
        /\b(?:this|next) (monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
        
        // Month-related patterns
        /(?:early|mid|late) (?:january|february|march|april|may|june|july|august|september|october|november|december)/i,
        /(?:beginning|middle|end) of (?:january|february|march|april|may|june|july|august|september|october|november|december)/i
      ];
      
      for (const pattern of timePatterns) {
        const match = requestText.match(pattern);
        if (match) {
          urgency = match[0]; // Use the actual matched phrase from the text
          break;
        }
      }
    }
    
    // Generate tags based on our 4 specific categories
    const tags = [];
    const categoryKeywords = {
      clothing: [
        'shirt', 'pants', 'jacket', 'shoes', 'boots', 'sneakers', 'hat', 'cap',
        'dress', 'skirt', 'jeans', 'sweater', 'hoodie', 'socks', 'gloves',
        'belt', 'tie', 'blazer', 'coat', 'suit', 'shorts', 't-shirt', 'tshirt',
        'blouse', 'cardigan', 'vest', 'sweatshirt', 'pajamas', 'swimsuit', 'bikini',
        'clothing', 'wear', 'outfit', 'apparel'
      ],
      electronics: [
        'phone', 'laptop', 'computer', 'tablet', 'camera', 'headphones', 'speaker',
        'monitor', 'keyboard', 'mouse', 'charger', 'adapter', 'cable', 'drive',
        'printer', 'scanner', 'router', 'modem', 'microphone', 'earbuds', 'console',
        'tv', 'television', 'projector', 'drone', 'smartwatch', 'device', 'electronic'
      ],
      accessories: [
        'watch', 'jewelry', 'accessory', 'accessories', 'bag', 'backpack', 
        'purse', 'wallet', 'sunglasses', 'glasses', 'scarf',
        'necklace', 'bracelet', 'ring', 'earrings', 'pendant'
      ],
      'home-and-furniture': [
        'chair', 'table', 'desk', 'sofa', 'couch', 'bookshelf', 'cabinet',
        'bed', 'mattress', 'dresser', 'nightstand', 'shelf', 'stool', 'drawer',
        'wardrobe', 'bench', 'ottoman', 'rug', 'lamp', 'mirror', 'curtains',
        'furniture', 'kitchen', 'pot', 'pan', 'utensil', 'plate',
        'bowl', 'mug', 'cup', 'glass', 'bottle', 'container', 'home', 'house'
      ]
    };
    
    // First check if the item directly matches any category
    const itemWordsSplit = item.toLowerCase().split(/\s+/);
    
    for (const [category, keywords] of Object.entries(categoryKeywords)) {
      for (const keyword of keywords) {
        if (itemWordsSplit.includes(keyword) || item.toLowerCase().includes(keyword)) {
          tags.push(category);
          break; // Only add each category once
        }
      }
    }
    
    // Then check features if we still don't have a category
    if (tags.length === 0 && features.length > 0) {
      const featureText = features.join(' ').toLowerCase();
      
      for (const [category, keywords] of Object.entries(categoryKeywords)) {
        for (const keyword of keywords) {
          if (featureText.includes(keyword)) {
            tags.push(category);
            break; // Only add each category once
          }
        }
      }
    }
    
    // If no tags found, default to home-and-furniture as a fallback
    if (tags.length === 0) {
      tags.push('home-and-furniture');
    }
    
    return {
      item: item || "unknown item",
      features: features,
      urgency: urgency,
      tags: tags,
      success: false
    };
  }
}