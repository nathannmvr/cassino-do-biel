'use client';

import { useState, useEffect } from 'react';
import { socket } from '@/lib/socket';
import { User, Match } from '@/types';

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const [users, setUsers] = useState<User[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);

  useEffect(() => {
    if (isAuthenticated) {
        if (!socket.connected) socket.connect();
        socket.emit('admin_login');

        socket.on('update_data', ({ users: u, matches: m }: { users: Record<string, User>; matches: Record<string, Match> }) => {
            setUsers(Object.values(u).sort((a: User, b: User) => b.score - a.score));
            setMatches(Object.values(m));
        });

        return () => {
            socket.off('update_data');
        }
    }
  }, [isAuthenticated]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (username === 'admin' && password === 'admin') {
        setIsAuthenticated(true);
    } else {
        setErrorMsg('Credenciais inválidas');
    }
  };

  const forceWinner = (matchId: string, winnerId: string) => {
    socket.emit('finish_game', { matchId, winnerId });
  };

  // NOVA FUNÇÃO: Manipula a adição de pontos
  const handleAddPoints = (userId: string, currentName: string) => {
    const input = prompt(`Alterar saldo de ${currentName}.\nDigite o valor a ADICIONAR (use negativo para remover):`, "1000");
    
    if (input) {
        const amount = parseInt(input);
        if (!isNaN(amount)) {
            socket.emit('admin_update_score', { userId, amount });
        } else {
            alert("Valor inválido.");
        }
    }
  };

  if (!isAuthenticated) {
    return (
        <div className="min-h-screen bg-black flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-zinc-900 border border-red-800 p-8 rounded-lg shadow-lg shadow-red-900/20">
                <h1 className="text-3xl text-red-600 font-bold mb-6 text-center tracking-widest">AREA RESTRITA</h1>
                <form onSubmit={handleLogin} className="flex flex-col gap-4">
                    <input 
                        className="p-3 bg-black border border-yellow-600 text-yellow-500 rounded focus:outline-none"
                        placeholder="Usuário"
                        value={username}
                        onChange={e => setUsername(e.target.value)}
                    />
                    <input 
                        className="p-3 bg-black border border-yellow-600 text-yellow-500 rounded focus:outline-none"
                        type="password"
                        placeholder="Senha"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                    />
                    {errorMsg && <p className="text-red-500 text-sm text-center">{errorMsg}</p>}
                    <button className="bg-red-700 text-white font-bold py-3 rounded hover:bg-red-600 transition-colors">
                        ACESSAR SISTEMA
                    </button>
                </form>
            </div>
        </div>
    );
  }

  return (
    <div className="min-h-screen p-8 bg-black text-white font-mono">
      <div className="flex justify-between items-center mb-8 border-b border-gray-800 pb-4">
          <h1 className="text-3xl text-red-600 font-bold">
            ÁREA DO ADMIN- CASSINO DO BIEL
          </h1>
          <button onClick={() => setIsAuthenticated(false)} className="text-gray-500 text-sm hover:text-white">SAIR</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* COLUNA 1: JOGOS ATIVOS */}
        <div className="border border-red-800 rounded p-6 bg-zinc-900/50 h-fit">
          <h2 className="text-xl text-red-500 mb-6 font-bold flex items-center gap-2">
            <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></span>
            CONFRONTOS EM ANDAMENTO
          </h2>
          
          {matches.length === 0 ? (
            <p className="text-gray-500 italic">Nenhum confronto ativo no momento.</p>
          ) : (
            <div className="space-y-6">
              {matches.map(m => (
                <div key={m.id} className="bg-black border border-yellow-600/50 p-4 rounded-lg">
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-yellow-500 font-bold text-lg animate-pulse border border-yellow-500 px-2 rounded">${m.pot}</span>
                    <span className="text-xs text-gray-500">ID: {m.id}</span>
                  </div>
                  
                  <div className="flex gap-4 items-center justify-between">
                    <div className="flex-1 flex flex-col gap-2">
                        <div className="text-center font-bold text-white">{m.player1.name}</div>
                        <button 
                            onClick={() => forceWinner(m.id, m.player1.id)}
                            className="bg-green-700 hover:bg-green-600 text-white py-2 px-4 rounded text-xs font-bold transition-all border border-green-500"
                        >
                            VENCEDOR
                        </button>
                    </div>

                    <div className="text-red-500 font-bold text-xl">X</div>

                    <div className="flex-1 flex flex-col gap-2">
                        <div className="text-center font-bold text-white">{m.player2.name}</div>
                        <button 
                            onClick={() => forceWinner(m.id, m.player2.id)}
                            className="bg-green-700 hover:bg-green-600 text-white py-2 px-4 rounded text-xs font-bold transition-all border border-green-500"
                        >
                            VENCEDOR
                        </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* COLUNA 2: RANKING GERAL E EDIÇÃO DE PONTOS */}
        <div className="border border-yellow-600/30 rounded p-6 bg-zinc-900/50">
          <h2 className="text-xl text-yellow-500 mb-6 font-bold flex items-center gap-2">
             <span>💰</span> GERENCIAR JOGADORES
          </h2>
          <div className="overflow-auto max-h-[600px] custom-scrollbar">
            <table className="w-full text-left text-sm">
                <thead className="text-gray-500 border-b border-gray-700 sticky top-0 bg-zinc-900 z-10">
                <tr>
                    <th className="pb-3 pl-2">Nome</th>
                    <th className="pb-3">Saldo</th>
                    <th className="pb-3 text-center">Ação</th>
                </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                {users.map(u => (
                    <tr key={u.id} className="hover:bg-white/5 transition-colors group">
                        <td className="py-3 pl-2 font-bold text-gray-200">
                            {u.name}
                            <span className="block text-[9px] text-gray-600 font-normal">{u.status}</span>
                        </td>
                        <td className="py-3 text-green-400 font-mono text-lg">${u.score}</td>
                        <td className="py-3 text-center">
                            {/* Botão para adicionar pontos */}
                            <button 
                                onClick={() => handleAddPoints(u.id, u.name)}
                                className="bg-yellow-600/20 text-yellow-500 hover:bg-yellow-500 hover:text-black border border-yellow-600 rounded px-3 py-1 text-xs font-bold transition-all"
                                title="Alterar Saldo"
                            >
                                $ EDITAR
                            </button>
                        </td>
                    </tr>
                ))}
                </tbody>
            </table>
            {users.length === 0 && <p className="text-center text-gray-500 py-4">Nenhum jogador online.</p>}
          </div>
        </div>

      </div>
    </div>
  );
}