'use client';

import { io } from 'socket.io-client';

export const socket = io({
  autoConnect: false, // Conecta manualmente para evitar conexões duplas no React Strict Mode
});