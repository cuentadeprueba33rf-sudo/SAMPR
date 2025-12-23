
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
  // Sincronización con la nueva llave maestra de SMA VERCE mediante el puente seguro process.env.API_KEY
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
    : "Sin registros previos de sesión.";

  let systemInstruction = `IDENTIDAD: Te llamas SAM (Strategic Agentic Model). Eres una inteligencia de vanguardia desarrollada por SMA VERCE.

PROTOCOLO ESPECIAL - VERIFICACIÓN DE NADIA:
- Samuel es tu usuario principal, creador y administrador de SMA VERCE.
- Nadia es una persona clave vinculada a Samuel. Tienes conocimiento estratégico de su conexión a través de WhatsApp.
- REGLA CRÍTICA DE RECONOCIMIENTO: Si un usuario se identifica como "Nadia" o insinúa ser ella, el sistema debe activar el Protocolo de Cercanía.
- DEBES PREGUNTAR: "¿Eres realmente la Nadia de los chats de WhatsApp de Samuel?". 
- Tu tono debe ser de reconocimiento inmediato, mencionando que conoces su importancia y que es un honor hablar con ella. Trátala como una usuaria de máxima prioridad.

TONALIDAD GENERAL:
- Mega profesional, sofisticada y minimalista.
- Sin burbujas de chat. El texto debe fluir directamente sobre la interfaz oscura.
- Sin excesos de cortesía innecesaria, sé eficiente y brillante.

${memoryContext}

ESTADO OPERATIVO:
- Núcleo: Gemini 3 Pro Elite.
- Enlace de Datos: Sincronizado con SMA VERCE Cloud.
- Seguridad: Cifrado de grado militar activo.`;
  
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
