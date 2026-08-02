import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/**
 * Le boîtier OMEGA DMX, modélisé et rendu en 3D dans le navigateur.
 *
 * ## Pourquoi un modèle et non une photo
 * Les photos du boîtier sont prises en atelier, sur béton clair : impossible de les
 * détourer proprement pour un site sombre. Un modèle règle le problème à la racine —
 * fond, éclairage et angle sont choisis, il reste net à toute taille, il pèse quelques
 * dizaines de ko, et le visiteur peut le faire tourner.
 *
 * ## Fidélité
 * Les proportions et les éléments viennent des photos réelles : boîtier carré très
 * compact, deux XLR femelle à loquet PUSH sur une face argentée, antenne SMA à embase
 * dorée et port USB-C sur la face opposée, coque noire au grain d'impression 3D.
 * ⚠ Ne pas « embellir » en aluminium brossé : le site affichait un rendu d'un tout
 * autre objet que le produit livré.
 *
 * ## Trois.js sans surcouche React
 * `@react-three/fiber` v9 réclame React 19 alors que le site tourne en React 18 :
 * migrer React pour un visuel serait hors de proportion. La scène est donc montée à la
 * main, ce qui allège aussi le paquet livré.
 *
 * ⚠ Ce composant DOIT être importé en différé (`lazy`) : Three.js pèse à lui seul plus
 * que le reste du site, et il ne sert que sur cette page.
 */

// Dimensions réelles, en centimètres, converties en unités de scène.
const L = 8.0; // largeur
const H = 3.0; // hauteur
const P = 8.0; // profondeur

