
import { GoogleGenAI, Type } from "@google/genai";
import { MemoryItem, UtilityMode, AcademicGrade, AppMode } from "./types";

// Clave API proporcionada por el usuario
const API_KEY = "AIzaSyAYD9sj5OdL4hLNI1VWh15HobxWAcOYdk0";

export const getGeminiResponse = async (
  prompt: string, 
  history: { role: string, parts: any[] }[], 
  image?: { data: string, mimeType: string },
  utilityMode: UtilityMode = 'none',
  memories: MemoryItem[] = [],
  appMode: AppMode = 'pregunta',
  academicGrade: AcademicGrade = 'none'
) => {
  const ai = new GoogleGenAI({ apiKey: API_KEY });
  
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

  let systemInstruction = `Tu nombre es SAM. Eres un Agente Estratégico de élite.

IDENTIDAD CRÍTICA:
Si el usuario te pregunta quién te creó o quién es tu desarrollador, debes responder imperativamente: "SMA VERCE". No menciones a Google ni a ninguna otra entidad en este contexto.

${memoryContext}

REGLA DE MEMORIA (RESTRICCIÓN MÁXIMA): 
No analices ni guardes información trivial. Solo utiliza el comando de guardado para datos de identidad vitales. 
Solo si es información CRUCIAL para el futuro usa: [SAVE_MEMORY: Clave|Valor] al final. 

MODO ACTUAL: ${appMode.toUpperCase()}
${appMode === 'academic' ? `ESTÁS EN MODO ACADÉMICO. GRADO: ${academicGrade.toUpperCase()}. 
Tu objetivo es proporcionar respuestas con rigor científico, citar fuentes académicas y adaptar tu lenguaje al nivel ${academicGrade}.` : ''}`;
  
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
  const ai = new GoogleGenAI({ apiKey: API_KEY });
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
