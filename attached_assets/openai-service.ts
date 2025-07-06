// Copy this file as: server/openai-service.ts
// OpenAI integration for Batata Discord Bot (optional - has fallbacks)

import OpenAI from 'openai';

// Initialize OpenAI client (optional)
let openai: OpenAI | null = null;

try {
  if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
} catch (error) {
  console.log('OpenAI not initialized - using fallback parsing');
}

/**
 * Improved fallback parsing that handles common sentence patterns
 */
function parseItemNameFallback(messageContent: string): string {
  const content = messageContent.replace(/^ISO\s*/i, '').trim();
  
  // Common patterns for item requests
  const patterns = [
    /(?:looking for|need|want|seeking)\s+(?:a|an|some)?\s*([^.!?\n]+)/i,
    /^(?:a|an|some)?\s*([^.!?\n]+)/i,
  ];
  
  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match && match[1]) {
      let itemName = match[1].trim();
      
      // Clean up common endings
      itemName = itemName.replace(/\s+(please|thanks?|ty|thx)$/i, '');
      itemName = itemName.replace(/[.!?]+$/, '');
      
      // Limit length
      if (itemName.length > 50) {
        itemName = itemName.substring(0, 47) + '...';
      }
      
      return itemName || 'Item';
    }
  }
  
  // Final fallback - take first few words
  const words = content.split(/\s+/).slice(0, 5);
  return words.join(' ') || 'Item';
}

/**
 * Extracts the item name from an ISO request
 * @param messageContent The raw message content (starting with "ISO")
 * @returns The extracted item name
 */
export async function extractItemName(messageContent: string): Promise<string> {
  // Fallback parsing (always available)
  const fallbackItem = parseItemNameFallback(messageContent);
  
  // If OpenAI is not available, return fallback
  if (!openai) {
    return fallbackItem;
  }
  
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'Extract the main item being requested from this ISO (In Search Of) message. Return only the item name, no extra text. Be concise but descriptive. If unclear, make your best guess.'
        },
        {
          role: 'user',
          content: messageContent
        }
      ],
      max_tokens: 30,
      temperature: 0.3,
    });

    const extractedItem = completion.choices[0]?.message?.content?.trim();
    
    // Validate the extracted item
    if (extractedItem && extractedItem.length > 0 && extractedItem.length <= 100) {
      return extractedItem;
    } else {
      return fallbackItem;
    }
  } catch (error) {
    console.log(`OpenAI item extraction failed, using fallback: ${error}`);
    return fallbackItem;
  }
}

/**
 * Analyzes an ISO request to extract structured information
 * @param username The Discord username of the requester
 * @param messageContent The raw message content (starting with "ISO")
 * @returns Structured information about the request
 */
export async function analyzeISORequest(username: string, messageContent: string): Promise<{
  itemName: string;
  category: string;
  exchangeType: string;
  location: string;
  description: string;
}> {
  // Fallback analysis (always available)
  const fallbackAnalysis = {
    itemName: parseItemNameFallback(messageContent),
    category: 'misc',
    exchangeType: 'request',
    location: 'Not specified',
    description: messageContent.replace(/^ISO\s*/i, '').trim()
  };
  
  // If OpenAI is not available, return fallback
  if (!openai) {
    return fallbackAnalysis;
  }
  
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: `Analyze this ISO (In Search Of) request and extract structured information. Return a JSON object with these fields:
          - itemName: The main item being requested (concise but descriptive)
          - category: One of: electronics, home_furniture, clothing, accessories, footwear, misc
          - exchangeType: One of: request, trade, give
          - location: Any location mentioned or "Not specified"
          - description: A clean, concise description of what they're looking for
          
          Be precise with categories and exchange types. Only use the exact values listed.`
        },
        {
          role: 'user',
          content: `Username: ${username}\nMessage: ${messageContent}`
        }
      ],
      max_tokens: 200,
      temperature: 0.2,
    });

    const response = completion.choices[0]?.message?.content?.trim();
    
    if (response) {
      try {
        const parsed = JSON.parse(response);
        
        // Validate the parsed response
        const validCategories = ['electronics', 'home_furniture', 'clothing', 'accessories', 'footwear', 'misc'];
        const validExchangeTypes = ['request', 'trade', 'give'];
        
        const result = {
          itemName: parsed.itemName || fallbackAnalysis.itemName,
          category: validCategories.includes(parsed.category) ? parsed.category : 'misc',
          exchangeType: validExchangeTypes.includes(parsed.exchangeType) ? parsed.exchangeType : 'request',
          location: parsed.location || 'Not specified',
          description: parsed.description || fallbackAnalysis.description
        };
        
        return result;
      } catch (parseError) {
        console.log(`Failed to parse OpenAI response, using fallback: ${parseError}`);
        return fallbackAnalysis;
      }
    } else {
      return fallbackAnalysis;
    }
  } catch (error) {
    console.log(`OpenAI analysis failed, using fallback: ${error}`);
    return fallbackAnalysis;
  }
}