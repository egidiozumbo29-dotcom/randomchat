import { useNavigate } from 'react-router-dom';
import { MessageCircle, Shield, Zap, Users } from 'lucide-react';
import AdSlot from '../components/AdSlot';

const Home = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col bg-dark-900">
      {/* Navbar */}
      <nav className="border-b border-dark-700 bg-dark-800/50 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-primary to-brand-secondary flex items-center justify-center">
              <MessageCircle size={18} className="text-white" />
            </div>
            <span className="font-bold text-xl text-white">RandomChat</span>
          </div>
          <button
            onClick={() => navigate('/admin')}
            className="text-sm text-gray-400 hover:text-white transition flex items-center gap-1"
          >
            <Shield size={16} />
            Admin
          </button>
        </div>
      </nav>

      {/* Hero Ad Banner */}
      <div className="max-w-6xl mx-auto px-4 w-full mt-6">
        <AdSlot label="Banner Ad - Homepage Top" className="w-full" />
      </div>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        <div className="text-center max-w-2xl">
          <h1 className="text-4xl md:text-6xl font-bold text-white mb-4 leading-tight">
            Chat anonima con chiunque, <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-primary to-brand-accent">ovunque</span>
          </h1>
          <p className="text-gray-400 text-lg mb-8">
            Incontra persone da tutto il mondo in modo sicuro. Moderazione automatica, nessuna registrazione.
          </p>
          <button
            onClick={() => navigate('/chat')}
            className="px-8 py-4 bg-gradient-to-r from-brand-primary to-brand-secondary hover:from-indigo-500 hover:to-violet-500 text-white font-semibold rounded-xl text-lg shadow-lg shadow-brand-primary/20 transition transform hover:scale-105"
          >
            Inizia a Chattare
          </button>
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl w-full mt-16">
          <div className="bg-dark-800 border border-dark-700 rounded-xl p-6 text-center">
            <div className="w-10 h-10 rounded-lg bg-brand-primary/10 flex items-center justify-center mx-auto mb-3">
              <Zap size={20} className="text-brand-primary" />
            </div>
            <h3 className="font-semibold text-white mb-1">Istantanea</h3>
            <p className="text-sm text-gray-400">Connessione immediata con utenti online</p>
          </div>
          <div className="bg-dark-800 border border-dark-700 rounded-xl p-6 text-center">
            <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center mx-auto mb-3">
              <Shield size={20} className="text-green-400" />
            </div>
            <h3 className="font-semibold text-white mb-1">Sicura</h3>
            <p className="text-sm text-gray-400">Filtro moderazione automatico e report utenti</p>
          </div>
          <div className="bg-dark-800 border border-dark-700 rounded-xl p-6 text-center">
            <div className="w-10 h-10 rounded-lg bg-brand-accent/10 flex items-center justify-center mx-auto mb-3">
              <Users size={20} className="text-brand-accent" />
            </div>
            <h3 className="font-semibold text-white mb-1">Anonima</h3>
            <p className="text-sm text-gray-400">Nessuna registrazione, nessun dato personale</p>
          </div>
        </div>
      </main>

      {/* Footer Ad */}
      <div className="max-w-6xl mx-auto px-4 w-full mb-8">
        <AdSlot label="Banner Ad - Homepage Bottom" className="w-full" />
      </div>

      {/* Footer */}
      <footer className="border-t border-dark-700 py-6 text-center text-sm text-gray-500">
        RandomChat MVP - Progetto educativo
      </footer>
    </div>
  );
};

export default Home;
