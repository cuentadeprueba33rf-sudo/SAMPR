
import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { AppMode, Message, GenerationState, UtilityMode, ThemeMode, MemoryItem, AcademicGrade } from './types';
import { ICONS, SAM_LOGO } from './constants';
import { getGeminiResponse, generateImage } from './geminiService';

const SplashScreen: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setStage(1), 500),   
      setTimeout(() => setStage(2), 1500),  
      setTimeout(() => setStage(3), 2800),  
      setTimeout(() => onComplete(), 3500), 
    ];
    return () => timers.forEach(clearTimeout);
  }, [onComplete]);

  return (
    <div className={`fixed inset-0 z-[1000] bg-[#050505] flex flex-col items-center justify-center transition-opacity duration-1000 ${stage === 3 ? 'opacity-0' : 'opacity-100'}`}>
      <div className="relative">
        <div className={`absolute inset-0 bg-white/5 blur-[80px] rounded-full transition-transform duration-1000 scale-150 ${stage >= 1 ? 'opacity-100' : 'opacity-0'}`}></div>
        <div className={`relative transition-all duration-1000 transform ${stage >= 1 ? 'scale-100 opacity-100' : 'scale-90 opacity-0'}`}>
          <SAM_LOGO className="w-16 h-16 text-white" />
        </div>
      </div>
      <div className={`mt-10 flex flex-col items-center transition-all duration-1000 transform ${stage >= 2 ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}>
        <h1 className="text-white text-lg font-light tracking-[0.5em] uppercase">SAM</h1>
        <p className="text-[8px] text-zinc-500 font-bold tracking-[0.3em] uppercase mt-3">SMA VERCE Systems</p>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [isInitializing, setIsInitializing] = useState(true);
  const [mode, setMode] = useState<AppMode>('pregunta');
  const [academicGrade, setAcademicGrade] = useState<AcademicGrade>('universidad');
  const [utility, setUtility] = useState<UtilityMode>('none');
  const [isUtilityMenuOpen, setIsUtilityMenuOpen] = useState(false);
  const [memories, setMemories] = useState<MemoryItem[]>(() => JSON.parse(localStorage.getItem('sam_memories') || '[]'));
  const [gallery, setGallery] = useState<string[]>(() => JSON.parse(localStorage.getItem('sam_gallery') || '[]'));
  
  const [dailyUsage, setDailyUsage] = useState<{ count: number, date: string }>(() => {
    const saved = localStorage.getItem('sam_daily_limit');
    const today = new Date().toDateString();
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.date === today) return parsed;
    }
    return { count: 0, date: today };
  });

  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [academicMessages, setAcademicMessages] = useState<Message[]>([]);

  const currentMessages = mode === 'pregunta' ? chatMessages : academicMessages;
  const setCurrentMessages = mode === 'pregunta' ? setChatMessages : setAcademicMessages;

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCreativeViewOpen, setIsCreativeViewOpen] = useState(false); 
  const [inputValue, setInputValue] = useState('');
  const [selectedImage, setSelectedImage] = useState<{ base64: string; type: string } | null>(null);
  const [generation, setGeneration] = useState<GenerationState>({ isGenerating: false });
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSend = useCallback(async (textOverride?: string) => {
    const finalContent = textOverride ?? inputValue;
    if (!finalContent.trim() && !selectedImage) return;

    if (isCreativeViewOpen) {
      if (dailyUsage.count >= 5) {
        setCurrentMessages(prev => [...prev, { role: 'sam', content: '"SAM REQUIERE RECALIBRACIÓN" Por favor, regrese mañana.', type: 'text' }]);
        setInputValue('');
        return;
      }
      setGeneration({ isGenerating: true });
      const currentAsset = selectedImage;
      setInputValue('');
      setSelectedImage(null);
      try {
        const imageUrl = await generateImage(finalContent, currentAsset ? { data: currentAsset.base64, mimeType: currentAsset.type } : undefined);
        if (imageUrl) {
          setGallery(prev => [imageUrl, ...prev]);
          setDailyUsage(prev => ({ ...prev, count: prev.count + 1 }));
          setCurrentMessages(prev => [...prev, 
            { role: 'user', content: finalContent, type: 'text' },
            { role: 'sam', content: 'Generación completada satisfactoriamente.', type: 'image', mediaUrl: imageUrl }
          ]);
        }
      } catch (e) {
        setCurrentMessages(prev => [...prev, { role: 'sam', content: 'Error en protocolo de generación. Reintente.', type: 'text' }]);
      } finally { setGeneration( { isGenerating: false }); }
      return;
    }

    const newUserMessage: Message = { role: 'user', content: finalContent, type: 'text', mediaUrl: selectedImage ? `data:${selectedImage.type};base64,${selectedImage.base64}` : undefined };
    setCurrentMessages(prev => [...prev, newUserMessage]);
    setInputValue('');
    setSelectedImage(null);
    setGeneration({ isGenerating: true });

    try {
      const history = currentMessages.slice(-10).map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] }));
      const result = await getGeminiResponse(finalContent, history, undefined, utility, memories, mode, academicGrade);
      setCurrentMessages(prev => [...prev, { role: 'sam', content: result.text, type: 'text' }]);
    } catch (error) {
      setCurrentMessages(prev => [...prev, { role: 'sam', content: 'Servidor SAM temporalmente ocupado. Por favor, espere.', type: 'text' }]);
    } finally { setGeneration({ isGenerating: false }); }
  }, [inputValue, selectedImage, currentMessages, mode, utility, memories, academicGrade, setCurrentMessages, isCreativeViewOpen, dailyUsage]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [currentMessages, generation.isGenerating]);

  const utilityModes: { id: UtilityMode; label: string; icon: string }[] = [
    { id: 'none', label: 'Estándar', icon: '🧠' },
    { id: 'search', label: 'Búsqueda Web', icon: '🌐' },
    { id: 'academic', label: 'Modo Paper', icon: '🎓' },
    { id: 'finance', label: 'Finanzas', icon: '📈' },
  ];

  return (
    <>
      {isInitializing && <SplashScreen onComplete={() => setIsInitializing(false)} />}
      
      <div className={`flex flex-col h-[100dvh] w-full text-zinc-300 overflow-hidden font-sans relative transition-opacity duration-1000 ${isInitializing ? 'opacity-0' : 'opacity-100'}`}>
        
        <main className="flex-1 flex flex-col relative z-10 w-full max-w-[500px] mx-auto overflow-hidden">
          
          {/* HEADER */}
          <header className="flex items-center justify-between px-6 pt-12 pb-4 shrink-0 safe-area-top">
            <button onClick={() => setIsSidebarOpen(true)} className="p-2 -ml-2 text-white/90">
              <ICONS.Menu />
            </button>
            <h2 className="text-[17px] font-medium text-white/90">SAM Systems</h2>
            <button className="px-4 py-1.5 bg-white/5 border border-white/10 rounded-lg text-[13px] font-medium text-white">
              SAM Elite
            </button>
          </header>

          {/* MAIN SCROLL AREA */}
          <div className="flex-1 overflow-y-auto no-scrollbar px-6 py-4 overscroll-contain">
            {currentMessages.length === 0 && !isCreativeViewOpen ? (
              <div className="h-full flex flex-col items-center justify-center animate-in fade-in duration-1000">
                <div className="mb-8 p-6 bg-white/5 rounded-full border border-white/10">
                   <SAM_LOGO className="w-12 h-12 text-white" />
                </div>
                <h1 className="text-[26px] font-semibold text-white tracking-tight mb-2 text-center px-4">¡Me alegra que estés aquí!</h1>
                <p className="text-zinc-500 text-sm text-center px-10">Inicie una consulta estratégica o explore el potencial creativo.</p>
              </div>
            ) : isCreativeViewOpen ? (
               <div className="space-y-10 pt-10 animate-in fade-in duration-700">
                  <div className="relative w-full rounded-3xl overflow-hidden aspect-video shadow-2xl border border-white/5">
                    <img src="https://img.freepik.com/premium-photo/anime-santa-claus-character-illustration-with-festive-elements_1177187-178636.jpg" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/30 flex flex-col items-center justify-end p-6">
                      <h2 className="text-xl font-medium text-white">Potencial Creativo SAM</h2>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {['Cinematic', 'Minimal', 'Luxury 3D', 'Architecture'].map((s, i) => (
                      <button key={i} onClick={() => setInputValue(`Generar un visual estilo ${s}`)} className="bg-white/5 p-4 rounded-2xl border border-white/5 text-[11px] font-bold uppercase tracking-widest text-zinc-400 hover:text-white transition-all active:scale-95">
                        {s}
                      </button>
                    ))}
                  </div>
               </div>
            ) : (
              <div className="space-y-10">
                {currentMessages.map((msg, idx) => (
                  <div key={idx} className={`animate-in fade-in slide-in-from-bottom-2 duration-500 ${msg.role === 'sam' ? 'pl-0' : 'flex flex-col items-end'}`}>
                    {msg.role === 'user' ? (
                      <div className="bg-[#1e293b]/50 px-5 py-3 rounded-[22px] max-w-[90%] border border-white/5">
                        <p className="text-white text-[15px] leading-relaxed">{msg.content}</p>
                      </div>
                    ) : (
                      <div className="max-w-none">
                        <div className="prose prose-invert leading-relaxed text-[16px] text-zinc-200">
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
                {generation.isGenerating && (
                  <div className="flex gap-2 items-center text-[12px] text-zinc-500 animate-pulse">
                    <div className="w-1.5 h-1.5 bg-blue-400 rounded-full"></div>
                    Procesando respuesta...
                  </div>
                )}
                <div ref={messagesEndRef} className="h-10" />
              </div>
            )}
          </div>

          {/* INPUT SECTION */}
          <div className="shrink-0 px-6 pt-2 pb-6 flex flex-col gap-4 relative">
            
            {/* Quick Actions Chips */}
            {currentMessages.length === 0 && !isCreativeViewOpen && (
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
                <button onClick={() => handleSend("Crear una imagen")} className="shrink-0 bg-white/[0.08] px-5 py-3 rounded-xl border border-white/5 text-[14px] text-zinc-300">Crear una imagen</button>
                <button onClick={() => handleSend("Recomendar un producto")} className="shrink-0 bg-white/[0.08] px-5 py-3 rounded-xl border border-white/5 text-[14px] text-zinc-300">Recomendar un producto</button>
              </div>
            )}

            {/* Utility Selector Menu */}
            {isUtilityMenuOpen && (
              <div className="absolute bottom-[100%] left-6 right-6 mb-2 bg-[#0f172a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200 z-[50]">
                {utilityModes.map((um) => (
                  <button 
                    key={um.id} 
                    onClick={() => { setUtility(um.id); setIsUtilityMenuOpen(false); }}
                    className={`w-full flex items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-white/5 ${utility === um.id ? 'bg-white/10' : ''}`}
                  >
                    <span className="text-xl">{um.icon}</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-white">{um.label}</p>
                      <p className="text-[10px] text-zinc-500 uppercase tracking-widest">{um.id === 'none' ? 'General' : 'Especializado'}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Rounded Input Bar */}
            <div className="bg-[#121a29]/90 border border-white/[0.08] rounded-[28px] h-14 flex items-center px-4 shadow-xl">
              <button onClick={() => fileInputRef.current?.click()} className="p-2 text-zinc-400 hover:text-white transition-colors">
                <ICONS.Plus />
              </button>
              <input 
                className="bg-transparent border-none outline-none flex-1 text-white placeholder-zinc-500 text-[15px] px-2"
                placeholder={isCreativeViewOpen ? "Protocolo de diseño..." : "Consultar a SAM..."}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              />
              <div className="flex items-center gap-1">
                {!inputValue.trim() && (
                  <button 
                    onClick={() => setIsUtilityMenuOpen(!isUtilityMenuOpen)} 
                    className={`p-2 transition-all rounded-full flex items-center justify-center ${utility !== 'none' ? 'bg-blue-500/20 text-blue-400' : 'text-zinc-400 hover:text-white'}`}
                  >
                    {utility === 'none' ? <ICONS.Zap /> : <span>{utilityModes.find(m => m.id === utility)?.icon}</span>}
                  </button>
                )}
                {inputValue.trim() && (
                  <button onClick={() => handleSend()} className="p-2 text-blue-400 hover:text-white transition-colors animate-in zoom-in duration-200">
                    <ICONS.Send />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* BOTTOM NAVIGATION */}
          <footer className="shrink-0 h-16 bg-[#050505] flex items-center justify-around border-t border-white/[0.03] safe-area-bottom">
            <button onClick={() => { setIsCreativeViewOpen(false); setMode('pregunta'); }} className={`p-3 transition-colors ${!isCreativeViewOpen && mode === 'pregunta' ? 'text-blue-400' : 'text-zinc-500'}`}>
              <ICONS.Home />
            </button>
            <button onClick={() => setIsCreativeViewOpen(true)} className={`p-3 transition-colors ${isCreativeViewOpen ? 'text-blue-400' : 'text-zinc-500'}`}>
              <ICONS.Compass />
            </button>
            <button onClick={() => { setIsCreativeViewOpen(false); setMode('academic'); }} className={`p-3 transition-colors ${!isCreativeViewOpen && mode === 'academic' ? 'text-blue-400' : 'text-zinc-500'}`}>
              <ICONS.Tabs />
            </button>
          </footer>

          <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              const r = new FileReader();
              r.onloadend = () => setSelectedImage({ base64: (r.result as string).split(',')[1], type: file.type });
              r.readAsDataURL(file);
            }
          }} />
        </main>

        {/* SIDEBAR MODAL */}
        {isSidebarOpen && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-[200] animate-in fade-in duration-300" onClick={() => setIsSidebarOpen(false)}>
            <div className="w-[280px] h-full bg-[#0a0f18] border-r border-white/5 flex flex-col animate-in slide-in-from-left duration-500" onClick={e => e.stopPropagation()}>
              <div className="p-8 border-b border-white/5 flex justify-between items-center">
                <div className="flex items-center gap-3">
                   <SAM_LOGO className="w-5 h-5 text-white" />
                   <h2 className="text-white font-bold text-xs tracking-[0.2em] uppercase">SAM Elite</h2>
                </div>
                <button onClick={() => setIsSidebarOpen(false)} className="text-zinc-500 hover:text-white"><ICONS.Close /></button>
              </div>
              <div className="flex-1 p-6 space-y-4 overflow-y-auto no-scrollbar">
                <div className="space-y-1">
                  <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest pl-2 mb-2">Sistemas</p>
                  <button onClick={() => { setMode('pregunta'); setIsSidebarOpen(false); }} className={`w-full text-left p-3 rounded-xl text-[14px] flex items-center gap-3 ${mode === 'pregunta' ? 'bg-white/5 text-white' : 'text-zinc-500'}`}>
                    <span>💬</span> Consultoría
                  </button>
                  <button onClick={() => { setMode('academic'); setIsSidebarOpen(false); }} className={`w-full text-left p-3 rounded-xl text-[14px] flex items-center gap-3 ${mode === 'academic' ? 'bg-white/5 text-white' : 'text-zinc-500'}`}>
                    <span>📖</span> Academia
                  </button>
                </div>
              </div>
              <div className="p-8 border-t border-white/5 text-center">
                <p className="text-[9px] text-zinc-700 font-bold uppercase tracking-[0.3em]">SMA VERCE Systems</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default App;
