import React, { useState } from 'react';
import { UserProfile, Challenge } from '../types';
import { askProfessorQuestion } from '../services/ai';
import { MessageSquareText, Send, Sparkles, User, Loader2, HelpCircle } from 'lucide-react';

interface ProfessorChatProps {
  userProfile: UserProfile;
  currentChallenge?: Challenge;
}

interface ChatMessage {
  id: string;
  sender: 'student' | 'professor';
  text: string;
  timestamp: string;
}

export const ProfessorChat: React.FC<ProfessorChatProps> = ({ userProfile, currentChallenge }) => {
  const isLight = userProfile.backgroundTheme !== 'studio-dark';

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'm1',
      sender: 'professor',
      text: `Greetings! I am Prof. ISO, your photography & editing professor. I see you're using a ${userProfile.camera.brand} ${userProfile.camera.model} and editing in ${userProfile.software}.${currentChallenge ? ` Let's work on the "${currentChallenge.title}" assignment together!` : ''} Ask me anything about camera settings, exposure, composition, or how to use tools in ${userProfile.software}!`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [input, setInput] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const quickQuestions = [
    ...(currentChallenge ? [`How do I shoot "${currentChallenge.title}" step-by-step on my ${userProfile.camera.brand}?`] : []),
    `How do I set up my ${userProfile.camera.brand} for landscape shots?`,
    `Where is the Tone Curve in ${userProfile.software}?`,
    `Explain the exposure triangle for a beginner.`,
    `How do I stop blowing out highlights in high-contrast light?`
  ];

  const handleSendMessage = async (textToSend?: string) => {
    const query = textToSend || input;
    if (!query.trim() || isLoading) return;

    const studentMsg: ChatMessage = {
      id: `msg_${Date.now()}`,
      sender: 'student',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, studentMsg]);
    if (!textToSend) setInput('');
    setIsLoading(true);

    try {
      const responseText = await askProfessorQuestion(userProfile, query);
      const profMsg: ChatMessage = {
        id: `msg_${Date.now() + 1}`,
        sender: 'professor',
        text: responseText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, profMsg]);
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: `msg_${Date.now() + 1}`,
        sender: 'professor',
        text: `Pardon me, I encountered an issue: ${err.message || 'Please check your AI connection settings.'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const cardClass = isLight ? 'bg-white/85 border-amber-100/80' : 'bg-studio-900 border-studio-800';
  const headerClass = isLight ? 'bg-slate-50/90 border-slate-200' : 'bg-studio-950 border-studio-800';
  const headingClass = isLight ? 'text-slate-900' : 'text-white';
  const mutedClass = isLight ? 'text-slate-500' : 'text-studio-400';

  return (
    <div className={`max-w-4xl mx-auto h-[calc(100vh-10rem)] flex flex-col rounded-2xl overflow-hidden shadow-2xl border backdrop-blur-xl transition-colors ${cardClass}`}>
      {/* Chat Header */}
      <div className={`px-6 py-4 border-b flex items-center justify-between ${headerClass}`}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500 text-black flex items-center justify-center font-bold shadow-md">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h2 className={`font-serif-title font-bold text-base ${headingClass}`}>Ask Prof. ISO</h2>
            <p className={`text-xs ${mutedClass}`}>
              Camera Specs & {userProfile.software} Knowledge Assistant
            </p>
          </div>
        </div>

        <span className="text-xs font-semibold text-amber-500 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/30">
          AI Professor Active
        </span>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 p-6 overflow-y-auto space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex items-start gap-3 ${msg.sender === 'student' ? 'flex-row-reverse' : ''}`}
          >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
              msg.sender === 'student'
                ? isLight ? 'bg-amber-100 text-amber-600' : 'bg-studio-800 text-amber-400'
                : 'bg-amber-500 text-black'
            }`}>
              {msg.sender === 'student' ? <User className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
            </div>

            <div className={`max-w-[80%] rounded-2xl p-4 text-xs leading-relaxed border ${
              msg.sender === 'student'
                ? isLight
                  ? 'bg-amber-50 text-slate-800 border-amber-200 font-sans'
                  : 'bg-amber-500/10 text-studio-100 border-amber-500/30 font-sans'
                : isLight
                  ? 'bg-slate-50 text-slate-700 border-slate-200 font-serif'
                  : 'bg-studio-950 text-studio-200 border-studio-800 font-serif'
            }`}>
              <p className="whitespace-pre-wrap">{msg.text}</p>
              <span className={`text-[10px] mt-2 block text-right font-sans ${isLight ? 'text-slate-400' : 'text-studio-500'}`}>{msg.timestamp}</span>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex items-center gap-3 text-xs text-amber-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Prof. ISO is typing a response...</span>
          </div>
        )}
      </div>

      {/* Suggested Quick Questions */}
      <div className={`px-6 py-2 border-t flex items-center gap-2 overflow-x-auto ${
        isLight ? 'bg-slate-50/60 border-slate-200/80' : 'bg-studio-950/60 border-studio-800/80'
      }`}>
        <HelpCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
        <span className={`text-[11px] font-semibold shrink-0 uppercase tracking-wider ${mutedClass}`}>Ideas:</span>
        {quickQuestions.map((q, idx) => (
          <button
            key={idx}
            onClick={() => handleSendMessage(q)}
            className={`text-[11px] px-3 py-1 rounded-full border shrink-0 transition-colors ${
              isLight
                ? 'bg-white hover:bg-amber-50 text-slate-600 hover:text-slate-900 border-slate-200'
                : 'bg-studio-900 hover:bg-studio-800 text-studio-300 hover:text-white border-studio-800'
            }`}
          >
            {q}
          </button>
        ))}
      </div>

      {/* Input Box */}
      <div className={`p-4 border-t flex items-center gap-3 ${headerClass}`}>
        <label htmlFor="professor-chat-input" className="sr-only">Ask Prof. ISO a question</label>
        <input
          id="professor-chat-input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
          placeholder={`Ask Prof. ISO about camera specs or editing in ${userProfile.software}...`}
          className={`flex-1 border rounded-xl px-4 py-3 text-xs focus:outline-none focus:border-amber-500 ${
            isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-studio-900 border-studio-700 text-white'
          }`}
        />
        <button
          onClick={() => handleSendMessage()}
          disabled={isLoading || !input.trim()}
          className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold p-3 rounded-xl transition-colors shadow-lg shadow-amber-500/20"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
