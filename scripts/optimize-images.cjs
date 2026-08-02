/**
 * Optimisation automatique des images de /public/products
 *
 * Corrige deux défauts distincts, tous deux mesurés sur le site en ligne :
 *
 * 1. « Les images ne s'affichent que de temps en temps. »
 *    Ce n'était pas le poids. Des fichiers portaient des espaces et des accents
 *    (« Logo OMEGA Haute qualité.png », « omega mousse.png »). Une URL non encodée
 *    échoue, l'URL encodée passe : selon l'endroit du code qui construit le chemin,
 *    l'image apparaissait sur une page et pas sur l'autre. L'accent aggrave encore,
 *    Windows, macOS et Netlify ne normalisant pas l'UTF-8 de la même façon (NFC/NFD).
 *    → tout nom est ramené ici en kebab-case ASCII, un jeu de caractères qui ne
 *      dépend ni de l'encodage de l'URL ni du système de fichiers.
 *
 * 2. Le poids. 31 Mo pour 32 images, dont un logo de 7321x1880 px (1,5 Mo) rechargé
 *    sur CHAQUE page pour être affiché sur 160 px de haut au maximum.
 *    → conversion WebP et redimensionnement à la taille réellement utile.
 *
 * Le script est idempotent : une fois converties, les images sont déjà au bon nom et
 * au bon format, une seconde exécution ne fait rien. Il peut donc rester branché dans
 * `npm run build` sans coût.
 *
 * ⚠ Il ne traite QUE /public/products :
 *   - /public/email/ sert aux e-mails, et plusieurs clients de messagerie ne savent
 *     toujours pas afficher le WebP ;
 *   - les favicons et l'apple-touch-icon doivent garder leur format d'origine.
 *
 * Usage : node scripts/optimize-images.cjs [--dry-run]
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const DOSSIER = path.join(__dirname, '..', 'public', 'products');
const SOURCES = ['.png', '.jpg', '.jpeg'];
const QUALITE = 82;
const LARGEUR_DEFAUT = 1600;

// Largeur maximale par image, quand le défaut serait du gâchis.
// Clé = nom normalisé, sans extension.
const LARGEURS = {
  // Affiché au plus grand dans Hero (h-40 = 160 px de haut, ratio 3,9 => ~625 px
  // de large) ; 1400 px couvre confortablement les écrans à haute densité.
  'logo-omega-hq-transparent': 1400,
};

const simulation = process.argv.includes('--dry-run');
const DIACRITIQUES = new RegExp('[\\u0300-\\u036f]', 'g');

/** Ramène un nom de fichier en kebab-case ASCII : « Logo OMEGA Haute qualité.png » -> « logo-omega-haute-qualite.webp » */
function normaliser(nom) {
  const base = path.basename(nom, path.extname(nom));
  const ascii = base
    .normalize('NFD')
    // Diacritiques laissés par la décomposition NFD. La classe est construite à
    // partir d'une chaîne ASCII plutôt qu'écrite en clair : le motif ne dépend
    // ainsi pas de l'encodage dans lequel ce fichier source est enregistré.
    .replace(DIACRITIQUES, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${ascii}.webp`;
}

function ko(octets) {
  return `${Math.round(octets / 1024)} ko`;
}

async function main() {
  if (!fs.existsSync(DOSSIER)) {
    console.error(`Dossier introuvable : ${DOSSIER}`);
    process.exit(1);
  }

  const fichiers = fs
    .readdirSync(DOSSIER)
    .filter((f) => SOURCES.includes(path.extname(f).toLowerCase()));

  if (fichiers.length === 0) {
    console.log('Images : rien à convertir, tout est déjà en WebP.');
    return;
  }

  // Deux sources qui donneraient le même nom normalisé écraseraient silencieusement
  // l'une l'autre : on refuse d'agir plutôt que de perdre une image.
  const parCible = new Map();
  for (const f of fichiers) {
    const cible = normaliser(f);
    if (!parCible.has(cible)) parCible.set(cible, []);
    parCible.get(cible).push(f);
  }
  const collisions = [...parCible].filter(([, src]) => src.length > 1);
  if (collisions.length > 0) {
    console.error('Conflit de noms — renommez ces fichiers à la main :');
    for (const [cible, src] of collisions) {
      console.error(`  ${src.join(' + ')}  ->  ${cible}`);
    }
    process.exit(1);
  }

  let avant = 0;
  let apres = 0;
  const lignes = [];

  for (const fichier of fichiers.sort()) {
    const source = path.join(DOSSIER, fichier);
    const cible = normaliser(fichier);
    const destination = path.join(DOSSIER, cible);

    if (fs.existsSync(destination)) {
      console.error(`Déjà présent, source ignorée : ${fichier} -> ${cible}`);
      continue;
    }

    const tailleAvant = fs.statSync(source).size;
    const meta = await sharp(source).metadata();
    const largeurMax = LARGEURS[path.basename(cible, '.webp')] || LARGEUR_DEFAUT;

    if (simulation) {
      lignes.push([fichier, cible, ko(tailleAvant), '(simulation)', `${meta.width}px -> ${Math.min(meta.width, largeurMax)}px`]);
      avant += tailleAvant;
      continue;
    }

    const tampon = await sharp(source)
      .resize({ width: largeurMax, withoutEnlargement: true })
      .webp({ quality: QUALITE })
      .toBuffer();

    fs.writeFileSync(destination, tampon);

    // L'original n'est retiré qu'une fois le WebP écrit et relu : en cas d'échec de
    // conversion, on préfère un dossier en double état plutôt qu'une image perdue.
    const tailleApres = fs.statSync(destination).size;
    if (tailleApres > 0) fs.unlinkSync(source);

    avant += tailleAvant;
    apres += tailleApres;
    const nouvelleLargeur = Math.min(meta.width, largeurMax);
    lignes.push([
      fichier,
      cible,
      ko(tailleAvant),
      ko(tailleApres),
      `${meta.width}px -> ${nouvelleLargeur}px`,
    ]);
  }

  if (lignes.length === 0) return;

  const l = (i) => Math.max(...lignes.map((x) => x[i].length));
  for (const x of lignes) {
    console.log(
      `  ${x[0].padEnd(l(0))}  ->  ${x[1].padEnd(l(1))}  ${x[2].padStart(8)}  ->  ${x[3].padStart(8)}   ${x[4]}`
    );
  }
  if (!simulation) {
    const gain = avant > 0 ? Math.round((1 - apres / avant) * 100) : 0;
    console.log(`\nImages : ${ko(avant)} -> ${ko(apres)} (-${gain} %), ${lignes.length} fichier(s).`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
