
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

  // Persist Gallery
  useEffect(() => {
    localStorage.setItem('sam_gallery', JSON.stringify(gallery));
  }, [gallery]);

  // --- Camera Logic ---
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

  // --- Send Logic ---
  const handleSend = useCallback(async (textOverride?: string) => {
    const finalContent = textOverride ?? inputValue;
    if (!finalContent.trim() && !selectedImage) return;

    // --- CASE: Visual Studio (Image Gen/Edit) ---
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

    // --- CASE: Consultancy (Text/Chat) ---
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

  const utilityData = [
    { id: 'search', title: 'Red de Datos', desc: 'Sincronización web.', icon: <ICONS.Globe /> },
    { id: 'academic', title: 'Filtro Académico', desc: 'Rigor científico.', icon: <ICONS.Book /> },
    { id: 'finance', title: 'Nodo Bursátil', desc: 'Mercados en vivo.', icon: <ICONS.Finance /> },
  ];

  const stylesGallery = [
    { id: 'boceto', title: 'Boceto', url: 'https://images.unsplash.com/photo-1544465544-1b71aee9dfa3?auto=format&fit=crop&q=80&w=300' },
    { id: 'festivo', title: 'Retrato festivo', url: 'https://images.unsplash.com/photo-1512389142860-9c449e58a543?auto=format&fit=crop&q=80&w=300' },
    { id: 'dramatico', title: 'Dramático', url: 'https://images.unsplash.com/photo-1492633423870-43d1cd2775eb?auto=format&fit=crop&q=80&w=300' },
    { id: '3d', title: 'Personaje 3D', url: 'https://images.unsplash.com/photo-1618336753974-aae8e04506aa?auto=format&fit=crop&q=80&w=300' },
  ];

  return (
    <div className="flex h-screen w-full bg-[#050505] text-zinc-300 overflow-hidden font-sans relative">
      
      <div className="absolute inset-0 z-0 pointer-events-none bg-gradient-to-b from-[#4a1d4a]/20 via-black to-black opacity-60"></div>

      <div className="flex-1 flex flex-col relative z-10 h-full max-w-[480px] mx-auto w-full overflow-hidden">
        
        {/* HEADER */}
        <header className="flex flex-col shrink-0 px-6 pt-10 pb-4">
          <div className="flex items-center justify-between">
            <button 
              onClick={() => { setIsSidebarOpen(true); setSidebarView('main'); }} 
              className="w-12 h-12 bg-zinc-900/40 border border-white/5 rounded-full flex flex-col items-center justify-center gap-1.5 transition-all hover:bg-zinc-800/60"
            >
              <div className="w-5 h-[2px] bg-white rounded-full"></div>
              <div className="w-5 h-[2px] bg-white rounded-full"></div>
            </button>
            
            {!isCreativeViewOpen && (
              <div className="bg-zinc-900/40 backdrop-blur-md rounded-full p-1 flex items-center border border-white/5 shadow-inner">
                <button onClick={() => setMode('pregunta')} className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-[0.1em] transition-all ${mode === 'pregunta' ? 'bg-white text-black' : 'text-zinc-500'}`}>Consultoría</button>
                <button onClick={() => setMode('academic')} className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-[0.1em] transition-all ${mode === 'academic' ? 'bg-white text-black' : 'text-zinc-500'}`}>Academia</button>
              </div>
            )}
            {isCreativeViewOpen && (
              <div className="flex flex-col items-center">
                <h1 className="text-xl font-medium text-white tracking-tight">Estudio Visual</h1>
                <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest">{5 - dailyUsage.count} de 5 disponibles hoy</span>
              </div>
            )}

            <button onClick={() => setIsCreativeViewOpen(!isCreativeViewOpen)} className={`p-2 transition-all ${isCreativeViewOpen ? 'text-white' : 'text-zinc-500 hover:text-white'}`}>
              <ICONS.Pencil />
            </button>
          </div>

          {!isCreativeViewOpen && mode === 'academic' && (
            <div className="flex justify-center mt-4 animate-in fade-in slide-in-from-top-1 duration-500">
              <div className="flex bg-zinc-900/40 rounded-xl p-0.5 border border-white/5 shadow-inner">
                <button onClick={() => setAcademicGrade('universidad')} className={`px-3 py-1 rounded-lg text-[9px] font-bold uppercase tracking-[0.05em] transition-all ${academicGrade === 'universidad' ? 'bg-white text-black' : 'text-zinc-500'}`}>Universidad</button>
                <button onClick={() => setAcademicGrade('bachiller')} className={`px-3 py-1 rounded-lg text-[9px] font-bold uppercase tracking-[0.05em] transition-all ${academicGrade === 'bachiller' ? 'bg-white text-black' : 'text-zinc-500'}`}>Bachiller</button>
              </div>
            </div>
          )}
        </header>

        {/* CONTENT AREA */}
        <div className="flex-1 overflow-y-auto no-scrollbar px-6 py-4">
          {isCreativeViewOpen ? (
            <>
              {/* FEATURED CARD */}
              <div className="relative w-full rounded-[48px] overflow-hidden aspect-[4/5] shadow-[0_40px_80px_rgba(0,0,0,0.6)] border border-white/10 mb-10 group">
                <img 
                  src="https://img.freepik.com/premium-photo/anime-santa-claus-character-illustration-with-festive-elements_1177187-178636.jpg" 
                  className="w-full h-full object-cover" 
                  alt="Santa Featured" 
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent flex flex-col items-center justify-end p-10 text-center">
                  <span className="text-white/80 text-[11px] font-bold uppercase tracking-[0.35em] mb-3">¡Felices fiestas!</span>
                  <h2 className="text-2xl md:text-3xl font-normal text-white leading-[1.15] mb-8 max-w-[280px]">
                    Protagoniza de tu propio corto navideño
                  </h2>
                  <button onClick={() => setInputValue("Crea una foto de Santa Claus en estilo anime cinematográfico")} className="px-10 py-4 bg-[#141414] border border-white/10 rounded-full text-white text-sm font-semibold tracking-wide hover:bg-zinc-800 transition-all active:scale-95">
                    Crear foto
                  </button>
                </div>
              </div>

              {/* STYLE SELECTOR */}
              <div className="mb-24">
                <h3 className="text-white/90 text-base font-normal mb-6">Probar un estilo en una imagen</h3>
                <div className="flex gap-4 overflow-x-auto no-scrollbar -mx-6 px-6 pb-2">
                  {stylesGallery.map(style => (
                    <div key={style.id} onClick={() => handleSend(`Genera una imagen en estilo ${style.title}`)} className="flex-shrink-0 flex flex-col items-center gap-4 group cursor-pointer">
                      <div className="w-32 h-44 rounded-[28px] overflow-hidden border border-white/10 shadow-lg group-hover:border-white/30 transition-all">
                        <img src={style.url} className="w-full h-full object-cover" alt={style.title} />
                      </div>
                      <span className="text-[11px] text-zinc-500 font-medium tracking-wide">{style.title}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-12 pb-32">
              {currentMessages.map((msg, idx) => (
                <div key={idx} className="animate-in fade-in slide-in-from-bottom-2">
                  {msg.role === 'user' ? (
                    <div className="flex flex-col items-end">
                      {msg.mediaUrl && <div className="mb-3 max-w-[200px] rounded-2xl overflow-hidden border border-white/10 shadow-xl"><img src={msg.mediaUrl} className="w-full h-auto" /></div>}
                      <div className="bg-[#1a1a1a] px-5 py-3 rounded-[20px] max-w-[85%] border border-white/5 shadow-sm">
                        <p className="text-white text-[14px] leading-relaxed">{msg.content}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="max-w-none">
                      <div className="prose prose-invert prose-sm">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                      {msg.mediaUrl && (
                        <div className="mt-6 rounded-3xl overflow-hidden border border-white/10 shadow-2xl">
                          <img src={msg.mediaUrl} className="w-full h-auto" alt="AI Generated" />
                        </div>
                      )}
                      {msg.sources && (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {msg.sources.map((s, i) => (
                            <a key={i} href={s.uri} target="_blank" className="px-2 py-1 bg-white/5 rounded text-[10px] text-zinc-500 hover:text-white border border-white/5">{s.title}</a>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {isCameraActive && (
                <div className="relative rounded-[32px] overflow-hidden border border-white/10 shadow-2xl bg-black aspect-[4/3] max-w-sm mx-auto animate-in zoom-in-95 duration-300">
                  <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 hover:opacity-100 transition-opacity">
                      <button onClick={captureFrame} className="w-16 h-16 bg-white/20 backdrop-blur-3xl border border-white/40 rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-transform">
                          <div className="w-10 h-10 bg-white rounded-full shadow-[0_0_15px_rgba(255,255,255,0.5)]"></div>
                      </button>
                  </div>
                  <button onClick={toggleCamera} className="absolute top-4 right-4 p-2 bg-black/60 backdrop-blur-xl rounded-full text-white">
                    <ICONS.Close />
                  </button>
                </div>
              )}

              {generation.isGenerating && (
                <div className="flex items-center gap-2 text-zinc-700 animate-pulse">
                   <div className="w-1.5 h-1.5 bg-zinc-700 rounded-full"></div>
                   <div className="w-1.5 h-1.5 bg-zinc-700 rounded-full"></div>
                   <div className="w-1.5 h-1.5 bg-zinc-700 rounded-full"></div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* FLOATING COMMAND HUB */}
        <div className="absolute bottom-6 left-0 right-0 px-6 z-50 animate-in slide-in-from-bottom-6 duration-700">
          
          {selectedImage && isCreativeViewOpen && (
            <div className="mb-4 flex justify-center animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="relative group p-1 bg-zinc-900/60 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
                <img 
                  src={`data:${selectedImage.type};base64,${selectedImage.base64}`} 
                  className="w-24 h-24 object-cover rounded-xl" 
                />
                <button 
                  onClick={() => setSelectedImage(null)} 
                  className="absolute top-2 right-2 p-1 bg-black/60 text-white rounded-full hover:bg-black transition-colors"
                >
                  <ICONS.Close />
                </button>
                <div className="absolute bottom-0 left-0 right-0 p-1 bg-white/10 text-center">
                  <span className="text-[8px] font-bold text-white uppercase tracking-widest">Modo Edición</span>
                </div>
              </div>
            </div>
          )}

          {!isCreativeViewOpen && (
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="relative">
                <button 
                  onClick={() => setIsUtilMenuOpen(!isUtilMenuOpen)}
                  className={`w-full flex items-center justify-between px-5 h-12 bg-zinc-900/40 backdrop-blur-3xl border rounded-2xl transition-all shadow-xl ${utility !== 'none' ? 'border-white/40' : 'border-white/10'}`}>
                  <div className="flex items-center gap-3">
                    <ICONS.Zap />
                    <span className="text-[10px] font-bold uppercase tracking-widest">{utility === 'none' ? 'Módulos' : utilityData.find(u => u.id === utility)?.title}</span>
                  </div>
                  <ICONS.ChevronDown />
                </button>
                {isUtilMenuOpen && (
                  <div className="absolute bottom-full left-0 mb-3 w-[260px] bg-black/80 backdrop-blur-3xl border border-white/10 rounded-3xl p-2 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-300">
                    {utilityData.map(u => (
                      <button key={u.id} onClick={() => { setUtility(u.id as UtilityMode); setIsUtilMenuOpen(false); }} className={`w-full flex items-center gap-4 p-3 rounded-2xl hover:bg-white/5 transition-all ${utility === u.id ? 'bg-white/5 text-white' : 'text-zinc-500'}`}>
                        {u.icon}
                        <div className="flex flex-col items-start">
                          <span className="text-xs font-bold">{u.title}</span>
                          <span className="text-[10px] opacity-60">{u.desc}</span>
                        </div>
                      </button>
                    ))}
                    <button onClick={() => setUtility('none')} className="w-full mt-2 p-2 text-[10px] font-bold text-red-500/60 uppercase">Desactivar</button>
                  </div>
                )}
              </div>
              <button onClick={toggleCamera} className={`w-full flex items-center justify-center gap-3 h-12 bg-zinc-900/40 backdrop-blur-3xl border rounded-2xl transition-all shadow-xl ${isCameraActive ? 'border-white/60 text-white' : 'border-white/10 text-zinc-500'}`}>
                <ICONS.Camera />
                <span className="text-[10px] font-bold uppercase tracking-widest">Cámara</span>
              </button>
            </div>
          )}

          <div className="flex items-center gap-3">
            {!isCreativeViewOpen ? (
              <div className="flex-1 h-14 bg-zinc-900/40 backdrop-blur-3xl border border-white/10 rounded-full flex items-center px-4 shadow-2xl transition-all focus-within:border-white/20">
                <button onClick={() => fileInputRef.current?.click()} className="p-2 text-zinc-500 hover:text-white transition-all"><ICONS.Clip /></button>
                <input 
                  className="bg-transparent border-none outline-none flex-1 text-white placeholder-zinc-700 text-sm px-4"
                  placeholder={mode === 'academic' ? "Investigación académica..." : "Consulta estratégica..."}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                />
                <button className="p-2 text-zinc-500 hover:text-white transition-all"><ICONS.Mic /></button>
                <button onClick={() => handleSend()} className={`w-10 h-10 flex items-center justify-center rounded-full transition-all ${inputValue.trim() || selectedImage ? 'bg-white text-black' : 'text-zinc-800 bg-white/5'}`}>
                  {generation.isGenerating ? <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></div> : <ICONS.Send />}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3 w-full">
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="w-14 h-14 bg-zinc-900/40 backdrop-blur-3xl border border-white/10 rounded-full flex items-center justify-center text-zinc-400 hover:text-white transition-all shadow-2xl"
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                </button>
                <div className="flex-1 h-14 bg-zinc-900/40 backdrop-blur-3xl border border-white/10 rounded-full flex items-center px-6 shadow-2xl">
                  <input 
                    className="bg-transparent border-none outline-none flex-1 text-white placeholder-zinc-500 text-sm"
                    placeholder={selectedImage ? "Describe los cambios a realizar..." : "Describe una foto a generar..."}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  />
                  <div className="flex items-center gap-4 text-zinc-500">
                    <button className="hover:text-white"><ICONS.Mic /></button>
                    <button onClick={() => handleSend()} className={inputValue.trim() || selectedImage || generation.isGenerating ? 'text-white' : 'opacity-30'}>
                      {generation.isGenerating ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>}
                    </button>
                  </div>
                </div>
              </div>
            )}
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

      {/* --- SIDEBAR --- */}
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[200] flex animate-in fade-in duration-300" onClick={() => setIsSidebarOpen(false)}>
          <div className="w-[320px] h-full bg-[#0a0a0a] border-r border-white/5 flex flex-col animate-in slide-in-from-left duration-500 shadow-2xl" onClick={e => e.stopPropagation()}>
             <div className="p-8 border-b border-white/5 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/5 rounded-lg border border-white/10">
                    <SAM_LOGO className="w-5 h-5 text-white" />
                  </div>
                  <h2 className="text-white font-bold tracking-tight">SAM Studio</h2>
                </div>
                <button onClick={() => setIsSidebarOpen(false)} className="p-2 text-zinc-500 hover:text-white"><ICONS.Close /></button>
             </div>
             
             <div className="flex-1 overflow-y-auto p-4 space-y-2 no-scrollbar">
                {sidebarView === 'main' && (
                  <>
                    <button onClick={() => { setIsCreativeViewOpen(false); setIsSidebarOpen(false); }} className={`w-full text-left p-4 rounded-2xl transition-all flex items-center gap-3 ${!isCreativeViewOpen ? 'bg-white/5 text-white border border-white/10' : 'text-zinc-500 hover:bg-white/5'}`}>
                      <ICONS.Send /> Consultoría SAM
                    </button>
                    <button onClick={() => { setIsCreativeViewOpen(true); setIsSidebarOpen(false); }} className={`w-full text-left p-4 rounded-2xl transition-all flex items-center gap-3 ${isCreativeViewOpen ? 'bg-white/5 text-white border border-white/10' : 'text-zinc-500 hover:bg-white/5'}`}>
                      <ICONS.Pencil /> Estudio Visual
                    </button>
                    <div className="pt-6 pb-2">
                       <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest px-4">Recursos</span>
                    </div>
                    <button onClick={() => setSidebarView('gallery')} className="w-full text-left p-4 rounded-2xl text-zinc-500 hover:bg-white/5 transition-all flex items-center gap-3">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                      Galería de Arte
                    </button>
                    <button onClick={() => setSidebarView('memory')} className="w-full text-left p-4 rounded-2xl text-zinc-500 hover:bg-white/5 transition-all flex items-center gap-3">
                      <ICONS.Zap /> Memoria Táctica
                    </button>
                  </>
                )}

                {sidebarView === 'gallery' && (
                  <div className="animate-in slide-in-from-right-4 duration-300 h-full flex flex-col">
                    <button onClick={() => setSidebarView('main')} className="flex items-center gap-2 text-zinc-500 mb-6 px-4 text-xs font-bold uppercase tracking-wider hover:text-white transition-colors">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="15 18 9 12 15 6"></polyline></svg> Volver
                    </button>
                    <h3 className="px-4 text-white text-lg font-medium mb-6">Galería Visual</h3>
                    {gallery.length === 0 ? (
                      <div className="flex-1 flex flex-col items-center justify-center text-center p-8 opacity-20">
                         <div className="w-16 h-16 border-2 border-dashed border-white/40 rounded-3xl mb-4"></div>
                         <p className="text-xs italic">Sin activos estratégicos.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-3 px-2 pb-10">
                        {gallery.map((img, i) => (
                          <div key={i} className="aspect-square rounded-2xl overflow-hidden border border-white/10 shadow-lg group relative">
                            <img src={img} className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {sidebarView === 'memory' && (
                   <div className="animate-in slide-in-from-right-4 duration-300">
                      <button onClick={() => setSidebarView('main')} className="flex items-center gap-2 text-zinc-500 mb-6 px-4 text-xs font-bold uppercase tracking-wider hover:text-white transition-colors">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="15 18 9 12 15 6"></polyline></svg> Volver
                      </button>
                      <h3 className="px-4 text-white text-lg font-medium mb-6">Memoria SAM</h3>
                      <div className="space-y-4 px-2">
                        {memories.length === 0 ? <p className="px-4 text-xs text-zinc-600 italic">Bóveda vacía.</p> : memories.map(m => (
                          <div key={m.id} className="p-4 bg-white/5 rounded-2xl border border-white/10">
                            <span className="text-[10px] text-blue-400 font-bold uppercase tracking-tighter">{m.key}</span>
                            <p className="text-sm text-zinc-400 mt-1">{m.value}</p>
                          </div>
                        ))}
                      </div>
                   </div>
                )}
             </div>

             <div className="p-8 border-t border-white/5">
                <div className="flex items-center gap-2 text-[10px] text-zinc-600 font-bold uppercase tracking-widest">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_#22c55e]"></div>
                  SAM Node Active
                </div>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
