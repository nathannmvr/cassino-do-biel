'use client';

import { useState, useEffect } from 'react';
import { socket } from '@/lib/socket';
import { Match, User, ChallengeRequest } from '@/types';

type ViewState = 'login' | 'lobby' | 'playing';

// Função para gerar um ID único para o navegador
const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export default function Home() {
  const [view, setView] = useState<ViewState>('login'); 
  const [name, setName] = useState<string>('');
  const [myId, setMyId] = useState<string>(''); 
  const [score, setScore] = useState<number>(0);
  const [bet, setBet] = useState<number>(100);
  const [statusMsg, setStatusMsg] = useState<string>('');
  const [matchData, setMatchData] = useState<Match | null>(null);
  const [ranking, setRanking] = useState<User[]>([]);

  // Estado para o modal de desafio recebido
  const [challenge, setChallenge] = useState<ChallengeRequest | null>(null);

  useEffect(() => {
    if (!socket.connected) socket.connect();

    // Tenta recuperar sessão salva no navegador
    const savedName = localStorage.getItem('casino_name');
    const savedToken = localStorage.getItem('casino_token');

    if (savedName && savedToken) {
      setName(savedName);
      setMyId(savedToken);
      // Login automático
      socket.emit('login', { name: savedName, token: savedToken });
    }

    // --- Listeners do Socket ---

    socket.on('session_data', (data: { score: number; id: string; status: string }) => {
      setScore(data.score);
      setMyId(data.id);
      // Se não estiver em jogo, vai pro lobby
      if(data.status !== 'playing') {
          setView('lobby');
      }
    });

    socket.on('update_data', ({ users }: { users: Record<string, User> }) => {
      // Ordena usuários por pontuação
      const sortedUsers = Object.values(users).sort((a: User, b: User) => b.score - a.score);
      setRanking(sortedUsers);
    });

    // Recebe convite de outro jogador
    socket.on('incoming_challenge', (req: ChallengeRequest) => {
        setChallenge(req); 
    });

    socket.on('challenge_declined', () => {
        setStatusMsg('O oponente recusou o desafio.');
        setTimeout(() => setStatusMsg(''), 3000);
    });

    socket.on('waiting', (msg: string) => setStatusMsg(msg));
    
    socket.on('error', (msg: string) => {
        alert(msg);
        setStatusMsg('');
    });

    // Partida iniciada (Aceite confirmado)
    socket.on('match_found', (match: Match) => {
      setMatchData(match);
      setChallenge(null);
      setView('playing');
      setStatusMsg('');
    });

    // Fim de jogo (decidido pelo Admin)
    socket.on('game_over', (result: { newScore: number; winnerId: string }) => {
       setScore(result.newScore);
       alert(result.winnerId === myId ? "💰 VITÓRIA! O Dealer pagou sua aposta." : "💸 DERROTA! A casa (ou o oponente) venceu.");
       setView('lobby');
       setMatchData(null);
    });

    return () => {
      socket.off('session_data');
      socket.off('update_data');
      socket.off('match_found');
      socket.off('game_over');
      socket.off('waiting');
      socket.off('error');
      socket.off('incoming_challenge');
      socket.off('challenge_declined');
    };
  }, [myId]); // Dependência myId para verificar vencedor corretamente

  const handleLogin = () => {
    if (!name) return;
    
    // Gera token se não existir
    let token = localStorage.getItem('casino_token');
    if (!token) {
        token = generateUUID();
        localStorage.setItem('casino_token', token);
    }
    localStorage.setItem('casino_name', name);
    
    setMyId(token);
    socket.emit('login', { name, token });
  };

  const findMatch = () => {
    setStatusMsg('Buscando oponente disponível...');
    socket.emit('find_match', bet);
  };

  const respondChallenge = (accepted: boolean) => {
    socket.emit('answer_challenge', accepted);
    setChallenge(null); 
  };

  return (
    <div className="min-h-screen p-4 md:p-8 bg-background flex flex-col md:flex-row gap-6 relative">
      
      {/* --- MODAL DE DESAFIO (POPUP) --- */}
      {challenge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm px-4">
            <div className="bg-casino-dark border-2 border-casino-gold p-8 rounded-xl max-w-sm w-full text-center shadow-[0_0_50px_rgba(255,215,0,0.4)] animate-bounce-in">
                <h3 className="text-2xl text-casino-gold font-bold mb-4 uppercase tracking-widest">Desafio!</h3>
                <p className="text-gray-300 mb-8 text-lg">
                    <span className="text-red-500 font-bold">{challenge.challengerName}</span> quer apostar <span className="text-yellow-400 font-mono font-bold">${challenge.bet}</span> contra você.
                </p>
                <div className="flex gap-4">
                    <button 
                        onClick={() => respondChallenge(false)}
                        className="flex-1 py-3 rounded bg-neutral-800 text-gray-300 hover:bg-neutral-700 font-bold border border-gray-600 transition-colors"
                    >
                        CORRER
                    </button>
                    <button 
                        onClick={() => respondChallenge(true)}
                        className="flex-1 py-3 rounded bg-red-700 text-white hover:bg-red-600 font-bold border border-red-500 shadow-lg shadow-red-900/50 transition-transform hover:scale-105"
                    >
                        ACEITAR
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* --- ÁREA PRINCIPAL (ESQUERDA) --- */}
      <div className="flex-1 flex flex-col items-center justify-center border-r-0 md:border-r border-gray-800 pr-0 md:pr-6">
        <h1 className="text-4xl md:text-5xl font-bold tracking-widest text-casino-gold border-b-4 border-casino-red pb-2 mb-10 text-center">
          CASSINO DO BIEL
        </h1>

        {view === 'login' && (
          <div className="w-full max-w-sm flex flex-col gap-4 border border-casino-gold p-8 rounded-xl bg-casino-dark shadow-[0_0_20px_rgba(255,215,0,0.2)]">
            <label className="text-gray-400 text-sm font-bold uppercase">Nome do Jogador</label>
            <input 
              className="input-cassino"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Digite seu nome..."
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            />
            <button onClick={handleLogin} className="btn-gold mt-4 py-3">ENTRAR NO SALÃO</button>
          </div>
        )}

        {view === 'lobby' && (
          <div className="w-full max-w-sm flex flex-col gap-6 text-center border border-casino-gold p-8 rounded-xl bg-casino-dark shadow-xl">
            <div className="flex justify-between items-center border-b border-gray-700 pb-4">
              <span className="text-gray-400 text-sm">PERFIL</span>
              <span className="text-xl font-bold text-white">{name}</span>
            </div>
            
            <div className="bg-black border border-red-900 p-6 rounded relative overflow-hidden">
              <div className="absolute top-0 right-0 w-16 h-16 bg-red-600 blur-[40px] opacity-20"></div>
              <p className="text-red-500 text-xs font-bold uppercase tracking-widest mb-1">Seu Saldo</p>
              <p className="text-5xl text-casino-gold font-mono">${score}</p>
            </div>

            <div className="text-left bg-neutral-900/50 p-4 rounded border border-gray-800">
              <label className="text-xs text-gray-500 uppercase font-bold mb-2 block">Quanto quer apostar?</label>
              <div className="flex items-center gap-2">
                <span className="text-casino-gold text-xl font-bold">$</span>
                <input 
                  type="number" 
                  className="bg-transparent text-white text-2xl font-bold w-full focus:outline-none"
                  value={bet}
                  onChange={(e) => setBet(Number(e.target.value))}
                />
              </div>
            </div>

            <button 
                onClick={findMatch} 
                disabled={!!statusMsg}
                className={`btn-red w-full py-4 text-lg shadow-[0_0_15px_rgba(139,0,0,0.4)] uppercase tracking-wider ${statusMsg ? 'opacity-50 cursor-not-allowed' : 'hover:brightness-110'}`}
            >
                {statusMsg ? (
                    <span className="animate-pulse">{statusMsg}</span>
                ) : (
                    "DESAFIAR ALGUÉM"
                )}
            </button>
          </div>
        )}

        {view === 'playing' && matchData && (
          <div className="w-full max-w-lg border-2 border-red-600 p-8 rounded-xl bg-black text-center relative overflow-hidden shadow-[0_0_30px_rgba(139,0,0,0.3)]">
            <div className="absolute top-0 left-0 w-full h-1 bg-red-600 animate-pulse"></div>
            
            <h2 className="text-2xl md:text-3xl text-red-500 font-bold mb-8 tracking-widest">DUELO EM ANDAMENTO</h2>

            <div className="flex justify-between items-center mb-10 px-2 md:px-4">
              <div className="text-left flex flex-col items-start">
                <span className="text-[10px] text-gray-500 uppercase bg-gray-900 px-2 py-1 rounded mb-1">VOCÊ</span>
                <p className="text-lg md:text-2xl text-casino-gold font-bold truncate max-w-[120px]">{name}</p>
              </div>
              
              <div className="text-2xl font-black text-white bg-red-900/20 rounded-full w-12 h-12 flex items-center justify-center border border-red-900">X</div>
              
              <div className="text-right flex flex-col items-end">
                <span className="text-[10px] text-gray-500 uppercase bg-gray-900 px-2 py-1 rounded mb-1">OPONENTE</span>
                <p className="text-lg md:text-2xl text-casino-gold font-bold truncate max-w-[120px]">
                  {matchData.player1.id === myId ? matchData.player2.name : matchData.player1.name}
                </p>
              </div>
            </div>

            <div className="bg-gradient-to-b from-red-900/20 to-black p-6 rounded mb-8 border border-red-800">
              <p className="text-xs uppercase tracking-widest mb-1 text-red-400">Pote na Mesa</p>
              <p className="text-5xl md:text-6xl font-mono text-white drop-shadow-[0_0_10px_rgba(255,0,0,0.5)]">${matchData.pot}</p>
            </div>

            {/* ÁREA DE ESPERA DO ADMIN */}
            <div className="border border-yellow-600/30 p-4 rounded bg-yellow-500/5 animate-pulse">
                <p className="text-yellow-500 font-bold tracking-widest text-sm md:text-base">
                    AGUARDANDO O DEALER...
                </p>
                <p className="text-xs text-gray-500 mt-2">
                    O administrador está auditando o resultado. Não feche a janela.
                </p>
            </div>
            
          </div>
        )}
      </div>

      {/* --- SIDEBAR RANKING (DIREITA) --- */}
      <div className="w-full md:w-80 flex flex-col gap-4 mt-8 md:mt-0">
        <div className="border border-casino-gold bg-casino-dark rounded-lg p-4 h-full max-h-[600px] overflow-hidden flex flex-col shadow-lg">
          <h3 className="text-xl font-bold text-center mb-4 text-casino-gold border-b border-gray-700 pb-2 flex items-center justify-center gap-2">
            <span>🏆</span> RANKING
          </h3>
          
          <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
            {ranking.map((u, index) => (
              <div 
                // CHAVE ÚNICA CORRIGIDA
                key={`${u.id}-${index}`} 
                className={`flex justify-between items-center p-3 rounded border transition-colors ${
                    u.id === myId 
                    ? 'border-yellow-500 bg-yellow-500/10' 
                    : 'border-gray-800 bg-black/40 hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={`font-mono font-bold w-6 text-center text-lg ${
                      index === 0 ? 'text-yellow-400' : 
                      index === 1 ? 'text-gray-300' : 
                      index === 2 ? 'text-orange-600' : 'text-gray-600'
                  }`}>
                    #{index + 1}
                  </span>
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-gray-200 truncate max-w-[100px]">{u.name}</span>
                    {/* Indicador de Status Visual */}
                    <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded w-fit ${
                        u.status === 'idle' ? 'text-green-500 bg-green-900/20' : 
                        u.status === 'playing' ? 'text-red-500 bg-red-900/20' :
                        'text-yellow-500 bg-yellow-900/20'
                    }`}>
                        {u.status === 'idle' ? 'Livre' : u.status === 'playing' ? 'Jogando' : 'Ocupado'}
                    </span>
                  </div>
                </div>
                <span className="text-green-400 font-bold text-sm font-mono">${u.score}</span>
              </div>
            ))}

            {ranking.length === 0 && (
                <div className="text-center py-10 text-gray-600 italic text-sm">
                    Nenhum jogador online
                </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}