
import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import { AppMode, Message, GenerationState, UtilityMode, MemoryItem, AcademicGrade } from './types';
import { ICONS, SAM_LOGO } from './constants';
import { getGeminiResponse, generateImage } from './geminiService';

// Componente para animar el texto palabra por palabra
const Typewriter = memo(({ text, speed = 10, onComplete }: { text: string; speed?: number; onComplete?: () => void }) => {
  const [displayedText, setDisplayedText] = useState('');
  const [index, setIndex] = useState(0);
  const words = text.split(' ');

  useEffect(() => {
    if (index < words.length) {
      const timeout = setTimeout(() => {
        setDisplayedText((prev) => prev + (prev ? ' ' : '') + words[index]);
        setIndex((prev) => prev + 1);
      }, speed);
      return () => clearTimeout(timeout);
    } else if (onComplete) {
      onComplete();
    }
  }, [index, words, speed, onComplete]);

  return (
    <div className="prose prose-invert prose-sm leading-relaxed text-[15px] animate-in fade-in duration-500">
      <ReactMarkdown>{displayedText}</ReactMarkdown>
    </div>
  );
});

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>('pregunta');
  const [academicGrade, setAcademicGrade] = useState<AcademicGrade>('universidad');
  const [utility, setUtility] = useState<UtilityMode>('none');
  const [isUtilityMenuOpen, setIsUtilityMenuOpen] = useState(false);
  const [memories, setMemories] = useState<MemoryItem[]>(() => JSON.parse(localStorage.getItem('sam_memories') || '[]'));
  
  const [chatMessages, setChatMessages] = useState<Message[]>([
    { role: 'sam', content: 'Hola 😊 ¿cómo estás? ¿Qué tal va tu día?', type: 'text' }
  ]);
  const [academicMessages, setAcademicMessages] = useState<Message[]>([]);

  const currentMessages = mode === 'pregunta' ? chatMessages : academicMessages;
  const setCurrentMessages = mode === 'pregunta' ? setChatMessages : setAcademicMessages;

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [generation, setGeneration] = useState<GenerationState>({ isGenerating: false });
  const [toast, setToast] = useState<{ message: string; visible: boolean }>({ message: '', visible: false });
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (message: string) => {
    setToast({ message, visible: true });
    setTimeout(() => setToast({ message: '', visible: false }), 2500);
  };

  const handleSend = useCallback(async (textOverride?: string) => {
    const finalContent = textOverride ?? inputValue;
    if (!finalContent.trim()) return;

    const newUserMessage: Message = { role: 'user', content: finalContent, type: 'text' };
    setCurrentMessages(prev => [...prev, newUserMessage]);
    setInputValue('');
    setIsUtilityMenuOpen(false);
    setGeneration({ isGenerating: true });

    try {
      const history = currentMessages.slice(-12).map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] }));
      const result = await getGeminiResponse(finalContent, history, undefined, utility, memories, mode, academicGrade);
      
      // Añadimos la propiedad isNew para activar la animación de typewriter
      setCurrentMessages(prev => [...prev, { 
        role: 'sam', 
        content: result.text, 
        type: 'text',
        isNew: true 
      }]);
    } catch (error) {
      setCurrentMessages(prev => [...prev, { role: 'sam', content: 'Error en la conexión con SAM.', type: 'text' }]);
    } finally { setGeneration({ isGenerating: false }); }
  }, [inputValue, currentMessages, mode, utility, memories, academicGrade, setCurrentMessages]);

  useEffect(() => { 
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); 
  }, [currentMessages, generation.isGenerating]);

  const handleNewChat = () => {
    setCurrentMessages([{ role: 'sam', content: 'Nueva sesión estratégica iniciada.', type: 'text' }]);
    showToast("Chat reiniciado");
  };

  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content);
    showToast("Copiado");
  };

  const handleFeedback = (isPositive: boolean) => {
    showToast(isPositive ? "Feedback positivo" : "Feedback negativo");
  };

  const handleSpeak = (content: string) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(content);
      utterance.lang = 'es-ES';
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    }
  };

  const utilityModes: { id: UtilityMode; label: string; icon: string }[] = [
    { id: 'none', label: 'IA', icon: '🧠' },
    { id: 'search', label: 'Web', icon: '🌐' },
    { id: 'finance', label: 'Fin.', icon: '📈' },
    { id: 'academic', label: 'Acad.', icon: '🎓' },
  ];

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-[#000000] text-white overflow-hidden safe-area-top safe-area-bottom relative">
      
      {/* TOAST */}
      {toast.visible && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[500] bg-[#1a1a1a] border border-white/10 px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider animate-in fade-in slide-in-from-top-4 duration-300 shadow-2xl">
          {toast.message}
        </div>
      )}

      {/* HEADER COMPACTO */}
      <header className="flex items-center justify-between px-4 py-3 shrink-0 z-10 max-w-lg mx-auto w-full">
        <button 
          onClick={() => setIsSidebarOpen(true)}
          className="w-10 h-10 bg-[#1a1a1a] rounded-full flex items-center justify-center text-white/90 active:scale-90 transition-all border border-white/5"
        >
          <ICONS.Menu />
        </button>

        <div className="flex items-center bg-[#1a1a1a] rounded-full px-3 py-1.5 gap-3 shadow-sm border border-white/5">
          <button onClick={handleNewChat} className="text-white/70 active:scale-90 p-1"><ICONS.Edit /></button>
          <button onClick={() => showToast("Opciones")} className="text-white/70 active:scale-90 p-1"><ICONS.Dots /></button>
        </div>
      </header>

      {/* AREA DE CHAT */}
      <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-2">
        <div className="max-w-md mx-auto space-y-6 pb-6">
          {currentMessages.map((msg, idx) => (
            <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
              {msg.role === 'user' ? (
                <div className="bg-[#004a8f] px-4 py-2 rounded-[20px] max-w-[85%] text-[15px] leading-snug shadow-lg">
                  {msg.content}
                </div>
              ) : (
                <div className="w-full">
                  {msg.isNew ? (
                    <Typewriter 
                      text={msg.content} 
                      onComplete={() => {
                        // Opcional: limpiar la flag isNew después de completar
                        const newMsgs = [...currentMessages];
                        newMsgs[idx] = { ...newMsgs[idx], isNew: false };
                        // No seteamos el estado directamente aquí para evitar loops, 
                        // simplemente se queda como está.
                      }}
                    />
                  ) : (
                    <div className="prose prose-invert prose-sm leading-relaxed text-[15px]">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  )}
                  <div className="flex items-center gap-4 mt-3 text-[#3a3a3c]">
                    <button onClick={() => handleCopy(msg.content)} className="hover:text-white transition-colors active:scale-90"><ICONS.Copy /></button>
                    <button onClick={() => handleFeedback(true)} className="hover:text-white transition-colors active:scale-90"><ICONS.ThumbUp /></button>
                    <button onClick={() => handleFeedback(false)} className="hover:text-white transition-colors active:scale-90"><ICONS.ThumbDown /></button>
                    <button onClick={() => handleSpeak(msg.content)} className="hover:text-white transition-colors active:scale-90"><ICONS.Speaker /></button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {generation.isGenerating && (
            <div className="flex gap-1.5 items-center text-[#4a4a4a] pl-2">
              <div className="w-1 h-1 bg-blue-500 rounded-full animate-bounce"></div>
              <div className="w-1 h-1 bg-blue-500 rounded-full animate-bounce [animation-delay:0.1s]"></div>
              <div className="w-1 h-1 bg-blue-500 rounded-full animate-bounce [animation-delay:0.2s]"></div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* BARRA DE ENTRADA UNIFICADA */}
      <div className="px-4 pt-2 pb-6 shrink-0 z-20 w-full flex flex-col items-center">
        <div className="max-w-md w-full flex items-center gap-2.5 relative">
          
          {/* Selector de Utilidad (Flotante) */}
          {isUtilityMenuOpen && (
            <div className="absolute bottom-[125%] left-0 right-0 bg-[#121212] border border-white/10 rounded-2xl p-1.5 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200 grid grid-cols-4 gap-1">
              {utilityModes.map(m => (
                <button 
                  key={m.id}
                  onClick={() => { setUtility(m.id); setIsUtilityMenuOpen(false); showToast(m.label); }}
                  className={`flex flex-col items-center justify-center py-2.5 rounded-xl transition-all ${utility === m.id ? 'bg-blue-600 text-white' : 'text-[#8e8e93] hover:bg-white/5'}`}
                >
                  <span className="text-sm">{m.icon}</span>
                  <span className="text-[8px] font-bold mt-1 uppercase tracking-tighter">{m.label}</span>
                </button>
              ))}
            </div>
          )}

          {/* CUADRO DE TEXTO CON BOTÓN + INTERNO */}
          <div className="flex-1 bg-[#1a1a1a] rounded-full h-11 flex items-center pl-1 pr-3 gap-2 border border-white/5 focus-within:border-blue-500/30 transition-all shadow-xl">
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="w-9 h-9 bg-white/5 rounded-full flex items-center justify-center text-white shrink-0 active:scale-90 transition-all hover:bg-white/10"
            >
              <ICONS.Plus />
            </button>

            <input 
              className="bg-transparent border-none outline-none flex-1 text-white placeholder-[#4a4a4a] text-[15px] font-medium"
              placeholder="Escribir a SAM..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            />
            
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setIsUtilityMenuOpen(!isUtilityMenuOpen)} 
                className={`w-7 h-7 flex items-center justify-center rounded-full transition-all ${utility !== 'none' ? 'bg-blue-600/20 text-blue-400' : 'text-[#8e8e93] hover:text-white'}`}
              >
                <ICONS.Zap />
              </button>
              
              {inputValue.trim() ? (
                <button onClick={() => handleSend()} className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white active:scale-90 animate-in zoom-in duration-200">
                  <ICONS.Send />
                </button>
              ) : (
                <button onClick={() => showToast("Audio...")} className="text-[#007aff] active:scale-90"><ICONS.Waveform /></button>
              )}
            </div>
          </div>
        </div>
        <p className="text-[8px] text-[#2a2a2a] mt-3 uppercase tracking-[0.4em] font-bold">SMA VERCE SYSTEMS</p>
      </div>

      <input type="file" ref={fileInputRef} className="hidden" />

      {/* SIDEBAR MODAL */}
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[300] animate-in fade-in duration-300" onClick={() => setIsSidebarOpen(false)}>
          <div className="w-[260px] h-full bg-[#0a0a0a] border-r border-white/5 flex flex-col animate-in slide-in-from-left duration-300" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-white/5 flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <SAM_LOGO className="w-4 h-4 text-white" />
                <span className="text-white font-bold uppercase text-[9px] tracking-widest">SAM ELITE</span>
              </div>
              <button onClick={() => setIsSidebarOpen(false)} className="text-[#4a4a4a] p-1"><ICONS.Close /></button>
            </div>
            
            <div className="flex-1 p-5 space-y-6">
              <div className="space-y-1.5">
                <p className="text-[8px] text-[#2a2a2a] font-bold uppercase tracking-widest mb-3 pl-2">Sistemas</p>
                <button onClick={() => { setMode('pregunta'); setIsSidebarOpen(false); }} className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 text-xs font-medium transition-all ${mode === 'pregunta' ? 'bg-[#1a1a1a] text-white border border-white/5' : 'text-[#4a4a4a]'}`}>
                  💬 Consultoría
                </button>
                <button onClick={() => { setMode('academic'); setIsSidebarOpen(false); }} className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 text-xs font-medium transition-all ${mode === 'academic' ? 'bg-[#1a1a1a] text-white border border-white/5' : 'text-[#4a4a4a]'}`}>
                  🎓 Academia
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
