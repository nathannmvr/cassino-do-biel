'use client';

import { io, Socket } from 'socket.io-client';
import { ServerToClientEvents, ClientToServerEvents } from '../types';

// Tipagem estrita no cliente também!
export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io({
    autoConnect: false,
});