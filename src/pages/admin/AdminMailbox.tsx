import React, { useState, useEffect } from 'react';
import { Mail, RefreshCw, Send, ArrowLeft, Paperclip, Loader2, PenSquare } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';

/**
 * Messagerie OMEGA — la boîte contact@omegasud.fr, dans le back-office.
 *
 * Comble un angle mort : les demandes passées par le formulaire du site arrivent dans
 * l'onglet « Messages », mais un client qui écrit directement à contact@omegasud.fr —
 * ou qui répond à une notification — n'apparaissait nulle part ici.
 *
 * Rien ne se fait dans le navigateur : IMAP et SMTP tournent dans la fonction Netlify
 * `mailbox`, qui exige le jeton de l'administrateur connecté. Les identifiants de la
 * boîte ne quittent jamais le serveur.
 */

interface Entete {
  uid: number;
  objet: string;
  de: { nom?: string; adresse?: string } | null;
  a?: { nom?: string; adresse?: string } | null;
  date: string | null;
  lu: boolean;
}

interface LigneJournal {
  id: string;
  created_at: string;
  evenement: string;
  destinataire: string;
  objet: string | null;
  statut: 'envoye' | 'echec';
  erreur: string | null;
  origine: 'auto' | 'manuel';
}

/** Les trois vues. « Journal » n'est pas un dossier IMAP : voir plus bas. */
type Vue = 'reception' | 'envoyes' | 'journal';

interface Message extends Entete {
  texte: string;
  html: string | null;
  messageId: string | null;
  piecesJointes: { nom?: string; type?: string; taille?: number }[];
}