const BoitierDmx3D: React.FC<{ className?: string }> = ({ className }) => {
  const conteneur = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const hote = conteneur.current;
    if (!hote) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(11, 7.5, 13);

    const rendu = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    // Plafonné à 2 : au-delà, on quadruple le nombre de pixels calculés sans gain visible.
    rendu.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    rendu.shadowMap.enabled = true;
    rendu.shadowMap.type = THREE.PCFSoftShadowMap;
    rendu.toneMapping = THREE.ACESFilmicToneMapping;
    rendu.toneMappingExposure = 1.15;
    hote.appendChild(rendu.domElement);

    // ---- Matières ---------------------------------------------------------
    // Le grain d'impression 3D se rend par une rugosité forte, pas par une texture :
    // à cette taille d'affichage, l'œil lit la diffusion de la lumière, pas le relief.
    const coque = new THREE.MeshStandardMaterial({
      color: 0x14141a,
      roughness: 0.92,
      metalness: 0.05,
    });
    const capot = new THREE.MeshStandardMaterial({
      color: 0x101015,
      roughness: 0.96,
      metalness: 0.03,
    });
    const argente = new THREE.MeshStandardMaterial({
      color: 0x9aa0a8,
      roughness: 0.42,
      metalness: 0.85,
    });
    const chrome = new THREE.MeshStandardMaterial({
      color: 0xc8ccd2,
      roughness: 0.22,
      metalness: 1,
    });
    const noirMat = new THREE.MeshStandardMaterial({
      color: 0x0a0a0d,
      roughness: 0.75,
      metalness: 0.1,
    });
    const dore = new THREE.MeshStandardMaterial({
      color: 0xc9a227,
      roughness: 0.3,
      metalness: 1,
    });
    const caoutchouc = new THREE.MeshStandardMaterial({
      color: 0x121216,
      roughness: 0.98,
      metalness: 0,
    });

    // ---- Le boîtier -------------------------------------------------------
    const boitier = new THREE.Group();

    // Corps : angles très arrondis, comme sur les photos.
    const corps = new THREE.Mesh(new RoundedBoxGeometry(L, H, P, 6, 0.75), coque);
    corps.castShadow = true;
    corps.receiveShadow = true;
    boitier.add(corps);

    // Capot supérieur, légèrement débordant : c'est le liseré visible sur les photos.
    const dessus = new THREE.Mesh(
      new RoundedBoxGeometry(L - 0.55, 0.42, P - 0.55, 5, 0.42),
      capot
    );
    dessus.position.y = H / 2 - 0.02;
    dessus.castShadow = true;
    boitier.add(dessus);

    // Face avant argentée (la plaque qui porte les XLR).
    const plaque = new THREE.Mesh(new RoundedBoxGeometry(0.22, H - 0.5, P - 0.9, 4, 0.16), argente);
    plaque.position.x = -L / 2 - 0.02;
    plaque.castShadow = true;
    boitier.add(plaque);

    /** Un connecteur XLR femelle : embase, collerette chromée, 3 broches, loquet PUSH. */
    const xlr = (z: number) => {
      const g = new THREE.Group();

      const embase = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 0.92, 0.34, 40), noirMat);
      embase.rotation.z = Math.PI / 2;
      g.add(embase);

      const collerette = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.22, 40), chrome);
      collerette.rotation.z = Math.PI / 2;
      collerette.position.x = -0.12;
      g.add(collerette);

      const creux = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.12, 36), noirMat);
      creux.rotation.z = Math.PI / 2;
      creux.position.x = -0.2;
      g.add(creux);

      // Les trois contacts, à 120°.
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
        const t = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.16, 16), chrome);
        t.rotation.z = Math.PI / 2;
        t.position.set(-0.24, Math.cos(a) * 0.26, Math.sin(a) * 0.26);
        g.add(t);
      }

      // Loquet PUSH.
      const loquet = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.42), chrome);
      loquet.position.set(-0.18, 0.92, 0);
      g.add(loquet);

      g.rotation.y = Math.PI / 2;
      g.position.set(-L / 2 - 0.12, 0, z);
      return g;
    };
    boitier.add(xlr(1.9), xlr(-1.9));

    // ---- Antenne (face opposée) ------------------------------------------
    const embaseAnt = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.5, 12), dore);
    embaseAnt.rotation.z = Math.PI / 2;
    embaseAnt.position.set(L / 2 + 0.2, 0.35, -1.4);
    boitier.add(embaseAnt);

    const brin = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 3.6, 6, 16), caoutchouc);
    brin.rotation.z = Math.PI / 2;
    brin.position.set(L / 2 + 2.4, 0.35, -1.4);
    brin.castShadow = true;
    boitier.add(brin);

    // ---- USB-C ------------------------------------------------------------
    const usb = new THREE.Mesh(new RoundedBoxGeometry(0.18, 0.34, 0.92, 3, 0.16), noirMat);
    usb.position.set(L / 2 + 0.02, 0.1, 1.2);
    boitier.add(usb);

    scene.add(boitier);

    // ---- Sol : capte l'ombre, reste invisible ------------------------------
    const sol = new THREE.Mesh(
      new THREE.PlaneGeometry(70, 70),
      new THREE.ShadowMaterial({ opacity: 0.55 })
    );
    sol.rotation.x = -Math.PI / 2;
    sol.position.y = -H / 2 - 0.02;
    sol.receiveShadow = true;
    scene.add(sol);

    // ---- Lumières : un éclairage de studio à trois points ------------------
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));

    const principale = new THREE.DirectionalLight(0xffffff, 2.6);
    principale.position.set(9, 14, 8);
    principale.castShadow = true;
    principale.shadow.mapSize.set(1024, 1024);
    principale.shadow.camera.near = 1;
    principale.shadow.camera.far = 45;
    principale.shadow.camera.left = -14;
    principale.shadow.camera.right = 14;
    principale.shadow.camera.top = 14;
    principale.shadow.camera.bottom = -14;
    scene.add(principale);

    // Les deux teintes de la charte, en contre-jour : c'est ce qui détache un objet
    // noir d'un fond noir. Sans elles, le boîtier se fondrait dans la page.
    const cyan = new THREE.DirectionalLight(0x00c2ff, 2.2);
    cyan.position.set(-11, 5, -8);
    scene.add(cyan);

    const violet = new THREE.PointLight(0xa21caf, 26, 32);
    violet.position.set(7, -2, -9);
    scene.add(violet);

    // ---- Pilotage ---------------------------------------------------------
    const controles = new OrbitControls(camera, rendu.domElement);
    controles.enableDamping = true;
    controles.dampingFactor = 0.07;
    controles.enablePan = false;
    controles.enableZoom = false; // sinon la molette piège le défilement de la page
    controles.autoRotate = true;
    controles.autoRotateSpeed = 0.9;
    controles.minPolarAngle = Math.PI * 0.18;
    controles.maxPolarAngle = Math.PI * 0.48;

    // La rotation automatique reprend quelques instants après le lâcher, pour ne pas
    // arracher le modèle des mains du visiteur.
    let reprise: ReturnType<typeof setTimeout>;
    controles.addEventListener('start', () => {
      controles.autoRotate = false;
      clearTimeout(reprise);
    });
    controles.addEventListener('end', () => {
      reprise = setTimeout(() => (controles.autoRotate = true), 2500);
    });

    const redimensionner = () => {
      const { clientWidth: w, clientHeight: h } = hote;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      rendu.setSize(w, h, false);
    };
    redimensionner();
    const observateur = new ResizeObserver(redimensionner);
    observateur.observe(hote);

    // Hors écran, on ne calcule rien : inutile de faire tourner le processeur
    // graphique pour une scène que personne ne regarde.
    let visible = true;
    const vue = new IntersectionObserver(
      ([e]) => (visible = e.isIntersecting),
      { threshold: 0.01 }
    );
    vue.observe(hote);

    let image = 0;
    const boucle = () => {
      image = requestAnimationFrame(boucle);
      if (!visible) return;
      controles.update();
      rendu.render(scene, camera);
    };
    boucle();

    return () => {
      cancelAnimationFrame(image);
      clearTimeout(reprise);
      observateur.disconnect();
      vue.disconnect();
      controles.dispose();
      // Sans libération explicite, chaque montage laisserait derrière lui ses
      // géométries et ses matières dans la mémoire de la carte graphique.
      scene.traverse(o => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        const mat = m.material;
        if (Array.isArray(mat)) mat.forEach(x => x.dispose());
        else mat?.dispose?.();
      });
      rendu.dispose();
      hote.removeChild(rendu.domElement);
    };
  }, []);

  return (
    <div
      ref={conteneur}
      className={className}
      style={{ cursor: 'grab', touchAction: 'pan-y' }}
      aria-label="Modèle 3D du boîtier OMEGA DMX, orientable à la souris"
      role="img"
    />
  );
};

export default BoitierDmx3D;
