import React, { useState, useCallback, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Receipt, Download, RefreshCw, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';

/**
 * TVA — ce qu'il faut déclarer, prêt à recopier.
 *
 * Demande de l'exploitant : « comment je sais exactement ce que je dois à l'État, sans
 * erreur ? Dans mon chiffre d'affaires tout est mélangé, entre le B2B, le B2C et les
 * différents pays. »
 *
 * Une déclaration de TVA ne demande pas un chiffre d'affaires global : elle demande des
 * catégories SÉPARÉES (ventes taxables, livraisons intracommunautaires, exportations).
 * Tant qu'elles sont confondues, le comptable devine — et c'est là que les erreurs
 * naissent. Cet écran les sépare, à partir d'une source unique : les commandes payées,
 * avec le régime FIGÉ au moment de la vente.
 *
 * ⚠ Ne couvre QUE la TVA collectée. La TVA déductible vient des factures d'achat, qui ne
 * passent pas par le site : c'est le comptable qui l'apporte.
 */

interface Bloc {
  base_ht: number;
  tva_collectee?: number;
  nb: number;
}
interface Declaration {
  periode: { du: string; au: string };
  ventes_france: Bloc;
  ventes_ue_b2c: Bloc;
  livraisons_intracommunautaires: Bloc;
  /** Exportations HORS Union européenne (art. 262 I). */
  exportations: Bloc;
  /** DOM/COM (art. 294) : 0 % comme l'export, mais une AUTRE ligne de déclaration.
      Optionnel : une base antérieure à la migration du 4 août ne le renvoie pas. */
  livraisons_outre_mer?: Bloc;
  total_tva_collectee: number;
  total_ht: number;
  sans_regime: number;
  par_pays: Array<{
    pays: string;
    regime: string | null;
    base_ht: number;
    tva: number;
    nb: number;
  }>;
}
interface SeuilOss {
  annee: number;
  total_ttc: number;
  seuil: number;
  restant: number;
  depasse: boolean;
  pourcentage: number;
}

const eur = (n: number | null | undefined) =>
  (Number(n) || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

/** Périodes usuelles : mois et trimestre en cours, et les précédents. */
function periodesProposees() {
  const now = new Date();
  const a = now.getFullYear();
  const m = now.getMonth();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const finMois = (an: number, mo: number) => new Date(an, mo + 1, 0);
  const trim = Math.floor(m / 3);
  return [
    {
      id: 'mois',
      label: 'Mois en cours',
      du: iso(new Date(a, m, 1)),
      au: iso(finMois(a, m)),
    },
    {
      id: 'mois_prec',
      label: 'Mois précédent',
      du: iso(new Date(a, m - 1, 1)),
      au: iso(finMois(a, m - 1)),
    },
    {
      id: 'trimestre',
      label: 'Trimestre en cours',
      du: iso(new Date(a, trim * 3, 1)),
      au: iso(finMois(a, trim * 3 + 2)),
    },
    {
      id: 'annee',
      label: 'Année en cours',
      du: iso(new Date(a, 0, 1)),
      au: iso(new Date(a, 11, 31)),
    },
  ];
}

const AdminTva: React.FC = () => {
  const periodes = periodesProposees();
  const [du, setDu] = useState(periodes[0].du);
  const [au, setAu] = useState(periodes[0].au);
  const [decl, setDecl] = useState<Declaration | null>(null);
  const [oss, setOss] = useState<SeuilOss | null>(null);
  const [loading, setLoading] = useState(false);

  const charger = useCallback(async () => {
    setLoading(true);
    try {
      const [d, o] = await Promise.all([
        supabase.rpc('declaration_tva', { p_du: du, p_au: au }),
        supabase.rpc('seuil_oss', {}),
      ]);
      if (d.error) throw d.error;
      setDecl(d.data as unknown as Declaration);
      if (!o.error) setOss(o.data as unknown as SeuilOss);
    } catch (e) {
      toast.error(
        'Lecture impossible : ' + (e instanceof Error ? e.message : 'erreur')
      );
    } finally {
      setLoading(false);
    }
  }, [du, au]);

  useEffect(() => {
    charger();
  }, [charger]);

  /** Export pour le comptable : une ligne par catégorie, dans l'ordre de la déclaration. */
  const exporterCsv = () => {
    if (!decl) return;
    const lignes = [
      ['Periode', `${decl.periode.du} au ${decl.periode.au}`, '', ''],
      ['Categorie', 'Base HT', 'TVA collectee', 'Nb commandes'],
      [
        'Ventes taxables France (TVA 20%)',
        decl.ventes_france.base_ht,
        decl.ventes_france.tva_collectee ?? 0,
        decl.ventes_france.nb,
      ],
      [
        'Ventes a distance UE (particuliers)',
        decl.ventes_ue_b2c.base_ht,
        decl.ventes_ue_b2c.tva_collectee ?? 0,
        decl.ventes_ue_b2c.nb,
      ],
      [
        'Livraisons intracommunautaires (exonerees, art. 262 ter I)',
        decl.livraisons_intracommunautaires.base_ht,
        0,
        decl.livraisons_intracommunautaires.nb,
      ],
      [
        'Exportations hors UE (exonerees, art. 262 I)',
        decl.exportations.base_ht,
        0,
        decl.exportations.nb,
      ],
      // ⚠ Ligne DISTINCTE des exportations : une livraison vers un DOM sort aussi à 0 %,
      // mais elle ne se déclare pas dans la même case que l'export hors UE.
      [
        'Livraisons outre-mer (exonerees, art. 294)',
        decl.livraisons_outre_mer?.base_ht ?? 0,
        0,
        decl.livraisons_outre_mer?.nb ?? 0,
      ],
      ['TOTAL', decl.total_ht, decl.total_tva_collectee, ''],
      ['', '', '', ''],
      ['Detail par pays', 'Regime', 'Base HT', 'TVA'],
      ...(decl.par_pays || []).map(p => [p.pays, p.regime || '?', p.base_ht, p.tva]),
    ];
    // Séparateur POINT-VIRGULE et BOM : sans eux, Excel en français ouvre tout dans
    // une seule colonne et casse les accents.
    const csv =
      '﻿' +
      lignes
        .map(l =>
          l
            .map(c =>
              typeof c === 'number' ? String(c).replace('.', ',') : `"${String(c)}"`
            )
            .join(';')
        )
        .join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `TVA_${decl.periode.du}_${decl.periode.au}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  };

  const Carte = ({
    titre,
    sous,
    bloc,
    tva,
    couleur,
  }: {
    titre: string;
    sous: string;
    bloc: Bloc;
    tva?: boolean;
    couleur: string;
  }) => (
    <div className={`rounded-xl border p-4 ${couleur}`}>
      <div className="text-xs font-bold uppercase tracking-wide opacity-80">{titre}</div>
      <div className="text-[11px] opacity-60 mb-3 leading-snug">{sous}</div>
      <div className="text-2xl font-bold text-white">{eur(bloc?.base_ht)}</div>
      <div className="text-xs opacity-70 mt-1">
        base HT · {bloc?.nb || 0} commande{(bloc?.nb || 0) > 1 ? 's' : ''}
      </div>
      {tva && (
        <div className="mt-2 pt-2 border-t border-white/10 text-sm">
          TVA collectée :{' '}
          <span className="font-bold text-white">{eur(bloc?.tva_collectee)}</span>
        </div>
      )}
    </div>
  );

  return (
    <div className="text-gray-200">
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="flex items-center gap-2 mr-auto">
          <Receipt className="w-5 h-5 text-cyan-400" />
          <h2 className="text-xl font-bold text-white">TVA à déclarer</h2>
        </div>

        <select
          onChange={e => {
            const p = periodes.find(x => x.id === e.target.value);
            if (p) {
              setDu(p.du);
              setAu(p.au);
            }
          }}
          className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm outline-none"
        >
          {periodes.map(p => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={du}
          onChange={e => setDu(e.target.value)}
          className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm outline-none"
        />
        <input
          type="date"
          value={au}
          onChange={e => setAu(e.target.value)}
          className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm outline-none"
        />
        <button
          onClick={charger}
          className="p-2 rounded-lg bg-gray-800 border border-gray-700 hover:border-cyan-500 transition"
          title="Rafraîchir"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
        <button
          onClick={exporterCsv}
          disabled={!decl}
          className="px-3 py-2 rounded-lg bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 text-sm hover:border-cyan-400 transition disabled:opacity-40 flex items-center gap-2"
        >
          <Download className="w-4 h-4" />
          Export comptable
        </button>
      </div>

      {decl && (
        <>
          {/* Cinq catégories, pas quatre : l'outre-mer a sa propre carte. Il sort à 0 %
              comme l'export hors UE, mais il ne se déclare pas dans la même case — les
              additionner ferait recopier un chiffre faux sur la déclaration. */}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5 mb-5">
            <Carte
              titre="Ventes en France"
              sous="TVA 20 % collectée — France et Monaco"
              bloc={decl.ventes_france}
              tva
              couleur="bg-cyan-500/10 border-cyan-500/30"
            />
            <Carte
              titre="Ventes à distance UE"
              sous="Particuliers d'autres pays de l'UE"
              bloc={decl.ventes_ue_b2c}
              tva
              couleur="bg-sky-500/10 border-sky-500/30"
            />
            <Carte
              titre="Livraisons intracommunautaires"
              sous="Entreprises UE, n° de TVA vérifié — exonéré (262 ter I)"
              bloc={decl.livraisons_intracommunautaires}
              couleur="bg-amber-500/10 border-amber-500/30"
            />
            <Carte
              titre="Exportations hors UE"
              sous="Suisse, Royaume-Uni… — exonéré (art. 262 I)"
              bloc={decl.exportations}
              couleur="bg-emerald-500/10 border-emerald-500/30"
            />
            <Carte
              titre="Livraisons outre-mer"
              sous="DOM et collectivités — exonéré (art. 294)"
              bloc={decl.livraisons_outre_mer ?? { base_ht: 0, nb: 0 }}
              couleur="bg-teal-500/10 border-teal-500/30"
            />
          </div>

          <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4 mb-5 flex flex-wrap items-center gap-6">
            <div>
              <div className="text-xs uppercase tracking-wide text-gray-500">
                Chiffre d'affaires HT
              </div>
              <div className="text-2xl font-bold text-white">{eur(decl.total_ht)}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-gray-500">
                TVA collectée à reverser
              </div>
              <div className="text-2xl font-bold text-cyan-300">
                {eur(decl.total_tva_collectee)}
              </div>
            </div>
            <div className="text-xs text-gray-500 max-w-md leading-relaxed">
              Montant <b>avant déduction</b> de la TVA payée sur vos achats. Votre
              comptable soustrait celle-ci pour obtenir ce qui est réellement dû.
            </div>
          </div>

          {/* Une commande sans régime, c'est une commande d'avant la mise en place du
              calcul : elle fausserait la ventilation en silence si on ne la signalait pas. */}
          {decl.sans_regime > 0 && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 mb-5 flex gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-300 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-200">
                <b>
                  {decl.sans_regime} commande{decl.sans_regime > 1 ? 's' : ''} sans régime
                  fiscal
                </b>{' '}
                sur la période — antérieure{decl.sans_regime > 1 ? 's' : ''} au calcul
                automatique de TVA. Elle{decl.sans_regime > 1 ? 's ne sont' : ' n\'est'} pas
                comptée{decl.sans_regime > 1 ? 's' : ''} dans les catégories ci-dessus :
                vérifiez-la{decl.sans_regime > 1 ? 's' : ''} à la main.
              </div>
            </div>
          )}

          {oss && (
            <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4 mb-5">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-semibold text-white">
                  Seuil du guichet unique (OSS) — {oss.annee}
                </div>
                <div className="text-sm text-gray-400">
                  {eur(oss.total_ttc)} / {eur(oss.seuil)}
                </div>
              </div>
              <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
                <div
                  className={`h-full ${oss.depasse ? 'bg-red-500' : 'bg-cyan-500'}`}
                  style={{ width: `${Math.min(100, oss.pourcentage)}%` }}
                />
              </div>
              <div className="text-xs text-gray-500 mt-2 leading-relaxed">
                {oss.depasse ? (
                  <span className="text-red-300">
                    Seuil dépassé : vous devez appliquer le taux du pays de destination et
                    vous inscrire au guichet unique sur impots.gouv.fr.
                  </span>
                ) : (
                  <>
                    Ventes aux particuliers d'autres pays de l'UE. En dessous de{' '}
                    {eur(oss.seuil)} par an, vous facturez la TVA française : rien à faire.
                    Il reste <b className="text-gray-300">{eur(oss.restant)}</b>.
                  </>
                )}
              </div>
            </div>
          )}

          {decl.par_pays && decl.par_pays.length > 0 && (
            <div className="rounded-xl border border-gray-800 bg-gray-900/60 overflow-hidden">
              <div className="px-4 py-3 text-sm font-semibold text-white border-b border-gray-800">
                Détail par pays
              </div>
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-gray-500">
                  <tr>
                    <th className="text-left px-4 py-2">Pays</th>
                    <th className="text-left px-4 py-2">Régime</th>
                    <th className="text-right px-4 py-2">Base HT</th>
                    <th className="text-right px-4 py-2">TVA</th>
                    <th className="text-right px-4 py-2">Commandes</th>
                  </tr>
                </thead>
                <tbody>
                  {decl.par_pays.map((p, i) => (
                    <tr key={i} className="border-t border-gray-800/60">
                      <td className="px-4 py-2 font-mono">{p.pays}</td>
                      <td className="px-4 py-2 text-gray-400">{p.regime || '—'}</td>
                      <td className="px-4 py-2 text-right">{eur(p.base_ht)}</td>
                      <td className="px-4 py-2 text-right">{eur(p.tva)}</td>
                      <td className="px-4 py-2 text-right text-gray-400">{p.nb}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {!decl && !loading && (
        <div className="text-gray-400 text-sm">Aucune donnée sur cette période.</div>
      )}
    </div>
  );
};

export default AdminTva;
