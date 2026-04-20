const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { MongoClient, ServerApiVersion } = require('mongodb');

// Carrega variáveis de ambiente do arquivo .env (opcional, mas recomendado)
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// ========== CONFIGURAÇÃO DO MONGODB ==========
// Use a string de conexão do MongoDB Atlas (via variável de ambiente)
const MONGO_URI = process.env.MONGODB_URI;

if (!MONGO_URI) {
    console.error('❌ ERRO: A variável de ambiente MONGODB_URI não está definida.');
    console.error('Crie um arquivo .env com MONGODB_URI="sua_string_de_conexao"');
    process.exit(1);
}

const DB_NAME = 'chat_msn';
const COLLECTION_MESSAGES = 'messages';

const client = new MongoClient(MONGO_URI, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

let db, messagesCollection;

async function connectMongo() {
    try {
        await client.connect();
        db = client.db(DB_NAME);
        messagesCollection = db.collection(COLLECTION_MESSAGES);
        console.log('✅ Conectado ao MongoDB Atlas');
    } catch (err) {
        console.error('❌ Erro ao conectar no MongoDB:', err);
        process.exit(1);
    }
}
connectMongo();

// ========== SERVIDOR WEB ==========
app.use(express.static('public'));

// ========== GERENCIAMENTO DE USUÁRIOS ONLINE ==========
const onlineUsers = new Map(); // socket.id -> { username }

// ========== SOCKET.IO ==========
io.on('connection', async (socket) => {
    console.log(`🔌 Novo cliente conectado: ${socket.id}`);

    // ----- DEFINIR NOME DE USUÁRIO -----
    socket.on('set username', async (username) => {
        const trimmed = username?.trim();
        if (!trimmed || trimmed.length > 20) {
            socket.emit('username error', 'Nome inválido (1-20 caracteres)');
            return;
        }

        // Verifica se o nome já está em uso
        for (let [id, user] of onlineUsers) {
            if (user.username === trimmed) {
                socket.emit('username error', 'Nome já está em uso');
                return;
            }
        }

        // Registra o usuário
        onlineUsers.set(socket.id, { username: trimmed });
        socket.data.username = trimmed;

        // Confirma para o cliente
        socket.emit('username accepted', trimmed);

        // Atualiza lista de online para todos
        updateOnlineList();

        // Envia as últimas 50 mensagens do histórico (mais recentes primeiro no banco, depois invertemos)
        try {
            const lastMessages = await messagesCollection.find()
                .sort({ timestamp: -1 })
                .limit(50)
                .toArray();
            // Inverte para ordem cronológica (mais antigas primeiro)
            socket.emit('history', lastMessages.reverse());
        } catch (err) {
            console.error('Erro ao buscar histórico:', err);
        }

        // Avisa a todos que alguém entrou
        io.emit('user joined', trimmed);
        console.log(`👤 ${trimmed} entrou no chat`);
    });

    // ----- ENVIO DE MENSAGEM DE TEXTO -----
    socket.on('chat message', async (data) => {
        const username = socket.data.username;
        if (!username) return;

        const messageDoc = {
            sender: username,
            content: data.content,
            type: 'text',
            timestamp: new Date()
        };

        // Salva no MongoDB
        try {
            await messagesCollection.insertOne(messageDoc);
        } catch (err) {
            console.error('Erro ao salvar mensagem:', err);
        }

        // Envia para todos os clientes conectados (incluindo o remetente)
        io.emit('chat message', messageDoc);
    });

    // ----- ENVIO DE DESENHO -----
    socket.on('drawing', async (data) => {
        const username = socket.data.username;
        if (!username) return;

        const messageDoc = {
            sender: username,
            imageUrl: data.imageUrl,
            type: 'drawing',
            timestamp: new Date()
        };

        try {
            await messagesCollection.insertOne(messageDoc);
        } catch (err) {
            console.error('Erro ao salvar desenho:', err);
        }

        io.emit('drawing', messageDoc);
    });

    // ----- DESCONEXÃO -----
    socket.on('disconnect', () => {
        const username = socket.data.username;
        if (username) {
            onlineUsers.delete(socket.id);
            updateOnlineList();
            io.emit('user left', username);
            console.log(`👋 ${username} saiu do chat`);
        }
        console.log(`🔌 Cliente desconectado: ${socket.id}`);
    });

    // Função auxiliar para emitir lista de usuários online
    function updateOnlineList() {
        const users = Array.from(onlineUsers.values()).map(u => u.username);
        io.emit('online list', users);
    }
});

server.listen(PORT, () => {
    console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});
