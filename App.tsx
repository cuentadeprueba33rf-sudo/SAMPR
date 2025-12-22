
import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { AppMode, Message, GenerationState, UtilityMode, ThemeMode, MemoryItem, AcademicGrade } from './types';
import { ICONS, SAM_LOGO } from './constants';
import { getGeminiResponse, generateImage } from './geminiService';

const App: React.FC = () => {
  // --- Global App State ---
  const [mode, setMode] = useState<AppMode>('pregunta');
  const [academicGrade, setAcademicGrade] = useState<AcademicGrade>('universidad');
  const [utility, setUtility] = useState<UtilityMode>('none');
  const [theme, setTheme] = useState<ThemeMode>(() => (localStorage.getItem('sam_theme') as ThemeMode) || 'dark');
  const [memories, setMemories] = useState<MemoryItem[]>(() => JSON.parse(localStorage.getItem('sam_memories') || '[]'));
  const [gallery, setGallery] = useState<string[]>(() => JSON.parse(localStorage.getItem('sam_gallery') || '[]'));
  
  // --- Daily Limit Logic ---
  const [dailyUsage, setDailyUsage] = useState<{ count: number, date: string }>(() => {
    const saved = localStorage.getItem('sam_daily_limit');
    const today = new Date().toDateString();
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.date === today) return parsed;
    }
    return { count: 0, date: today };
  });

  useEffect(() => {
    localStorage.setItem('sam_daily_limit', JSON.stringify(dailyUsage));
  }, [dailyUsage]);

  // --- Message States ---
  const [chatMessages, setChatMessages] = useState<Message[]>([
    { role: 'sam', content: 'SAM activo. Consultoría estratégica disponible. ¿En qué puedo asistir hoy?', type: 'text' }
  ]);
  const [academicMessages, setAcademicMessages] = useState<Message[]>([
    { role: 'sam', content: 'Entorno Académico SAM habilitado. Nivel de rigor configurado.', type: 'text' }
  ]);

  const currentMessages = mode === 'pregunta' ? chatMessages : academicMessages;
  const setCurrentMessages = mode === 'pregunta' ? setChatMessages : setAcademicMessages;

  // --- UI States ---
  const [isUtilMenuOpen, setIsUtilMenuOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCreativeViewOpen, setIsCreativeViewOpen] = useState(false); 
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [sidebarView, setSidebarView] = useState<'main' | 'settings' | 'memory' | 'gallery'>('main');
  
  const [inputValue, setInputValue] = useState('');
  const [selectedImage, setSelectedImage] = useState<{ base64: string; type: string } | null>(null);
  const [generation, setGeneration] = useState<GenerationState>({ isGenerating: false });
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem('sam_gallery', JSON.stringify(gallery));
  }, [gallery]);

  const toggleCamera = async () => {
    if (isCameraActive) {
      streamRef.current?.getTracks().forEach(t => t.stop());
      setIsCameraActive(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        streamRef.current = stream;
        setIsCameraActive(true);
        setTimeout(() => videoRef.current && (videoRef.current.srcObject = stream), 100);
      } catch (e) { alert("Visión restringida. Verifique permisos."); }
    }
  };

  const captureFrame = () => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(videoRef.current, 0, 0);
      const dataUrl = canvas.toDataURL('image/jpeg');
      const base64 = dataUrl.split(',')[1];
      setSelectedImage({ base64, type: 'image/jpeg' });
      toggleCamera();
    }
  };

  const handleSend = useCallback(async (textOverride?: string) => {
    const finalContent = textOverride ?? inputValue;
    if (!finalContent.trim() && !selectedImage) return;

    if (isCreativeViewOpen) {
      if (dailyUsage.count >= 5) {
        setCurrentMessages(prev => [...prev, { role: 'sam', content: '"SAM ESTA DESCANSANDO" regresa mañana', type: 'text' }]);
        setInputValue('');
        setSelectedImage(null);
        return;
      }

      setGeneration({ isGenerating: true, statusMessage: 'Procesando activo visual...' });
      const currentAsset = selectedImage;
      setInputValue('');
      setSelectedImage(null);
      
      try {
        const imageUrl = await generateImage(
          finalContent, 
          currentAsset ? { data: currentAsset.base64, mimeType: currentAsset.type } : undefined
        );
        
        if (imageUrl) {
          setGallery(prev => [imageUrl, ...prev]);
          setDailyUsage(prev => ({ ...prev, count: prev.count + 1 }));
          const newMessage: Message = { 
            role: 'sam', 
            content: currentAsset ? 'Imagen editada con éxito.' : 'Activo generado con éxito.', 
            type: 'image', 
            mediaUrl: imageUrl 
          };
          setCurrentMessages(prev => [...prev, { role: 'user', content: finalContent, type: 'text' }, newMessage]);
        } else {
          throw new Error("API Limit or Error");
        }
      } catch (e) {
        setCurrentMessages(prev => [...prev, { role: 'sam', content: '"SAM ESTA DESCANSANDO" regresa mañana', type: 'text' }]);
      } finally {
        setGeneration({ isGenerating: false });
      }
      return;
    }

    const newUserMessage: Message = { 
      role: 'user', 
      content: finalContent, 
      type: 'text',
      mediaUrl: selectedImage ? `data:${selectedImage.type};base64,${selectedImage.base64}` : undefined
    };
    
    setCurrentMessages(prev => [...prev, newUserMessage]);
    setInputValue('');
    setSelectedImage(null);
    setGeneration({ isGenerating: true });

    try {
      const history = currentMessages.slice(-8).map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }]
      }));
      
      const imageForAPI = selectedImage ? { data: selectedImage.base64, mimeType: selectedImage.type } : undefined;
      const result = await getGeminiResponse(
        finalContent || "Analiza esta imagen", 
        history, 
        imageForAPI, 
        utility, 
        memories, 
        mode, 
        academicGrade
      );
      
      setCurrentMessages(prev => [...prev, { 
        role: 'sam', 
        content: result.text, 
        type: 'text',
        sources: result.sources.length > 0 ? result.sources : undefined,
        memoryUpdated: !!result.detectedMemory
      }]);
    } catch (error) {
      setCurrentMessages(prev => [...prev, { role: 'sam', content: '"SAM ESTA DESCANSANDO" regresa mañana', type: 'text' }]);
    } finally {
      setGeneration({ isGenerating: false });
    }
  }, [inputValue, selectedImage, currentMessages, mode, utility, memories, academicGrade, setCurrentMessages, isCreativeViewOpen, dailyUsage]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentMessages, generation.isGenerating]);

  return (
    <div className="flex flex-col h-screen w-full bg-[#050505] text-zinc-300 overflow-hidden font-sans relative">
      
      <div className="absolute inset-0 z-0 pointer-events-none bg-gradient-to-b from-[#4a1d4a]/20 via-black to-black opacity-60"></div>

      {/* Main Container: Full Screen Height and Width */}
      <div className="flex-1 flex flex-col relative z-10 h-full w-full max-w-[600px] mx-auto overflow-hidden bg-black/20 backdrop-blur-sm">
        
        {/* HEADER */}
        <header className="flex flex-col shrink-0 px-6 pt-10 pb-4 safe-area-top">
          <div className="flex items-center justify-between">
            <button 
              onClick={() => { setIsSidebarOpen(true); setSidebarView('main'); }} 
              className="w-10 h-10 bg-zinc-900/40 border border-white/5 rounded-full flex flex-col items-center justify-center gap-1 transition-all hover:bg-zinc-800/60"
            >
              <div className="w-4 h-[1.5px] bg-white rounded-full"></div>
              <div className="w-4 h-[1.5px] bg-white rounded-full"></div>
            </button>
            
            {!isCreativeViewOpen && (
              <div className="bg-zinc-900/40 backdrop-blur-md rounded-full p-1 flex items-center border border-white/5">
                <button onClick={() => setMode('pregunta')} className={`px-4 py-1.5 rounded-full text-[9px] font-bold uppercase tracking-[0.1em] transition-all ${mode === 'pregunta' ? 'bg-white text-black' : 'text-zinc-500'}`}>Consultoría</button>
                <button onClick={() => setMode('academic')} className={`px-4 py-1.5 rounded-full text-[9px] font-bold uppercase tracking-[0.1em] transition-all ${mode === 'academic' ? 'bg-white text-black' : 'text-zinc-500'}`}>Academia</button>
              </div>
            )}
            {isCreativeViewOpen && (
              <div className="flex flex-col items-center">
                <h1 className="text-lg font-medium text-white tracking-tight">Estudio Visual</h1>
                <span className="text-[8px] text-zinc-500 font-bold uppercase tracking-widest">{5 - dailyUsage.count} Disponibles</span>
              </div>
            )}

            <button onClick={() => setIsCreativeViewOpen(!isCreativeViewOpen)} className={`p-2 transition-all ${isCreativeViewOpen ? 'text-white' : 'text-zinc-500 hover:text-white'}`}>
              <ICONS.Pencil />
            </button>
          </div>
        </header>

        {/* CONTENT AREA: Fills all remaining space */}
        <div className="flex-1 overflow-y-auto no-scrollbar px-6 py-4">
          {isCreativeViewOpen ? (
            <div className="space-y-6">
              <div className="relative w-full rounded-[40px] overflow-hidden aspect-[4/5] shadow-2xl border border-white/10 group">
                <img src="https://img.freepik.com/premium-photo/anime-santa-claus-character-illustration-with-festive-elements_1177187-178636.jpg" className="w-full h-full object-cover" alt="Santa" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/20 to-transparent flex flex-col items-center justify-end p-8 text-center">
                  <h2 className="text-xl font-normal text-white leading-tight mb-6">Generación Visual Élite</h2>
                  <button onClick={() => setInputValue("Crea una foto de Santa Claus en estilo anime cinematográfico")} className="px-8 py-3 bg-white text-black rounded-full text-xs font-bold tracking-wide hover:scale-105 transition-all">Empezar</button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-10 pb-10">
              {currentMessages.map((msg, idx) => (
                <div key={idx} className="animate-in fade-in slide-in-from-bottom-2">
                  {msg.role === 'user' ? (
                    <div className="flex flex-col items-end">
                      <div className="bg-zinc-800/30 px-5 py-3 rounded-[24px] max-w-[90%] border border-white/5">
                        <p className="text-white text-[14px] leading-relaxed">{msg.content}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="max-w-none">
                      <div className="prose prose-invert prose-sm opacity-90 leading-relaxed text-[14px]">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                      {msg.mediaUrl && (
                        <div className="mt-6 rounded-3xl overflow-hidden border border-white/10 shadow-2xl">
                          <img src={msg.mediaUrl} className="w-full h-auto" />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* COMMAND HUB: Fixed at the very bottom, no gaps */}
        <div className="shrink-0 pt-2 px-6 pb-8 bg-gradient-to-t from-black via-black/95 to-transparent border-t border-white/5 safe-area-bottom">
          {!isCreativeViewOpen && (
            <div className="grid grid-cols-2 gap-2 mb-4">
              <button 
                onClick={() => setIsUtilMenuOpen(!isUtilMenuOpen)}
                className="flex items-center justify-center gap-2 h-10 bg-zinc-900/60 border border-white/5 rounded-xl text-[9px] font-bold uppercase tracking-widest text-zinc-500">
                <ICONS.Zap /> {utility === 'none' ? 'Módulos' : 'Activo'}
              </button>
              <button onClick={toggleCamera} className="flex items-center justify-center gap-2 h-10 bg-zinc-900/60 border border-white/5 rounded-xl text-[9px] font-bold uppercase tracking-widest text-zinc-500">
                <ICONS.Camera /> Cámara
              </button>
            </div>
          )}

          <div className="flex items-center gap-3">
            <div className="flex-1 h-14 bg-zinc-900/90 backdrop-blur-3xl border border-white/10 rounded-full flex items-center px-5 shadow-2xl transition-all focus-within:border-white/20">
              <input 
                className="bg-transparent border-none outline-none flex-1 text-white placeholder-zinc-700 text-[14px] font-medium"
                placeholder={isCreativeViewOpen ? "Describir visual..." : "Consultar SAM..."}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              />
              <button onClick={() => handleSend()} className={`w-9 h-9 flex items-center justify-center rounded-full transition-all ${inputValue.trim() ? 'bg-white text-black shadow-lg shadow-white/10' : 'text-zinc-800 bg-white/5'}`}>
                {generation.isGenerating ? <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></div> : <ICONS.Send />}
              </button>
            </div>
          </div>
          
          <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={(e) => {
             const file = e.target.files?.[0];
             if (file) {
               const r = new FileReader();
               r.onloadend = () => setSelectedImage({ base64: (r.result as string).split(',')[1], type: file.type });
               r.readAsDataURL(file);
             }
          }} />
        </div>

      </div>

      {/* SIDEBAR */}
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[200] flex animate-in fade-in duration-300" onClick={() => setIsSidebarOpen(false)}>
          <div className="w-[300px] h-full bg-[#0a0a0a] border-r border-white/5 flex flex-col shadow-2xl animate-in slide-in-from-left duration-300" onClick={e => e.stopPropagation()}>
             <div className="p-10 border-b border-white/5 flex justify-between items-center">
                <div className="flex items-center gap-3">
                   <div className="p-2 bg-white/5 rounded-lg border border-white/10">
                      <SAM_LOGO className="w-5 h-5 text-white" />
                   </div>
                   <h2 className="text-white font-bold text-sm tracking-tight uppercase">SAM Elite</h2>
                </div>
                <button onClick={() => setIsSidebarOpen(false)} className="text-zinc-500 hover:text-white"><ICONS.Close /></button>
             </div>
             <div className="flex-1 overflow-y-auto p-6 space-y-2">
                <button onClick={() => { setIsCreativeViewOpen(false); setIsSidebarOpen(false); }} className={`w-full text-left p-4 rounded-2xl transition-all text-xs font-bold uppercase tracking-widest ${!isCreativeViewOpen ? 'bg-white/5 text-white border border-white/10' : 'text-zinc-500 hover:bg-white/5'}`}>Consultoría</button>
                <button onClick={() => { setIsCreativeViewOpen(true); setIsSidebarOpen(false); }} className={`w-full text-left p-4 rounded-2xl transition-all text-xs font-bold uppercase tracking-widest ${isCreativeViewOpen ? 'bg-white/5 text-white border border-white/10' : 'text-zinc-500 hover:bg-white/5'}`}>Estudio Visual</button>
             </div>
             <div className="p-10 border-t border-white/5">
                <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-[0.2em]">Node Status: Active</p>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
