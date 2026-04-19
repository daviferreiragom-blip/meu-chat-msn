const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server); // Inicializa o Socket.IO

const PORT = process.env.PORT || 3000;

// Servir arquivos estáticos (HTML, CSS, JS do seu chat) da pasta 'public'
app.use(express.static('public'));

// Evento de conexão de um novo cliente
io.on('connection', (socket) => {
    console.log('Um usuário se conectou:', socket.id);

    // Ouvinte para quando o cliente envia uma mensagem
    socket.on('chat message', (msg) => {
        console.log('Mensagem recebida: ', msg);
        // Reenvia a mensagem para TODOS os outros clientes conectados
        socket.broadcast.emit('chat message', msg);
    });

    // Evento para quando um cliente se desconecta
    socket.on('disconnect', () => {
        console.log('Usuário se desconectou:', socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});