const AdminMailbox = () => {
  const [messages, setMessages] = useState<Entete[]>([]);
  const [ouvert, setOuvert] = useState<Message | null>(null);
  const [chargement, setChargement] = useState(true);
  const [ouverture, setOuverture] = useState(false);
  const [reponse, setReponse] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [nonConfigure, setNonConfigure] = useState(false);
  // Rédaction d'un message neuf. `null` = on n'est pas en train d'en écrire un.
  const [redaction, setRedaction] = useState<{
    a: string;
    objet: string;
    corps: string;
  } | null>(null);
  const [vue, setVue] = useState<Vue>('reception');
  // Chemin réel du dossier « Envoyés » : son nom varie selon l'hébergeur, on le lit
  // au lieu de le deviner.
  const [cheminEnvoyes, setCheminEnvoyes] = useState<string | null>(null);
  const [journal, setJournal] = useState<LigneJournal[]>([]);

  const appeler = async (corps: Record<string, unknown>) => {
    const { data } = await supabase.auth.getSession();
    const jeton = data.session?.access_token;
    if (!jeton) throw new Error('Session expirée, reconnectez-vous');

    const r = await fetch('/.netlify/functions/mailbox', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jeton}`,
      },
      body: JSON.stringify(corps),
    });
    const reponse = await r.json();
    if (!r.ok) throw new Error(reponse?.error || `Erreur ${r.status}`);
    return reponse;
  };

  const charger = async () => {
    setChargement(true);
    try {
      // Le journal vit en base, pas dans la boîte : aucun appel IMAP ici.
      if (vue === 'journal') {
        const { data, error } = await supabase
          .from('email_log')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100);
        if (error) throw error;
        setJournal((data as LigneJournal[]) ?? []);
        setNonConfigure(false);
        return;
      }

      let dossier = 'INBOX';
      if (vue === 'envoyes') {
        // Résolu une fois, puis mémorisé.
        let chemin = cheminEnvoyes;
        if (!chemin) {
          const d = await appeler({ action: 'dossiers' });
          if (d.configured === false) {
            setNonConfigure(true);
            return;
          }
          const trouve =
            d.dossiers?.find((x: any) => x.role === '\\Sent') ??
            d.dossiers?.find((x: any) => /sent|envoy/i.test(x.nom || x.chemin));
          chemin = trouve?.chemin ?? null;
          setCheminEnvoyes(chemin);
        }
        if (!chemin) {
          setMessages([]);
          toast.error("Aucun dossier « Envoyés » sur ce serveur");
          return;
        }
        dossier = chemin;
      }

      const r = await appeler({ action: 'lister', limite: 30, dossier });
      if (r.configured === false) {
        setNonConfigure(true);
        return;
      }
      setNonConfigure(false);
      setMessages(r.messages ?? []);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Messagerie inaccessible');
    } finally {
      setChargement(false);
    }
  };

  useEffect(() => {
    setOuvert(null);
    charger();
  }, [vue]);

  const ouvrir = async (uid: number) => {
    setOuverture(true);
    try {
      const m = await appeler({
        action: 'ouvrir',
        uid,
        // Sans le dossier, on relirait cet identifiant dans la boite de reception :
        // les UID sont propres a chaque dossier.
        dossier: vue === 'envoyes' ? cheminEnvoyes : 'INBOX',
      });
      setOuvert(m);
      setReponse('');
      // Le serveur vient de marquer le message comme lu : on reflète l'état ici plutôt
      // que de recharger toute la liste.
      setMessages(prec => prec.map(e => (e.uid === uid ? { ...e, lu: true } : e)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Message illisible');
    } finally {
      setOuverture(false);
    }
  };

  const envoyerReponse = async () => {
    if (!ouvert?.de?.adresse || !reponse.trim()) return;
    setEnvoi(true);
    try {
      await appeler({
        action: 'repondre',
        a: ouvert.de.adresse,
        objet: ouvert.objet,
        corps: reponse,
        messageId: ouvert.messageId,
      });
      toast.success('Réponse envoyée');
      setReponse('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "L'envoi a échoué");
    } finally {
      setEnvoi(false);
    }
  };

  const envoyerNouveau = async () => {
    if (!redaction?.a.trim() || !redaction.corps.trim()) return;
    setEnvoi(true);
    try {
      await appeler({
        action: 'envoyer',
        a: redaction.a,
        objet: redaction.objet,
        corps: redaction.corps,
      });
      toast.success('Message envoyé');
      setRedaction(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "L'envoi a échoué");
    } finally {
      setEnvoi(false);
    }
  };

  const dateCourte = (d: string | null) =>
    d ? new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '';

  const nomDe = (de: Entete['de']) => de?.nom || de?.adresse || 'Expéditeur inconnu';

  if (nonConfigure) {
    return (
      <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-8 border border-white/10">
        <div className="flex items-center gap-3 mb-4">
          <Mail className="text-blue-400" size={24} />
          <h2 className="text-2xl font-bold text-white">Messagerie</h2>
        </div>
        <p className="text-gray-400 mb-4">
          La messagerie n'est pas encore configurée. Ajoutez les variables{' '}
          <code className="bg-black/30 px-1 rounded">MAIL_USER</code> et{' '}
          <code className="bg-black/30 px-1 rounded">MAIL_PASS</code> dans Netlify
          (Site settings → Environment variables), puis redéployez.
        </p>
        <button
          onClick={charger}
          className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg"
        >
          Réessayer
        </button>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-8 border border-white/10">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Mail className="text-blue-400" size={24} />
          <h2 className="text-2xl font-bold text-white">
            {redaction ? 'Nouveau message' : ouvert ? 'Message' : 'Messagerie'}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {(ouvert || redaction) && (
            <button
              onClick={() => (redaction ? setRedaction(null) : setOuvert(null))}
              className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg transition-colors"
            >
              <ArrowLeft size={16} />
              Retour
            </button>
          )}
          {!redaction && !ouvert && (
            <>
              <button
                onClick={() => setRedaction({ a: '', objet: '', corps: '' })}
                className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all"
              >
                <PenSquare size={16} />
                Nouveau message
              </button>
              <button
                onClick={charger}
                disabled={chargement}
                className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-60"
              >
                <RefreshCw size={16} className={chargement ? 'animate-spin' : ''} />
                Actualiser
              </button>
            </>
          )}
        </div>
      </div>

      {/* Rédaction d'un message neuf */}
      {redaction && (
        <div className="space-y-4">
          <div>
            <label className="block text-gray-400 text-sm mb-1">Destinataire</label>
            <input
              type="email"
              value={redaction.a}
              onChange={e => setRedaction({ ...redaction, a: e.target.value })}
              placeholder="client@exemple.fr"
              className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50"
            />
          </div>
          <div>
            <label className="block text-gray-400 text-sm mb-1">Objet</label>
            <input
              type="text"
              value={redaction.objet}
              onChange={e => setRedaction({ ...redaction, objet: e.target.value })}
              placeholder="Objet du message"
              className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50"
            />
          </div>
          <div>
            <label className="block text-gray-400 text-sm mb-1">Message</label>
            <textarea
              value={redaction.corps}
              onChange={e => setRedaction({ ...redaction, corps: e.target.value })}
              rows={10}
              placeholder="Votre message…"
              className="w-full bg-black/30 border border-white/10 rounded-lg p-4 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={envoyerNouveau}
              disabled={envoi || !redaction.a.trim() || !redaction.corps.trim()}
              className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white px-5 py-2.5 rounded-lg font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all disabled:opacity-50"
            >
              <Send size={16} />
              {envoi ? 'Envoi…' : 'Envoyer'}
            </button>
            <span className="text-gray-500 text-sm">
              Expédié depuis contact@omegasud.fr. La réponse arrivera dans cette
              messagerie.
            </span>
          </div>
        </div>
      )}

      {/* Vues. « Journal » n'est pas un dossier de la boîte : un envoi SMTP ne dépose
          aucune copie dans « Envoyés » (c'est le logiciel de messagerie qui le fait),
          les notifications du site y seraient donc invisibles. Le journal les retient
          en base, échecs compris. */}
      {!ouvert && !redaction && (
        <div className="flex flex-wrap gap-2 mb-6">
          {(
            [
              ['reception', 'Réception'],
              ['envoyes', 'Envoyés'],
              ['journal', 'Envois du site'],
            ] as [Vue, string][]
          ).map(([id, libelle]) => (
            <button
              key={id}
              onClick={() => setVue(id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                vue === id
                  ? 'bg-blue-500 text-white'
                  : 'bg-white/5 text-gray-300 hover:bg-white/10 border border-white/10'
              }`}
            >
              {libelle}
            </button>
          ))}
        </div>
      )}

      {/* Journal des envois du site */}
      {!ouvert && !redaction && vue === 'journal' && (
        <>
          {chargement ? (
            <div className="text-gray-400 flex items-center gap-2 py-8 justify-center">
              <Loader2 className="animate-spin" size={18} />
              Lecture du journal…
            </div>
          ) : journal.length === 0 ? (
            <div className="text-gray-400 text-center py-8">
              Aucun envoi enregistré pour l'instant.
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {journal.map(l => (
                  <div
                    key={l.id}
                    className={`flex items-start justify-between gap-4 rounded-lg p-4 border ${
                      l.statut === 'echec'
                        ? 'bg-red-500/10 border-red-500/30'
                        : 'bg-white/5 border-white/10'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-white font-medium truncate">
                        {l.objet || '(sans objet)'}
                      </div>
                      <div className="text-gray-400 text-sm truncate">
                        {l.destinataire} · {l.evenement}
                        {l.origine === 'manuel' ? ' · écrit à la main' : ''}
                      </div>
                      {l.erreur && (
                        <div className="text-red-300 text-xs mt-1 break-all">
                          {l.erreur}
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-gray-500 text-xs whitespace-nowrap">
                        {dateCourte(l.created_at)}
                      </div>
                      <div
                        className={`text-xs font-semibold mt-1 ${
                          l.statut === 'echec' ? 'text-red-400' : 'text-green-400'
                        }`}
                      >
                        {l.statut === 'echec' ? 'échec' : 'accepté'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-gray-500 text-xs mt-4">
                « Accepté » signifie que le serveur d'envoi a pris le message en charge.
                Savoir s'il a été lu, ou s'il a atterri dans les indésirables, n'est pas
                mesurable depuis le site.
              </p>
            </>
          )}
        </>
      )}

      {/* Liste des messages de la boîte */}
      {!ouvert && !redaction && vue !== 'journal' && (
        <>
          {chargement ? (
            <div className="text-gray-400 flex items-center gap-2 py-8 justify-center">
              <Loader2 className="animate-spin" size={18} />
              Lecture de la boîte…
            </div>
          ) : messages.length === 0 ? (
            <div className="text-gray-400 text-center py-8">Aucun message.</div>
          ) : (
            <div className="space-y-2">
              {messages.map(m => (
                <button
                  key={m.uid}
                  onClick={() => ouvrir(m.uid)}
                  disabled={ouverture}
                  className={`w-full text-left flex items-start justify-between gap-4 rounded-lg p-4 border transition-colors disabled:opacity-60 ${
                    m.lu
                      ? 'bg-white/5 border-white/10 hover:bg-white/10'
                      : 'bg-blue-500/10 border-blue-500/30 hover:bg-blue-500/20'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block text-white font-medium truncate">
                      {m.objet}
                    </span>
                    {/* Dans « Envoyés », l'expéditeur c'est nous : c'est le
                        destinataire qui identifie le message. */}
                    <span className="block text-gray-400 text-sm truncate">
                      {vue === 'envoyes'
                        ? `À ${nomDe(m.a ?? null)}`
                        : nomDe(m.de) +
                          (m.de?.nom && m.de?.adresse ? ` — ${m.de.adresse}` : '')}
                    </span>
                  </span>
                  <span className="shrink-0 text-gray-500 text-xs whitespace-nowrap">
                    {dateCourte(m.date)}
                    {!m.lu && (
                      <span className="block text-blue-400 font-semibold mt-1">
                        non lu
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* Message ouvert */}
      {ouvert && (
        <div className="space-y-6">
          <div className="bg-white/5 rounded-lg p-5 border border-white/10">
            <div className="text-white font-semibold text-lg mb-1">{ouvert.objet}</div>
            <div className="text-gray-400 text-sm mb-4">
              {nomDe(ouvert.de)}
              {ouvert.de?.adresse ? ` <${ouvert.de.adresse}>` : ''} ·{' '}
              {dateCourte(ouvert.date)}
            </div>

            {/* Le corps est affiché en TEXTE, jamais en HTML : injecter le HTML d'un
                expéditeur inconnu dans le back-office ouvrirait la porte à l'exécution
                de son code. */}
            <div className="text-gray-200 text-sm whitespace-pre-line leading-relaxed max-h-96 overflow-auto">
              {ouvert.texte || '(message sans contenu texte)'}
            </div>

            {ouvert.piecesJointes.length > 0 && (
              <div className="mt-4 pt-4 border-t border-white/10">
                <div className="text-gray-400 text-xs mb-2">Pièces jointes</div>
                <div className="flex flex-wrap gap-2">
                  {ouvert.piecesJointes.map((p, i) => (
                    <span
                      key={i}
                      className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-lg text-gray-300 text-sm border border-white/10"
                    >
                      <Paperclip size={14} />
                      {p.nom || 'pièce jointe'}
                      {p.taille ? (
                        <span className="text-gray-500">
                          {Math.round(p.taille / 1024)} ko
                        </span>
                      ) : null}
                    </span>
                  ))}
                </div>
                <div className="text-gray-500 text-xs mt-2">
                  Téléchargement depuis le webmail : les pièces jointes ne sont pas
                  transférées ici.
                </div>
              </div>
            )}
          </div>

          {/* Réponse */}
          <div>
            <h3 className="text-white font-semibold mb-3">
              Répondre à {nomDe(ouvert.de)}
            </h3>
            <textarea
              value={reponse}
              onChange={e => setReponse(e.target.value)}
              rows={7}
              placeholder="Votre réponse…"
              className="w-full bg-black/30 border border-white/10 rounded-lg p-4 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50"
            />
            <div className="flex items-center gap-3 mt-3">
              <button
                onClick={envoyerReponse}
                disabled={envoi || !reponse.trim() || !ouvert.de?.adresse}
                className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white px-5 py-2.5 rounded-lg font-semibold hover:shadow-lg hover:shadow-blue-500/25 transition-all disabled:opacity-50"
              >
                <Send size={16} />
                {envoi ? 'Envoi…' : 'Envoyer'}
              </button>
              <span className="text-gray-500 text-sm">
                Expédié depuis contact@omegasud.fr, dans le fil d'origine.
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminMailbox;
