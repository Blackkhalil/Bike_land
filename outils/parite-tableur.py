"""
Parité du moteur de calcul des offres de groupe avec le vrai tableur.

Recalcule le classeur Bike_Land_Calculatrice_Offres.xlsx (onglets « Bike for
All », « Bike for All durée » et « Road trip groupe ») sur des entrées tirées
au hasard, et range entrées et résultats dans tests/offres/cas-tableur.json.
Le test tests/offres/parite-tableur.test.mts compare ensuite le moteur
(src/lib/offres/) à chacun de ces cas.

Le recalcul est fait par la bibliothèque Python « formulas », qui lit les
formules du fichier et les exécute (LibreOffice n'est pas installé). Rien
n'est recopié à la main : ce sont les formules du classeur qui tournent.

Deux réglages avant le calcul, et rien d'autre :

  - Paramètres!B29 (prix du road trip par personne) passe de 3 125 F à
    3 000 F : décision 2 du responsable (3 000 F + 125 F de frais de
    paiement électronique = 3 125 F), voir docs/bike-land/SUIVI.md ;
  - la fonction TEXT(valeur ; "hh:mm") des récapitulatifs : « formulas »
    ne sait pas écrire une heure seule (un nombre de jour inférieur à 1,
    qu'il convertit en date impossible) et rend #VALUE!. Elle est fournie
    ici : l'heure arrondie à la seconde, écrite « 08:45 ». Les heures du
    classeur tombent toutes au quart d'heure, à un bruit de calcul près
    (0,37499999999999967 pour 9 h) que l'arrondi à la seconde efface.
    Toutes les autres fonctions sont celles de « formulas ».

Domaines tirés (graine fixe, le fichier est reproductible) :
  - Bike for All : 10 à 18 personnes, budget de 5 000 à 40 000 F par pas de
    250 F, départ de 8 h à 17 h 45 au quart d'heure (le plus long trajet
    possible, 4 h 15, rentre ainsi avant 22 h), 0 à 3 gâteaux par personne,
    accompagnateur ou non ;
  - Bike for All durée : 10 à 18 personnes, 30 à 180 minutes par 15 minutes,
    départ de 8 h à 19 h, chaque coco, 0 à 3 gâteaux, accompagnateur ou non ;
  - Road trip groupe : 10 à 18 personnes, réduction ou non, 0 à 3 gâteaux.
Chaque combinaison coco / gâteaux / accompagnateur (ou réduction / gâteaux)
revient à tour de rôle, le reste est tiré au hasard. Paiement électronique
pour les cas demandés ; une série en plus sans paiement électronique
(« Non » du tableur), qui est le comptoir de la décision 12. Le test en tire
le canal de vente du moteur : « en-ligne » pour « Oui », « comptoir » pour
« Non ». Les sorties du test sont demandées le lundi 9 novembre 2026 à 10 h,
pour le mercredi et le samedi suivants : la date limite du vendredi et le
délai minimum en ligne, que le tableur ne connaît pas, sont donc respectés.

Les récapitulatifs (A33, A27, A20) sont gardés en entier pour les 25 premiers
cas de chaque série, et pour tous sous forme d'empreinte (SHA-256 du texte,
16 premiers caractères) : le fichier reste lisible.

Le premier lancement après l'installation de « formulas » peut prendre
plusieurs minutes (Python compile la bibliothèque) ; les suivants, moins de
quatre minutes pour les 3 760 cas.

Usage, depuis la racine du projet, avec un Python qui a « formulas » :
    python outils/parite-tableur.py "bikeland new docs/Bike_Land_Calculatrice_Offres.xlsx"
Options : --cas 1000 (par onglet, avec paiement électronique),
          --comptoir 250 (par onglet, sans), --sortie tests/offres/cas-tableur.json
"""

import argparse
import hashlib
import json
import os
import random
import time

import numpy as np
import formulas
from formulas.functions import wrap_ufunc
from formulas.functions.text import xtext

GRAINE = 20261109
PRIX_ROAD_TRIP_DECISION_2 = 3000
RECAPS_EN_ENTIER = 25
# Les lignes de l'onglet Paramètres qui portent une heure : départ et fin du
# road trip, heure limite du vendredi.
LIGNES_HEURES = (33, 34, 38)


def texte_avec_heure(valeur, format_code):
    """TEXT() du tableur, avec le format « hh:mm » que « formulas » ne sait pas écrire."""
    if str(format_code).lower() == "hh:mm" and isinstance(valeur, (int, float, np.integer, np.floating)) and not isinstance(valeur, bool):
        secondes = int(round(float(valeur) * 86400))
        return f"{(secondes // 3600) % 24:02d}:{(secondes // 60) % 60:02d}"
    return xtext(valeur, format_code)


