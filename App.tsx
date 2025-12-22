
import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { AppMode, Message, GenerationState, UtilityMode, ThemeMode, MemoryItem, AcademicGrade } from './types';
import { ICONS, SAM_LOGO } from './constants';
import { getGeminiResponse, generateImage } from './geminiService';

const SplashScreen: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setStage(1), 500),   // Aparece Logo
      setTimeout(() => setStage(2), 1500),  // Aparece Texto
      setTimeout(() => setStage(3), 2800),  // Desvanecimiento
      setTimeout(() => onComplete(), 3500), // Fin
    ];
    return () => timers.forEach(clearTimeout);
  }, [onComplete]);

  return (
    <div className={`fixed inset-0 z-[1000] bg-[#050505] flex flex-col items-center justify-center transition-opacity duration-1000 ${stage === 3 ? 'opacity-0' : 'opacity-100'}`}>
      <div className="relative">
        {/* Glow Effect */}
        <div className={`absolute inset-0 bg-white/5 blur-[60px] rounded-full transition-transform duration-1000 scale-150 ${stage >= 1 ? 'opacity-100' : 'opacity-0'}`}></div>
        
        {/* Logo Animation */}
        <div className={`relative transition-all duration-1000 transform ${stage >= 1 ? 'scale-100 opacity-100' : 'scale-75 opacity-0'}`}>
          <SAM_LOGO className="w-24 h-24 text-white" />
          <div className="absolute inset-0 border border-white/20 rounded-full animate-ping opacity-20"></div>
        </div>
      </div>

      <div className={`mt-10 flex flex-col items-center transition-all duration-1000 transform ${stage >= 2 ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}>
        <h1 className="text-white text-lg font-light tracking-[0.5em] uppercase">SAM</h1>
        <div className="h-[1px] w-12 bg-white/20 my-3"></div>
        <p className="text-[8px] text-zinc-500 font-bold tracking-[0.3em] uppercase">SMA VERCE Systems</p>
      </div>

      {/* Loading Bar */}
      <div className="absolute bottom-20 w-48 h-[1px] bg-white/5 overflow-hidden">
        <div className="h-full bg-white/40 animate-progress"></div>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  // --- Splash Screen State ---
  const [isInitializing, setIsInitializing] = useState(true);

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
    { role: 'sam', content: 'Entorno Académico SAM habilitado. Nivel de rigor científico configurado.', type: 'text' }
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

  const stylesGallery = [
    { id: 'cinematic', title: 'Cinematográfico', prompt: 'Estilo cinematográfico, alta definición, iluminación dramática', url: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?auto=format&fit=crop&q=80&w=300' },
    { id: 'anime', title: 'Anime Élite', prompt: 'Estilo anime moderno de alta calidad, colores vibrantes, trazos finos', url: 'https://images.unsplash.com/photo-1578632738908-484462a6f33a?auto=format&fit=crop&q=80&w=300' },
    { id: '3d', title: 'Render 3D', prompt: 'Render 3D profesional, Unreal Engine 5, hiperdetallado, realista', url: 'https://images.unsplash.com/photo-1618336753974-aae8e04506aa?auto=format&fit=crop&q=80&w=300' },
    { id: 'cyberpunk', title: 'Cyberpunk', prompt: 'Estilo Cyberpunk, luces de neón, atmósfera futurista nocturna', url: 'https://images.unsplash.com/photo-1605810230434-7631ac76ec81?auto=format&fit=crop&q=80&w=300' },
  ];

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
    <>
      {isInitializing && <SplashScreen onComplete={() => setIsInitializing(false)} />}
      
      <div className={`flex flex-col h-[100dvh] w-full bg-[#050505] text-zinc-300 overflow-hidden font-sans relative transition-opacity duration-1000 ${isInitializing ? 'opacity-0' : 'opacity-100'}`}>
        
        <div className="absolute inset-0 z-0 pointer-events-none bg-gradient-to-b from-[#4a1d4a]/10 via-black to-black opacity-80"></div>

        <main className="flex-1 flex flex-col relative z-10 w-full max-w-[650px] mx-auto overflow-hidden">
          
          <header className="flex flex-col shrink-0 px-6 pt-12 pb-4 safe-area-top backdrop-blur-sm bg-black/10">
            <div className="flex items-center justify-between">
              <button 
                onClick={() => { setIsSidebarOpen(true); setSidebarView('main'); }} 
                className="w-10 h-10 bg-zinc-900/50 border border-white/5 rounded-full flex flex-col items-center justify-center gap-1 transition-all active:scale-90"
              >
                <div className="w-4 h-[1.5px] bg-white rounded-full"></div>
                <div className="w-4 h-[1.5px] bg-white rounded-full"></div>
              </button>
              
              {!isCreativeViewOpen ? (
                <div className="bg-zinc-900/60 backdrop-blur-md rounded-full p-1 flex items-center border border-white/5 shadow-xl">
                  <button onClick={() => setMode('pregunta')} className={`px-4 py-1.5 rounded-full text-[9px] font-bold uppercase tracking-widest transition-all ${mode === 'pregunta' ? 'bg-white text-black' : 'text-zinc-500'}`}>Consultoría</button>
                  <button onClick={() => setMode('academic')} className={`px-4 py-1.5 rounded-full text-[9px] font-bold uppercase tracking-widest transition-all ${mode === 'academic' ? 'bg-white text-black' : 'text-zinc-500'}`}>Academia</button>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <h1 className="text-lg font-medium text-white tracking-tight">Estudio Visual</h1>
                  <span className="text-[8px] text-zinc-500 font-bold uppercase tracking-[0.2em]">SMA VERCE</span>
                </div>
              )}

              <button onClick={() => setIsCreativeViewOpen(!isCreativeViewOpen)} className={`p-2 transition-all ${isCreativeViewOpen ? 'text-white scale-110' : 'text-zinc-500 hover:text-white'}`}>
                <ICONS.Pencil />
              </button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto no-scrollbar px-6 py-6 overscroll-contain">
            {isCreativeViewOpen ? (
              <div className="space-y-10 pb-8">
                <div className="relative w-full rounded-[40px] overflow-hidden aspect-[16/10] shadow-[0_40px_80px_rgba(0,0,0,0.8)] border border-white/10">
                  <img 
                    src="https://img.freepik.com/premium-photo/anime-santa-claus-character-illustration-with-festive-elements_1177187-178636.jpg" 
                    className="w-full h-full object-cover" 
                    alt="Main Santa Anime" 
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent flex flex-col items-center justify-end p-8 text-center">
                    <h2 className="text-xl font-normal text-white leading-tight mb-4 tracking-tight">Potencial Creativo SAM</h2>
                    <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-[0.2em] mb-4">5 Créditos Diarios</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {stylesGallery.map((style) => (
                    <button 
                      key={style.id}
                      onClick={() => setInputValue(style.prompt)}
                      className="group relative aspect-square rounded-[30px] overflow-hidden border border-white/5 transition-all hover:border-white/20 active:scale-95"
                    >
                      <img src={style.url} className="w-full h-full object-cover transition-transform group-hover:scale-110 duration-700" alt={style.title} />
                      <div className="absolute inset-0 bg-black/40 group-hover:bg-black/10 transition-colors" />
                      <div className="absolute bottom-4 left-4 right-4">
                          <span className="text-[10px] text-white font-bold uppercase tracking-widest">{style.title}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-12">
                {currentMessages.map((msg, idx) => (
                  <div key={idx} className={`animate-in fade-in slide-in-from-bottom-3 duration-500 ${msg.role === 'sam' ? 'pl-0' : 'pl-4'}`}>
                    {msg.role === 'user' ? (
                      <div className="flex flex-col items-end">
                        <div className="bg-[#111] px-5 py-3 rounded-[24px] max-w-[90%] border border-white/5 shadow-sm">
                          <p className="text-zinc-200 text-[14px] leading-relaxed">{msg.content}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="max-w-none">
                        <div className="prose prose-invert prose-sm opacity-95 leading-relaxed text-[15px] font-normal selection:bg-white/20">
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                        {msg.mediaUrl && (
                          <div className="mt-8 rounded-[32px] overflow-hidden border border-white/10 shadow-2xl transition-transform hover:scale-[1.01]">
                            <img src={msg.mediaUrl} className="w-full h-auto" />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                <div ref={messagesEndRef} className="h-4" />
              </div>
            )}
          </div>

          <div className="shrink-0 p-6 bg-gradient-to-t from-black via-black/95 to-transparent border-t border-white/5 safe-area-bottom">
            {!isCreativeViewOpen && (
              <div className="grid grid-cols-2 gap-2 mb-4">
                <button 
                  onClick={() => setIsUtilMenuOpen(!isUtilMenuOpen)}
                  className="flex items-center justify-center gap-2 h-10 bg-zinc-900/40 border border-white/5 rounded-2xl text-[9px] font-bold uppercase tracking-widest text-zinc-500 hover:text-zinc-300 transition-colors">
                  <ICONS.Zap /> {utility === 'none' ? 'Módulos' : 'Nodo Activo'}
                </button>
                <button onClick={toggleCamera} className="flex items-center justify-center gap-2 h-10 bg-zinc-900/40 border border-white/5 rounded-2xl text-[9px] font-bold uppercase tracking-widest text-zinc-500 hover:text-zinc-300 transition-colors">
                  <ICONS.Camera /> Sensores
                </button>
              </div>
            )}

            <div className="flex items-center gap-3">
              <div className="flex-1 h-14 bg-[#0a0a0a]/90 backdrop-blur-3xl border border-white/10 rounded-full flex items-center px-5 shadow-2xl transition-all focus-within:border-white/20 focus-within:bg-[#111]">
                <input 
                  className="bg-transparent border-none outline-none flex-1 text-white placeholder-zinc-800 text-[14px] font-medium"
                  placeholder={isCreativeViewOpen ? "Protocolo de diseño..." : "Consulta estratégica..."}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                />
                <button onClick={() => handleSend()} className={`w-9 h-9 flex items-center justify-center rounded-full transition-all ${inputValue.trim() ? 'bg-white text-black shadow-lg shadow-white/10 active:scale-90' : 'text-zinc-900 bg-white/5'}`}>
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

        </main>

        {/* SIDEBAR */}
        {isSidebarOpen && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-[200] flex animate-in fade-in duration-300" onClick={() => setIsSidebarOpen(false)}>
            <div className="w-[300px] h-full bg-[#050505] border-r border-white/5 flex flex-col shadow-2xl animate-in slide-in-from-left duration-300" onClick={e => e.stopPropagation()}>
              <div className="p-10 border-b border-white/5 flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white/5 rounded-lg border border-white/10">
                        <SAM_LOGO className="w-5 h-5 text-white" />
                    </div>
                    <h2 className="text-white font-bold text-xs tracking-[0.2em] uppercase">SAM Elite</h2>
                  </div>
                  <button onClick={() => setIsSidebarOpen(false)} className="text-zinc-600 hover:text-white"><ICONS.Close /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-2 no-scrollbar">
                  <button onClick={() => { setIsCreativeViewOpen(false); setIsSidebarOpen(false); }} className={`w-full text-left p-4 rounded-2xl transition-all text-[10px] font-bold uppercase tracking-widest ${!isCreativeViewOpen ? 'bg-white/5 text-white border border-white/10' : 'text-zinc-600 hover:bg-white/5'}`}>Consultoría</button>
                  <button onClick={() => { setIsCreativeViewOpen(true); setIsSidebarOpen(false); }} className={`w-full text-left p-4 rounded-2xl transition-all text-[10px] font-bold uppercase tracking-widest ${isCreativeViewOpen ? 'bg-white/5 text-white border border-white/10' : 'text-zinc-600 hover:bg-white/5'}`}>Estudio Visual</button>
              </div>
              <div className="p-10 border-t border-white/5">
                  <p className="text-[10px] text-zinc-700 font-bold uppercase tracking-[0.3em]">Core: Connected</p>
                  <p className="text-[8px] text-zinc-800 mt-2">Author: SMA VERCE</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default App;
