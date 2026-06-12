const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const GameState = require('./GameState');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Serve static files (HTML, CSS, JS) from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Add a data structure to store the game state, e.g., an object with player states
const gameState = new GameState();

// Handle Socket.IO connections
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Add the player to the game state
    const initialPosition = {
        x: 0,
        y: 5,
        z: -1.5
    };
    gameState.addPlayer(socket.id, initialPosition);

    // Listen for player actions
    socket.on('playerAction', (action) => {
        // Store the client's published state and rebroadcast to everyone
        gameState.updatePlayer(socket.id, action.state);

        // Broadcast the updated game state to all connected clients
        io.emit('gameStateUpdate', gameState.getState());
    });

    // Relay a landed hit to the client that owns the target fighter
    socket.on('attackHit', ({ targetId, hit }) => {
        io.to(targetId).emit('hitReceived', hit);
    });

    // Relay cosmetic effects (projectiles, smoke) to everyone else
    socket.on('effect', (effect) => {
        socket.broadcast.emit('effect', effect);
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);

        // Remove the player from the game state
        gameState.removePlayer(socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});