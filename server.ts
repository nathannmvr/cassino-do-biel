import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { Server } from 'socket.io';
import * as fs from 'fs'; // Importando File System
import * as path from 'path';
import { User, Match, ClientToServerEvents, ServerToClientEvents } from './types';

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = 3000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Caminho do arquivo de banco de dados
const DB_PATH = path.join(process.cwd(), 'database.json');

// --- ESTADO (EM MEMÓRIA) ---
let users: Record<string, User> = {};
const matches: Record<string, Match> = {};
const socketToToken: Record<string, string> = {}; 
const pendingChallenges: Record<string, string> = {};
let matchIdCounter = 1;

// --- FUNÇÕES DE PERSISTÊNCIA ---

// 1. Salvar no arquivo
const saveData = () => {
  try {
    // Salvamos apenas os USUÁRIOS (Pontos e Nomes). 
    // Não salvamos partidas ativas porque os sockets morrem quando o servidor cai.
    const dataStr = JSON.stringify(users, null, 2);
    fs.writeFileSync(DB_PATH, dataStr);
  } catch (error) {
    console.error('Erro ao salvar banco de dados:', error);
  }
};

// 2. Carregar do arquivo
const loadData = () => {
  try {
    if (fs.existsSync(DB_PATH)) {
      const fileData = fs.readFileSync(DB_PATH, 'utf-8');
      const loadedUsers: Record<string, User> = JSON.parse(fileData);
      
      // Sanitização: Resetar status para 'idle'
      // Se o servidor caiu no meio de um jogo, o user não pode voltar "jogando" sem oponente
      for (const key in loadedUsers) {
        loadedUsers[key].status = 'idle';
        // O socketId antigo não serve mais, limpa ou deixa como está (será atualizado no login)
        loadedUsers[key].socketId = ''; 
      }
      
      users = loadedUsers;
      console.log('> Dados recuperados do arquivo database.json');
    }
  } catch (error) {
    console.error('Erro ao carregar banco de dados:', error);
    users = {};
  }
};

app.prepare().then(() => {
  // CARREGAR DADOS AO INICIAR
  loadData();

  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer);

  const broadcastUpdate = () => {
    const userList = Object.values(users).map(u => ({...u}));
    const matchList = Object.values(matches);
    io.emit('update_data', { users: userList, matches: matchList });
  };

  io.on('connection', (socket) => {
    
    // ADMIN LOGIN
    socket.on('admin_login', () => {
        broadcastUpdate(); 
    });

    // ADMIN UPDATE SCORE (Salvar após alterar)
    socket.on('admin_update_score', ({ userId, amount }) => {
        const user = users[userId];
        if (user) {
            user.score += amount;
            
            saveData(); // <--- PERSISTIR

            io.to(user.socketId).emit('session_data', user);
            broadcastUpdate();
        }
    });

    // ADMIN FINISH GAME (Salvar após resultado)
    socket.on('finish_game', ({ matchId, winnerId }) => {
        const match = matches[matchId];
        if(!match) return;
  
        const loserId = winnerId === match.player1.id ? match.player2.id : match.player1.id;
  
        if(users[winnerId]) {
          users[winnerId].score += (match.pot / 2); 
          users[winnerId].status = 'idle';
        }
        if(users[loserId]) {
          users[loserId].score -= (match.pot / 2);
          users[loserId].status = 'idle';
        }
  
        saveData(); // <--- PERSISTIR

        if(users[match.player1.id])
          io.to(users[match.player1.id].socketId).emit('game_over', { winnerId, newScore: users[match.player1.id].score });
        
        if(users[match.player2.id])
          io.to(users[match.player2.id].socketId).emit('game_over', { winnerId, newScore: users[match.player2.id].score });
  
        delete matches[matchId];
        broadcastUpdate();
      });

    // LOGIN (Salvar novo usuário ou atualização de nome)
    socket.on('login', ({ name, token }) => {
      socketToToken[socket.id] = token;

      if (users[token]) {
        users[token].socketId = socket.id;
        users[token].name = name; 
        if (users[token].status !== 'playing') {
            users[token].status = 'idle'; 
        }
      } else {
        // Novo Usuário
        users[token] = {
          id: token,
          socketId: socket.id,
          name: name,
          score: 1000,
          status: 'idle'
        };
      }
      
      saveData(); // <--- PERSISTIR (Para salvar novos usuários)

      socket.emit('session_data', users[token]);
      broadcastUpdate();
    });

    // FIND MATCH
    socket.on('find_match', (betAmount) => {
      const token = socketToToken[socket.id];
      const player = users[token];
      
      if (!player) return;
      if (player.score < betAmount) {
        socket.emit('error', 'Saldo insuficiente.');
        return;
      }

      const potentialOpponents = Object.values(users).filter(u => 
        u.id !== player.id && 
        u.status === 'idle' && 
        u.score >= betAmount
      );

      if (potentialOpponents.length > 0) {
        const opponent = potentialOpponents[Math.floor(Math.random() * potentialOpponents.length)];
        
        player.status = 'challenging';
        player.bet = betAmount;
        opponent.status = 'challenged';
        
        pendingChallenges[opponent.id] = player.id;

        io.to(opponent.socketId).emit('incoming_challenge', {
            challengerName: player.name,
            bet: betAmount
        });

        socket.emit('waiting', `Desafiando ${opponent.name}... Aguardando resposta.`);
        broadcastUpdate();
      } else {
        socket.emit('error', 'Nenhum jogador disponível com saldo suficiente no momento.');
      }
    });

    // ANSWER CHALLENGE
    socket.on('answer_challenge', (accepted) => {
        const challengedToken = socketToToken[socket.id];
        const challengerToken = pendingChallenges[challengedToken];
        
        const challenged = users[challengedToken];
        const challenger = users[challengerToken];

        if (!challenger || !challenged) {
            if(challenged) challenged.status = 'idle';
            return;
        }

        if (accepted) {
            const matchId = `match_${matchIdCounter++}`;
            challenger.status = 'playing';
            challenged.status = 'playing';

            matches[matchId] = {
                id: matchId,
                player1: { id: challenger.id, name: challenger.name },
                player2: { id: challenged.id, name: challenged.name },
                pot: (challenger.bet || 0) * 2
            };

            io.to(challenger.socketId).emit('match_found', matches[matchId]);
            io.to(challenged.socketId).emit('match_found', matches[matchId]);

        } else {
            challenger.status = 'idle';
            challenged.status = 'idle';
            io.to(challenger.socketId).emit('challenge_declined');
            io.to(challenger.socketId).emit('error', `${challenged.name} recusou o duelo.`);
        }

        delete pendingChallenges[challengedToken];
        delete challenger.bet;
        broadcastUpdate();
    });

    socket.on('disconnect', () => {
      delete socketToToken[socket.id];
    });
  });

  httpServer.listen(port, () => {
    console.log(`> Servidor Cassino rodando em http://${hostname}:${port}`);
    console.log(`> Persistência de dados ativa: ${DB_PATH}`);
  });
});