formulas.get_functions()["TEXT"] = wrap_ufunc(texte_avec_heure, input_parser=lambda *a: a)


def scalaire(valeur):
    """Une valeur rendue par « formulas » (plage, tableau 1 x 1, flottant numpy…) en valeur JSON."""
    if isinstance(valeur, formulas.Ranges):
        valeur = valeur.value
    if isinstance(valeur, np.ndarray):
        valeur = valeur.ravel()[0]
    if isinstance(valeur, (np.floating, float)):
        valeur = float(valeur)
        return int(valeur) if valeur.is_integer() else valeur
    if isinstance(valeur, (np.integer, int)) and not isinstance(valeur, bool):
        return int(valeur)
    if isinstance(valeur, (np.str_, str)):
        return str(valeur)
    if isinstance(valeur, (np.bool_, bool)):
        return bool(valeur)
    return str(valeur)


def heure_du_jour(fraction):
    """Une fraction de jour (0,364583…) en « 08:45 », à la seconde près."""
    secondes = int(round(float(fraction) * 86400))
    return f"{(secondes // 3600) % 24:02d}:{(secondes // 60) % 60:02d}"


def fraction(heure):
    """« 08:45 » en fraction de jour, comme une heure saisie dans Excel."""
    return (int(heure[:2]) * 60 + int(heure[3:])) / 1440


def empreinte(texte):
    return hashlib.sha256(texte.encode("utf-8")).hexdigest()[:16]


def oui_non(valeur):
    return "Oui" if valeur else "Non"


class Classeur:
    def __init__(self, chemin):
        self.nom = os.path.basename(chemin)
        debut = time.time()
        self.modele = formulas.ExcelModel().loads(chemin).finish()
        print(f"Classeur chargé en {time.time() - debut:.1f} s")

    def cle(self, feuille, cellule):
        return f"'[{self.nom}]{feuille.upper()}'!{cellule}"

    def parametres(self):
        """Les valeurs de l'onglet Paramètres (colonne B), les heures écrites « 08:00 »."""
        solution = self.modele.calculate()
        valeurs = {}
        for ligne in range(5, 42):
            cle = self.cle("Paramètres", f"B{ligne}")
            if cle not in solution:
                continue
            valeur = scalaire(solution[cle])
            if ligne in LIGNES_HEURES:
                valeur = heure_du_jour(valeur)
            valeurs[f"B{ligne}"] = valeur
        return valeurs

    def fonction(self, feuille, entrees, sorties, constantes=None):
        constantes = constantes or {}
        cles_entrees = [self.cle(f, c) for f, c in list(constantes.keys())] + [self.cle(feuille, c) for c in entrees]
        cles_sorties = [self.cle(feuille, c) for c in sorties]
        compilee = self.modele.compile(inputs=cles_entrees, outputs=cles_sorties)
        valeurs_constantes = list(constantes.values())

        def calculer(*valeurs):
            resultats = compilee(*(valeurs_constantes + list(valeurs)))
            return dict(zip(sorties, (scalaire(r) for r in resultats)))

        return calculer


