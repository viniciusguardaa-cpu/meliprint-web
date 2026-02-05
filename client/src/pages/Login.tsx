import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function Login() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const error = searchParams.get('error');

  useEffect(() => {
    if (user && !loading) {
      navigate('/dashboard');
    }
  }, [user, loading, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#4F8CFF] via-[#2F6FED] to-[#255EDB] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-12">
          <div className="mb-8">
            <img src="/logo.png" alt="Printly Logo" className="h-32 w-auto" />
          </div>
          <p className="text-white text-lg mt-2 text-center font-medium">
            Impressão rápida de etiquetas do Mercado Livre
          </p>
        </div>

        {error && (
          <div className="bg-red-500/20 backdrop-blur-sm border border-red-300/50 text-white px-4 py-3 rounded-lg mb-6">
            Erro na autenticação. Tente novamente.
          </div>
        )}

        <button
          onClick={login}
          disabled={loading}
          className="w-full bg-white hover:bg-white/90 text-[#2F6FED] font-semibold py-4 px-6 rounded-xl transition-colors duration-200 flex items-center justify-center gap-3 disabled:opacity-50 shadow-lg"
        >
          {loading ? (
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-[#2F6FED]"></div>
          ) : (
            <>
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
              </svg>
              Entrar com Mercado Livre
            </>
          )}
        </button>

        <p className="text-center text-white/80 text-sm mt-6">
          Acesse sua conta do Mercado Livre para começar a imprimir etiquetas
        </p>
      </div>
    </div>
  );
}
