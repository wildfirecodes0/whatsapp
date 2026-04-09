import { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { 
  MessageSquare, 
  Bot, 
  User, 
  QrCode, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  Power,
  History,
  ShieldCheck,
  Smartphone
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Message {
  from: string;
  jid: string;
  text: string;
  timestamp: number;
}

interface BotReply {
  to: string;
  jid: string;
  text: string;
}

export default function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [status, setStatus] = useState<'connecting' | 'open' | 'close' | 'qr'>('connecting');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [botActive, setBotActive] = useState(true);
  const [userOnline, setUserOnline] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [replies, setReplies] = useState<BotReply[]>([]);

  useEffect(() => {
    const newSocket = io();
    setSocket(newSocket);

    newSocket.on('status', (data: { status: any; qr: string | null }) => {
      setStatus(data.status);
      setQrCode(data.qr);
    });

    newSocket.on('bot-config', (data: { botActive: boolean; userOnline: boolean }) => {
      setBotActive(data.botActive);
      setUserOnline(data.userOnline);
    });

    newSocket.on('message', (msg: Message) => {
      setMessages(prev => [msg, ...prev].slice(0, 50));
    });

    newSocket.on('bot-reply', (reply: BotReply) => {
      setReplies(prev => [reply, ...prev].slice(0, 50));
    });

    return () => {
      newSocket.close();
    };
  }, []);

  const toggleBot = () => {
    socket?.emit('toggle-bot', !botActive);
  };

  const toggleOnline = () => {
    socket?.emit('toggle-online', !userOnline);
  };

  return (
    <div className="min-h-screen bg-[#F0F2F5] text-[#111B21] font-sans">
      {/* Header */}
      <header className="bg-[#00A884] text-white py-4 px-6 shadow-md flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="bg-white p-2 rounded-full">
            <Bot className="text-[#00A884] w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">AI WhatsApp Bot</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-white/20 px-3 py-1 rounded-full text-sm">
            {status === 'open' ? (
              <><CheckCircle2 className="w-4 h-4 text-white" /> Connected</>
            ) : status === 'qr' ? (
              <><QrCode className="w-4 h-4 text-white" /> Waiting for Login</>
            ) : (
              <><Loader2 className="w-4 h-4 animate-spin" /> Connecting...</>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Status & Controls */}
        <div className="space-y-6">
          {/* Connection Card */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-gray-500" />
              <h2 className="font-semibold">WhatsApp Connection</h2>
            </div>
            <div className="p-6 flex flex-col items-center justify-center min-h-[300px]">
              {status === 'qr' && qrCode ? (
                <div className="text-center space-y-4">
                  <p className="text-sm text-gray-600 mb-2">Scan this QR code with your WhatsApp</p>
                  <div className="bg-white p-4 border-4 border-[#00A884] rounded-lg shadow-inner">
                    <img src={qrCode} alt="WhatsApp QR Code" className="w-64 h-64" />
                  </div>
                  <p className="text-xs text-gray-400">Open WhatsApp {'>'} Settings {'>'} Linked Devices</p>
                </div>
              ) : status === 'open' ? (
                <div className="text-center space-y-4">
                  <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-12 h-12 text-green-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-green-700">Connected</h3>
                    <p className="text-sm text-gray-500">Your bot is ready to assist</p>
                  </div>
                </div>
              ) : (
                <div className="text-center space-y-4">
                  <Loader2 className="w-12 h-12 text-[#00A884] animate-spin mx-auto" />
                  <p className="text-gray-500">Initializing WhatsApp session...</p>
                </div>
              )}
            </div>
          </section>

          {/* Bot Controls */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${botActive ? 'bg-green-100' : 'bg-red-100'}`}>
                  <Power className={`w-5 h-5 ${botActive ? 'text-green-600' : 'text-red-600'}`} />
                </div>
                <div>
                  <h3 className="font-bold">Bot Status</h3>
                  <p className="text-xs text-gray-500">{botActive ? 'Active & Responding' : 'Paused'}</p>
                </div>
              </div>
              <button 
                onClick={toggleBot}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${botActive ? 'bg-[#00A884]' : 'bg-gray-300'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${botActive ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${userOnline ? 'bg-blue-100' : 'bg-gray-100'}`}>
                  <User className={`w-5 h-5 ${userOnline ? 'text-blue-600' : 'text-gray-600'}`} />
                </div>
                <div>
                  <h3 className="font-bold">I am Online</h3>
                  <p className="text-xs text-gray-500">{userOnline ? 'Bot is auto-paused' : 'Bot is active'}</p>
                </div>
              </div>
              <button 
                onClick={toggleOnline}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${userOnline ? 'bg-blue-500' : 'bg-gray-300'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${userOnline ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>

            <div className="pt-4 border-t border-gray-100">
              <div className="flex items-start gap-3 bg-amber-50 p-3 rounded-lg">
                <ShieldCheck className="w-5 h-5 text-amber-600 mt-0.5" />
                <p className="text-xs text-amber-800 leading-relaxed">
                  The bot only replies to numbers <strong>not saved</strong> in your contacts. It will automatically pause when you toggle "I am Online".
                </p>
              </div>
            </div>
          </section>
        </div>

        {/* Middle Column: Live Feed */}
        <div className="lg:col-span-2 space-y-6">
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col h-[600px]">
            <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-[#00A884]" />
                <h2 className="font-semibold">Live Messages</h2>
              </div>
              <span className="text-xs font-medium bg-green-100 text-green-700 px-2 py-1 rounded">Real-time</span>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#E5DDD5] bg-opacity-30">
              <AnimatePresence initial={false}>
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-gray-400 space-y-2">
                    <MessageSquare className="w-12 h-12 opacity-20" />
                    <p>No messages received yet</p>
                  </div>
                ) : (
                  messages.map((msg, idx) => (
                    <motion.div
                      key={msg.timestamp + idx}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex flex-col"
                    >
                      <div className="bg-white p-3 rounded-lg rounded-tl-none shadow-sm max-w-[80%] self-start border border-gray-100">
                        <div className="flex justify-between items-center mb-1 gap-4">
                          <span className="text-xs font-bold text-[#00A884]">{msg.from}</span>
                          <span className="text-[10px] text-gray-400">
                            {new Date(msg.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-sm leading-relaxed">{msg.text}</p>
                        <div className="mt-1 text-[10px] text-gray-400 font-mono">{msg.jid}</div>
                      </div>
                      
                      {/* Check if there's a corresponding reply */}
                      {replies.find(r => r.jid === msg.jid) && (
                        <div className="bg-[#D9FDD3] p-3 rounded-lg rounded-tr-none shadow-sm max-w-[80%] self-end mt-2 border border-[#BEE6B6]">
                          <div className="flex items-center gap-1 mb-1">
                            <Bot className="w-3 h-3 text-green-700" />
                            <span className="text-[10px] font-bold text-green-700 uppercase tracking-wider">AI Reply</span>
                          </div>
                          <p className="text-sm leading-relaxed">{replies.find(r => r.jid === msg.jid)?.text}</p>
                        </div>
                      )}
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </div>
          </section>

          {/* Bottom Section: Bot History */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200">
            <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
              <History className="w-5 h-5 text-gray-500" />
              <h2 className="font-semibold">Recent AI Actions</h2>
            </div>
            <div className="p-4">
              <div className="space-y-3">
                {replies.slice(0, 5).map((reply, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                        <Bot className="w-4 h-4 text-green-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Replied to {reply.to}</p>
                        <p className="text-xs text-gray-500 truncate max-w-[300px] italic">"{reply.text}"</p>
                      </div>
                    </div>
                    <span className="text-[10px] text-gray-400">Just now</span>
                  </div>
                ))}
                {replies.length === 0 && (
                  <p className="text-center text-sm text-gray-400 py-4">No automated replies sent yet</p>
                )}
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