def depart_au_hasard(tirage, dernier):
    pas = tirage.randint(0, (dernier - 8 * 60) // 15)
    minutes = 8 * 60 + 15 * pas
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def bike_for_all(classeur, tirage, nombre, paiement, references=()):
    calculer = classeur.fonction(
        "Bike for All",
        ["B4", "B5", "B6", "B7", "B8", "B9"],
        ["B11", "B13", "B15", "B18", "B19", "B20", "B21", "B22", "B23", "B24", "B26", "B27", "B28", "A33"],
    )
    combinaisons = [(g, a) for g in range(4) for a in (False, True)]
    entrees = [dict(r) for r in references]
    for i in range(nombre):
        gateaux, accompagnateur = combinaisons[i % len(combinaisons)]
        entrees.append({
            "personnes": tirage.randint(10, 18),
            "budgetXof": 5000 + 250 * tirage.randint(0, 140),
            "depart": depart_au_hasard(tirage, 17 * 60 + 45),
            "gateauxParPersonne": gateaux,
            "accompagnateur": accompagnateur,
            "paiementElectronique": paiement,
        })
    cas = []
    for entree in entrees:
        r = calculer(entree["personnes"], entree["budgetXof"], fraction(entree["depart"]), entree["gateauxParPersonne"], oui_non(entree["accompagnateur"]), oui_non(entree["paiementElectronique"]))
        cas.append({
            "entree": entree,
            "tableur": {
                "conditions": r["B11"],
                "fraisOrganisationXof": r["B13"],
                "cocoPropose": r["B15"],
                "coco": r["B18"],
                "cocosXof": r["B19"],
                "minutes": r["B20"],
                "fin": heure_du_jour(r["B21"]),
                "gateauxXof": r["B22"],
                "accompagnateurXof": r["B23"],
                "fraisPaiementXof": r["B24"],
                "totalXof": r["B26"],
                "prixBarreXof": r["B27"],
                "encaisseNetXof": r["B28"],
                "recapEmpreinte": empreinte(r["A33"]),
                **({"recap": r["A33"]} if len(cas) < RECAPS_EN_ENTIER else {}),
            },
        })
    return cas


def bike_for_all_duree(classeur, tirage, nombre, paiement, references=()):
    calculer = classeur.fonction(
        "Bike for All durée",
        ["B4", "B5", "B6", "B7", "B8", "B9", "B10"],
        ["B12", "B14", "B15", "B16", "B17", "B18", "B19", "B20", "B22", "B23", "B24", "A27"],
    )
    combinaisons = [(c, g, a) for c in ("aucun", "petit", "grand") for g in range(4) for a in (False, True)]
    entrees = [dict(r) for r in references]
    for i in range(nombre):
        coco, gateaux, accompagnateur = combinaisons[i % len(combinaisons)]
        entrees.append({
            "personnes": tirage.randint(10, 18),
            "minutes": 30 + 15 * tirage.randint(0, 10),
            "depart": depart_au_hasard(tirage, 19 * 60),
            "coco": coco,
            "gateauxParPersonne": gateaux,
            "accompagnateur": accompagnateur,
            "paiementElectronique": paiement,
        })
    cas = []
    for entree in entrees:
        r = calculer(entree["personnes"], entree["minutes"], fraction(entree["depart"]), entree["coco"], entree["gateauxParPersonne"], oui_non(entree["accompagnateur"]), oui_non(entree["paiementElectronique"]))
        cas.append({
            "entree": entree,
            "tableur": {
                "conditions": r["B12"],
                "tempsXof": r["B14"],
                "fraisOrganisationXof": r["B15"],
                "cocosXof": r["B16"],
                "gateauxXof": r["B17"],
                "accompagnateurXof": r["B18"],
                "fraisPaiementXof": r["B19"],
                "fin": heure_du_jour(r["B20"]),
                "totalXof": r["B22"],
                "prixBarreXof": r["B23"],
                "encaisseNetXof": r["B24"],
                "recapEmpreinte": empreinte(r["A27"]),
                **({"recap": r["A27"]} if len(cas) < RECAPS_EN_ENTIER else {}),
            },
        })
    return cas


def road_trip(classeur, tirage, nombre, paiement, references=()):
    calculer = classeur.fonction(
        "Road trip groupe",
        ["B4", "B5", "B6", "B7"],
        ["B9", "B10", "B11", "B12", "B13", "B14", "B18", "A20"],
        constantes={("Paramètres", "B29"): PRIX_ROAD_TRIP_DECISION_2},
    )
    combinaisons = [(red, g) for red in (False, True) for g in range(4)]
    entrees = [dict(r) for r in references]
    for i in range(nombre):
        reduction, gateaux = combinaisons[i % len(combinaisons)]
        entrees.append({
            "personnes": tirage.randint(10, 18),
            "reductionValidee": reduction,
            "gateauxParPersonne": gateaux,
            "paiementElectronique": paiement,
        })
    cas = []
    for entree in entrees:
        r = calculer(entree["personnes"], oui_non(entree["reductionValidee"]), entree["gateauxParPersonne"], oui_non(entree["paiementElectronique"]))
        cas.append({
            "entree": entree,
            "tableur": {
                "conditions": r["B9"],
                "prixAvantReductionXof": r["B10"],
                "reductionXof": r["B11"],
                "gateauxXof": r["B12"],
                "fraisPaiementXof": r["B13"],
                "totalXof": r["B14"],
                # Le prix barré du récapitulatif (A20) : B14 + B11, seulement avec la réduction.
                "prixBarreXof": r["B14"] + r["B11"] if r["B11"] > 0 else None,
                "encaisseNetXof": r["B18"],
                "recapEmpreinte": empreinte(r["A20"]),
                **({"recap": r["A20"]} if len(cas) < RECAPS_EN_ENTIER else {}),
            },
        })
    return cas


# Les cas de référence de docs/bike-land/SUIVI.md, placés en tête de chaque onglet.
REFERENCES_BUDGET = [
    {"personnes": 10, "budgetXof": 5000, "depart": "08:00", "gateauxParPersonne": 0, "accompagnateur": False, "paiementElectronique": True},
    {"personnes": 10, "budgetXof": 10000, "depart": "08:00", "gateauxParPersonne": 0, "accompagnateur": False, "paiementElectronique": True},
    {"personnes": 10, "budgetXof": 10000, "depart": "08:00", "gateauxParPersonne": 0, "accompagnateur": True, "paiementElectronique": True},
    {"personnes": 13, "budgetXof": 10000, "depart": "08:00", "gateauxParPersonne": 0, "accompagnateur": True, "paiementElectronique": True},
    {"personnes": 12, "budgetXof": 20000, "depart": "08:00", "gateauxParPersonne": 0, "accompagnateur": True, "paiementElectronique": True},
    {"personnes": 18, "budgetXof": 5000, "depart": "08:00", "gateauxParPersonne": 0, "accompagnateur": False, "paiementElectronique": True},
]
REFERENCES_DUREE = [
    {"personnes": 15, "minutes": 60, "depart": "08:00", "coco": "petit", "gateauxParPersonne": 1, "accompagnateur": False, "paiementElectronique": True},
    {"personnes": 15, "minutes": 75, "depart": "08:00", "coco": "aucun", "gateauxParPersonne": 0, "accompagnateur": False, "paiementElectronique": True},
]
REFERENCES_ROAD_TRIP = [
    {"personnes": 10, "reductionValidee": False, "gateauxParPersonne": 0, "paiementElectronique": True},
    {"personnes": 10, "reductionValidee": True, "gateauxParPersonne": 0, "paiementElectronique": True},
]


def main():
    lecteur = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    lecteur.add_argument("classeur")
    lecteur.add_argument("--cas", type=int, default=1000)
    lecteur.add_argument("--comptoir", type=int, default=250)
    lecteur.add_argument("--sortie", default=os.path.join("tests", "offres", "cas-tableur.json"))
    options = lecteur.parse_args()

    classeur = Classeur(options.classeur)
    tirage = random.Random(GRAINE)
    debut = time.time()
    parametres = classeur.parametres()
    parametres["B29"] = PRIX_ROAD_TRIP_DECISION_2
    resultat = {
        "source": classeur.nom,
        "outil": "outils/parite-tableur.py",
        "recalcul": f"formulas {formulas.__version__}",
        "graine": GRAINE,
        "reglages": {"Paramètres!B29 (prix du road trip par personne)": PRIX_ROAD_TRIP_DECISION_2},
        "note": "Entrées tirées au hasard et résultats du tableur recalculé. Ne pas modifier à la main : relancer l'outil.",
        "parametres": parametres,
        "bikeForAll": bike_for_all(classeur, tirage, options.cas, True, REFERENCES_BUDGET)
        + bike_for_all(classeur, tirage, options.comptoir, False),
        "bikeForAllDuree": bike_for_all_duree(classeur, tirage, options.cas, True, REFERENCES_DUREE)
        + bike_for_all_duree(classeur, tirage, options.comptoir, False),
        "roadTrip": road_trip(classeur, tirage, options.cas, True, REFERENCES_ROAD_TRIP)
        + road_trip(classeur, tirage, options.comptoir, False),
    }
    print(f"Recalcul en {time.time() - debut:.1f} s")

    with open(options.sortie, "w", encoding="utf-8", newline="\n") as fichier:
        fichier.write("{\n")
        entete = [k for k in resultat if k not in ("bikeForAll", "bikeForAllDuree", "roadTrip")]
        for cle in entete:
            fichier.write(f"  {json.dumps(cle)}: {json.dumps(resultat[cle], ensure_ascii=False)},\n")
        onglets = ["bikeForAll", "bikeForAllDuree", "roadTrip"]
        for n, cle in enumerate(onglets):
            fichier.write(f"  {json.dumps(cle)}: [\n")
            lignes = [f"    {json.dumps(c, ensure_ascii=False)}" for c in resultat[cle]]
            fichier.write(",\n".join(lignes))
            fichier.write("\n  ]" + ("," if n < len(onglets) - 1 else "") + "\n")
        fichier.write("}\n")

    for cle in ("bikeForAll", "bikeForAllDuree", "roadTrip"):
        cas = resultat[cle]
        oui = sum(1 for c in cas if c["tableur"]["conditions"] == "Oui")
        print(f"{cle} : {len(cas)} cas, conditions « Oui » : {oui}")
    print(f"Écrit : {options.sortie}")


if __name__ == "__main__":
    main()
