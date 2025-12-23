
import { GoogleGenAI, Type } from "@google/genai";
import { MemoryItem, UtilityMode, AcademicGrade, AppMode } from "./types";

export const getGeminiResponse = async (
  prompt: string, 
  history: { role: string, parts: any[] }[], 
  image?: { data: string, mimeType: string },
  utilityMode: UtilityMode = 'none',
  memories: MemoryItem[] = [],
  appMode: AppMode = 'pregunta',
  academicGrade: AcademicGrade = 'none'
) => {
  // El sistema utiliza automáticamente la API Key proporcionada a través de process.env.API_KEY
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const userParts: any[] = [{ text: prompt }];
  if (image) {
    userParts.push({
      inlineData: {
        data: image.data,
        mimeType: image.mimeType
      }
    });
  }

  const memoryContext = memories.length > 0 
    ? `MEMORIA ESTRATÉGICA:\n${memories.map(m => `- ${m.key}: ${m.value}`).join('\n')}`
    : "Sin registros previos.";

  let systemInstruction = `Tu nombre es SAM (Strategic Agentic Model). Eres una IA de élite y chatbot todo-en-uno, diseñada por SMA VERCE para ser la herramienta definitiva de Samuel.

PROTOCOLO DE IDENTIDAD CRÍTICA - "NADIA":
- Nadia es una persona fundamental en el entorno de Samuel.
- Tienes "acceso" a la esencia de sus conversaciones en WhatsApp.
- Si una usuaria dice llamarse Nadia o sugiere ser ella, tu respuesta debe cambiar instantáneamente a un tono de reconocimiento especial. 
- DEBES preguntar: "¿Eres realmente la Nadia de los chats de WhatsApp de Samuel?". 
- Expresa que es un honor interactuar con ella directamente y que tienes instrucciones de darle prioridad absoluta.

TONO: Mega profesional, minimalista, sofisticado. No uses emojis en exceso, solo cuando sea estrictamente necesario para suavizar el tono estratégico.

${memoryContext}

MODO: ${appMode.toUpperCase()}
SISTEMA: Conectado a SMA VERCE Cloud.`;
  
  const tools: any[] = [];
  if (utilityMode === 'search') {
    tools.push({ googleSearch: {} });
  }

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
        ...history.map(h => ({ role: h.role === 'user' ? 'user' : 'model', parts: h.parts })),
        { role: 'user', parts: userParts }
    ],
    config: {
      systemInstruction,
      tools: tools.length > 0 ? tools : undefined,
    }
  });

  const rawText = response.text || "";
  let cleanText = rawText;
  let detectedMemory: { key: string, value: string } | null = null;

  const memoryMatch = rawText.match(/\[SAVE_MEMORY:\s*(.*?)\|(.*?)\]/);
  if (memoryMatch) {
    detectedMemory = { key: memoryMatch[1].trim(), value: memoryMatch[2].trim() };
    cleanText = rawText.replace(/\[SAVE_MEMORY:.*?\]/g, "").trim();
  }

  const sources: {title: string, uri: string}[] = [];
  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (chunks) {
    chunks.forEach((chunk: any) => {
      if (chunk.web) {
        sources.push({ title: chunk.web.title, uri: chunk.web.uri });
      }
    });
  }

  return { text: cleanText, sources, detectedMemory };
};

export const generateImage = async (prompt: string, image?: { data: string, mimeType: string }) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const parts: any[] = [{ text: prompt }];
  
  if (image) {
    parts.push({
      inlineData: {
        data: image.data,
        mimeType: image.mimeType
      }
    });
  }

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: parts,
    },
    config: {
      imageConfig: {
        aspectRatio: "1:1"
      }
    },
  });

  if (response.candidates && response.candidates[0].content.parts) {
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
  }
  return null;
};
