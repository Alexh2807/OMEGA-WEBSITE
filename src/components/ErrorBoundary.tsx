import React, { Component, ErrorInfo, ReactNode } from 'react';

/**
 * Filet de sécurité autour des pages.
 *
 * ## Trois défauts corrigés
 *
 * 1. **UNE erreur figeait TOUT LE SITE.** La barrière était montée une seule fois autour
 *    des routes, sans clé ni réinitialisation : une fois `hasError` levé, elle affichait
 *    l'écran d'erreur quoi qu'il arrive. Le client changeait de page — l'URL changeait,
 *    le contenu non. Le seul recours était de recharger. On lui passe désormais
 *    `resetKey={location.pathname}` : changer de page remet la barrière à zéro.
 *
 * 2. **« Réessayer » ne réessayait rien.** Il effaçait l'état d'erreur, React remontait
 *    la même page cassée, qui relevait la même erreur. Le bouton ramène maintenant à
 *    l'accueil (`onRetour`), c'est-à-dire à un endroit dont on sait qu'il fonctionne.
 *
 * 3. **Le client lisait la pile React.** `error.toString()` et `componentStack` étaient
 *    affichés en clair : des noms de composants et de fichiers internes, incompréhensibles
 *    pour un client et inutilement bavards sur l'architecture du site. Le détail va
 *    maintenant dans la console (où le développeur le lit), et n'apparaît à l'écran qu'en
 *    développement.
 */

interface Props {
  children: ReactNode;
  /** Change de valeur ⇒ la barrière se réarme (typiquement `location.pathname`). */
  resetKey?: string;
  /** Action du bouton « Retour à l'accueil » — la navigation appartient à l'appelant. */
  onRetour?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // La trace complète reste disponible — dans la console, pas sous les yeux du client.
    console.error('ErrorBoundary a intercepté une erreur :', error, errorInfo);
    this.setState({
      error,
      errorInfo,
    });
  }

  componentDidUpdate(prevProps: Props) {
    /* Le client a navigué : la page suivante n'a aucune raison d'hériter de l'erreur de
       la précédente. Sans ceci, une erreur sur /panier rendait /produits, /contact et
       l'accueil tout aussi inaccessibles. */
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null, errorInfo: null });
    }
  }

  private reinitialiser = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-black flex items-center justify-center p-4">
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-6 sm:p-8 border border-red-500/30 max-w-2xl w-full">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 shrink-0 rounded-full bg-red-500/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl font-bold text-white">Cette page n'a pas pu s'afficher</h1>
                <p className="text-gray-400">Un incident technique est survenu de notre côté.</p>
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-lg p-4 mb-6">
              <p className="text-gray-300 text-sm leading-relaxed">
                Rien n'est perdu : votre panier et votre compte sont intacts. Rechargez la
                page, ou revenez à l'accueil. Si l'incident se répète, écrivez-nous depuis
                la page Contact en précisant ce que vous faisiez — nous corrigerons.
              </p>
            </div>

            {/* Le détail technique n'est montré QU'EN DÉVELOPPEMENT : en production il
                n'aide pas le client et expose l'organisation interne du site. */}
            {import.meta.env.DEV && this.state.error && (
              <details className="bg-white/5 rounded-lg p-4 mb-6">
                <summary className="text-white cursor-pointer font-semibold mb-2">
                  Détails techniques (développement uniquement)
                </summary>
                <pre className="text-gray-400 text-xs overflow-auto max-h-64 font-mono whitespace-pre-wrap">
                  {this.state.error.message}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}

            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={() => window.location.reload()}
                className="flex-1 bg-gradient-to-r from-blue-500 to-blue-600 text-white py-3 rounded-lg font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300"
              >
                Recharger la page
              </button>
              <button
                onClick={() => {
                  /* On efface l'erreur PUIS on navigue : dans l'autre ordre, la barrière
                     resterait levée et l'accueil s'afficherait… en écran d'erreur. */
                  this.reinitialiser();
                  if (this.props.onRetour) this.props.onRetour();
                  else window.location.href = '/';
                }}
                className="flex-1 bg-white/10 text-white py-3 rounded-lg font-semibold hover:bg-white/20 transition-all duration-300"
              >
                Retour à l'accueil
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
