import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Loader2, RotateCcw, ShieldCheck } from 'lucide-react';
import { obtenirPreuveCaptcha, type PreuveCaptcha } from '../utils/captcha';

/**
 * « Je ne suis pas un robot » — captcha MAISON, sans service tiers.
 *
 * Dès l'ouverture du formulaire, l'appareil résout en arrière-plan une preuve de calcul
 * (cf. utils/captcha.ts) ; la case ne fait que la valider. Le temps de remplir les
 * champs, le calcul est fini : la coche est instantanée. La base revérifie la preuve à
 * l'inscription (hook) — la case seule ne protège de rien, c'est la preuve qui compte.
 *
 * Grande zone tactile (≥ 48 px), clavier (Espace / Entrée) : PC, téléphone, tablette.
 */
const VALIDITE_MS = 9 * 60 * 1000; // le défi expire à 10 min côté base

interface Props {
  /** Preuve prête ET case cochée → preuve ; sinon null. */
  onPreuve: (p: PreuveCaptcha | null) => void;
  /** Change de valeur après chaque tentative : une preuve ne sert qu'une fois. */
  renouveler?: number;
}

type Etat = 'calcul' | 'pret' | 'erreur';

const CaptchaMaison = ({ onPreuve, renouveler = 0 }: Props) => {
  const [etat, setEtat] = useState<Etat>('calcul');
  const [coche, setCoche] = useState(false);
  const preuve = useRef<{ p: PreuveCaptcha; le: number } | null>(null);
  const rappel = useRef(onPreuve);
  rappel.current = onPreuve;
  const cocheRef = useRef(false);
  cocheRef.current = coche;

  const calculer = useCallback(() => {
    preuve.current = null;
    setEtat('calcul');
    rappel.current(null);
    obtenirPreuveCaptcha()
      .then(p => {
        preuve.current = { p, le: Date.now() };
        setEtat('pret');
        if (cocheRef.current) rappel.current(p);
      })
      .catch(() => setEtat('erreur'));
  }, []);

  // Premier calcul à l'ouverture, puis un neuf après chaque tentative d'inscription.
  useEffect(() => {
    setCoche(false);
    calculer();
  }, [renouveler, calculer]);

  // Défi trop vieux (formulaire laissé ouvert) : on en refait un sans rien demander.
  useEffect(() => {
    const t = setInterval(() => {
      if (preuve.current && Date.now() - preuve.current.le > VALIDITE_MS) calculer();
    }, 30_000);
    return () => clearInterval(t);
  }, [calculer]);

  const basculer = () => {
    if (etat === 'erreur') {
      calculer();
      return;
    }
    const suivant = !coche;
    setCoche(suivant);
    rappel.current(suivant && preuve.current ? preuve.current.p : null);
  };

  const valide = coche && etat === 'pret';
  return (
    <div
      role="checkbox"
      aria-checked={valide}
      aria-label="Je ne suis pas un robot"
      tabIndex={0}
      onClick={basculer}
      onKeyDown={e => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          basculer();
        }
      }}
      className={`flex min-h-[56px] w-full cursor-pointer select-none items-center gap-3 rounded-lg border px-4 py-3 transition-colors ${
        valide ? 'border-green-500/50 bg-green-500/10' : 'border-gray-600 bg-gray-800/50 hover:border-gray-500'
      }`}
    >
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
          valide ? 'border-green-500 bg-green-500' : 'border-gray-400'
        }`}
      >
        {valide && <Check size={18} className="text-black" strokeWidth={3} />}
        {coche && etat === 'calcul' && <Loader2 size={16} className="animate-spin text-gray-300" />}
      </span>
      <span className="flex-1 text-sm text-gray-200">
        {etat === 'erreur'
          ? 'Vérification impossible — toucher pour réessayer'
          : coche && etat === 'calcul'
            ? 'Vérification en cours…'
            : 'Je ne suis pas un robot'}
      </span>
      {etat === 'erreur' ? (
        <RotateCcw size={18} className="text-gray-400" />
      ) : (
        <ShieldCheck size={20} className={valide ? 'text-green-400' : 'text-gray-500'} />
      )}
    </div>
  );
};

export default CaptchaMaison;
