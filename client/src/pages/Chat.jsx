import React, { useState } from 'react';
import { Send, Hash, UserCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Chat() {
  const { user } = useAuth();
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: 'Admin Shiva',
      content: 'Welcome everyone! The project architecture is established and ready.',
      time: '12:00 PM',
      isMe: false,
    },
    {
      id: 2,
      sender: 'Priya Manager',
      content: 'Great! All database schema tables have org_id multi-tenant isolation.',
      time: '12:02 PM',
      isMe: false,
    },
    {
      id: 3,
      sender: user?.name || 'You',
      content: 'Ready to integrate the Machine Learning task delay prediction API.',
      time: '12:05 PM',
      isMe: true,
    },
  ]);
  const [inputText, setInputText] = useState('');

  const handleSend = (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    setMessages([
      ...messages,
      {
        id: Date.now(),
        sender: user?.name || 'You',
        content: inputText.trim(),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isMe: true,
      },
    ]);
    setInputText('');
  };

  return (
    <div className="h-[calc(100vh-8rem)] bg-white rounded-xl border border-slate-200 shadow-sm flex overflow-hidden">
      {/* Channels Sidebar */}
      <div className="w-64 border-r border-slate-200 bg-slate-50 flex flex-col">
        <div className="p-4 border-b border-slate-200">
          <h3 className="font-semibold text-slate-800 text-sm">Channels & Rooms</h3>
        </div>
        <div className="p-3 space-y-1">
          <button className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-brand-50 text-brand-700 font-medium text-sm">
            <Hash className="w-4 h-4" /> general
          </button>
          <button className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-slate-600 hover:bg-slate-100 font-medium text-sm">
            <Hash className="w-4 h-4" /> project-discussion
          </button>
          <button className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-slate-600 hover:bg-slate-100 font-medium text-sm">
            <Hash className="w-4 h-4" /> ml-and-analytics
          </button>
        </div>
      </div>

      {/* Chat Messages Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="h-14 border-b border-slate-200 px-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Hash className="w-5 h-5 text-slate-500" />
            <span className="font-semibold text-slate-800 text-sm">general</span>
          </div>
          <span className="text-xs text-emerald-600 font-medium flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Live Connected
          </span>
        </div>

        {/* Message Feed */}
        <div className="flex-1 p-6 overflow-y-auto space-y-4">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex flex-col ${msg.isMe ? 'items-end' : 'items-start'}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold text-slate-700">{msg.sender}</span>
                <span className="text-[10px] text-slate-400">{msg.time}</span>
              </div>
              <div
                className={`px-4 py-2.5 rounded-2xl text-sm max-w-md ${
                  msg.isMe
                    ? 'bg-brand-600 text-white rounded-br-none'
                    : 'bg-slate-100 text-slate-800 rounded-bl-none'
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}
        </div>

        {/* Input Field */}
        <form onSubmit={handleSend} className="p-4 border-t border-slate-200 flex gap-3">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type your message to the team..."
            className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
          />
          <button
            type="submit"
            className="bg-brand-600 hover:bg-brand-700 text-white px-5 py-2.5 rounded-lg transition font-medium flex items-center gap-2 text-sm shadow-sm"
          >
            <Send className="w-4 h-4" /> Send
          </button>
        </form>
      </div>
    </div>
  );
}
