import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import baileys from '@whiskeysockets/baileys';
const { 
  useMultiFileAuthState, 
  DisconnectReason, 
  fetchLatestBaileysVersion,
  makeInMemoryStore 
} = baileys as any;
const makeWASocket = (baileys as any).default || baileys;
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode';
import pino from 'pino';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = pino({ level: 'silent' });
const store = makeInMemoryStore({ logger });
store.readFromFile('./baileys_store_multi.json');
setInterval(() => {
  store.writeToFile('./baileys_store_multi.json');
}, 10000);

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
    }
  });

  app.use(cors());
  app.use(express.json());

  let sock: any = null;
  let qrCodeData: string | null = null;
  let connectionStatus: 'connecting' | 'open' | 'close' | 'qr' = 'connecting';
  let botActive = true;
  let userOnline = false;

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

  async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      printQRInTerminal: false,
      auth: state,
      logger,
      browser: ['AI WhatsApp Bot', 'Chrome', '1.0.0'],
    });

    store.bind(sock.ev);

    sock.ev.on('connection.update', async (update: any) => {
      const { connection, lastDisconnect, qr } = update;
      
      if (qr) {
        qrCodeData = await qrcode.toDataURL(qr);
        connectionStatus = 'qr';
        io.emit('status', { status: 'qr', qr: qrCodeData });
      }

      if (connection === 'close') {
        const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
        connectionStatus = 'close';
        io.emit('status', { status: 'close' });
        if (shouldReconnect) {
          connectToWhatsApp();
        }
      } else if (connection === 'open') {
        connectionStatus = 'open';
        qrCodeData = null;
        io.emit('status', { status: 'open' });
        console.log('WhatsApp connection opened');
      }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('presence.update', (update: any) => {
      // This is for other people's presence. 
      // To check own presence, we might need a different approach or just rely on user interaction.
      // However, baileys doesn't easily give "own online status" unless we are the one sending it.
      // We will implement a "Manual Online" toggle or try to detect if we are active on another device.
    });

    sock.ev.on('messages.upsert', async (m: any) => {
      if (m.type !== 'notify') return;
      
      for (const msg of m.messages) {
        if (!msg.message) continue;

        const jid = msg.key.remoteJid;
        if (!jid) continue;
        const isMe = msg.key.fromMe;

        if (isMe) {
          // If user sends a message, consider them online and pause bot for 5 minutes
          if (!userOnline) {
            userOnline = true;
            io.emit('bot-config', { botActive, userOnline });
            console.log('User activity detected, auto-pausing bot');
            
            setTimeout(() => {
              userOnline = false;
              io.emit('bot-config', { botActive, userOnline });
              console.log('Auto-pause expired, bot resuming');
            }, 5 * 60 * 1000); // 5 minutes
          }
          continue;
        }

        const pushName = msg.pushName || 'Unknown';
        const messageContent = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

        if (!messageContent) continue;

        // Log message to UI
        io.emit('message', {
          from: pushName,
          jid,
          text: messageContent,
          timestamp: msg.messageTimestamp,
        });

        // Bot logic
        if (botActive && !userOnline) {
          // Check if it's a group
          if (jid.endsWith('@g.us')) continue;

          // Check if contact is saved
          const contacts = store.contacts;
          const isContact = !!contacts[jid];

          if (!isContact) {
            console.log(`Replying to unknown number: ${jid}`);
            try {
              const reply = await generateAIReply(messageContent, pushName);
              await sock.sendMessage(jid, { text: reply });
              
              io.emit('bot-reply', {
                to: pushName,
                jid,
                text: reply,
              });
            } catch (err) {
              console.error('Error generating AI reply:', err);
            }
          }
        }
      }
    });
  }

  async function generateAIReply(message: string, senderName: string) {
    if (!process.env.GEMINI_API_KEY) {
      return "Hi! I'm an AI bot. My owner is currently offline. (API Key missing)";
    }

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `You are a helpful personal assistant for a WhatsApp user. 
        A person named "${senderName}" (who is not in the user's contacts) sent this message: "${message}".
        Reply politely and naturally as if you are the user's assistant. 
        Keep it short and helpful. Mention that the owner is currently busy or offline.
        Reply in the same language as the incoming message if possible.`,
      });
      return response.text || "Hi! I'm currently away. I'll get back to you soon.";
    } catch (error) {
      console.error('Gemini Error:', error);
      return "Hi! I'm currently away. I'll get back to you soon.";
    }
  }

  connectToWhatsApp();

  io.on('connection', (socket) => {
    socket.emit('status', { status: connectionStatus, qr: qrCodeData });
    socket.emit('bot-config', { botActive, userOnline });

    socket.on('toggle-bot', (active: boolean) => {
      botActive = active;
      io.emit('bot-config', { botActive, userOnline });
    });

    socket.on('toggle-online', (online: boolean) => {
      userOnline = online;
      io.emit('bot-config', { botActive, userOnline });
    });
  });

  // Vite integration
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = 3000;
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => console.error('Failed to start server:', err));
