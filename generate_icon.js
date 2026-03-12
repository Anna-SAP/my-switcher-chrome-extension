import { GoogleGenAI } from "@google/genai";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function generate() {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-image-preview',
      contents: {
        parts: [
          {
            text: 'A highly recognizable, vibrant neon fluorescent colored app icon with a large letter "S" in the center. Solid dark background to make the neon pop. Clean, modern, minimalist design, suitable for a chrome extension icon.',
          },
        ],
      },
      config: {
        imageConfig: {
          aspectRatio: "1:1",
          imageSize: "512px"
        }
      }
    });
    
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        const base64EncodeString = part.inlineData.data;
        const buffer = Buffer.from(base64EncodeString, 'base64');
        fs.writeFileSync(path.join(__dirname, 'public', 'extension', 'icon.png'), buffer);
        console.log('Icon generated and saved successfully.');
        return;
      }
    }
  } catch (e) {
    console.error(e);
  }
}

generate();
